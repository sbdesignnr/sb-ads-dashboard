import { NextResponse, after, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getShortlist } from "@/lib/agents/skaut";
import { executeResearch, startResearch, STALE_MS } from "@/lib/agents/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// beh agenta (1–2 min) prebieha po odpovedi v after(), ten sa počíta do tohto limitu
export const maxDuration = 800;

const leadSelect = {
  id: true,
  companyName: true,
  companyCity: true,
  websiteUrl: true,
  websiteScore: true,
  companyEmail: true,
  segment: { select: { name: true } },
} as const;

/**
 * GET /api/agents/research[?q=text][&lead=id]
 * Pracovňa Nory: kandidáti na ponuku (vhodné leady, ktoré ešte neskúmala), posledné behy
 * a prípadné hľadanie leadu podľa názvu.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const pinnedId = req.nextUrl.searchParams.get("lead");

  try {
    // spadnutý beh (funkcia skončila časovým limitom) nesmie navždy blokovať tlačidlá
    await prisma.leadResearch.updateMany({
      where: { status: "running", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: "failed", error: "Beh sa neukončil včas (pravdepodobne časový limit)." },
    });
    const [runs, top, found, pinned] = await Promise.all([
      prisma.leadResearch.findMany({
        orderBy: { createdAt: "desc" },
        take: 14,
        select: {
          id: true,
          status: true,
          step: true,
          offerName: true,
          costEur: true,
          emailSubject: true,
          appliedAt: true,
          error: true,
          createdAt: true,
          updatedAt: true,
          lead: { select: { id: true, companyName: true, companyCity: true } },
        },
      }),
      q ? Promise.resolve(null) : getShortlist(10),
      q
        ? prisma.lead.findMany({
            where: { websiteUrl: { not: null }, companyName: { contains: q, mode: "insensitive" } },
            orderBy: { websiteScore: "desc" },
            take: 10,
            select: leadSelect,
          })
        : Promise.resolve([]),
      pinnedId
        ? prisma.lead.findUnique({ where: { id: pinnedId }, select: leadSelect })
        : Promise.resolve(null),
    ]);
    // Kandidáti = výber Skauta (skóre príležitosti a dôvody), zoradené od najlepšieho.
    const candidates = (top?.picks ?? []).map((p) => ({ ...p.lead, opportunity: p.score, reasons: p.reasons }));
    return NextResponse.json({ runs, candidates, candidateTotal: top?.candidates ?? 0, found, pinned });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/agents/research { leadId } — zaradí beh a vráti hneď; agent pracuje na pozadí. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  const { leadId, withMockup, director } = (await req.json().catch(() => ({}))) as {
    leadId?: string;
    withMockup?: boolean;
    director?: boolean;
  };
  if (!leadId) return NextResponse.json({ error: "Chýba leadId." }, { status: 400 });

  const started = await startResearch(leadId);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  // návrh domovskej stránky sa robí len na výslovnú žiadosť (drahé; maily ho predvolene neobsahujú)
  after(() => executeResearch(started.id, leadId, { withMockup: withMockup === true, director: Boolean(director), deep: true }));
  return NextResponse.json({ id: started.id });
}
