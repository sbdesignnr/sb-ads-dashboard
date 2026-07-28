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
const BATCH = 6;

// Importované, ešte nezanalyzované leady: majú web, nie sú zamietnuté a
// lastScannedAt je null (enrichLead ho vždy nastaví — úspech aj zlyhanie).
function pendingWhere(): Prisma.LeadWhereInput {
  return {
    source: "trusted-leads",
    websiteUrl: { not: null },
    status: { not: "rejected" },
    lastScannedAt: null,
  };
}

/** GET — počet leadov čakajúcich na analýzu (poháňa progres v UI). */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const count = await prisma.lead.count({ where: pendingWhere() });
  return NextResponse.json({ remaining: count });
}

/** POST — zanalyzuje ďalšiu dávku importovaných leadov. */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const leads = await prisma.lead.findMany({
    where: pendingWhere(),
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

  const remaining = await prisma.lead.count({ where: pendingWhere() });
  return NextResponse.json({
    processed: leads.length,
    analyzed,
    qualified,
    remaining,
  });
}
