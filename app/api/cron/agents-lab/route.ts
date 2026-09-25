import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { checkAiNews, weeklyReview } from "@/lib/agents/lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

/** Týždenne (pondelok ráno): kontrola noviniek z AI (cenník, nové modely) a hodnotenie práce agentov. */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const news = await checkAiNews();
    const review = await weeklyReview();
    return NextResponse.json({ news, review });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
