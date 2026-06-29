import { executeGaql } from "./middleware";

const MICROS = 1_000_000;
const num = (v: unknown) => Number(v ?? 0);

// AdGroupAdStatus / ConversionActionStatus share ENABLED=2; map common values.
function statusName(v: unknown): string {
  const map: Record<number, string> = { 2: "ENABLED", 3: "PAUSED/REMOVED", 4: "REMOVED/HIDDEN" };
  if (typeof v === "number") return map[v] ?? String(v);
  return String(v ?? "").toUpperCase() || "UNKNOWN";
}

export interface AdMetric {
  campaign: string;
  adGroup: string;
  adId: string;
  status: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cost: number;
}

export interface GeoTarget {
  campaign: string;
  geo: string;
  negative: boolean;
}

export interface ConversionActionInfo {
  name: string;
  status: string;
}

interface AdRow {
  campaign: { name: string };
  ad_group: { name: string };
  ad_group_ad: { ad: { id: string | number }; status: string | number };
  metrics: {
    impressions?: string | number;
    clicks?: string | number;
    ctr?: string | number;
    conversions?: string | number;
    cost_micros?: string | number;
  };
}

export async function getAdsMetrics(customerId?: string): Promise<AdMetric[]> {
  const gaql = `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.conversions,
      metrics.cost_micros
    FROM ad_group_ad
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 20
  `;
  const rows = await executeGaql<AdRow>(gaql, customerId);
  return rows.map((r) => ({
    campaign: r.campaign.name,
    adGroup: r.ad_group.name,
    adId: String(r.ad_group_ad.ad.id),
    status: statusName(r.ad_group_ad.status),
    impressions: num(r.metrics.impressions),
    clicks: num(r.metrics.clicks),
    ctr: num(r.metrics.ctr) * 100,
    conversions: num(r.metrics.conversions),
    cost: num(r.metrics.cost_micros) / MICROS,
  }));
}

interface GeoRow {
  campaign: { name: string };
  campaign_criterion?: { location?: { geo_target_constant?: string }; negative?: boolean };
}

export async function getGeoTargets(customerId?: string): Promise<GeoTarget[]> {
  const gaql = `
    SELECT
      campaign.name,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'LOCATION'
    LIMIT 50
  `;
  const rows = await executeGaql<GeoRow>(gaql, customerId);
  return rows.map((r) => ({
    campaign: r.campaign.name,
    geo: String(r.campaign_criterion?.location?.geo_target_constant ?? "").replace("geoTargetConstants/", ""),
    negative: Boolean(r.campaign_criterion?.negative),
  }));
}

interface ConvRow {
  conversion_action: { name: string; status: string | number };
}

export async function getConversionActions(customerId?: string): Promise<ConversionActionInfo[]> {
  const gaql = `
    SELECT conversion_action.name, conversion_action.status
    FROM conversion_action
    LIMIT 30
  `;
  const rows = await executeGaql<ConvRow>(gaql, customerId);
  return rows.map((r) => ({
    name: r.conversion_action.name,
    status: statusName(r.conversion_action.status),
  }));
}
