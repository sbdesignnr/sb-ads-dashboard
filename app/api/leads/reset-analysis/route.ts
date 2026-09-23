import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/reset-analysis — vynuluje lastScannedAt pre "nové" leady
 * (voliteľne v jednom segmente), aby ich existujúci "Analyzovať weby" flow
 * (/api/leads/analyze-bulk) zobral znova cez enrichLead. Používa sa po oprave
 * skórovacej logiky (PageSpeed timeout, screenshot…) — leady naskenované
 * PRED opravou majú staré, nespoľahlivé skóre, ktoré sa samo neprepočíta;
 * kliknutie na "Prepočítať" v Príležitosti (AI) totiž len prepíše text z
 * existujúceho skóre, web nescanuje odznova.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* bez tela = naprieč všetkými segmentmi */
  }
  const segmentId =
    body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined;

  const res = await prisma.lead.updateMany({
    where: {
      status: "new",
      websiteUrl: { not: null },
      ...(segmentId ? { segmentId } : {}),
    },
    data: { lastScannedAt: null },
  });
  return NextResponse.json({ reset: res.count });
}
