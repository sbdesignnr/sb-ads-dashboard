import type {
  Campaign,
  CampaignStatus,
  CampaignType,
  DailyMetric,
  MetricTotals,
  TrendDirection,
} from "@/lib/types";
import { computeTotals } from "@/lib/utils/metrics";
import { googleCampaigns } from "@/lib/mock-data";
import { executeGaql, GoogleAdsNotConnectedError } from "./middleware";
import type { DataSource, GoogleKeywordMetric } from "./types";

const MICROS = 1_000_000;
const num = (v: unknown) => Number(v ?? 0);

// Google Ads has no LAST_90_DAYS / LAST_60_DAYS literal — use an explicit
// BETWEEN range computed from `days`.
function lastNDaysRange(days: number): { since: string; until: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return { since: fmt(since), until: fmt(until) };
}

function mapChannelType(type: string): CampaignType {
  switch (type) {
    case "SEARCH":
      return "search";
    case "DISPLAY":
      return "display";
    case "SHOPPING":
      return "shopping";
    case "PERFORMANCE_MAX":
      return "shopping";
    case "VIDEO":
      return "display";
    default:
      return "search";
  }
}

function mapStatus(status: string): CampaignStatus {
  if (status === "ENABLED") return "active";
  return "paused";
}

function deriveTrend(daily: DailyMetric[]): TrendDirection {
  const last = daily.slice(-7).reduce((a, d) => a + d.revenue, 0);
  const prev = daily.slice(-14, -7).reduce((a, d) => a + d.revenue, 0);
  if (prev === 0) return last > 0 ? "up" : "flat";
  const change = (last - prev) / prev;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "flat";
}

interface CampaignGaqlRow {
  campaign: { id: string | number; name: string; status: string; advertising_channel_type: string };
  campaign_budget?: { amount_micros?: string | number };
  segments: { date: string };
  metrics: {
    impressions?: string | number;
    clicks?: string | number;
    cost_micros?: string | number;
    conversions?: string | number;
    conversions_value?: string | number;
  };
}

function rowToDaily(r: CampaignGaqlRow): DailyMetric {
  return {
    date: r.segments.date,
    impressions: num(r.metrics.impressions),
    clicks: num(r.metrics.clicks),
    spend: num(r.metrics.cost_micros) / MICROS,
    conversions: num(r.metrics.conversions),
    revenue: num(r.metrics.conversions_value),
  };
}

/** All campaigns with a daily metric series, mapped to the app's Campaign type. */
export async function getCampaigns(customerId?: string, days = 90): Promise<Campaign[]> {
  const { since, until } = lastNDaysRange(days);
  const gaql = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY campaign.id
  `;

  const rows = await executeGaql<CampaignGaqlRow>(gaql, customerId);

  const grouped = new Map<string, { meta: CampaignGaqlRow; daily: DailyMetric[] }>();
  for (const r of rows) {
    const id = String(r.campaign.id);
    const entry = grouped.get(id) ?? { meta: r, daily: [] };
    entry.daily.push(rowToDaily(r));
    grouped.set(id, entry);
  }

  const campaigns: Campaign[] = [];
  for (const [id, { meta, daily }] of grouped) {
    daily.sort((a, b) => a.date.localeCompare(b.date));
    campaigns.push({
      id,
      name: meta.campaign.name,
      platform: "google",
      type: mapChannelType(meta.campaign.advertising_channel_type),
      objective: meta.campaign.advertising_channel_type,
      status: mapStatus(meta.campaign.status),
      dailyBudget: num(meta.campaign_budget?.amount_micros) / MICROS,
      startDate: daily[0]?.date ?? new Date().toISOString().slice(0, 10),
      trend: deriveTrend(daily),
      daily,
      changeHistory: [],
    });
  }

  return campaigns.sort(
    (a, b) =>
      computeTotals(b.daily).spend - computeTotals(a.daily).spend,
  );
}

/** Daily metrics + totals for a single campaign over a date range. */
export async function getCampaignMetrics(
  customerId: string | undefined,
  campaignId: string,
  dateRange: { since: string; until: string },
): Promise<{ daily: DailyMetric[]; totals: MetricTotals }> {
  const gaql = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${dateRange.since}' AND '${dateRange.until}'
    ORDER BY segments.date
  `;
  const rows = await executeGaql<CampaignGaqlRow>(gaql, customerId);
  const daily = rows.map(rowToDaily);
  return { daily, totals: computeTotals(daily) };
}

/** Account-level aggregated metrics over the last `days`. */
export async function getAccountMetrics(
  customerId?: string,
  days = 30,
): Promise<MetricTotals> {
  const { since, until } = lastNDaysRange(days);
  const gaql = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM customer
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;
  const rows = await executeGaql<CampaignGaqlRow>(gaql, customerId);
  return computeTotals(rows.map(rowToDaily));
}

/** Keyword-level metrics (top spenders) over the last 30 days. */
export async function getKeywordMetrics(customerId?: string): Promise<GoogleKeywordMetric[]> {
  const gaql = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.ctr,
      metrics.average_cpc
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `;

  interface KeywordRow {
    ad_group_criterion: { keyword: { text?: string; match_type?: string } };
    metrics: {
      impressions?: string | number;
      clicks?: string | number;
      cost_micros?: string | number;
      conversions?: string | number;
      ctr?: string | number;
      average_cpc?: string | number;
    };
  }

  const rows = await executeGaql<KeywordRow>(gaql, customerId);
  return rows.map((r) => ({
    keyword: r.ad_group_criterion.keyword.text ?? "",
    matchType: r.ad_group_criterion.keyword.match_type ?? "UNKNOWN",
    impressions: num(r.metrics.impressions),
    clicks: num(r.metrics.clicks),
    cost: num(r.metrics.cost_micros) / MICROS,
    conversions: num(r.metrics.conversions),
    ctr: num(r.metrics.ctr) * 100,
    avgCpc: num(r.metrics.average_cpc) / MICROS,
  }));
}

export interface CampaignsResult {
  campaigns: Campaign[];
  source: DataSource;
  error?: string;
}

// Short server-side memo so rapid repeat requests (multiple tabs / reloads)
// don't re-run a slow Google Ads auth attempt within the window.
let memo: { ts: number; result: CampaignsResult } | null = null;
const MEMO_TTL = 60_000;

/** Real campaigns when connected, otherwise mock data. Never throws. */
export async function getCampaignsWithFallback(customerId?: string): Promise<CampaignsResult> {
  if (!customerId && memo && Date.now() - memo.ts < MEMO_TTL) {
    return memo.result;
  }

  let result: CampaignsResult;
  try {
    const campaigns = await getCampaigns(customerId);
    result = campaigns.length
      ? { campaigns, source: "google-ads" }
      : { campaigns: googleCampaigns, source: "mock", error: "no_campaigns" };
  } catch (err) {
    const reason =
      err instanceof GoogleAdsNotConnectedError ? "not_connected" : (err as Error).message;
    console.warn(`[google-ads] falling back to mock data: ${reason}`);
    result = { campaigns: googleCampaigns, source: "mock", error: reason };
  }

  if (!customerId) memo = { ts: Date.now(), result };
  return result;
}
