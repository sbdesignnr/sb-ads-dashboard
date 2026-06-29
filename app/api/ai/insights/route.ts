import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { generateAccountInsights } from "@/lib/ai/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const data = await generateAccountInsights(force);
  return NextResponse.json(data);
}
