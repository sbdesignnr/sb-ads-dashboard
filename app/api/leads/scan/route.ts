import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { scanSegment, scanDaily } from "@/lib/leads/scanner";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendTelegram } from "@/lib/notifications/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Logged-in dashboard user (UI) or the Vercel Cron secret (scheduled GET).
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

// Manual scan of one segment (from the UI).
export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { segmentId?: string; region?: "SK" | "CZ" | "both" } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.segmentId) return NextResponse.json({ error: "missing_segmentId" }, { status: 400 });
  const region = body.region === "SK" || body.region === "CZ" ? body.region : "both";
  const result = await scanSegment(body.segmentId, { region });
  return NextResponse.json(result);
}

// Daily Vercel Cron: top the pipeline up to ~200 fresh leads via a rotating
// window of segments, then notify over Telegram (the app's real channel — Jarvis
// has no push).
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await scanDaily();

  try {
    const settings = await getNotificationSettings();
    if (settings.telegramChatId && !result.skipped) {
      await sendTelegram(
        settings.telegramChatId,
        `🔎 <b>Denné skenovanie dokončené</b>\n+${result.addedQualified} nových leadov (${result.scanned} segmentov).\nV pipeline: ${result.newLeads} nových leadov.`,
        { link: new URL("/leads", req.nextUrl.origin).toString(), linkLabel: "Otvoriť leady" },
      );
    }
  } catch {
    /* notification is best-effort — never fail the scan on it */
  }

  return NextResponse.json(result);
}
