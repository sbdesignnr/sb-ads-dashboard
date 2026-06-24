import { getCustomerClient } from "./client";
import { ensureFreshAccessToken, getStoredToken } from "./auth";

/**
 * "Middleware" for Google Ads API calls: ensures the token is fresh, runs the
 * GAQL query, logs the call with timing, and normalises errors so callers can
 * gracefully fall back to mock data.
 */

export class GoogleAdsNotConnectedError extends Error {
  constructor() {
    super("Google Ads účet nie je pripojený");
    this.name = "GoogleAdsNotConnectedError";
  }
}

export class GoogleAdsApiError extends Error {
  code?: string;
  isRateLimit: boolean;
  constructor(message: string, code?: string, isRateLimit = false) {
    super(message);
    this.name = "GoogleAdsApiError";
    this.code = code;
    this.isRateLimit = isRateLimit;
  }
}

function log(message: string) {
  console.log(`[google-ads] ${new Date().toISOString()} ${message}`);
}

function classifyError(err: unknown): GoogleAdsApiError {
  // google-ads-api errors expose an `errors` array with `error_code`.
  const anyErr = err as {
    message?: string;
    code?: string | number;
    errors?: { error_code?: Record<string, unknown>; message?: string }[];
  };
  const detail = anyErr?.errors?.[0];
  const message = detail?.message ?? anyErr?.message ?? String(err);
  const codeKey = detail?.error_code ? Object.keys(detail.error_code)[0] : undefined;
  const codeVal = detail?.error_code && codeKey ? String(detail.error_code[codeKey]) : undefined;
  const code = codeVal ?? (anyErr?.code != null ? String(anyErr.code) : undefined);
  const isRateLimit =
    /rate|quota|RESOURCE_EXHAUSTED|too many/i.test(message) || code === "8";
  return new GoogleAdsApiError(message, code, isRateLimit);
}

/**
 * Execute a GAQL query against the connected account.
 * Throws GoogleAdsNotConnectedError when no refresh token is stored, or
 * GoogleAdsApiError for any API-level failure.
 */
export async function executeGaql<T = Record<string, unknown>>(
  gaql: string,
  customerId?: string,
): Promise<T[]> {
  const token = await getStoredToken();
  if (!token?.refreshToken) {
    throw new GoogleAdsNotConnectedError();
  }

  // Keep the stored access token fresh (the library also refreshes internally).
  await ensureFreshAccessToken();

  const customer = getCustomerClient(token.refreshToken, customerId ?? token.customerId ?? undefined);
  const started = Date.now();
  try {
    const rows = (await customer.query(gaql)) as unknown as T[];
    log(`query OK · ${rows.length} rows · ${Date.now() - started}ms`);
    return rows;
  } catch (err) {
    const apiError = classifyError(err);
    log(
      `query FAILED · ${Date.now() - started}ms · code=${apiError.code ?? "?"} · ${apiError.message}`,
    );
    throw apiError;
  }
}
