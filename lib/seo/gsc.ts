import { JWT } from "google-auth-library";

/**
 * Google Search Console (Search Analytics) client.
 *
 * Auth is a service account — the same pattern GA4 already uses. Unlike OAuth it
 * never expires, so cron-driven audits keep working without a re-login. The
 * account needs (a) the Search Console API enabled in the GCP project and (b)
 * read access on the property (GSC → Settings → Users and permissions).
 *
 * Every function degrades gracefully: if GSC isn't reachable the audit still
 * runs, it just can't emit position/CTR-based tasks.
 */

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://searchconsole.googleapis.com/webmasters/v3";

export class GscUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "api_disabled" | "no_access" | "error",
  ) {
    super(message);
    this.name = "GscUnavailableError";
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** Accepts raw JSON or base64-encoded JSON (a .env line can't hold raw newlines). */
function parseCredentials(): ServiceAccount | null {
  const raw = (process.env.GSC_SERVICE_ACCOUNT_KEY || process.env.GA4_SERVICE_ACCOUNT_KEY || "").trim();
  if (!raw) return null;
  const attempt = (s: string): ServiceAccount | null => {
    try {
      const p = JSON.parse(s) as ServiceAccount;
      return p.client_email && p.private_key ? p : null;
    } catch {
      return null;
    }
  };
  return attempt(raw) ?? attempt(Buffer.from(raw, "base64").toString("utf8"));
}

export function gscConfigured(): boolean {
  return parseCredentials() !== null;
}

/** The service account address the user must grant access to (for setup hints). */
export function gscServiceAccountEmail(): string | null {
  return parseCredentials()?.client_email ?? null;
}

async function accessToken(): Promise<string> {
  const c = parseCredentials();
  if (!c) throw new GscUnavailableError("Service account key nie je nastavený.", "not_configured");
  const jwt = new JWT({ email: c.client_email, key: c.private_key, scopes: [SCOPE] });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new GscUnavailableError("Nepodarilo sa získať access token.", "error");
  return token;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (res.ok) return (await res.json()) as T;

  const text = await res.text();
  if (res.status === 403 && /has not been used in project|is disabled/i.test(text)) {
    throw new GscUnavailableError(
      "Search Console API nie je zapnuté v GCP projekte. Zapni ho a skús o pár minút znova.",
      "api_disabled",
    );
  }
  if (res.status === 403 || res.status === 401) {
    throw new GscUnavailableError(
      `Service account nemá prístup k tejto property. Pridaj ${gscServiceAccountEmail() ?? "service account"} v Search Console → Nastavenia → Používatelia a povolenia.`,
      "no_access",
    );
  }
  throw new GscUnavailableError(`Search Console API vrátilo HTTP ${res.status}: ${text.slice(0, 200)}`, "error");
}

/** Properties the service account can read — used to verify setup. */
export async function listSites(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const data = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("/sites");
  return data.siteEntry ?? [];
}

export type GscDimension = "query" | "page" | "date" | "country" | "device";

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
  position: number; // average, 1-based
}

export interface SearchAnalyticsOptions {
  siteUrl: string; // "sc-domain:sbdesign.sk" or "https://www.sbdesign.sk/"
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dimensions?: GscDimension[];
  rowLimit?: number;
  /** Restrict to pages/queries containing this substring. */
  pageFilter?: string;
}

/** Search Analytics query — the backbone of every position/CTR-based SEO task. */
export async function searchAnalytics(opts: SearchAnalyticsOptions): Promise<GscRow[]> {
  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions ?? ["query"],
    rowLimit: Math.min(opts.rowLimit ?? 500, 25000),
    type: "web",
  };
  if (opts.pageFilter) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: "page", operator: "contains", expression: opts.pageFilter }] },
    ];
  }
  const data = await call<{ rows?: GscRow[] }>(`/sites/${encodeURIComponent(opts.siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.rows ?? [];
}

/** YYYY-MM-DD `days` ago (GSC data lags ~2 days, so callers should offset). */
export function daysAgo(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface GscStatus {
  configured: boolean;
  serviceAccount: string | null;
  ok: boolean;
  reason?: GscUnavailableError["reason"];
  message?: string;
  sites?: string[];
}

/** One call the settings UI can render to tell the user exactly what's missing. */
export async function gscStatus(): Promise<GscStatus> {
  const serviceAccount = gscServiceAccountEmail();
  if (!serviceAccount) {
    return { configured: false, serviceAccount: null, ok: false, reason: "not_configured", message: "Service account key nie je nastavený." };
  }
  try {
    const sites = await listSites();
    return { configured: true, serviceAccount, ok: true, sites: sites.map((s) => s.siteUrl) };
  } catch (e) {
    const err = e as GscUnavailableError;
    return {
      configured: true,
      serviceAccount,
      ok: false,
      reason: err.reason ?? "error",
      message: err.message,
    };
  }
}
