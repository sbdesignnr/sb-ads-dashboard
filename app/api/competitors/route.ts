import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompetitorsWithLatestScan } from "@/lib/competitors/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const competitors = await getCompetitorsWithLatestScan();
  return NextResponse.json({ competitors });
}
