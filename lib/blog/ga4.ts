import { BetaAnalyticsDataClient } from "@google-analytics/data";

export interface ArticleMetrics {
  views: number;
  avgTimeSec: number;
  bounceRate: number; // percentage 0-100
}
export interface TrafficPoint {
  date: string; // YYYY-MM-DD
  value: number;
}
export interface ArticlePerformance {
  source: "ga4" | "simulated";
  metrics: ArticleMetrics;
  series: TrafficPoint[];
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function ga4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID?.trim() && process.env.GA4_SERVICE_ACCOUNT_KEY?.trim());
}

function propertyPath(): string {
  const p = (process.env.GA4_PROPERTY_ID || "").trim();
  return p.startsWith("properties/") ? p : `properties/${p}`;
}

function parseCredentials(): Record<string, unknown> | null {
  const raw = (process.env.GA4_SERVICE_ACCOUNT_KEY || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* maybe base64-encoded */
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

let cached: BetaAnalyticsDataClient | null = null;
function getClient(): BetaAnalyticsDataClient | null {
  if (cached) return cached;
  const credentials = parseCredentials();
  if (!credentials) return null;
  cached = new BetaAnalyticsDataClient({ credentials });
  return cached;
}

function fmtDate(yyyymmdd: string): string {
  if (yyyymmdd.length === 8) return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  return yyyymmdd;
}

async function fetchFromGA4(client: BetaAnalyticsDataClient, slug: string): Promise<ArticlePerformance> {
  const property = propertyPath();
  const pathValue = `/blog/${slug}`;

  const [totals] = await client.runReport({
    property,
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: "bounceRate" }],
    dimensionFilter: {
      filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: pathValue } },
    },
  });
  const row = totals.rows?.[0];
  const metrics: ArticleMetrics = {
    views: Math.round(num(row?.metricValues?.[0]?.value)),
    avgTimeSec: Math.round(num(row?.metricValues?.[1]?.value)),
    bounceRate: Math.round(num(row?.metricValues?.[2]?.value) * 1000) / 10,
  };

  const [daily] = await client.runReport({
    property,
    dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: pathValue } } },
          {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
        ],
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const series: TrafficPoint[] = (daily.rows ?? []).map((r) => ({
    date: fmtDate(r.dimensionValues?.[0]?.value ?? ""),
    value: Math.round(num(r.metricValues?.[0]?.value)),
  }));

  return { source: "ga4", metrics, series };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function simulate(slug: string): ArticlePerformance {
  const h = hashString(slug);
  const metrics: ArticleMetrics = {
    views: 150 + (h % 1600),
    avgTimeSec: 55 + (h % 185),
    bounceRate: 32 + (h % 43),
  };
  const series: TrafficPoint[] = [];
  const today = new Date();
  const slope = ((h % 5) - 1) * 0.15; // slight up/down trend
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const seed = hashString(`${slug}:${i}`);
    const value = Math.max(0, Math.round(4 + (h % 16) + (seed % 9) + (29 - i) * slope));
    series.push({ date: d.toISOString().slice(0, 10), value });
  }
  return { source: "simulated", metrics, series };
}

/** Real GA4 data when configured, otherwise deterministic simulated estimates. */
export async function getArticlePerformance(slug: string): Promise<ArticlePerformance> {
  if (ga4Configured()) {
    try {
      const client = getClient();
      if (client) return await fetchFromGA4(client, slug);
    } catch (e) {
      console.warn("[ga4] falling back to simulated:", (e as Error).message);
    }
  }
  return simulate(slug);
}
