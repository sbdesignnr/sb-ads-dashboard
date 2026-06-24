import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateWeeklyReport } from "@/lib/competitors/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await generateWeeklyReport();
  return NextResponse.json({ report });
}
