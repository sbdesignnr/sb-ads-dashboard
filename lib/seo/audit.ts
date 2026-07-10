import { prisma } from "@/lib/prisma";
import type { SeoSite } from "@prisma/client";
import { crawlSite } from "./crawler";
import { runChecks, priorityOf, type Pillar, type GscSignals } from "./checks";
import { readPsi } from "./metrics";
import { gscConfigured, gscStatus, searchAnalytics, daysAgo } from "./gsc";

const PILLARS: Pillar[] = ["technical", "onpage", "content", "authority", "local"];

/** Get (or lazily create) the primary site. */
export async function getPrimarySite(): Promise<SeoSite> {
  const existing = await prisma.seoSite.findFirst({ where: { isPrimary: true } });
  if (existing) return existing;
  return prisma.seoSite.create({
    data: {
      domain: "sbdesign.sk",
      url: "https://www.sbdesign.sk",
      gscProperty: "sc-domain:sbdesign.sk",
      isPrimary: true,
    },
  });
}

/**
 * Pillar score 0-100: starts at 100 and loses ground for every open task.
 * Penalties decay by rank (1/√n) so the worst problems dominate and a long tail
 * of minor ones can't bottom the score out — one critical issue should hurt more
 * than ten cosmetic ones, and a pillar with real issues must never look "green".
 */
function pillarScore(open: { pillar: string; impact: number }[], pillar: Pillar): number {
  const tasks = open
    .filter((t) => t.pillar === pillar)
    .sort((a, b) => b.impact - a.impact);
  if (!tasks.length) return 100;
  const penalty = tasks.reduce((sum, t, i) => sum + (t.impact * 2) / Math.sqrt(i + 1), 0);
  return Math.max(0, Math.round(100 - Math.min(100, penalty)));
}

export interface AuditResult {
  auditId: string;
  pagesCrawled: number;
  tasksOpen: number;
  tasksNew: number;
  tasksResolved: number;
  score: number;
  pillarScores: Record<Pillar, number>;
  gscConnected: boolean;
  gscMessage?: string;
}

/**
 * Run a full audit: crawl the site, evaluate every check, then reconcile the task
 * list. Tasks are keyed by `checkKey`, so re-running updates the reasoning with
 * fresh numbers instead of creating duplicates — and a check that no longer fires
 * auto-resolves its task (unless the user already marked it done).
 */
export async function runAudit(siteId?: string): Promise<AuditResult> {
  const site = siteId ? await prisma.seoSite.findUniqueOrThrow({ where: { id: siteId } }) : await getPrimarySite();

  const gsc = gscConfigured() ? await gscStatus() : null;
  const audit = await prisma.seoAudit.create({
    data: { siteId: site.id, status: "running", gscConnected: Boolean(gsc?.ok) },
  });

  try {
    const crawl = await crawlSite(site.url, 40);
    const publishedPosts = await prisma.blogPost.count({ where: { status: "published" } });
    // One PageSpeed run on the homepage — it's slow (~30 s) but Core Web Vitals
    // are a ranking factor, and a bad LCP outweighs most on-page tweaks.
    const psi = await readPsi(site.url).catch(() => ({ lcp: null, cls: null, performance: null }));

    // Real positions/CTR — the checks that need them simply don't fire without GSC.
    let gscSignals: GscSignals | null = null;
    if (gsc?.ok && site.gscProperty) {
      const window = { siteUrl: site.gscProperty, startDate: daysAgo(31), endDate: daysAgo(3) };
      const [queries, pages] = await Promise.all([
        searchAnalytics({ ...window, dimensions: ["query"], rowLimit: 500 }).catch(() => []),
        searchAnalytics({ ...window, dimensions: ["page"], rowLimit: 500 }).catch(() => []),
      ]);
      const map = (rows: typeof queries) =>
        rows.map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
      gscSignals = { queries: map(queries), pages: map(pages) };
    }

    const drafts = runChecks(crawl, publishedPosts, { url: site.url, ...psi }, gscSignals);

    const now = new Date();
    let tasksNew = 0;
    for (const d of drafts) {
      const priority = priorityOf(d.impact, d.effortMin);
      const existing = await prisma.seoTask.findUnique({
        where: { siteId_checkKey: { siteId: site.id, checkKey: d.checkKey } },
      });

      if (!existing) tasksNew++;
      await prisma.seoTask.upsert({
        where: { siteId_checkKey: { siteId: site.id, checkKey: d.checkKey } },
        create: {
          siteId: site.id,
          checkKey: d.checkKey,
          pillar: d.pillar,
          title: d.title,
          why: d.why,
          steps: d.steps,
          codeSnippet: d.codeSnippet ?? null,
          targetUrl: d.targetUrl ?? null,
          effortMin: d.effortMin,
          impact: d.impact,
          priority,
          metric: d.metric ?? null,
          metricScope: d.metricScope ?? null,
          expectedNote: d.expectedNote ?? null,
          verifyAfterDays: d.verifyAfterDays ?? 28,
        },
        // Refresh the wording/numbers, but never clobber the user's progress.
        update: {
          title: d.title,
          why: d.why,
          steps: d.steps,
          codeSnippet: d.codeSnippet ?? null,
          effortMin: d.effortMin,
          impact: d.impact,
          priority,
          expectedNote: d.expectedNote ?? null,
          // A check that fires again after being "done" means it regressed.
          ...(existing?.status === "done" || existing?.status === "verified" ? { status: "todo", doneAt: null } : {}),
        },
      });
    }

    // Checks that stopped firing → the problem is gone. Auto-resolve, but leave
    // manual playbook tasks (authority/local) alone — a crawl can't see those.
    const firedKeys = new Set(drafts.map((d) => d.checkKey));
    const stale = await prisma.seoTask.findMany({
      where: { siteId: site.id, status: { in: ["todo", "doing"] }, pillar: { notIn: ["authority", "local"] } },
      select: { id: true, checkKey: true },
    });
    const resolvedIds = stale.filter((t) => !firedKeys.has(t.checkKey)).map((t) => t.id);
    if (resolvedIds.length) {
      await prisma.seoTask.updateMany({
        where: { id: { in: resolvedIds } },
        data: { status: "verified", verdict: "improved", verdictNote: "Kontrola už nehlási problém.", doneAt: now },
      });
    }

    const open = await prisma.seoTask.findMany({
      where: { siteId: site.id, status: { in: ["todo", "doing"] } },
      select: { pillar: true, impact: true },
    });
    const pillarScores = Object.fromEntries(PILLARS.map((p) => [p, pillarScore(open, p)])) as Record<Pillar, number>;
    const score = Math.round(PILLARS.reduce((s, p) => s + pillarScores[p], 0) / PILLARS.length);

    await prisma.seoAudit.update({
      where: { id: audit.id },
      data: {
        status: "completed",
        score,
        pillarScores,
        pagesCrawled: crawl.pages.length,
        tasksOpen: open.length,
        completedAt: now,
      },
    });

    return {
      auditId: audit.id,
      pagesCrawled: crawl.pages.length,
      tasksOpen: open.length,
      tasksNew,
      tasksResolved: resolvedIds.length,
      score,
      pillarScores,
      gscConnected: Boolean(gsc?.ok),
      gscMessage: gsc?.ok ? undefined : gsc?.message,
    };
  } catch (e) {
    await prisma.seoAudit.update({
      where: { id: audit.id },
      data: { status: "failed", errorMessage: (e as Error).message.slice(0, 300), completedAt: new Date() },
    });
    throw e;
  }
}
