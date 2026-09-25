import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { sendMorningDigest } from "@/lib/agents/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Prihlásený používateľ (na skúšku) alebo Vercel Cron so CRON_SECRET.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user) return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && req.headers.get("authorization") === `Bearer ${secret}`);
}

/**
 * Ranný prehľad na Telegram: čo agenti urobili cez noc a čo musí spraviť človek.
 * ?dry=1 vráti len text (nič sa neposiela), ?force=1 pošle aj druhýkrát v ten deň.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  try {
    const r = await sendMorningDigest({ dry: p.get("dry") === "1", force: p.get("force") === "1" });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ sent: false, reason: (e as Error).message }, { status: 500 });
  }
}
