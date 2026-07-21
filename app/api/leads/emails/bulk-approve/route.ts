import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scheduleFollowUps } from "@/lib/leads/email-sender";
import { nextSendTime } from "@/lib/leads/schedule";

export const dynamic = "force-dynamic";

// Approve many emails at once; queue follow-ups for any approved initial emails.
// Each approved email (without a future custom schedule) is stamped with the next
// daily send time of the covering campaign — same rule as single approve.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { emailIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const ids = Array.isArray(body.emailIds)
    ? body.emailIds.filter((x) => typeof x === "string")
    : [];
  if (!ids.length) return NextResponse.json({ approved: 0 });

  const emails = await prisma.leadEmail.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      leadId: true,
      emailType: true,
      scheduledAt: true,
      lead: { select: { segmentId: true } },
    },
  });

  const now = new Date();
  // Predpočítaj najbližší čas odoslania na segment (kešuj kampaň podľa segmentu).
  const campaignCache = new Map<string, { sendTime: string } | null>();
  const scheduleFor = async (
    segmentId: string | null,
  ): Promise<Date | null> => {
    const key = segmentId ?? "__all__";
    if (!campaignCache.has(key)) {
      const c =
        (segmentId
          ? await prisma.leadCampaign.findFirst({
              where: { segmentId },
              orderBy: { isActive: "desc" },
            })
          : null) ??
        (await prisma.leadCampaign.findFirst({
          where: { segmentId: null },
          orderBy: { isActive: "desc" },
        }));
      campaignCache.set(key, c ? { sendTime: c.sendTime } : null);
    }
    const c = campaignCache.get(key);
    return c ? nextSendTime(c.sendTime, now) : null;
  };

  for (const e of emails) {
    const data: { status: "approved"; scheduledAt?: Date } = {
      status: "approved",
    };
    if (!e.scheduledAt || e.scheduledAt <= now) {
      const def = await scheduleFor(e.lead.segmentId);
      if (def) data.scheduledAt = def;
    }
    await prisma.leadEmail.update({ where: { id: e.id }, data });
    if (e.emailType === "initial")
      await scheduleFollowUps(e.leadId, e.id).catch(() => {});
  }

  return NextResponse.json({ approved: emails.length });
}
