import { GoogleAdsApi } from "google-ads-api";

/**
 * Server-side Google Ads API client.
 * Credentials come exclusively from environment variables — never hardcode them
 * and never import this module from a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Chýba premenná prostredia ${name}`);
  return value;
}

const sanitizeId = (id?: string | null) => (id ?? "").replace(/-/g, "").trim();

let cachedApi: GoogleAdsApi | null = null;

/** Returns a singleton GoogleAdsApi instance. */
export function getGoogleAdsClient(): GoogleAdsApi {
  if (cachedApi) return cachedApi;
  cachedApi = new GoogleAdsApi({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    developer_token: required("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });
  return cachedApi;
}

/** Returns a Customer instance scoped to a specific account. */
export function getCustomerClient(refreshToken: string, customerId?: string) {
  const client = getGoogleAdsClient();
  const target = sanitizeId(
    customerId ?? process.env.GOOGLE_ADS_CUSTOMER_ID ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  );
  const loginCustomerId = sanitizeId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  return client.Customer({
    customer_id: target,
    login_customer_id: loginCustomerId || undefined,
    refresh_token: refreshToken,
  });
}

/** True when the base API credentials are present (token may still be missing). */
export function isGoogleAdsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  );
}

export function getConfiguredCustomerId(): string | null {
  const id = sanitizeId(
    process.env.GOOGLE_ADS_CUSTOMER_ID ?? process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  );
  return id || null;
}

export function getLoginCustomerId(): string | null {
  const id = sanitizeId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  return id || null;
}
