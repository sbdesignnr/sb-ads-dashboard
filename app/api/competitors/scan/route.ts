import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runCompetitorScan } from "@/lib/competitors/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Scraping 6 sites + analysis can take a while.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let competitorId: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.competitorId === "string") competitorId = body.competitorId;
  } catch {
    // no body → scan all
  }

  const result = await runCompetitorScan(competitorId);
  return NextResponse.json(result);
}
