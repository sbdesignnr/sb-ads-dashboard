import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enrichLead } from "@/lib/leads/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Koľko leadov analyzujeme na jedno volanie (klient volá v slučke, kým remaining>0).
// enrichLead je drahé (PageSpeed + AI vizuál + register) — držíme malú dávku.
// Znížené zo 6 na 4 potom, čo sa PageSpeed timeout predĺžil na 35s (reálne
// Lighthouse behy bežne trvajú 15-30s) — 4 × 35s bezpečne zmestí pod 300s limit
// funkcie aj v takmer-worst-case scenári (všetky v dávke naraz timeoutnú).
const BATCH = 4;

// Importované, ešte nezanalyzované leady: majú web, nie sú zamietnuté a
// lastScannedAt je null (enrichLead ho vždy nastaví — úspech aj zlyhanie).
// Voliteľne obmedzené na jeden segment (nech sa dá analyzovať len ten, pre
// ktorý sa práve chystá kampaň, nie celá databáza naraz).
function pendingWhere(segmentId?: string): Prisma.LeadWhereInput {
  return {
    source: "trusted-leads",
    websiteUrl: { not: null },
    status: { not: "rejected" },
    lastScannedAt: null,
    ...(segmentId ? { segmentId } : {}),
  };
}

/** GET — počet leadov čakajúcich na analýzu (poháňa progres v UI). `?segment=<id>` obmedzí na segment. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const seg = req.nextUrl.searchParams.get("segment");
  const segmentId = seg && seg !== "all" ? seg : undefined;
  const count = await prisma.lead.count({ where: pendingWhere(segmentId) });
  return NextResponse.json({ remaining: count });
}

/** POST — zanalyzuje ďalšiu dávku importovaných leadov. `segmentId` v tele obmedzí na segment. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* bez tela — analyzuj naprieč všetkými segmentmi */
  }
  const segmentId =
    body.segmentId && body.segmentId !== "all" ? body.segmentId : undefined;

  const leads = await prisma.lead.findMany({
    where: pendingWhere(segmentId),
    select: {
      id: true,
      segment: {
        select: { id: true, name: true, communicationStyle: true },
      },
    },
    take: BATCH,
    orderBy: { createdAt: "asc" },
  });

  let analyzed = 0;
  let qualified = 0;
  // Sekvenčne — enrichLead robí externé volania (PageSpeed, AI), nechceme
  // naraziť na rate-limity.
  for (const lead of leads) {
    const segment = lead.segment ?? {
      id: "",
      name: "",
      communicationStyle: null,
    };
    try {
      const res = await enrichLead(lead.id, segment);
      analyzed++;
      if (res?.qualified) qualified++;
    } catch {
      // enrichLead si sám nastaví lastScannedAt aj pri zlyhaní analýzy, ale ak
      // by padlo skôr, označíme lead ako skenovaný, nech sa slučka nezacyklí.
      await prisma.lead
        .update({
          where: { id: lead.id },
          data: { lastScannedAt: new Date() },
        })
        .catch(() => {});
      analyzed++;
    }
  }

  const remaining = await prisma.lead.count({
    where: pendingWhere(segmentId),
  });
  return NextResponse.json({
    processed: leads.length,
    analyzed,
    qualified,
    remaining,
  });
}
