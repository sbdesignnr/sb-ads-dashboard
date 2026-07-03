import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeLeadEmail } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

const withLead = { lead: { include: { segment: { select: { name: true } } } } };

// Queue lists for the campaign page:
//  ?queue=initial   → initial drafts waiting for approval
//  ?queue=followup  → due follow-up drafts (scheduled within the next 24h)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const queue = new URL(req.url).searchParams.get("queue") ?? "initial";

  const where =
    queue === "followup"
      ? {
          status: "draft",
          emailType: { in: ["followup1", "followup2"] },
          scheduledAt: { lte: new Date(Date.now() + 24 * 3600 * 1000) },
        }
      : { status: "draft", emailType: "initial" };

  const emails = await prisma.leadEmail.findMany({
    where,
    include: withLead,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json({ emails: emails.map(serializeLeadEmail) });
}
