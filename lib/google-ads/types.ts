export type DataSource = "google-ads" | "mock";

export interface GoogleAdsConnectionStatus {
  connected: boolean;
  configured: boolean;
  customerId: string | null;
  loginCustomerId: string | null;
  expiresAt: string | null;
  lastUpdated: string | null;
}

export interface GoogleKeywordMetric {
  keyword: string;
  matchType: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  avgCpc: number;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}
