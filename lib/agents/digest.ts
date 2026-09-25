// Ranný prehľad: čo agenti urobili cez noc a čo musí spraviť človek. Počíta sa z reálnych dát
// (výskumy, návrhy, maily, pokladnica), nič sa nevymýšľa. Posiela sa na Telegram a zobrazuje v
// /agenti; nič sa neodosiela zákazníkom.
import { prisma } from "@/lib/prisma";
import { getBudget } from "@/lib/agents/budget";
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
  budget: { spentEur: number; capEur: number; pctUsed: number; todayEur: number; available: boolean };
  todo: DigestTodo[];
}

const baseUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://ads.sbdesign.sk").replace(/\/$/, "");

export async function buildDigest(sinceHours = 16): Promise<Digest> {
  const since = new Date(Date.now() - sinceHours * 3_600_000);
  const [research, mockups, viewed, rejected, mails, pendingOffers, drafts, budget, spend] = await Promise.all([
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
    prisma.leadResearch.count({ where: { status: "done", appliedAt: null, emailBody: { not: null } } }),
    prisma.leadEmail.count({ where: { status: "draft" } }),
    getBudget(),
    prisma.agentSpend.aggregate({ where: { createdAt: { gte: since } }, _sum: { eur: true } }).catch(() => ({ _sum: { eur: 0 } })),
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
    budget: { spentEur: budget.spentEur, capEur: budget.capEur, pctUsed: budget.pctUsed, todayEur: budget.todayEur, available: budget.available },
    todo,
  };
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
  lines.push("", "<b>Čo musíš ty</b>");
  if (!d.todo.length) lines.push("• Nič, všetko je vybavené.");
  d.todo.forEach((t, i) => lines.push(`${i + 1}. <a href="${escapeHtml(t.href)}">${escapeHtml(t.label)}</a> (${t.count})${t.detail ? ` · ${escapeHtml(t.detail)}` : ""}`));
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
