import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runNotifications } from "@/lib/notifications/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Logged-in dashboard user (manual "run now") or the Vercel Cron secret.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runNotifications();
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
