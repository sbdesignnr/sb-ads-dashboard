import { NextResponse, type NextRequest } from "next/server";
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

/** UTC instant of Bratislava-local midnight of `dayKey` ("YYYY-MM-DD"). */
function startOfLocalDay(dayKey: string): Date {
  return fromZonedTime(`${dayKey}T00:00:00`, TZ);
}

/** Local "YYYY-MM" (Bratislava) for a given instant. */
function monthKeyOf(d: Date): string {
  return localDay(d).slice(0, 7);
}

/** "YYYY-MM" shifted by `n` months (negative = earlier). */
function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [začiatok, koniec) mesiaca `key` ako UTC instanty (Bratislava polnoc). */
function monthRange(key: string): { start: Date; end: Date } {
  return { start: startOfLocalDay(`${key}-01`), end: startOfLocalDay(`${shiftMonth(key, 1)}-01`) };
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric", timeZone: TZ }).format(
    new Date(Date.UTC(y, m - 1, 2)),
  );
}

/** Počet dní v mesiaci `key`. */
function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const currentMonth = monthKeyOf(now);
  const month = req.nextUrl.searchParams.get("month")?.trim() || currentMonth;
  const { start: monthStart, end: monthEnd } = monthRange(month);

  const today = localDay(now);
  const startToday = startOfLocalDay(today);
  const sentWhere = { status: "sent" as const };
  const sentInMonth = { ...sentWhere, sentAt: { gte: monthStart, lt: monthEnd } };

  const [sentToday, sentThisMonth, sentTotal] = await Promise.all([
    prisma.leadEmail.count({ where: { ...sentWhere, sentAt: { gte: startToday } } }),
    prisma.leadEmail.count({ where: sentInMonth }),
    prisma.leadEmail.count({ where: sentWhere }),
  ]);

  // Lievik (unikátne firmy) - z toho, čo bolo odoslané VO VYBRANOM MESIACI (aj keď odpoveď/otvorenie
  // prišli neskôr - počíta sa, komu bolo v tom mesiaci napísané, nie kedy zareagoval).
  const [openedLeads, clickedLeads, repliedLeads, contactedLeads] = await Promise.all([
    prisma.leadEmail.findMany({ where: { ...sentInMonth, openCount: { gt: 0 } }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.leadEmail.findMany({ where: { ...sentInMonth, clickCount: { gt: 0 } }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.leadEmail.findMany({ where: { ...sentInMonth, repliedAt: { not: null } }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.leadEmail.findMany({ where: sentInMonth, select: { leadId: true }, distinct: ["leadId"] }),
  ]);

  // Odoslané za deň, pre každý deň vybraného mesiaca (budúce dni ostanú 0).
  const sentInMonthRows = await prisma.leadEmail.findMany({ where: sentInMonth, select: { sentAt: true } });
  const perDay = new Map<string, number>();
  const nDays = daysInMonth(month);
  for (let i = 1; i <= nDays; i++) perDay.set(`${month}-${String(i).padStart(2, "0")}`, 0);
  for (const e of sentInMonthRows) {
    if (!e.sentAt) continue;
    const key = localDay(e.sentAt);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const series = [...perDay.entries()].map(([date, count]) => ({ date, count }));

  // Zoznamy výsledkov.
  const leadSel = { id: true, companyName: true, companyEmail: true, websiteUrl: true, status: true };

  const [replied, openedNotReplied, clicked, allSent] = await Promise.all([
    prisma.leadEmail.findMany({
      where: { ...sentInMonth, repliedAt: { not: null } },
      select: { id: true, emailType: true, subject: true, sentAt: true, repliedAt: true, openCount: true, lead: { select: leadSel } },
      orderBy: { repliedAt: "desc" },
      take: 100,
    }),
    prisma.leadEmail.findMany({
      where: { ...sentInMonth, openCount: { gt: 0 }, repliedAt: null },
      select: { id: true, emailType: true, subject: true, sentAt: true, openCount: true, lastOpenedAt: true, clickCount: true, lead: { select: leadSel } },
      orderBy: { lastOpenedAt: "desc" },
      take: 100,
    }),
    prisma.leadEmail.findMany({
      where: { ...sentInMonth, clickCount: { gt: 0 } },
      select: { id: true, emailType: true, subject: true, sentAt: true, clickCount: true, lastClickedAt: true, repliedAt: true, lead: { select: leadSel } },
      orderBy: { lastClickedAt: "desc" },
      take: 100,
    }),
    // Všetko odoslané v mesiaci, najnovšie prvé - jediný zoznam so všetkými troma signálmi naraz
    // (odoslané/otvorené/odpovedal), vrátane tých, čo nikto ešte neotvoril.
    prisma.leadEmail.findMany({
      where: sentInMonth,
      select: { id: true, emailType: true, subject: true, sentAt: true, repliedAt: true, openCount: true, clickCount: true, lastOpenedAt: true, lastClickedAt: true, lead: { select: leadSel } },
      orderBy: { sentAt: "desc" },
      take: 200,
    }),
  ]);

  // Porovnanie mesiacov: pre KAŽDÝ mesiac, kedy sa niečo odoslalo, koľko a s akým výsledkom
  // (podľa toho sa vykresľuje aj prepínač mesiacov - vždy sa dá prejsť aj tam, kde už niečo je).
  const allSentRows = await prisma.leadEmail.findMany({
    where: sentWhere,
    select: { sentAt: true, openCount: true, clickCount: true, repliedAt: true },
  });
  const byMonth = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();
  for (const e of allSentRows) {
    if (!e.sentAt) continue;
    const key = monthKeyOf(e.sentAt);
    const m = byMonth.get(key) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
    m.sent++;
    if ((e.openCount ?? 0) > 0) m.opened++;
    if ((e.clickCount ?? 0) > 0) m.clicked++;
    if (e.repliedAt) m.replied++;
    byMonth.set(key, m);
  }
  if (!byMonth.has(currentMonth)) byMonth.set(currentMonth, { sent: 0, opened: 0, clicked: 0, replied: 0 });
  const monthlySummary = [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, v]) => ({ month: key, label: monthLabel(key), ...v }));
  const hasPrev = byMonth.has(shiftMonth(month, -1));
  const hasNext = shiftMonth(month, 1) <= currentMonth;

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const mapRow = (e: {
    id: string;
    emailType: string;
    subject: string;
    sentAt: Date | null;
    repliedAt?: Date | null;
    openCount?: number;
    clickCount?: number;
    lastOpenedAt?: Date | null;
    lastClickedAt?: Date | null;
    lead: { id: string; companyName: string; companyEmail: string | null; websiteUrl: string | null; status: string };
  }) => ({
    id: e.id,
    leadId: e.lead.id,
    company: e.lead.companyName,
    email: e.lead.companyEmail,
    website: e.lead.websiteUrl,
    leadStatus: e.lead.status,
    emailType: e.emailType,
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
    month,
    monthLabel: monthLabel(month),
    isCurrentMonth: month === currentMonth,
    hasPrev,
    hasNext,
    sent: {
      today: sentToday,
      month: sentThisMonth,
      total: sentTotal,
    },
    funnel: {
      contacted: contactedLeads.length,
      opened: openedLeads.length,
      clicked: clickedLeads.length,
      replied: repliedLeads.length,
    },
    series,
    monthlySummary,
    lists: {
      allSent: allSent.map(mapRow),
      replied: replied.map(mapRow),
      openedNotReplied: openedNotReplied.map(mapRow),
      clicked: clicked.map(mapRow),
    },
  });
}
