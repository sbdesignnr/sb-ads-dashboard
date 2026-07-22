import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
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
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

const TZ = "Europe/Bratislava";

/** Local wall-clock day (YYYY-MM-DD) in Bratislava. */
function todayLocal(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Minutes since local midnight in Bratislava — for comparing against campaign.sendTime. */
function minutesNowLocal(now: Date): number {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "08:30" → 510. Unparseable → 0 (send at the first run of the day). */
function minutesFromHHMM(v: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? "").trim());
  if (!m) return 0;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

/** The UTC instant of local midnight today — the correct "today" boundary for the daily limit. */
function startOfTodayLocal(now: Date): Date {
  return fromZonedTime(`${todayLocal(now)}T00:00:00`, TZ);
}

// Runs every 30 min. Each active campaign sends its approved emails once its own
// sendTime (Bratislava) has arrived, up to its daily limit. Also generates bodies
// for due follow-ups so they surface for approval — follow-ups are NEVER sent
// automatically.
async function handle(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const nowMin = minutesNowLocal(now);

  let sent = 0;
  const skipped: string[] = [];
  const campaigns = await prisma.leadCampaign.findMany({
    where: { isActive: true },
  });
  if (!campaigns.length) skipped.push("žiadna aktívna kampaň");

  for (const c of campaigns) {
    // Dve cesty odoslania:
    //  1) mail s vlastným časom (scheduledAt) sa odošle, keď jeho čas prišiel —
    //     bez ohľadu na denný sendTime kampane (používateľ ho naplánoval presne),
    //  2) mail bez vlastného času sa riadi denným sendTime kampane.
    const sendMin = minutesFromHHMM(c.sendTime);
    const sendTimePassed = nowMin >= sendMin;

    const scope = c.segmentId ? { segmentId: c.segmentId } : {};
    const sentToday = await prisma.leadEmail.count({
      where: {
        status: "sent",
        sentAt: { gte: startOfTodayLocal(now) },
        lead: scope,
      },
    });
    const remaining = c.dailyLimit - sentToday;
    if (remaining <= 0) {
      skipped.push(`${c.name}: denný limit ${c.dailyLimit} vyčerpaný`);
      continue;
    }

    // Naplánované (čas prišiel) VŽDY; nenaplánované len keď prešiel denný sendTime.
    const dueClauses: Prisma.LeadEmailWhereInput[] = [
      { scheduledAt: { lte: now } },
    ];
    if (sendTimePassed) dueClauses.push({ scheduledAt: null });

    const approved = await prisma.leadEmail.findMany({
      where: { status: "approved", OR: dueClauses, lead: scope },
      // Naplánované najskôr (podľa vlastného času), potom podľa poradia vytvorenia.
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: remaining,
    });
    if (!approved.length) {
      skipped.push(
        sendTimePassed
          ? `${c.name}: 0 schválených emailov v jej segmente`
          : `${c.name}: pred ${c.sendTime} sa posielajú len naplánované (žiadne nie je splatné)`,
      );
      continue;
    }

    let campaignSent = 0;
    for (const e of approved) {
      const r = await sendLeadEmail(e.id);
      if (r.success) {
        sent++;
        campaignSent++;
      } else {
        console.error("[cron/send-emails] send failed:", e.id, r.error);
      }
    }
    if (campaignSent > 0) {
      await prisma.leadCampaign.update({
        where: { id: c.id },
        data: {
          totalSent: { increment: campaignSent },
          ...(c.startedAt ? {} : { startedAt: now }),
        },
      });
    }
  }
  if (skipped.length)
    console.log("[cron/send-emails] neodoslané:", skipped.join(" | "));

  // Follow-ups splatné do 3 dní → predgeneruj telo (ak chýba), nech sú vopred
  // pripravené na kontrolu a schválenie, nie až v deň odoslania.
  let followupsReady = 0;
  const soon = new Date(now.getTime() + 3 * 24 * 3_600_000);
  const dueFollowups = await prisma.leadEmail.findMany({
    where: {
      status: "draft",
      emailType: { in: ["followup1", "followup2"] },
      scheduledAt: { lte: soon },
    },
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
      // Follow-up ide ako odpoveď → „Re: <pôvodný predmet>".
      const subject = initial?.subject
        ? `Re: ${initial.subject.replace(/^\s*(re\s*:\s*)+/i, "").trim()}`
        : out.subject;
      await prisma.leadEmail.update({
        where: { id: f.id },
        data: { subject, body: out.body },
      });
      followupsReady++;
    } catch {
      /* skip */
    }
  }

  return NextResponse.json({ sent, followups_ready: followupsReady, skipped });
}

export const GET = handle;
export const POST = handle;
