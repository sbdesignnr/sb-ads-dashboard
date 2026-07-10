import { prisma } from "@/lib/prisma";
import { getConfiguredCustomerId } from "@/lib/google-ads/client";
import { getStoredToken } from "@/lib/google-ads/auth";
import { sendTelegram, escapeHtml } from "./telegram";
import { getNotificationSettings, inQuietHours } from "./settings";
import {
  getCampaignStates,
  getDisapprovedAds,
  getAccountState,
  getTodayConversions,
} from "./gads-signals";
import { judgeAlerts } from "./ai";
import { generateWeeklyPlan } from "@/lib/blog/weekly-plan";
import type { AlertCandidate, AlertSeverity, FinalAlert } from "./types";

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  info: "💰",
};

function bratislavaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(now); // YYYY-MM-DD
}

/** ISO-week key like "2026-W27" (Bratislava) so blog ideas fire once a week. */
function isoWeek(now = new Date()): string {
  const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava" }).format(now));
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Current hour (0-23) in Bratislava. */
function bratislavaHour(now = new Date()): number {
  return (
    Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Bratislava" }).format(now)) % 24
  );
}

/** ISO weekday in Bratislava: 1=Mon … 7=Sun. */
function bratislavaIsoWeekday(now = new Date()): number {
  const jsDay = new Date(`${bratislavaDate(now)}T12:00:00Z`).getUTCDay(); // 0=Sun
  return jsDay === 0 ? 7 : jsDay;
}

/** Normalised 5-word title fingerprint — catches near-duplicate topic titles. */
function titleKey(s: string): string {
  return s
    .replace(/^(?:Nápad na blog|Čas napísať článok)\s*:\s*/i, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

/**
 * The concrete article to write next: the highest-ranked weekly topic that isn't
 * already a blog post (same target keyword or near-identical title) and wasn't
 * suggested in a recent reminder. Falls back to the top topic if all repeat.
 */
async function pickArticleTopic() {
  const topics = await generateWeeklyPlan();
  if (!topics.length) return null;

  const posts = await prisma.blogPost.findMany({ select: { title: true, targetKeyword: true } });
  const usedKeywords = new Set(posts.map((p) => p.targetKeyword?.toLowerCase().trim()).filter(Boolean) as string[]);
  const usedTitles = new Set(posts.map((p) => titleKey(p.title)));

  const prior = await prisma.sentAlert.findMany({
    where: { type: "blog_suggestion" },
    select: { title: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const a of prior) usedTitles.add(titleKey(a.title));

  return (
    topics.find((t) => !usedKeywords.has(t.targetKeyword.toLowerCase().trim()) && !usedTitles.has(titleKey(t.title))) ??
    topics[0]
  );
}

function siteBase(): string {
  return (process.env.NEXTAUTH_URL || process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace(/\/api\/.*/, "") || "").replace(/\/$/, "");
}

function linkFor(type: string): string | undefined {
  const base = siteBase();
  if (!base) return undefined;
  return type === "blog_suggestion" ? `${base}/blog` : `${base}/google-ads`;
}

export interface RunResult {
  connected: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  error?: string;
}

/** Main loop: gather signals, judge them, and push the ones that matter. */
export async function runNotifications(): Promise<RunResult> {
  const settings = await getNotificationSettings();
  const token = await getStoredToken();
  const connected = Boolean(token?.refreshToken);

  const customerId = getConfiguredCustomerId() ?? undefined;
  const day = bratislavaDate();
  const candidates: AlertCandidate[] = [];
  const conversionAlerts: FinalAlert[] = [];
  const extraAlerts: FinalAlert[] = [];

  // --- "Write an article" reminder (independent of Google Ads) ---
  // Fires on the configured weekday + hour (Bratislava), at most once per ISO week.
  // The cron ticks every 30 min, so an hour match gives two chances; the dedup key
  // ensures only the first one is delivered.
  if (settings.enabled && settings.alertBlog && settings.telegramChatId) {
    const dueNow =
      bratislavaIsoWeekday() === settings.blogReminderDay && bratislavaHour() === settings.blogReminderHour;
    const key = `blog_suggestion:${isoWeek()}`;
    if (dueNow && !(await prisma.sentAlert.findUnique({ where: { dedupKey: key } }))) {
      try {
        const topic = await pickArticleTopic();
        if (topic) {
          const outline = topic.outline.slice(0, 4).map((h) => `• ${h}`).join("\n");
          extraAlerts.push({
            key,
            type: "blog_suggestion",
            severity: "info",
            // Keep the topic in the title — pickArticleTopic() reads past alert
            // titles to avoid suggesting the same article twice.
            title: `Čas napísať článok: ${topic.title}`,
            body: [
              "Dnes je tvoj deň na nový článok. Konkrétna téma:",
              "",
              `📝 ${topic.title}`,
              "",
              `Prečo práve teraz: ${topic.reason}`,
              `Kľúčové slovo: ${topic.targetKeyword}`,
              `SEO potenciál: ${topic.potentialLabel} (${topic.seoPotential}/100)`,
              ...(outline ? ["", "Osnova:", outline] : []),
              "",
              "V dashboarde ti AI vygeneruje celý článok.",
            ].join("\n"),
          });
        }
      } catch {
        /* best-effort — a failed reminder must never break the whole run */
      }
    }
  }

  if (!connected) {
    // Deliver the blog idea even when Google Ads is disconnected, then stop.
    return deliverFinals(settings, [...extraAlerts], 0, false);
  }

  // --- Conversions (deterministic delta vs stored state) ---
  const today = await getTodayConversions(customerId);
  for (const c of today) {
    const state = await prisma.campaignConvState.findUnique({ where: { campaignId: c.campaignId } });
    const curConv = Math.floor(c.conversions);
    if (!state) {
      // First observation — set the baseline, never alert on history.
      await prisma.campaignConvState.create({
        data: { campaignId: c.campaignId, conversions: c.conversions, conversionsValue: c.conversionsValue },
      });
      continue;
    }
    const prevConv = Math.floor(state.conversions);
    const newConv = curConv - prevConv;
    const valueDelta = Math.max(0, c.conversionsValue - state.conversionsValue);
    await prisma.campaignConvState.update({
      where: { campaignId: c.campaignId },
      data: { conversions: c.conversions, conversionsValue: c.conversionsValue },
    });
    if (curConv < prevConv) continue; // day rollover — baseline reset above
    if (newConv < 1) continue;
    if (!settings.enabled || !settings.alertConversions || !settings.telegramChatId) continue;
    if (settings.minConversionValue != null && valueDelta < settings.minConversionValue) continue;
    const valTxt = valueDelta > 0 ? ` · hodnota ${valueDelta.toFixed(0)}€` : "";
    conversionAlerts.push({
      key: `conversion:${c.campaignId}:${day}:${curConv}`,
      type: "conversion",
      severity: "info",
      campaignId: c.campaignId,
      title: `Nová konverzia — ${c.campaignName}`,
      body: `${newConv}× nová konverzia${valTxt}.`,
    });
  }

  // --- Action signals (only if enabled) ---
  if (settings.alertActions) {
    const account = await getAccountState(customerId);
    if (account && account.status !== "ENABLED") {
      candidates.push({
        key: `account_status:${account.status}`,
        type: "account_status",
        severity: "critical",
        forceSend: true,
        facts: `Účet "${account.name}" má stav ${account.status} — kampane nemusia bežať. Treba to okamžite riešiť (platba/pozastavenie).`,
      });
    }

    for (const ad of await getDisapprovedAds(customerId)) {
      candidates.push({
        key: `disapproved:${ad.campaignId}:${ad.adId}`,
        type: "disapproved_ad",
        severity: "high",
        forceSend: true,
        campaignId: ad.campaignId,
        campaignName: ad.campaignName,
        facts: `Reklama (ID ${ad.adId}) v kampani "${ad.campaignName}" je ZAMIETNUTÁ — beží bez schválenej reklamy. Treba upraviť/požiadať o preskúmanie.`,
      });
    }

    for (const s of await getCampaignStates(customerId)) {
      const budgetLostPct = Math.round(s.budgetLostShare * 100);
      if (s.budgetLostShare >= 0.15 && s.conv7d >= 1) {
        candidates.push({
          key: `budget_limited:${s.id}:${day}`,
          type: "budget_limited",
          severity: "medium",
          forceSend: false,
          campaignId: s.id,
          campaignName: s.name,
          facts: `Kampaň "${s.name}" stráca ~${budgetLostPct}% zobrazení pre nízky rozpočet (denný ${s.budget.toFixed(0)}€), za 7 dní ${s.conv7d.toFixed(0)} konverzií pri ${s.cost7d.toFixed(0)}€. Funguje, ale rozpočet ju brzdí.`,
        });
      }
      if (s.cost7d >= 30 && s.conv7d === 0) {
        candidates.push({
          key: `tracking_broken:${s.id}:${day}`,
          type: "tracking_broken",
          severity: "high",
          forceSend: false,
          campaignId: s.id,
          campaignName: s.name,
          facts: `Kampaň "${s.name}" minula za 7 dní ${s.cost7d.toFixed(0)}€ ale má 0 konverzií (priem. denný rozpočet ${s.budget.toFixed(0)}€). Možné zlyhané meranie konverzií alebo neefektívna kampaň — ak nejde o novú kampaň v učení, treba skontrolovať konverzie.`,
        });
      }
    }
  }

  // --- Dedup against already-sent alerts ---
  const keys = candidates.map((c) => c.key);
  const already = keys.length
    ? new Set((await prisma.sentAlert.findMany({ where: { dedupKey: { in: keys } }, select: { dedupKey: true } })).map((a) => a.dedupKey))
    : new Set<string>();
  const fresh = candidates.filter((c) => !already.has(c.key));

  // --- AI expert judges the action candidates ---
  const finals: FinalAlert[] = [...conversionAlerts, ...extraAlerts];
  if (fresh.length && process.env.ANTHROPIC_API_KEY) {
    let judged: Awaited<ReturnType<typeof judgeAlerts>> = [];
    try {
      judged = await judgeAlerts(fresh);
    } catch {
      judged = [];
    }
    const byKey = new Map(fresh.map((c) => [c.key, c]));
    for (const j of judged) {
      const cand = byKey.get(j.key);
      if (!cand) continue;
      if (!j.send && !cand.forceSend) continue; // AI suppressed a non-urgent one
      finals.push({ key: cand.key, type: cand.type, severity: cand.severity, campaignId: cand.campaignId, title: j.title || cand.campaignName || "Google Ads", body: j.body || cand.facts });
    }
  } else if (fresh.length) {
    // No AI available: only push the unambiguous, forced ones with template text.
    for (const c of fresh.filter((c) => c.forceSend)) {
      finals.push({ key: c.key, type: c.type, severity: c.severity, campaignId: c.campaignId, title: c.campaignName ? `Google Ads — ${c.campaignName}` : "Google Ads", body: c.facts });
    }
  }

  return deliverFinals(settings, finals, candidates.length, true);
}

/** Push finalized alerts to Telegram (quiet hours honoured; non-critical deferred). */
async function deliverFinals(
  settings: Awaited<ReturnType<typeof getNotificationSettings>>,
  finals: FinalAlert[],
  candidatesCount: number,
  connected: boolean,
): Promise<RunResult> {
  if (!settings.enabled || !settings.telegramChatId) {
    return { connected, candidates: candidatesCount, sent: 0, skipped: finals.length };
  }
  const quiet = inQuietHours(settings);
  let sent = 0;
  let skipped = 0;
  for (const a of finals) {
    // The blog reminder fires at a weekday+hour the user picked themselves, so
    // quiet hours must not silently swallow it (it only gets one hour per week).
    if (quiet && a.severity !== "critical" && a.type !== "blog_suggestion") {
      skipped++;
      continue;
    }
    const icon = a.type === "blog_suggestion" ? "✍️" : SEVERITY_ICON[a.severity];
    const text = `${icon} <b>${escapeHtml(a.title)}</b>\n\n${escapeHtml(a.body)}`;
    const res = await sendTelegram(settings.telegramChatId, text, {
      link: linkFor(a.type),
      linkLabel: a.type === "blog_suggestion" ? "Otvoriť blog" : "Otvoriť dashboard",
      silent: a.severity === "info",
    });
    if (res.ok) {
      sent++;
      // Record non-conversion alerts for dedup (conversions are deduped via state).
      if (a.type !== "conversion") {
        await prisma.sentAlert.create({
          data: { dedupKey: a.key, type: a.type, severity: a.severity, campaignId: a.campaignId ?? null, title: a.title, body: a.body },
        }).catch(() => {});
      }
    } else {
      skipped++;
    }
  }
  return { connected, candidates: candidatesCount, sent, skipped };
}

/** Send a one-off test message so the user can confirm delivery works. */
export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getNotificationSettings();
  if (!settings.telegramChatId) return { ok: false, error: "no_chat" };
  const link = linkFor("test");
  return sendTelegram(
    settings.telegramChatId,
    `✅ <b>Test upozornenia</b>\n\nToto je skúšobná správa zo SB Ads Dashboardu. Ak ju vidíš, mobilné upozornenia fungujú.`,
    { link: link || undefined },
  );
}
