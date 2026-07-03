import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendLeadEmail } from "@/lib/leads/email-sender";
import { generateOutreachEmail } from "@/lib/leads/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

function startOfTodayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Daily (08:25 UTC): send today's approved emails up to each campaign's limit,
// and generate the bodies of due follow-ups so they surface for approval.
// Follow-ups are NEVER sent automatically.
async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();

  let sent = 0;
  const campaigns = await prisma.leadCampaign.findMany({ where: { isActive: true } });
  for (const c of campaigns) {
    const scope = c.segmentId ? { segmentId: c.segmentId } : {};
    const sentToday = await prisma.leadEmail.count({
      where: { status: "sent", sentAt: { gte: startOfTodayUTC() }, lead: scope },
    });
    const remaining = c.dailyLimit - sentToday;
    if (remaining <= 0) continue;

    const approved = await prisma.leadEmail.findMany({
      where: {
        status: "approved",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        lead: scope,
      },
      orderBy: { createdAt: "asc" },
      take: remaining,
    });

    let campaignSent = 0;
    for (const e of approved) {
      const r = await sendLeadEmail(e.id);
      if (r.success) {
        sent++;
        campaignSent++;
      }
    }
    if (campaignSent > 0) {
      await prisma.leadCampaign.update({
        where: { id: c.id },
        data: { totalSent: { increment: campaignSent }, ...(c.startedAt ? {} : { startedAt: now }) },
      });
    }
  }

  // Due follow-ups → generate bodies (if missing) so they appear in the queue.
  let followupsReady = 0;
  const dueFollowups = await prisma.leadEmail.findMany({
    where: { status: "draft", emailType: { in: ["followup1", "followup2"] }, scheduledAt: { lte: now } },
    include: { lead: { include: { segment: true } } },
    take: 50,
  });
  for (const f of dueFollowups) {
    if (f.body?.trim()) {
      followupsReady++;
      continue;
    }
    if (!f.lead || !process.env.ANTHROPIC_API_KEY) continue;
    try {
      const initial = await prisma.leadEmail.findFirst({
        where: { leadId: f.leadId, emailType: "initial" },
        orderBy: { createdAt: "asc" },
      });
      const out = await generateOutreachEmail({
        lead: f.lead,
        segmentName: f.lead.segment?.name ?? "firma",
        type: f.emailType as "followup1" | "followup2",
        previousSubject: initial?.subject,
        previousBody: initial?.body,
      });
      await prisma.leadEmail.update({ where: { id: f.id }, data: { subject: out.subject, body: out.body } });
      followupsReady++;
    } catch {
      /* skip */
    }
  }

  return NextResponse.json({ sent, followups_ready: followupsReady });
}

export const GET = handle;
export const POST = handle;
