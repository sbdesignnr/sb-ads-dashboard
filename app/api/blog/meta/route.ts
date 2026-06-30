import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { generateMeta } from "@/lib/blog/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
  }

  let body: { title?: string; content?: string; targetKeyword?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "empty_content" }, { status: 400 });
  }

  try {
    const result = await generateMeta({
      title: body.title,
      content: body.content,
      targetKeyword: body.targetKeyword,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
