import type {
  Campaign,
  DailyMetric,
  MetricTotals,
  MetricKey,
  AccountScore,
} from "@/lib/types";

/** Division that returns 0 instead of NaN/Infinity. */
export function safeDiv(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

/** Percentage change between two values. */
export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

interface RawSum {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  reach: number;
}

function sumRaw(daily: DailyMetric[]): { sum: RawSum; hasReach: boolean } {
  let hasReach = false;
  const sum = daily.reduce<RawSum>(
    (acc, d) => {
      if (d.reach != null) hasReach = true;
      return {
        impressions: acc.impressions + d.impressions,
        clicks: acc.clicks + d.clicks,
        spend: acc.spend + d.spend,
        conversions: acc.conversions + d.conversions,
        revenue: acc.revenue + d.revenue,
        reach: acc.reach + (d.reach ?? 0),
      };
    },
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0, reach: 0 },
  );
  return { sum, hasReach };
}

/** Compute aggregated + derived metrics for a list of daily rows. */
export function computeTotals(daily: DailyMetric[]): MetricTotals {
  const { sum, hasReach } = sumRaw(daily);

  return {
    impressions: sum.impressions,
    clicks: sum.clicks,
    spend: sum.spend,
    conversions: sum.conversions,
    revenue: sum.revenue,
    ctr: safeDiv(sum.clicks, sum.impressions) * 100,
    cpc: safeDiv(sum.spend, sum.clicks),
    cpm: safeDiv(sum.spend, sum.impressions) * 1000,
    roas: safeDiv(sum.revenue, sum.spend),
    conversionRate: safeDiv(sum.conversions, sum.clicks) * 100,
    reach: hasReach ? sum.reach : undefined,
    frequency: hasReach ? safeDiv(sum.impressions, sum.reach) : undefined,
  };
}

/** Last `days` rows of a series. */
export function sliceDays<T>(rows: T[], days?: number): T[] {
  if (!days) return rows;
  return rows.slice(-days);
}

/** Aggregate totals across many campaigns over the last `days`. */
export function aggregateTotals(campaigns: Campaign[], days?: number): MetricTotals {
  const all = campaigns.flatMap((c) => sliceDays(c.daily, days));
  return computeTotals(all);
}

/** Merge campaigns into a single per-day series (summing additive metrics). */
export function aggregateDailySeries(
  campaigns: Campaign[],
  days?: number,
): DailyMetric[] {
  const map = new Map<string, DailyMetric>();
  for (const c of campaigns) {
    for (const d of sliceDays(c.daily, days)) {
      const existing = map.get(d.date);
      if (existing) {
        existing.impressions += d.impressions;
        existing.clicks += d.clicks;
        existing.spend += d.spend;
        existing.conversions += d.conversions;
        existing.revenue += d.revenue;
        existing.reach = (existing.reach ?? 0) + (d.reach ?? 0);
      } else {
        map.set(d.date, { ...d });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Derive a metric value for a single daily row (for charts). */
export function dailyMetricValue(d: DailyMetric, key: MetricKey): number {
  switch (key) {
    case "ctr":
      return safeDiv(d.clicks, d.impressions) * 100;
    case "cpc":
      return safeDiv(d.spend, d.clicks);
    case "cpm":
      return safeDiv(d.spend, d.impressions) * 1000;
    case "roas":
      return safeDiv(d.revenue, d.spend);
    case "conversionRate":
      return safeDiv(d.conversions, d.clicks) * 100;
    default:
      return d[key] as number;
  }
}

/**
 * Week-over-week delta (%) for a derived metric: compares totals of the last
 * 7 days vs the preceding 7 days.
 */
export function deltaWoW(daily: DailyMetric[], metric: MetricKey): number {
  const last = computeTotals(daily.slice(-7));
  const prev = computeTotals(daily.slice(-14, -7));
  return percentChange(Number(last[metric] ?? 0), Number(prev[metric] ?? 0));
}

/** Extract a sparkline series (one number per day) for a metric. */
export function sparkline(daily: DailyMetric[], metric: MetricKey, days = 14): number[] {
  return sliceDays(daily, days).map((d) => dailyMetricValue(d, metric));
}

/** A heuristic 0-100 account health score with a weighted breakdown. */
export function computeAccountScore(campaigns: Campaign[]): AccountScore {
  const totals = aggregateTotals(campaigns, 30);

  // Targets used to normalise each factor to 0-100.
  const roasScore = clamp((totals.roas / 4) * 100, 0, 100); // 4x ROAS = full marks
  const ctrScore = clamp((totals.ctr / 3) * 100, 0, 100); // 3% CTR = full marks
  const cvrScore = clamp((totals.conversionRate / 5) * 100, 0, 100); // 5% CVR = full

  const active = campaigns.length || 1;
  const trendingUp = campaigns.filter((c) => c.trend === "up").length;
  const limited = campaigns.filter((c) => c.status === "limited").length;
  const momentumScore = clamp(((trendingUp - limited) / active) * 100 + 50, 0, 100);

  const breakdown = [
    { label: "Návratnosť (ROAS)", value: roasScore, weight: 0.4 },
    { label: "Miera prekliku (CTR)", value: ctrScore, weight: 0.2 },
    { label: "Konverzný pomer", value: cvrScore, weight: 0.2 },
    { label: "Momentum účtu", value: momentumScore, weight: 0.2 },
  ];

  const score = Math.round(
    breakdown.reduce((acc, b) => acc + b.value * b.weight, 0),
  );

  return { score, grade: gradeFor(score), breakdown };
}

function gradeFor(score: number): AccountScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
