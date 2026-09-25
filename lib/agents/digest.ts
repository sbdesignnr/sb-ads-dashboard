// Ranný prehľad: čo agenti urobili cez noc a čo musí spraviť človek. Počíta sa z reálnych dát
// (výskumy, návrhy, maily, pokladnica), nič sa nevymýšľa. Posiela sa na Telegram a zobrazuje v
// /agenti; nič sa neodosiela zákazníkom.
import { prisma } from "@/lib/prisma";
import { AGENTS_START, getBudget } from "@/lib/agents/budget";
import { DAILY_RESEARCH_CAP } from "@/lib/agents/night";
import { draftsWaitingWhere, researchReadyWhere } from "@/lib/agents/queue";
import { PRIORITY_KEYWORDS, poolWhere, getShortlist } from "@/lib/agents/skaut";
import { agentMarket } from "@/lib/agents/market";
import { WEEK_TARGET } from "@/lib/agents/status";
import { listNotes, notesAvailable } from "@/lib/agents/notes";
import { scoutFunnel, type Funnel } from "@/lib/agents/scout";
import { publicMockupUrl } from "@/lib/agents/mockup";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { escapeHtml, sendTelegram, telegramConfigured } from "@/lib/notifications/telegram";
import type { Council } from "@/lib/leads/research/council";
import type { MailCraft } from "@/lib/leads/research/mailcraft";

export interface DigestOffer {
  researchId: string;
  leadId: string;
  company: string;
  city: string | null;
  offer: string | null;
  status: "done" | "failed" | "skipped";
  note: string | null;
  mockupUrl: string | null;
  premium: boolean;
  angle: string | null;
  costEur: number | null;
}

export interface DigestTodo {
  id: string;
  label: string;
  count: number;
  href: string;
  detail?: string;
}

export interface HealthItem {
  level: "error" | "warn" | "info";
  text: string;
  href?: string;
}

export interface Digest {
  at: string;
  sinceHours: number;
  offers: DigestOffer[];
  mockupsMade: number;
  premiumMade: number;
  scoutRejected: { company: string; reason: string }[];
  viewedMockups: { company: string; views: number; url: string }[];
  replies: { company: string; subject: string }[];
  opens: number;
  clicks: number;
  spentSinceEur: number;
  budget: { spentEur: number; capEur: number; pctUsed: number; todayEur: number; available: boolean; projectedEur: number };
  todo: DigestTodo[];
  /** týždenný cieľ a doterajší postup */
  week: { offers: number; target: number; sent: number; opened: number; replied: number };
  /** zásoba leadov pre Noru */
  supply: { ready: number; daysLeft: number; perNight: number };
  /** čo v systéme nefunguje alebo môže zablokovať odosielanie */
  health: HealthItem[];
  nightOn: boolean;
  /** autopilot Skauta: lievik hľadania, posúdenia a postup po segmentoch */
  autopilot: Funnel;
  /** týždenné hodnotenie: súhrn a naučené lekcie */
  learned: { summary: string | null; lessons: string[]; at: string | null };
  /** novinky z AI (zmena cenníka, nový model) z poslednej týždennej kontroly */
  news: { title: string; body: string; at: string } | null;
}

const baseUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://ads.sbdesign.sk").replace(/\/$/, "");

export async function buildDigest(sinceHours = 16): Promise<Digest> {
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  const weekFrom = new Date(Math.max(Date.now() - 7 * 24 * 3_600_000, AGENTS_START.getTime()));
  const [research, mockups, viewed, rejected, mails, pendingOffers, drafts, budget, spend, weekOffers, weekMails, shortlist, health, autopilot, lessonNotes, newsNotes] = await Promise.all([
    prisma.leadResearch.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, leadId: true, status: true, error: true, offerName: true, costEur: true, brief: true, lead: { select: { companyName: true, companyCity: true } } },
    }),
    prisma.leadMockup.findMany({
      where: { createdAt: { gte: since }, status: "done" },
      select: { id: true, researchId: true, leadId: true, token: true, spec: true },
    }),
    prisma.leadMockup.findMany({
      where: { lastViewedAt: { gte: since }, views: { gt: 0 } },
      orderBy: { lastViewedAt: "desc" },
      take: 8,
      select: { token: true, views: true, lead: { select: { companyName: true } } },
    }),
    prisma.lead.findMany({
      where: { status: "rejected", disqualifyReason: { startsWith: "Miro:" }, updatedAt: { gte: since } },
      take: 20,
      select: { companyName: true, disqualifyReason: true },
    }),
    prisma.leadEmail.findMany({
      where: { OR: [{ repliedAt: { gte: since } }, { openedAt: { gte: since } }, { clickedAt: { gte: since } }] },
      select: { subject: true, repliedAt: true, openedAt: true, clickedAt: true, lead: { select: { companyName: true } } },
      take: 60,
    }),
    prisma.leadResearch.count({ where: researchReadyWhere }),
    prisma.leadEmail.count({ where: draftsWaitingWhere() }),
    getBudget(),
    prisma.agentSpend.aggregate({ where: { createdAt: { gte: new Date(Math.max(since.getTime(), AGENTS_START.getTime())) } }, _sum: { eur: true } }).catch(() => ({ _sum: { eur: 0 } })),
    prisma.leadResearch.count({ where: { status: "done", createdAt: { gte: weekFrom } } }).catch(() => 0),
    prisma.leadEmail.findMany({
      where: { OR: [{ sentAt: { gte: weekFrom } }, { openedAt: { gte: weekFrom } }, { repliedAt: { gte: weekFrom } }] },
      select: { sentAt: true, openedAt: true, repliedAt: true },
    }),
    getShortlist(1).catch(() => ({ picks: [], candidates: 0 })),
    healthChecks(),
    scoutFunnel(7),
    listNotes({ kind: "lesson", since: new Date(Date.now() - 14 * 86_400_000) }, 12),
    listNotes({ kind: "news", since: new Date(Date.now() - 14 * 86_400_000) }, 3),
  ]);

  const mockupByResearch = new Map(mockups.filter((m) => m.researchId).map((m) => [m.researchId as string, m]));
  const offers: DigestOffer[] = research.map((r) => {
    const brief = (r.brief ?? {}) as { craft?: MailCraft | null; council?: Council | null };
    const mk = mockupByResearch.get(r.id);
    const chosen = brief.craft?.variants?.find((v) => v.chosen);
    const skipped = r.status === "failed" && (r.error ?? "").startsWith("Vyradené");
    return {
      researchId: r.id,
      leadId: r.leadId,
      company: r.lead.companyName,
      city: r.lead.companyCity,
      offer: r.offerName,
      status: r.status === "done" ? "done" : skipped ? "skipped" : "failed",
      note: r.status === "done" ? null : (r.error ?? "").slice(0, 200),
      mockupUrl: mk ? publicMockupUrl(mk.token) : null,
      premium: Boolean(mk && (mk.spec as { freeform?: boolean } | null)?.freeform),
      angle: chosen?.angle ?? null,
      costEur: r.costEur,
    };
  });

  const replies = mails.filter((m) => m.repliedAt && m.repliedAt >= since).map((m) => ({ company: m.lead.companyName, subject: m.subject }));
  const todo: DigestTodo[] = [];
  const doneOffers = offers.filter((o) => o.status === "done").length;
  if (pendingOffers > 0)
    todo.push({ id: "offers", label: "Prezrieť ponuky od Nory a použiť ich ako koncepty", count: pendingOffers, href: `${baseUrl()}/agenti`, detail: doneOffers ? `${doneOffers} z nich pribudlo cez noc` : undefined });
  if (drafts > 0) todo.push({ id: "drafts", label: "Schváliť koncepty mailov na odoslanie", count: drafts, href: `${baseUrl()}/leads/kampane` });
  if (replies.length) todo.push({ id: "replies", label: "Odpovedať na odpovede leadov", count: replies.length, href: `${baseUrl()}/leads`, detail: replies.map((r) => r.company).slice(0, 3).join(", ") });
  const failed = offers.filter((o) => o.status === "failed").length;
  if (failed) todo.push({ id: "failed", label: "Skontrolovať zlyhané behy Nory", count: failed, href: `${baseUrl()}/agenti` });

  return {
    at: new Date().toISOString(),
    sinceHours,
    offers,
    mockupsMade: mockups.length,
    premiumMade: mockups.filter((m) => (m.spec as { freeform?: boolean } | null)?.freeform).length,
    scoutRejected: rejected.map((l) => ({ company: l.companyName, reason: (l.disqualifyReason ?? "").replace(/^Miro:\s*/, "").slice(0, 160) })),
    viewedMockups: viewed.map((v) => ({ company: v.lead.companyName, views: v.views, url: publicMockupUrl(v.token) })),
    replies,
    opens: mails.filter((m) => m.openedAt && m.openedAt >= since).length,
    clicks: mails.filter((m) => m.clickedAt && m.clickedAt >= since).length,
    spentSinceEur: Math.round((spend._sum.eur ?? 0) * 100) / 100,
    budget: { spentEur: budget.spentEur, capEur: budget.capEur, pctUsed: budget.pctUsed, todayEur: budget.todayEur, available: budget.available, projectedEur: budget.projectedEur },
    todo,
    week: {
      offers: weekOffers,
      target: WEEK_TARGET,
      sent: weekMails.filter((m) => m.sentAt && m.sentAt >= weekFrom).length,
      opened: weekMails.filter((m) => m.openedAt && m.openedAt >= weekFrom).length,
      replied: weekMails.filter((m) => m.repliedAt && m.repliedAt >= weekFrom).length,
    },
    supply: { ready: shortlist.candidates, daysLeft: Math.ceil(shortlist.candidates / DAILY_RESEARCH_CAP), perNight: DAILY_RESEARCH_CAP },
    health: [
      ...health,
      ...(shortlist.candidates < 15
        ? [{ level: "warn" as const, text: `Zásoba pre Noru je nízka: ${shortlist.candidates} leadov, vystačí približne ${Math.ceil(shortlist.candidates / DAILY_RESEARCH_CAP)} dní. Doplní ju ranný sken; pomôže aj analýza firiem v Leadoch.`, href: `${baseUrl()}/leads` }]
        : []),
      ...(budget.available && budget.pctUsed >= 0.9
        ? [{ level: "warn" as const, text: `Rozpočet je vyčerpaný na ${Math.round(budget.pctUsed * 100)} %, nočné behy sa zastavia.` }]
        : []),
    ],
    nightOn: process.env.AGENT_NIGHT_DISABLED !== "1",
    autopilot,
    learned: {
      summary: lessonNotes.find((n) => (n.data as { summary?: boolean } | null)?.summary)?.body ?? null,
      lessons: lessonNotes.filter((n) => !(n.data as { summary?: boolean } | null)?.summary).slice(0, 4).map((n) => n.body ?? "").filter(Boolean),
      at: lessonNotes[0]?.createdAt.toISOString() ?? null,
    },
    news: newsNotes.find((n) => n.body) ? { title: newsNotes.find((n) => n.body)!.title ?? "", body: newsNotes.find((n) => n.body)!.body ?? "", at: newsNotes.find((n) => n.body)!.createdAt.toISOString() } : null,
  };
}

/** Kontroly, ktoré odhalia, prečo by mail neodišiel alebo agent nepracoval. */
async function healthChecks(): Promise<HealthItem[]> {
  const out: HealthItem[] = [];
  if (!process.env.ANTHROPIC_API_KEY) out.push({ level: "error", text: "Chýba ANTHROPIC_API_KEY: agenti nemôžu písať." });
  try {
    const campaigns = await prisma.leadCampaign.findMany({ where: { isActive: true }, select: { segmentId: true } });
    if (!campaigns.length) {
      out.push({ level: "error", text: "Žiadna kampaň nie je aktívna: schválené maily by neodišli.", href: `${baseUrl()}/leads/kampane` });
    } else if (!campaigns.some((c) => !c.segmentId)) {
      const active = new Set(campaigns.map((c) => c.segmentId));
      const [pool, mails] = await Promise.all([
        prisma.lead.groupBy({
          by: ["segmentId"],
          where: { ...poolWhere((await agentMarket()).market), segment: { is: { OR: PRIORITY_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" as const } })) } } },
          _count: { _all: true },
        }),
        prisma.leadEmail.findMany({ where: { status: { in: ["draft", "approved"] } }, select: { lead: { select: { segmentId: true } } }, take: 800 }),
      ]);
      const need = new Map<string, number>();
      for (const g of pool) if (g.segmentId && !active.has(g.segmentId)) need.set(g.segmentId, (need.get(g.segmentId) ?? 0) + g._count._all);
      for (const m of mails) if (m.lead.segmentId && !active.has(m.lead.segmentId)) need.set(m.lead.segmentId, (need.get(m.lead.segmentId) ?? 0) + 1);
      if (need.size) {
        const names = await prisma.leadSegment.findMany({ where: { id: { in: [...need.keys()] } }, select: { id: true, name: true } });
        const list = names.map((seg) => `${seg.name} (${need.get(seg.id)})`).join(", ");
        out.push({
          level: "warn",
          text: `Tieto odbory nemajú aktívnu kampaň, schválený mail z nich by neodišiel: ${list}. Vytvor pre ne kampaň v Kampaniach.`,
          href: `${baseUrl()}/leads/kampane`,
        });
      }
    }
  } catch {
    /* kontrola je doplnok */
  }
  try {
    const settings = await getNotificationSettings();
    if (!telegramConfigured() || !settings.enabled || !settings.telegramChatId)
      out.push({ level: "warn", text: "Telegram nie je nastavený: ranný prehľad ti neprijde na mobil.", href: `${baseUrl()}/settings` });
  } catch {
    /* ignoruj */
  }
  if (!(await notesAvailable())) out.push({ level: "error", text: "Chýba tabuľka agent_notes: autopilot Skauta nebeží a odôvodnenia sa neukladajú. Spusti SQL z postupu." });
  if (process.env.AGENT_NIGHT_DISABLED === "1") out.push({ level: "info", text: "Nočný režim je vypnutý (AGENT_NIGHT_DISABLED=1): agenti cez noc nepracujú." });
  return out;
}

const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** Text pre Telegram (HTML). Krátky, čitateľný na mobile. */
export function digestTelegram(d: Digest): string {
  const date = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "numeric", timeZone: "Europe/Bratislava" }).format(new Date(d.at));
  const done = d.offers.filter((o) => o.status === "done");
  const lines: string[] = [`<b>Ranný prehľad</b> · ${escapeHtml(date)}`, ""];
  lines.push("<b>Cez noc</b>");
  if (!d.offers.length && !d.scoutRejected.length && !d.mockupsMade) lines.push("• Agenti nič nespracovali (nočný režim nemal čo alebo bol vypnutý).");
  if (done.length)
    lines.push(`• Nora pripravila ${done.length} ${plural(done.length, "ponuku", "ponuky", "ponúk")}: ${done.slice(0, 4).map((o) => escapeHtml(o.company)).join(", ")}${done.length > 4 ? "…" : ""}`);
  if (d.mockupsMade) lines.push(`• Ateliér navrhol ${d.mockupsMade} ${plural(d.mockupsMade, "domovskú stránku", "domovské stránky", "domovských stránok")}${d.premiumMade ? ` (prémiových ${d.premiumMade})` : ""}`);
  if (d.scoutRejected.length) lines.push(`• Miro vyradil ${d.scoutRejected.length} nevhodných leadov`);
  const failed = d.offers.filter((o) => o.status === "failed");
  if (failed.length) lines.push(`• Zlyhalo: ${failed.length} ${plural(failed.length, "beh", "behy", "behov")}`);
  if (d.viewedMockups.length) lines.push(`• Návrh si otvorili: ${d.viewedMockups.slice(0, 4).map((v) => `<a href="${escapeHtml(v.url)}">${escapeHtml(v.company)}</a> (${v.views}×)`).join(", ")}`);
  if (d.replies.length) lines.push(`• Odpovedali: ${d.replies.slice(0, 4).map((r) => escapeHtml(r.company)).join(", ")}`);
  if (d.opens || d.clicks) lines.push(`• Maily: ${d.opens} otvorení, ${d.clicks} klikov`);
  lines.push(`• Minuté: ${eur(d.spentSinceEur)}${d.budget.available ? `, mesiac ${eur(d.budget.spentEur)} z ${d.budget.capEur} €` : ""}`);
  lines.push(`• Týždeň: ${d.week.offers} z ${d.week.target} ponúk, odoslaných ${d.week.sent}, otvorení ${d.week.opened}, odpovedí ${d.week.replied}`);
  lines.push(`• Zásoba pre Noru: ${d.supply.ready} leadov (~${d.supply.daysLeft} dní)`);
  if (d.autopilot.available)
    lines.push(`• Miro za 7 dní (${d.autopilot.market === "SK" ? "Slovensko" : "Slovensko + Česko"}): ${d.autopilot.scans} skenov, ${d.autopilot.found} firiem, ${d.autopilot.suitable} vhodných, ${d.autopilot.rejected} skrytých s dôvodom`);
  if (d.news) lines.push(`• Novinky z AI: ${escapeHtml(d.news.body.slice(0, 200))}`);
  lines.push("", "<b>Čo musíš ty</b>");
  if (!d.todo.length) lines.push("• Nič, všetko je vybavené.");
  d.todo.forEach((t, i) => lines.push(`${i + 1}. <a href="${escapeHtml(t.href)}">${escapeHtml(t.label)}</a> (${t.count})${t.detail ? ` · ${escapeHtml(t.detail)}` : ""}`));
  const warns = d.health.filter((h) => h.level !== "info");
  if (warns.length) {
    lines.push("", "<b>Pozor</b>");
    for (const h of warns.slice(0, 4)) lines.push(`⚠ ${h.href ? `<a href="${escapeHtml(h.href)}">${escapeHtml(h.text)}</a>` : escapeHtml(h.text)}`);
  }
  return lines.join("\n");
}

export type DigestSend = { sent: boolean; reason?: string; text?: string };

/** Pošle prehľad na Telegram (raz za deň; force obchádza kontrolu duplicity). */
export async function sendMorningDigest(opts: { force?: boolean; dry?: boolean } = {}): Promise<DigestSend> {
  const digest = await buildDigest();
  const text = digestTelegram(digest);
  if (opts.dry) return { sent: false, reason: "dry", text };
  const settings = await getNotificationSettings();
  if (!telegramConfigured() || !settings.enabled || !settings.telegramChatId) return { sent: false, reason: "Telegram nie je nastavený.", text };
  const day = new Date().toISOString().slice(0, 10);
  const dedupKey = `agents-digest:${day}`;
  if (!opts.force) {
    const seen = await prisma.sentAlert.findUnique({ where: { dedupKey } }).catch(() => null);
    if (seen) return { sent: false, reason: "Dnešný prehľad už odišiel.", text };
  }
  const res = await sendTelegram(settings.telegramChatId, text, { link: `${baseUrl()}/agenti`, linkLabel: "Otvoriť pracovňu agentov" });
  if (!res.ok) return { sent: false, reason: res.error, text };
  await prisma.sentAlert
    .upsert({ where: { dedupKey }, update: { body: text.slice(0, 2000) }, create: { dedupKey, type: "agents-digest", severity: "info", title: "Ranný prehľad agentov", body: text.slice(0, 2000) } })
    .catch(() => {});
  return { sent: true, text };
}
