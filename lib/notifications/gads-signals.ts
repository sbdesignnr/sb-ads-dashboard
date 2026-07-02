import { executeGaql } from "@/lib/google-ads/middleware";

const MICROS = 1_000_000;
const num = (v: unknown) => Number(v ?? 0);

export interface CampaignState {
  id: string;
  name: string;
  biddingStrategy: string;
  budget: number; // daily budget €
  cost7d: number;
  conv7d: number;
  convValue7d: number;
  budgetLostShare: number; // avg search budget lost impression share 0..1
}

export interface DisapprovedAd {
  campaignId: string;
  campaignName: string;
  adId: string;
}

export interface AccountState {
  status: string; // ENABLED | SUSPENDED | CANCELED | ...
  name: string;
}

export interface TodayConversion {
  campaignId: string;
  campaignName: string;
  conversions: number;
  conversionsValue: number;
}

function enumName(v: unknown, map: Record<number, string>): string {
  if (typeof v === "number") return map[v] ?? String(v);
  return String(v ?? "").toUpperCase() || "UNKNOWN";
}

interface StateRow {
  campaign: {
    id: string | number;
    name: string;
    bidding_strategy_type?: string | number;
  };
  campaign_budget?: { amount_micros?: string | number };
  metrics: {
    cost_micros?: string | number;
    conversions?: string | number;
    conversions_value?: string | number;
    search_budget_lost_impression_share?: string | number;
  };
}

/** Per enabled campaign: last-7-day spend/conversions + budget-lost share. */
export async function getCampaignStates(customerId?: string): Promise<CampaignState[]> {
  const gaql = `
    SELECT campaign.id, campaign.name, campaign.bidding_strategy_type,
           campaign_budget.amount_micros,
           metrics.cost_micros, metrics.conversions, metrics.conversions_value,
           metrics.search_budget_lost_impression_share
    FROM campaign
    WHERE campaign.status = 'ENABLED' AND segments.date DURING LAST_7_DAYS`;
  let rows: StateRow[];
  try {
    rows = await executeGaql<StateRow>(gaql, customerId);
  } catch {
    return [];
  }
  const byId = new Map<string, CampaignState & { _lostSum: number; _lostN: number }>();
  for (const r of rows) {
    const id = String(r.campaign.id);
    let s = byId.get(id);
    if (!s) {
      s = {
        id,
        name: r.campaign.name,
        biddingStrategy: enumName(r.campaign.bidding_strategy_type, {
          3: "MANUAL_CPC", 6: "TARGET_CPA", 9: "MAXIMIZE_CONVERSIONS", 10: "TARGET_ROAS", 11: "MAXIMIZE_CONVERSION_VALUE",
        }),
        budget: num(r.campaign_budget?.amount_micros) / MICROS,
        cost7d: 0, conv7d: 0, convValue7d: 0, budgetLostShare: 0,
        _lostSum: 0, _lostN: 0,
      };
      byId.set(id, s);
    }
    s.cost7d += num(r.metrics.cost_micros) / MICROS;
    s.conv7d += num(r.metrics.conversions);
    s.convValue7d += num(r.metrics.conversions_value);
    if (r.metrics.search_budget_lost_impression_share != null) {
      s._lostSum += num(r.metrics.search_budget_lost_impression_share);
      s._lostN += 1;
    }
  }
  return [...byId.values()].map((s) => {
    s.budgetLostShare = s._lostN ? s._lostSum / s._lostN : 0;
    const { _lostSum, _lostN, ...rest } = s;
    void _lostSum; void _lostN;
    return rest;
  });
}

interface AdRow {
  campaign: { id: string | number; name: string };
  ad_group_ad: { ad: { id: string | number }; policy_summary?: { approval_status?: string | number } };
}

/** Enabled ads that Google has DISAPPROVED (approval_status == 4). */
export async function getDisapprovedAds(customerId?: string): Promise<DisapprovedAd[]> {
  const gaql = `
    SELECT campaign.id, campaign.name, ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status
    FROM ad_group_ad
    WHERE campaign.status = 'ENABLED' AND ad_group_ad.status = 'ENABLED'
    LIMIT 300`;
  let rows: AdRow[];
  try {
    rows = await executeGaql<AdRow>(gaql, customerId);
  } catch {
    return [];
  }
  // ApprovalStatus: DISAPPROVED = 4 (or the string name).
  const isDisapproved = (v: unknown) => v === 4 || String(v ?? "").toUpperCase() === "DISAPPROVED";
  return rows
    .filter((r) => isDisapproved(r.ad_group_ad.policy_summary?.approval_status))
    .map((r) => ({
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      adId: String(r.ad_group_ad.ad.id),
    }));
}

/** Account-level status (suspended / canceled → campaigns not serving). */
export async function getAccountState(customerId?: string): Promise<AccountState | null> {
  const gaql = `SELECT customer.status, customer.descriptive_name FROM customer LIMIT 1`;
  try {
    const rows = await executeGaql<{ customer: { status?: string | number; descriptive_name?: string } }>(
      gaql,
      customerId,
    );
    const c = rows[0]?.customer;
    if (!c) return null;
    return {
      status: enumName(c.status, { 2: "ENABLED", 3: "CANCELED", 4: "SUSPENDED", 5: "CLOSED" }),
      name: c.descriptive_name ?? "účet",
    };
  } catch {
    return null;
  }
}

/** Per enabled campaign: conversions accumulated TODAY (for new-conversion delta). */
export async function getTodayConversions(customerId?: string): Promise<TodayConversion[]> {
  const gaql = `
    SELECT campaign.id, campaign.name, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE campaign.status = 'ENABLED' AND segments.date DURING TODAY`;
  try {
    const rows = await executeGaql<StateRow>(gaql, customerId);
    const byId = new Map<string, TodayConversion>();
    for (const r of rows) {
      const id = String(r.campaign.id);
      const cur = byId.get(id) ?? { campaignId: id, campaignName: r.campaign.name, conversions: 0, conversionsValue: 0 };
      cur.conversions += num(r.metrics.conversions);
      cur.conversionsValue += num(r.metrics.conversions_value);
      byId.set(id, cur);
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}
