import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { serializeCampaign } from "@/lib/leads/store";

export const dynamic = "force-dynamic";

function startOfTodayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [campaigns, sentToday, pendingInitial, dueFollowups, totalSent] = await Promise.all([
    prisma.leadCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.leadEmail.count({ where: { status: "sent", sentAt: { gte: startOfTodayUTC() } } }),
    prisma.leadEmail.count({ where: { status: "draft", emailType: "initial" } }),
    prisma.leadEmail.count({
      where: {
        status: "draft",
        emailType: { in: ["followup1", "followup2"] },
        scheduledAt: { lte: new Date(Date.now() + 24 * 3600 * 1000) },
      },
    }),
    prisma.leadEmail.count({ where: { status: "sent" } }),
  ]);

  return NextResponse.json({
    campaigns: campaigns.map(serializeCampaign),
    stats: { sentToday, pendingApproval: pendingInitial + dueFollowups, totalSent },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { name?: string; segmentId?: string | null; dailyLimit?: number; sendTime?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const campaign = await prisma.leadCampaign.create({
    data: {
      name: (body.name ?? "").trim() || "Kampaň",
      segmentId: body.segmentId && body.segmentId !== "all" ? body.segmentId : null,
      dailyLimit: Math.min(Math.max(1, Number(body.dailyLimit) || 20), 50),
      sendTime: /^\d{2}:\d{2}$/.test(body.sendTime ?? "") ? body.sendTime! : "08:30",
    },
  });
  return NextResponse.json({ campaign: serializeCampaign(campaign) });
}
