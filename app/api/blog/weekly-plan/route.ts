import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { generateWeeklyPlan } from "@/lib/blog/weekly-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const topics = await generateWeeklyPlan(force);
  return NextResponse.json({ topics });
}
