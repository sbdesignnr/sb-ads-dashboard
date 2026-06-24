import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { disconnectGoogleAds, getConnectionStatus } from "@/lib/google-ads/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getConnectionStatus());
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await disconnectGoogleAds();
  return NextResponse.json({ connected: false });
}
