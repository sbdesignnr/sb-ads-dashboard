import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { generateFullArticle } from "@/lib/blog/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  }

  let body: { title?: string; targetKeyword?: string; reason?: string; outline?: string[]; category?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });

  try {
    const article = await generateFullArticle({
      title,
      targetKeyword: (body.targetKeyword ?? "").trim() || undefined,
      reason: body.reason,
      outline: Array.isArray(body.outline) ? body.outline.filter((x) => typeof x === "string") : [],
      category: body.category,
    });
    return NextResponse.json({ article });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
