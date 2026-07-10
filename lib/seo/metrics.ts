import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { searchAnalytics, daysAgo, gscConfigured, GscUnavailableError } from "./gsc";

/**
 * Reading a task's metric. This is what turns "I did the thing" into "the thing
 * worked" — every task names a metric, we snapshot it when the task is completed
 * and read it again after the verification window.
 *
 * GSC data lags ~2-3 days, so every window ends 3 days ago.
 */

export type MetricId =
  | "gsc_impressions"
  | "gsc_clicks"
  | "gsc_ctr"
  | "gsc_position"
  | "psi_lcp"
  | "ga4_organic_sessions";

/** Lower is better for these — a position of 3 beats 9, an LCP of 1.8s beats 3.2s. */
const LOWER_IS_BETTER: MetricId[] = ["gsc_position", "psi_lcp"];

export function lowerIsBetter(metric: string): boolean {
  return LOWER_IS_BETTER.includes(metric as MetricId);
}

export const METRIC_LABEL: Record<MetricId, string> = {
  gsc_impressions: "Impresie (Search Console)",
  gsc_clicks: "Kliky (Search Console)",
  gsc_ctr: "CTR (Search Console)",
  gsc_position: "Priemerná pozícia (Search Console)",
  psi_lcp: "LCP — načítanie hlavného obsahu",
  ga4_organic_sessions: "Organické návštevy (GA4)",
};

const WINDOW_DAYS = 28;
const GSC_LAG_DAYS = 3;

async function readGsc(metric: MetricId, siteUrl: string, scope: string | null): Promise<number | null> {
  const rows = await searchAnalytics({
    siteUrl,
    startDate: daysAgo(WINDOW_DAYS + GSC_LAG_DAYS),
    endDate: daysAgo(GSC_LAG_DAYS),
    dimensions: ["page"],
    rowLimit: 1000,
  });
  // Scope to one URL when the task targets a page; otherwise aggregate the site.
  const relevant = scope ? rows.filter((r) => r.keys[0]?.replace(/\/$/, "") === scope.replace(/\/$/, "")) : rows;
  if (!relevant.length) return null;

  const impressions = relevant.reduce((s, r) => s + r.impressions, 0);
  const clicks = relevant.reduce((s, r) => s + r.clicks, 0);
  switch (metric) {
    case "gsc_impressions":
      return impressions;
    case "gsc_clicks":
      return clicks;
    case "gsc_ctr":
      return impressions ? clicks / impressions : null;
    case "gsc_position": {
      // Impression-weighted average — an unweighted mean over pages is meaningless.
      const weighted = relevant.reduce((s, r) => s + r.position * r.impressions, 0);
      return impressions ? weighted / impressions : null;
    }
    default:
      return null;
  }
}

export interface PsiResult {
  lcp: number | null; // seconds
  cls: number | null;
  performance: number | null; // 0-100
}

/**
 * PageSpeed Insights runs a real Lighthouse audit server-side — it routinely
 * takes 20-40 s and occasionally times out, so give it room and retry once.
 * Two runs of the same URL differ by a few percent; that's why `judge()` treats
 * a ±5 % move as noise.
 */
export async function readPsi(url: string): Promise<PsiResult> {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  const q = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (key) q.set("key", key);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, {
        signal: AbortSignal.timeout(70000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        lighthouseResult?: {
          categories?: { performance?: { score?: number } };
          audits?: Record<string, { numericValue?: number }>;
        };
      };
      const audits = data.lighthouseResult?.audits ?? {};
      const lcpMs = audits["largest-contentful-paint"]?.numericValue;
      const cls = audits["cumulative-layout-shift"]?.numericValue;
      const perf = data.lighthouseResult?.categories?.performance?.score;
      return {
        lcp: typeof lcpMs === "number" ? Math.round(lcpMs) / 1000 : null,
        cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
        performance: typeof perf === "number" ? Math.round(perf * 100) : null,
      };
    } catch {
      /* timeout — retry once */
    }
  }
  return { lcp: null, cls: null, performance: null };
}

async function readPsiLcp(url: string): Promise<number | null> {
  return (await readPsi(url)).lcp;
}

function ga4Credentials(): Record<string, unknown> | null {
  const raw = (process.env.GA4_SERVICE_ACCOUNT_KEY || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* try base64 */
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function readGa4OrganicSessions(): Promise<number | null> {
  const credentials = ga4Credentials();
  const propertyId = (process.env.GA4_PROPERTY_ID || "").trim();
  if (!credentials || !propertyId) return null;
  try {
    const client = new BetaAnalyticsDataClient({ credentials });
    const [res] = await client.runReport({
      property: propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`,
      dateRanges: [{ startDate: `${WINDOW_DAYS}daysAgo`, endDate: "today" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: "Organic Search" },
        },
      },
    });
    const v = res.rows?.[0]?.metricValues?.[0]?.value;
    return v ? Number(v) : 0;
  } catch {
    return null;
  }
}

/**
 * Read one metric for a task. Returns null when the data source isn't available
 * (GSC not connected, page has no impressions yet) — callers must treat null as
 * "cannot measure", never as zero.
 */
export async function readMetric(
  metric: string,
  opts: { gscProperty: string | null; scope: string | null; siteUrl: string },
): Promise<number | null> {
  try {
    if (metric.startsWith("gsc_")) {
      if (!gscConfigured() || !opts.gscProperty) return null;
      return await readGsc(metric as MetricId, opts.gscProperty, opts.scope);
    }
    if (metric === "psi_lcp") return await readPsiLcp(opts.scope ?? opts.siteUrl);
    if (metric === "ga4_organic_sessions") return await readGa4OrganicSessions();
    return null;
  } catch (e) {
    if (e instanceof GscUnavailableError) return null;
    throw e;
  }
}

export type Verdict = "improved" | "unchanged" | "worse";

/** A ±5 % band counts as noise — SEO metrics wobble week to week. */
export function judge(metric: string, baseline: number, actual: number): { verdict: Verdict; changePct: number } {
  const raw = baseline === 0 ? (actual > 0 ? 100 : 0) : ((actual - baseline) / Math.abs(baseline)) * 100;
  const changePct = Math.round(raw * 10) / 10;
  const better = lowerIsBetter(metric) ? changePct < 0 : changePct > 0;
  if (Math.abs(changePct) < 5) return { verdict: "unchanged", changePct };
  return { verdict: better ? "improved" : "worse", changePct };
}
