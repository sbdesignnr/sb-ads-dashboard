import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildDigest } from "@/lib/agents/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agents/digest?hours=16 — čo agenti urobili za posledné hodiny a čo čaká na človeka. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const hours = Math.min(72, Math.max(1, Number(new URL(req.url).searchParams.get("hours")) || 16));
  try {
    return NextResponse.json(await buildDigest(hours));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
