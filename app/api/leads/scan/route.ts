import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { scanSegment, scanAllSegments } from "@/lib/leads/scanner";

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
  let body: { segmentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.segmentId) return NextResponse.json({ error: "missing_segmentId" }, { status: 400 });
  const result = await scanSegment(body.segmentId);
  return NextResponse.json(result);
}

// Daily Vercel Cron: scan every segment (bounded).
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await scanAllSegments();
  return NextResponse.json(result);
}
