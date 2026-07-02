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

function dashboardLink(): string {
  const base = (process.env.NEXTAUTH_URL || process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace(/\/api\/.*/, "") || "").replace(/\/$/, "");
  return base ? `${base}/google-ads` : "";
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
  if (!connected) return { connected: false, candidates: 0, sent: 0, skipped: 0, error: "not_connected" };

  const customerId = getConfiguredCustomerId() ?? undefined;
  const day = bratislavaDate();
  const candidates: AlertCandidate[] = [];
  const conversionAlerts: FinalAlert[] = [];

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
  let finals: FinalAlert[] = [...conversionAlerts];
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

  // --- Deliver ---
  if (!settings.enabled || !settings.telegramChatId) {
    return { connected: true, candidates: candidates.length, sent: 0, skipped: finals.length };
  }
  const quiet = inQuietHours(settings);
  const link = dashboardLink();
  let sent = 0;
  let skipped = 0;
  for (const a of finals) {
    if (quiet && a.severity !== "critical") {
      skipped++;
      continue;
    }
    const text = `${SEVERITY_ICON[a.severity]} <b>${escapeHtml(a.title)}</b>\n\n${escapeHtml(a.body)}`;
    const res = await sendTelegram(settings.telegramChatId, text, {
      link: link || undefined,
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

  return { connected: true, candidates: candidates.length, sent, skipped };
}

/** Send a one-off test message so the user can confirm delivery works. */
export async function sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const settings = await getNotificationSettings();
  if (!settings.telegramChatId) return { ok: false, error: "no_chat" };
  const link = dashboardLink();
  return sendTelegram(
    settings.telegramChatId,
    `✅ <b>Test upozornenia</b>\n\nToto je skúšobná správa zo SB Ads Dashboardu. Ak ju vidíš, mobilné upozornenia fungujú.`,
    { link: link || undefined },
  );
}
