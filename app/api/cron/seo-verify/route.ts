import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { verifyDueTasks } from "@/lib/seo/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

// Daily: judge every SEO task whose verification window has elapsed.
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await verifyDueTasks());
}
