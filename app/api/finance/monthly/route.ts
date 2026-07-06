import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getMonthlyTotals } from "@/lib/finance/summary";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const months = Math.min(Math.max(1, Number(sp.get("months")) || 6), 12);
  const account = sp.get("account") ?? "all";
  const monthly = await getMonthlyTotals(months, account);
  return NextResponse.json({ monthly });
}
