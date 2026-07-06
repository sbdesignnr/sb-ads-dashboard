import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getFinanceSummary } from "@/lib/finance/summary";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : currentMonth();
  const account = sp.get("account") ?? "all";
  const summary = await getFinanceSummary(month, account);
  return NextResponse.json(summary);
}
