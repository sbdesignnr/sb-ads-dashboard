import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getAuthUrl, getRedirectUri } from "@/lib/google-ads/auth";
import { isGoogleAdsConfigured } from "@/lib/google-ads/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (!isGoogleAdsConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not_configured", req.url));
  }

  const origin = new URL(req.url).origin;
  const redirectUri = getRedirectUri(origin);
  return NextResponse.redirect(getAuthUrl(redirectUri));
}
