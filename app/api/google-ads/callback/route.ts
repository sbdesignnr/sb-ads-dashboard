import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { exchangeCodeForTokens, getRedirectUri, saveTokens } from "@/lib/google-ads/auth";
import { getConfiguredCustomerId } from "@/lib/google-ads/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code) {
    return NextResponse.redirect(new URL("/settings?google=error", req.url));
  }

  try {
    const redirectUri = getRedirectUri(url.origin);
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      // No refresh token returned (e.g. consent previously granted without it).
      return NextResponse.redirect(new URL("/settings?google=no_refresh", req.url));
    }

    await saveTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      customerId: getConfiguredCustomerId(),
    });

    return NextResponse.redirect(new URL("/settings?google=connected", req.url));
  } catch (err) {
    console.error("[google-ads] OAuth callback failed:", (err as Error).message);
    return NextResponse.redirect(new URL("/settings?google=error", req.url));
  }
}
