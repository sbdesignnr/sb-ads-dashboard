import { allCampaigns } from "@/lib/mock-data";
import { aggregateTotals, computeTotals } from "@/lib/utils/metrics";
import { platformLabel, statusLabel, typeLabel } from "@/lib/utils/formatters";
import type { MetricTotals } from "@/lib/types";

const RANGE_DAYS = 30;

const round = (n: number, d = 2) => {
  const p = 10 ** d;
  return Math.round(n * p) / p;
};

function summarize(t: MetricTotals) {
  return {
    spend_eur: round(t.spend),
    revenue_eur: round(t.revenue),
    roas: round(t.roas),
    ctr_pct: round(t.ctr),
    cpc_eur: round(t.cpc),
    cpm_eur: round(t.cpm),
    conversions: Math.round(t.conversions),
    clicks: Math.round(t.clicks),
    impressions: Math.round(t.impressions),
    conversion_rate_pct: round(t.conversionRate),
    ...(t.reach != null
      ? { reach: Math.round(t.reach), frequency: round(t.frequency ?? 0) }
      : {}),
  };
}

export interface AIContext {
  accountMetrics: ReturnType<typeof buildAccountMetrics>;
  campaignData: ReturnType<typeof buildCampaignData>;
}

function buildAccountMetrics() {
  const overall = aggregateTotals(allCampaigns, RANGE_DAYS);
  const google = aggregateTotals(
    allCampaigns.filter((c) => c.platform === "google"),
    RANGE_DAYS,
  );
  const meta = aggregateTotals(
    allCampaigns.filter((c) => c.platform === "meta"),
    RANGE_DAYS,
  );

  return {
    obdobie: `Posledných ${RANGE_DAYS} dní`,
    mena: "EUR",
    celkovo: summarize(overall),
    google_ads: summarize(google),
    meta_ads: summarize(meta),
  };
}

function buildCampaignData() {
  return allCampaigns.map((c) => {
    const t = computeTotals(c.daily.slice(-RANGE_DAYS));
    return {
      nazov: c.name,
      platforma: platformLabel(c.platform),
      typ: typeLabel(c.type),
      status: statusLabel(c.status),
      trend: c.trend,
      denny_rozpocet_eur: c.dailyBudget,
      ...summarize(t),
    };
  });
}

/** Build the campaign + account context sent to the AI on every message. */
export function buildAIContext(): AIContext {
  return {
    accountMetrics: buildAccountMetrics(),
    campaignData: buildCampaignData(),
  };
}
