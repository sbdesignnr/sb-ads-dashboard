import { NextResponse, after, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getShortlist } from "@/lib/agents/skaut";
import { latestVerdicts } from "@/lib/agents/notes";
import { executeInitialOutreach, startResearch, STALE_MS } from "@/lib/agents/research";

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

const RUNS_FETCH = 60;
const RUNS_SHOW = 20;
/** Mail už mal svoj osud (schválený/odoslaný/zamietnutý) — v pracovni Nory viac neprekáža. */
const EMAIL_HANDLED = new Set(["sent", "approved", "rejected"]);

/**
 * GET /api/agents/research[?q=text][&lead=id][&all=1]
 * Pracovňa Nory: kandidáti na ponuku (vhodné leady, ktoré ešte neskúmala), posledné behy
 * a prípadné hľadanie leadu podľa názvu. Behy, ktorých mail je už vybavený (schválený, odoslaný
 * alebo zamietnutý v kampaniach), sa v zozname skrývajú, aby sa nemiešali s novými ponukami,
 * ktoré ešte čakajú na posúdenie — pridaj ?all=1 pre celú históriu.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const pinnedId = req.nextUrl.searchParams.get("lead");
  const showAll = req.nextUrl.searchParams.get("all") === "1";

  try {
    // spadnutý beh (funkcia skončila časovým limitom) nesmie navždy blokovať tlačidlá —
    // beží súbežne s čítaním nižšie (nie pred ním), nech to nie je o kolo navyše;
    // ak sa minú o chlp, náprava sa prejaví pri najbližšom načítaní.
    const [, runsRaw, top, found, pinned] = await Promise.all([
      prisma.leadResearch.updateMany({
        where: { status: "running", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
        data: { status: "failed", error: "Beh sa neukončil včas (pravdepodobne časový limit)." },
      }),
      prisma.leadResearch.findMany({
        orderBy: { createdAt: "desc" },
        take: RUNS_FETCH,
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
    const verdicts = await latestVerdicts((top?.picks ?? []).map((p) => p.lead.id));
    const candidates = (top?.picks ?? []).map((p) => {
      const v = verdicts.get(p.lead.id)?.data as { why?: string; headline?: string; evidence?: string[]; fit?: number; suitable?: boolean } | undefined;
      return {
        ...p.lead,
        opportunity: p.score,
        reasons: p.reasons,
        verdict: v?.suitable ? { why: v.why ?? "", headline: v.headline ?? "", evidence: v.evidence ?? [], fit: v.fit ?? 0 } : null,
      };
    });

    // Skutočný osud prvého mailu (ten istý lead = jeden "initial" mail), aby pracovňa vedela
    // odlíšiť "ešte čaká" od "už schválený/odoslaný/zamietnutý v kampaniach".
    const leadIds = [...new Set(runsRaw.map((r) => r.lead.id))];
    const initialEmails = leadIds.length
      ? await prisma.leadEmail.findMany({
          where: { leadId: { in: leadIds }, emailType: "initial" },
          select: { leadId: true, status: true, sentAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const emailByLead = new Map<string, { status: string; sentAt: Date | null }>();
    for (const e of initialEmails) if (!emailByLead.has(e.leadId)) emailByLead.set(e.leadId, e);

    const annotated = runsRaw.map((r) => {
      const email = emailByLead.get(r.lead.id) ?? null;
      return { ...r, emailStatus: email?.status ?? null, emailSentAt: email?.sentAt ?? null };
    });
    const runs = (showAll ? annotated : annotated.filter((r) => !r.emailStatus || !EMAIL_HANDLED.has(r.emailStatus))).slice(0, RUNS_SHOW);
    const hiddenHandled = showAll ? 0 : annotated.length - runs.length;

    return NextResponse.json({ runs, hiddenHandled, candidates, candidateTotal: top?.candidates ?? 0, found, pinned });
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
  const { leadId } = (await req.json().catch(() => ({}))) as { leadId?: string };
  if (!leadId) return NextResponse.json({ error: "Chýba leadId." }, { status: 400 });

  const started = await startResearch(leadId);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  // Prvý kontaktný mail = pevná schválená šablóna, bez AI (pozri executeInitialOutreach).
  after(() => executeInitialOutreach(started.id, leadId));
  return NextResponse.json({ id: started.id });
}
