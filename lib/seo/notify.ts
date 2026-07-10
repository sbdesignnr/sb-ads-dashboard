import { prisma } from "@/lib/prisma";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendTelegram, escapeHtml } from "@/lib/notifications/telegram";
import { getPrimarySite } from "./audit";

/**
 * The weekly nudge. The audit only creates value if someone acts on it, so after
 * each run we push the three highest-priority tasks — with the time they cost —
 * plus whatever the verification engine proved since last week.
 */

const PILLAR: Record<string, string> = {
  technical: "Technické",
  onpage: "On-page",
  content: "Obsah",
  authority: "Autorita",
  local: "Lokálne",
};

function siteBase(): string {
  return (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}

export interface DigestResult {
  sent: boolean;
  reason?: string;
}

export async function sendWeeklySeoDigest(): Promise<DigestResult> {
  const settings = await getNotificationSettings();
  if (!settings.enabled || !settings.alertSeo || !settings.telegramChatId) {
    return { sent: false, reason: "disabled_or_no_chat" };
  }

  const site = await getPrimarySite();
  const [audits, open, verifiedRecently] = await Promise.all([
    prisma.seoAudit.findMany({
      where: { siteId: site.id, status: "completed" },
      orderBy: { completedAt: "desc" },
      take: 2,
      select: { score: true },
    }),
    prisma.seoTask.findMany({
      where: { siteId: site.id, status: { in: ["todo", "doing"] } },
      orderBy: { priority: "desc" },
    }),
    prisma.seoTask.findMany({
      where: {
        siteId: site.id,
        status: "verified",
        verdict: { not: null },
        updatedAt: { gte: new Date(Date.now() - 8 * 86_400_000) },
      },
      select: { title: true, verdict: true, verdictNote: true },
      take: 5,
    }),
  ]);

  if (!audits.length) return { sent: false, reason: "no_audit" };

  const score = audits[0].score;
  const prev = audits[1]?.score;
  const delta = prev === undefined ? "" : score > prev ? ` (▲ +${score - prev})` : score < prev ? ` (▼ ${score - prev})` : " (bez zmeny)";

  const top = open.slice(0, 3);
  const totalMin = open.reduce((s, t) => s + t.effortMin, 0);

  const parts: string[] = [
    `🔍 <b>SEO týždeň — skóre ${score}/100${delta}</b>`,
    "",
    `${open.length} otvorených úloh · ~${Math.round(totalMin / 60)} h práce`,
  ];

  if (top.length) {
    parts.push("", "<b>Tento týždeň sprav tieto tri:</b>");
    top.forEach((t, i) => {
      parts.push(`\n${i + 1}. <b>${escapeHtml(t.title)}</b>`);
      parts.push(`   ${PILLAR[t.pillar] ?? t.pillar} · ${t.effortMin} min · dopad ${t.impact}/5`);
      if (t.expectedNote) parts.push(`   → ${escapeHtml(t.expectedNote)}`);
    });
  } else {
    parts.push("", "✅ Žiadne otvorené úlohy. Pekná práca.");
  }

  if (verifiedRecently.length) {
    parts.push("", "<b>Overené za posledný týždeň:</b>");
    for (const v of verifiedRecently) {
      const icon = v.verdict === "improved" ? "📈" : v.verdict === "worse" ? "📉" : "➖";
      parts.push(`${icon} ${escapeHtml(v.title)}`);
      if (v.verdictNote) parts.push(`   ${escapeHtml(v.verdictNote)}`);
    }
  }

  const base = siteBase();
  const res = await sendTelegram(settings.telegramChatId, parts.join("\n"), {
    link: base ? `${base}/seo` : undefined,
    linkLabel: "Otvoriť SEO",
  });
  return { sent: res.ok, reason: res.error };
}
