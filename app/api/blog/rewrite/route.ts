import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { rewriteText } from "@/lib/blog/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  }

  let body: { text?: string; instruction?: string; targetKeyword?: string; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  try {
    const text = await rewriteText({
      text: body.text,
      instruction: body.instruction,
      targetKeyword: body.targetKeyword,
      title: body.title,
    });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
