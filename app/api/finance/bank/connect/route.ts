import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { createAuthUrl, type PsuType } from "@/lib/enable-banking/connect";
import { isEnableBankingConfigured } from "@/lib/enable-banking/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEnableBankingConfigured()) return NextResponse.json({ error: "enable_banking_not_configured" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { psuType?: string };
  const psuType: PsuType = body.psuType === "personal" ? "personal" : "business";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    const url = await createAuthUrl(psuType, `${appUrl}/api/finance/bank/callback`);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Enable Banking connect error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
