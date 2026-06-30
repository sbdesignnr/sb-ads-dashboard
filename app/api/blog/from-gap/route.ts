import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blog/slug";
import { analyzeSeo } from "@/lib/blog/analyze";
import { ensureUniqueSlug, serialize } from "@/lib/blog/store";
import { generateDraftFromGap } from "@/lib/blog/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

function outlineMarkdown(reason: string | undefined, outline: string[]): string {
  const head = reason ? `> ${reason}\n\n` : "";
  const body = outline.length
    ? outline.map((h) => `## ${h}\n\n_Doplň obsah…_\n`).join("\n")
    : "## Úvod\n\n_Doplň obsah…_\n";
  return head + body;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    title?: string;
    targetKeyword?: string;
    reason?: string;
    outline?: string[];
    category?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "missing_title" }, { status: 400 });
  const targetKeyword = (body.targetKeyword ?? "").trim() || null;
  const outline = Array.isArray(body.outline) ? body.outline.filter((x) => typeof x === "string") : [];

  let content: string;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      content = await generateDraftFromGap({
        title,
        targetKeyword: targetKeyword ?? undefined,
        reason: body.reason,
        outline,
      });
    } catch {
      content = outlineMarkdown(body.reason, outline);
    }
  } else {
    content = outlineMarkdown(body.reason, outline);
  }

  const slug = await ensureUniqueSlug(slugify(title));
  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      content,
      category: body.category ?? "Z konkurencie",
      targetKeyword,
      status: "draft",
      seoScore: analyzeSeo({ title, content, targetKeyword }).score,
    },
  });

  return NextResponse.json({ post: serialize(post) });
}
