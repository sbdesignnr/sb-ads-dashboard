import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { detectReplies } from "@/lib/leads/reply-detector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron (Bearer CRON_SECRET) alebo prihlásený používateľ (manuálne tlačidlo).
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await detectReplies();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/detect-replies] error:", (e as Error).message);
    return NextResponse.json(
      { error: "scan_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
