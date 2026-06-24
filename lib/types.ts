// Core domain types for the Ads Analytics Dashboard.

export type Platform = "google" | "meta";

export type CampaignStatus = "active" | "paused" | "learning" | "limited";

export type GoogleCampaignType = "search" | "display" | "shopping";
export type MetaCampaignType = "awareness" | "traffic" | "conversion";
export type CampaignType = GoogleCampaignType | MetaCampaignType;

export type TrendDirection = "up" | "down" | "flat";

export type Priority = "high" | "medium" | "low";

/** A single day of performance for one campaign. */
export interface DailyMetric {
  date: string; // ISO yyyy-mm-dd
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  reach?: number; // Meta only
}

export interface ChangeEvent {
  date: string; // ISO yyyy-mm-dd
  type: "budget" | "bid" | "creative" | "audience" | "status" | "keyword";
  description: string;
  author: string;
}

export interface Campaign {
  id: string;
  name: string;
  platform: Platform;
  type: CampaignType;
  objective: string;
  status: CampaignStatus;
  dailyBudget: number;
  startDate: string; // ISO yyyy-mm-dd
  trend: TrendDirection;
  daily: DailyMetric[];
  changeHistory: ChangeEvent[];
}

/** Aggregated + derived metrics for a set of daily rows. */
export interface MetricTotals {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number; // %
  cpc: number; // currency
  cpm: number; // currency
  roas: number; // ratio (x)
  conversionRate: number; // %
  reach?: number;
  frequency?: number;
}

export interface AIInsight {
  id: string;
  priority: Priority;
  platform: Platform;
  campaignId?: string;
  campaignName?: string;
  category: "Budget" | "Bidding" | "Creative" | "Targeting" | "Keywords" | "Structure";
  title: string;
  problem: string;
  solution: string;
  expectedImpact: string;
  impactScore: number; // 0-100, used for ranking
}

export interface AccountScore {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: { label: string; value: number; weight: number }[];
}

export type MetricKey =
  | "impressions"
  | "clicks"
  | "spend"
  | "conversions"
  | "revenue"
  | "ctr"
  | "cpc"
  | "cpm"
  | "roas"
  | "conversionRate";
