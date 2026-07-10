import { prisma } from "@/lib/prisma";
import { readMetric, judge, lowerIsBetter, METRIC_LABEL, type MetricId } from "./metrics";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendTelegram, escapeHtml } from "@/lib/notifications/telegram";

/**
 * The proof loop. Marking a task "done" snapshots its metric; after the task's
 * verification window we read it again and say plainly whether it worked. Without
 * this, an SEO tool is just a list of opinions.
 */

const fmt = (metric: string, v: number): string => {
  if (metric === "gsc_ctr") return `${(v * 100).toFixed(2)} %`;
  if (metric === "gsc_position") return v.toFixed(1);
  if (metric === "psi_lcp") return `${v.toFixed(2)} s`;
  return Math.round(v).toLocaleString("sk-SK");
};

/** Snapshot the metric as it stands right before the change takes effect. */
export async function captureBaseline(taskId: string): Promise<void> {
  const task = await prisma.seoTask.findUnique({ where: { id: taskId }, include: { site: true } });
  if (!task) return;

  const now = new Date();
  const verifyAt = new Date(now.getTime() + task.verifyAfterDays * 86_400_000);

  let baselineValue: number | null = null;
  if (task.metric) {
    baselineValue = await readMetric(task.metric, {
      gscProperty: task.site.gscProperty,
      scope: task.metricScope,
      siteUrl: task.site.url,
    }).catch(() => null);
  }

  await prisma.seoTask.update({
    where: { id: taskId },
    data: {
      status: "done",
      doneAt: now,
      verifyAt: task.metric ? verifyAt : null,
      baselineValue,
      baselineAt: baselineValue !== null ? now : null,
    },
  });
}

export interface VerifyRun {
  due: number;
  verified: number;
  skipped: number;
}

/** Cron entry point: judge every task whose verification window has elapsed. */
export async function verifyDueTasks(now = new Date()): Promise<VerifyRun> {
  const due = await prisma.seoTask.findMany({
    where: { status: "done", verifyAt: { lte: now } },
    include: { site: true },
  });
  if (!due.length) return { due: 0, verified: 0, skipped: 0 };

  const settings = await getNotificationSettings();
  let verified = 0;
  let skipped = 0;
  const lines: string[] = [];

  for (const task of due) {
    if (!task.metric || task.baselineValue === null) {
      // Nothing to compare against — close it out honestly rather than inventing a result.
      await prisma.seoTask.update({
        where: { id: task.id },
        data: { status: "verified", verdict: "unchanged", verdictNote: "Bez baseline sa efekt nedal zmerať." },
      });
      skipped++;
      continue;
    }

    const actual = await readMetric(task.metric, {
      gscProperty: task.site.gscProperty,
      scope: task.metricScope,
      siteUrl: task.site.url,
    }).catch(() => null);

    if (actual === null) {
      // Data source unavailable — retry in a week instead of scoring it blind.
      await prisma.seoTask.update({
        where: { id: task.id },
        data: { verifyAt: new Date(now.getTime() + 7 * 86_400_000) },
      });
      skipped++;
      continue;
    }

    const { verdict, changePct } = judge(task.metric, task.baselineValue, actual);
    const arrow = verdict === "improved" ? "📈" : verdict === "worse" ? "📉" : "➖";
    const dir = lowerIsBetter(task.metric) ? "(nižšie = lepšie)" : "";
    const note = `${METRIC_LABEL[task.metric as MetricId] ?? task.metric}: ${fmt(task.metric, task.baselineValue)} → ${fmt(task.metric, actual)} (${changePct > 0 ? "+" : ""}${changePct} %) ${dir}`.trim();

    await prisma.seoTask.update({
      where: { id: task.id },
      data: { status: "verified", actualValue: actual, verdict, verdictNote: note },
    });
    verified++;
    lines.push(`${arrow} <b>${escapeHtml(task.title)}</b>\n${escapeHtml(note)}`);
  }

  if (lines.length && settings.enabled && settings.telegramChatId) {
    await sendTelegram(
      settings.telegramChatId,
      `📊 <b>SEO — výsledky implementovaných úloh</b>\n\n${lines.join("\n\n")}`,
      { link: `${(process.env.NEXTAUTH_URL || "").replace(/\/$/, "")}/seo`, linkLabel: "Otvoriť SEO" },
    ).catch(() => {});
  }

  return { due: due.length, verified, skipped };
}
