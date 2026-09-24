import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getShortlist } from "@/lib/agents/skaut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/skaut — aktuálny výber Skauta (top príležitosti s dôvodmi). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { picks, candidates } = await getShortlist(20);
  return NextResponse.json({ candidates, picks });
}
