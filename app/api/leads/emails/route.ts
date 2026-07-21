import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLeadEmail } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const withLead = { lead: { include: { segment: { select: { name: true } } } } };

// Queue lists for the campaign page:
//  ?queue=initial   → initial drafts waiting for approval
//  ?queue=followup  → ALL pending follow-up drafts (soonest-due first)
//  ?queue=approved  → approved, waiting for the sender cron (still editable!)
//  ?queue=sent      → already-sent emails (with open tracking), newest first
//  ?segment=<id>    → only emails whose lead is in that segment (per campaign)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const queue = sp.get("queue") ?? "initial";
  const segment = sp.get("segment");

  const where: Prisma.LeadEmailWhereInput =
    queue === "sent"
      ? { status: "sent" }
      : queue === "approved"
        ? { status: "approved" }
        : queue === "followup"
          ? { status: "draft", emailType: { in: ["followup1", "followup2"] } }
          : { status: "draft", emailType: "initial" };

  // Scope to one campaign's segment when requested.
  if (segment && segment !== "all") {
    where.lead = { is: { segmentId: segment === "none" ? null : segment } };
  }

  const orderBy: Prisma.LeadEmailOrderByWithRelationInput =
    queue === "sent"
      ? { sentAt: "desc" }
      : queue === "followup"
        ? { scheduledAt: "asc" } // najskôr splatné hore
        : { createdAt: "desc" };

  const emails = await prisma.leadEmail.findMany({
    where,
    include: withLead,
    orderBy,
    take: queue === "sent" ? 100 : 300,
  });
  return NextResponse.json({ emails: emails.map(serializeLeadEmail) });
}
