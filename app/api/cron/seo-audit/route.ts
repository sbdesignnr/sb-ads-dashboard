import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { runAudit } from "@/lib/seo/audit";
import { sendWeeklySeoDigest } from "@/lib/seo/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

// Weekly: re-audit the site, then push the top three tasks to Telegram. Keeping
// the queue fresh is what makes the module usable without ever thinking about it.
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const audit = await runAudit();
  // The digest is best-effort — a Telegram outage must not fail the audit.
  const digest = await sendWeeklySeoDigest().catch((e) => ({ sent: false, reason: (e as Error).message }));
  return NextResponse.json({ audit, digest });
}
