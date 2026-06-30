import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { syncAllChannels } from "@/lib/youtube/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Allowed when a dashboard user is logged in (UI "Obnoviť" button) or when the
// request carries the Vercel Cron secret (GET from the scheduled job).
async function authorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await syncAllChannels();
  if (result.error === "missing_api_key") {
    return NextResponse.json(
      { ...result, error: "YouTube API nie je nakonfigurované (chýba YOUTUBE_API_KEY)." },
      { status: 503 },
    );
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}
