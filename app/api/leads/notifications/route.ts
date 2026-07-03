import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Feeds the header notification bell: due follow-ups awaiting approval + leads
// that have replied.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();

  const [dueFollowups, respondedLeads] = await Promise.all([
    prisma.leadEmail.findMany({
      where: { status: "draft", emailType: { in: ["followup1", "followup2"] }, scheduledAt: { lte: now } },
      include: { lead: { select: { id: true, companyName: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    }),
    prisma.lead.findMany({
      where: { status: "responded" },
      select: { id: true, companyName: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const items = [
    ...respondedLeads.map((l) => ({
      id: `resp-${l.id}`,
      type: "responded" as const,
      title: `${l.companyName} reagoval`,
      subtitle: "Lead odpovedal na email",
      href: `/leads/${l.id}`,
      at: l.updatedAt.toISOString(),
    })),
    ...dueFollowups.map((e) => ({
      id: `fu-${e.id}`,
      type: "followup" as const,
      title: `Followup pripravený — ${e.lead?.companyName ?? "lead"}`,
      subtitle: "Čaká na schválenie v kampani",
      href: `/leads/kampane`,
      at: (e.scheduledAt ?? e.createdAt).toISOString(),
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 10);

  return NextResponse.json({ count: dueFollowups.length + respondedLeads.length, items });
}
