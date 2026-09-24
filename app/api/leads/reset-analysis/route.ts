import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ANALYSIS_CURRENT_SINCE } from "@/lib/leads/qualification";

export const dynamic = "force-dynamic";

/**
 * "Staré" leady = neoslovené, majú web a boli analyzované PRED poslednou zmenou
 * skórovacej logiky (ANALYSIS_CURRENT_SINCE). Nezanalyzované (lastScannedAt null)
 * sem nepatria — tie už čakajú vo fronte. Vďaka tomu je reset IDEMPOTENTNÝ:
 * druhé kliknutie (napr. po návrate na stránku) nezmaže prácu, ktorú už spravila
 * nová analýza.
 */
function staleWhere(segmentId?: string): Prisma.LeadWhereInput {
  return {
    status: "new",
    websiteUrl: { not: null },
    lastScannedAt: { lt: new Date(ANALYSIS_CURRENT_SINCE) },
    ...(segmentId ? { segmentId } : {}),
  };
}

/** GET — koľko leadov (v segmente) má staré skóre a dá sa preanalyzovať. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seg = req.nextUrl.searchParams.get("segment");
  const segmentId = seg && seg !== "all" ? seg : undefined;
  const stale = await prisma.lead.count({ where: staleWhere(segmentId) });
  return NextResponse.json({ stale });
}

/**
 * POST /api/leads/reset-analysis — vynuluje lastScannedAt pre "staré" leady
 * (voliteľne v jednom segmente), aby ich existujúci "Analyzovať weby" flow
 * (/api/leads/analyze-bulk) zobral znova cez enrichLead. Používa sa po oprave
 * skórovacej logiky — leady naskenované PRED opravou majú staré, nespoľahlivé
 * skóre, ktoré sa samo neprepočíta; kliknutie na "Prepočítať" v Príležitosti (AI)
 * totiž len prepíše text z existujúceho skóre, web nescanuje odznova.
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
    where: staleWhere(segmentId),
    data: { lastScannedAt: null },
  });
  return NextResponse.json({ reset: res.count });
}
