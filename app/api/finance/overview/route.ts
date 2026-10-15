import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOverview, getOtherAccountOverviews } from "@/lib/finance/summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [overview, others] = await Promise.all([getCurrentOverview(), getOtherAccountOverviews()]);
  return NextResponse.json({ overview, others });
}
