import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getCampaignsWithFallback } from "@/lib/google-ads/campaigns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const customerId = new URL(req.url).searchParams.get("customerId") ?? undefined;
  const result = await getCampaignsWithFallback(customerId);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
