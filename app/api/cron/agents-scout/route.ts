import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runScoutCycle } from "@/lib/agents/scout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Prihlásený používateľ (na skúšku) alebo Vercel Cron so CRON_SECRET.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

/**
 * Autopilot Skauta (Miro): každých 30 minút večer analyzuje, hľadá e-maily, odôvodnene posudzuje
 * leady a podľa zásoby skenuje ďalší segment. Nič neodosiela.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    // ?dry=1: len spočíta, čo by cyklus urobil (nič nezapisuje ani neplatí)
    const result = await runScoutCycle(started + 780_000, { dry: req.nextUrl.searchParams.get("dry") === "1" });
    return NextResponse.json({ ...result, tookMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
