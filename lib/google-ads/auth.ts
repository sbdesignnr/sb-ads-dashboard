import { prisma } from "@/lib/prisma";
import { isGoogleAdsConfigured, getConfiguredCustomerId, getLoginCustomerId } from "./client";
import type { GoogleAdsConnectionStatus, OAuthTokenResponse } from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const TOKEN_ID = "primary";

export function getRedirectUri(origin?: string): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const base = origin ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/google-ads/callback`;
}

/** Build the Google OAuth2 consent URL (offline access → refresh token). */
export function getAuthUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  if (state) params.set("state", state);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Výmena kódu za token zlyhala: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Obnova access tokenu zlyhala: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function saveTokens(params: {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresIn?: number | null;
  scope?: string | null;
  customerId?: string | null;
}): Promise<void> {
  const expiresAt = params.expiresIn ? new Date(Date.now() + params.expiresIn * 1000) : null;
  await prisma.googleAdsToken.upsert({
    where: { id: TOKEN_ID },
    update: {
      ...(params.accessToken !== undefined ? { accessToken: params.accessToken } : {}),
      ...(params.refreshToken ? { refreshToken: params.refreshToken } : {}),
      expiresAt,
      ...(params.scope !== undefined ? { scope: params.scope } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
    },
    create: {
      id: TOKEN_ID,
      accessToken: params.accessToken ?? null,
      refreshToken: params.refreshToken ?? "",
      expiresAt,
      scope: params.scope ?? null,
      customerId: params.customerId ?? getConfiguredCustomerId(),
    },
  });
}

export async function getStoredToken() {
  try {
    return await prisma.googleAdsToken.findUnique({ where: { id: TOKEN_ID } });
  } catch {
    return null;
  }
}

export async function disconnectGoogleAds(): Promise<void> {
  try {
    // deleteMany does not throw when the row is absent (unlike delete).
    await prisma.googleAdsToken.deleteMany({ where: { id: TOKEN_ID } });
  } catch {
    // already disconnected
  }
}

/**
 * Returns a valid access token, refreshing it if it expired. The google-ads-api
 * library also refreshes internally from the refresh_token; this keeps the DB
 * copy fresh (used for status display + logging).
 */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const token = await getStoredToken();
  if (!token?.refreshToken) return null;

  const stillValid =
    token.accessToken && token.expiresAt && token.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid) return token.accessToken;

  try {
    const refreshed = await refreshAccessToken(token.refreshToken);
    await saveTokens({
      accessToken: refreshed.access_token,
      refreshToken: token.refreshToken,
      expiresIn: refreshed.expires_in,
      scope: refreshed.scope,
    });
    console.log("[google-ads] access token refreshed");
    return refreshed.access_token;
  } catch (err) {
    console.error("[google-ads] token refresh failed:", (err as Error).message);
    return null;
  }
}

export async function getConnectionStatus(): Promise<GoogleAdsConnectionStatus> {
  const token = await getStoredToken();
  return {
    connected: Boolean(token?.refreshToken),
    configured: isGoogleAdsConfigured(),
    customerId: getConfiguredCustomerId() ?? token?.customerId ?? null,
    loginCustomerId: getLoginCustomerId(),
    expiresAt: token?.expiresAt?.toISOString() ?? null,
    lastUpdated: token?.updatedAt?.toISOString() ?? null,
  };
}
