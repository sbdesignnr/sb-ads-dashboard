import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scoreTier } from "@/lib/leads/qualification";
import { isEditedByHand } from "@/lib/leads/draft-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads/emails/cleanup {segmentId}
 *
 * Odstráni NEODOSLANÉ initial koncepty leadov, ktorí už podľa aktuálneho skóre
 * nie sú vhodní na oslovenie (hraničné, bez skóre, web v poriadku). Nemaže:
 *  - schválené ani odoslané maily,
 *  - koncepty, ktoré človek upravil ručne,
 *  - koncepty pre vhodné leady.
 * Leady s jednoznačne dobrým webom (skóre pod BORDERLINE_AT, hodnoteným zo
 * screenshotu) sa navyše skryjú (status "rejected", dá sa vrátiť v záložke Skryté),
 * aby sa nemiešali s vhodnými.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* všetky segmenty */
  }
  const segFilter: Prisma.LeadWhereInput =
    body.segmentId && body.segmentId !== "all" ? { segmentId: body.segmentId } : {};

  const drafts = await prisma.leadEmail.findMany({
    where: {
      emailType: "initial",
      status: "draft",
      lead: { status: { in: ["new", "rejected"] }, ...segFilter },
    },
    select: {
      id: true,
      leadId: true,
      createdAt: true,
      updatedAt: true,
      lead: { select: { websiteScore: true, aiVisualReason: true, status: true } },
    },
  });

  const toDelete: string[] = [];
  const toHide = new Set<string>();
  let keptEdited = 0;
  for (const e of drafts) {
    const tier = scoreTier(e.lead.websiteScore);
    // Skrytý lead (rejected) svoj koncept v rade mať nemá, nech je jeho skóre akékoľvek.
    if (tier === "qualified" && e.lead.status === "new") continue;
    if (isEditedByHand(e)) {
      keptEdited++;
      continue;
    }
    toDelete.push(e.id);
    // Skrytie len pri jednoznačne dobrom webe zo skutočného screenshotu (odhad
    // len z textu je menej spoľahlivý — taký lead sa neskrýva).
    const textOnly = Boolean(e.lead.aiVisualReason?.startsWith("(Bez screenshotu"));
    if (e.lead.status === "new" && tier === "good" && !textOnly) toHide.add(e.leadId);
  }

  const deleted = toDelete.length
    ? (await prisma.leadEmail.deleteMany({ where: { id: { in: toDelete }, status: "draft" } })).count
    : 0;
  const hidden = toHide.size
    ? (
        await prisma.lead.updateMany({
          where: { id: { in: [...toHide] }, status: "new" },
          data: {
            status: "rejected",
            disqualifyReason: "Web v poriadku — skryté pri čistení fronty (dá sa vrátiť v záložke Skryté).",
          },
        })
      ).count
    : 0;

  return NextResponse.json({ deleted, hidden, keptEdited });
}
