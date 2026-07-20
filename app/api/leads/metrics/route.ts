import { NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Europe/Bratislava";
const MONTHLY_GOAL = 150;

/** Local "YYYY-MM-DD" (Bratislava) for a given instant. */
function localDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** UTC instant of Bratislava-local midnight of `dayKey`. */
function startOfLocalDay(dayKey: string): Date {
  return fromZonedTime(`${dayKey}T00:00:00`, TZ);
}

/** Monday of the local week that `dayKey` falls in (as "YYYY-MM-DD"). */
function mondayOf(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7; // po=1 … ne=7
  dt.setUTCDate(dt.getUTCDate() - (dow - 1));
  return localDay(dt);
}

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const today = localDay(now);
  const [ty, tm] = today.split("-");

  const startToday = startOfLocalDay(today);
  const startWeek = startOfLocalDay(mondayOf(today));
  const startMonth = startOfLocalDay(`${ty}-${tm}-01`);
  const startYear = startOfLocalDay(`${ty}-01-01`);

  const sentWhere = { status: "sent" as const };

  const [sentToday, sentWeek, sentMonth, sentYear, sentTotal] =
    await Promise.all([
      prisma.leadEmail.count({
        where: { ...sentWhere, sentAt: { gte: startToday } },
      }),
      prisma.leadEmail.count({
        where: { ...sentWhere, sentAt: { gte: startWeek } },
      }),
      prisma.leadEmail.count({
        where: { ...sentWhere, sentAt: { gte: startMonth } },
      }),
      prisma.leadEmail.count({
        where: { ...sentWhere, sentAt: { gte: startYear } },
      }),
      prisma.leadEmail.count({ where: sentWhere }),
    ]);

  // Funnel: sent → opened → clicked → replied (počet UNIKÁTNYCH firiem, nie mailov,
  // aby "koľko ľudí" sedelo — jeden lead môže mať viac mailov).
  const [openedLeads, clickedLeads, repliedLeads] = await Promise.all([
    prisma.leadEmail.findMany({
      where: { ...sentWhere, openCount: { gt: 0 } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
    prisma.leadEmail.findMany({
      where: { ...sentWhere, clickCount: { gt: 0 } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
    prisma.leadEmail.findMany({
      where: { repliedAt: { not: null } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
  ]);
  const contactedLeads = await prisma.leadEmail.findMany({
    where: sentWhere,
    select: { leadId: true },
    distinct: ["leadId"],
  });

  // 30-dňová časová os — odoslané za deň (lokálne dni).
  const since30 = startOfLocalDay(
    localDay(new Date(now.getTime() - 29 * 86_400_000)),
  );
  const recentSent = await prisma.leadEmail.findMany({
    where: { ...sentWhere, sentAt: { gte: since30 } },
    select: { sentAt: true },
  });
  const perDay = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const key = localDay(new Date(now.getTime() - (29 - i) * 86_400_000));
    perDay.set(key, 0);
  }
  for (const e of recentSent) {
    if (!e.sentAt) continue;
    const key = localDay(e.sentAt);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const series = [...perDay.entries()].map(([date, count]) => ({
    date,
    count,
  }));

  // Zoznamy výsledkov.
  const leadSel = {
    companyName: true,
    companyEmail: true,
    websiteUrl: true,
    status: true,
  };

  const [replied, openedNotReplied, clicked] = await Promise.all([
    // Kto odpovedal
    prisma.leadEmail.findMany({
      where: { repliedAt: { not: null } },
      select: {
        id: true,
        subject: true,
        sentAt: true,
        repliedAt: true,
        openCount: true,
        lead: { select: leadSel },
      },
      orderBy: { repliedAt: "desc" },
      take: 100,
    }),
    // Kto otvoril, ale neodpovedal
    prisma.leadEmail.findMany({
      where: { ...sentWhere, openCount: { gt: 0 }, repliedAt: null },
      select: {
        id: true,
        subject: true,
        sentAt: true,
        openCount: true,
        lastOpenedAt: true,
        clickCount: true,
        lead: { select: leadSel },
      },
      orderBy: { lastOpenedAt: "desc" },
      take: 100,
    }),
    // Kto klikol na odkaz
    prisma.leadEmail.findMany({
      where: { ...sentWhere, clickCount: { gt: 0 } },
      select: {
        id: true,
        subject: true,
        sentAt: true,
        clickCount: true,
        lastClickedAt: true,
        repliedAt: true,
        lead: { select: leadSel },
      },
      orderBy: { lastClickedAt: "desc" },
      take: 100,
    }),
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const mapRow = (e: {
    id: string;
    subject: string;
    sentAt: Date | null;
    repliedAt?: Date | null;
    openCount?: number;
    clickCount?: number;
    lastOpenedAt?: Date | null;
    lastClickedAt?: Date | null;
    lead: {
      companyName: string;
      companyEmail: string | null;
      websiteUrl: string | null;
      status: string;
    };
  }) => ({
    id: e.id,
    company: e.lead.companyName,
    email: e.lead.companyEmail,
    website: e.lead.websiteUrl,
    leadStatus: e.lead.status,
    subject: e.subject,
    sentAt: iso(e.sentAt ?? null),
    repliedAt: iso(e.repliedAt ?? null),
    openCount: e.openCount ?? 0,
    clickCount: e.clickCount ?? 0,
    lastOpenedAt: iso(e.lastOpenedAt ?? null),
    lastClickedAt: iso(e.lastClickedAt ?? null),
  });

  return NextResponse.json({
    goal: MONTHLY_GOAL,
    sent: {
      today: sentToday,
      week: sentWeek,
      month: sentMonth,
      year: sentYear,
      total: sentTotal,
    },
    funnel: {
      contacted: contactedLeads.length,
      opened: openedLeads.length,
      clicked: clickedLeads.length,
      replied: repliedLeads.length,
    },
    series,
    lists: {
      replied: replied.map(mapRow),
      openedNotReplied: openedNotReplied.map(mapRow),
      clicked: clicked.map(mapRow),
    },
  });
}
