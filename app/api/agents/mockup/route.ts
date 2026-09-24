import { NextResponse, after, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { executeMockup, publicMockupUrl, startMockup } from "@/lib/agents/mockup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// návrh (1–2 min) beží po odpovedi v after(); počíta sa do tohto limitu
export const maxDuration = 300;

/** GET /api/agents/mockup?leadId= — posledné návrhy leadu (bez HTML a obrázkov). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "Chýba leadId." }, { status: 400 });
  try {
    await prisma.leadMockup.updateMany({
      where: { status: "running", updatedAt: { lt: new Date(Date.now() - 8 * 60_000) } },
      data: { status: "failed", error: "Beh sa neukončil včas." },
    });
    const rows = await prisma.leadMockup.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, token: true, status: true, step: true, qa: true, costEur: true, error: true, views: true, lastViewedAt: true, createdAt: true, spec: true },
    });
    return NextResponse.json({
      mockups: rows.map((r) => ({
        id: r.id,
        status: r.status,
        step: r.step,
        costEur: r.costEur,
        error: r.error,
        views: r.views,
        lastViewedAt: r.lastViewedAt,
        createdAt: r.createdAt,
        url: publicMockupUrl(r.token),
        qaIssues: Array.isArray(r.qa) ? (r.qa as unknown[]).length : 0,
        fontPair: ((r.spec as { theme?: { fonts?: { display?: string } } } | null)?.theme?.fonts?.display) ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** POST /api/agents/mockup { leadId, director? } — zaradí návrh; Ateliér pracuje na pozadí. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  const { leadId, director } = (await req.json().catch(() => ({}))) as { leadId?: string; director?: boolean };
  if (!leadId) return NextResponse.json({ error: "Chýba leadId." }, { status: 400 });
  const started = await startMockup(leadId);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  after(() => executeMockup(started.id, { director: Boolean(director) }));
  return NextResponse.json({ id: started.id, url: publicMockupUrl(started.token) });
}
