import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runNightQueue } from "@/lib/agents/night";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Prihlásený používateľ (na skúšku) alebo Vercel Cron so CRON_SECRET.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

/** Nočný cron: Skaut vyberie top príležitosť a Nora pripraví ponuku (max 2 behy na volanie). */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  // ?max=1 (na skúšku) obmedzí počet behov na volanie; predvolené sú 2
  const max = Math.min(2, Math.max(1, Number(req.nextUrl.searchParams.get("max")) || 2));
  const result = await runNightQueue(started + 280_000, max);
  return NextResponse.json({ ...result, tookMs: Date.now() - started });
}
