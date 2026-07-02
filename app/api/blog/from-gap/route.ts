import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blog/slug";
import { analyzeSeo } from "@/lib/blog/analyze";
import { ensureUniqueSlug, serialize } from "@/lib/blog/store";
import { generateFullArticle } from "@/lib/blog/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function outlineMarkdown(reason: string | undefined, outline: string[]): string {
  const head = reason ? `> ${reason}\n\n` : "";
  const body = outline.length
    ? outline.map((h) => `## ${h}\n\n`).join("\n")
    : "## Úvod\n\n";
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

  // Generate a complete, publication-ready article (same engine as the editor button).
  const article = process.env.ANTHROPIC_API_KEY
    ? await generateFullArticle({
        title,
        targetKeyword: targetKeyword ?? undefined,
        reason: body.reason,
        outline,
        category: body.category,
      }).catch(() => null)
    : null;

  const finalTitle = article?.title || title;
  const content = article?.content || outlineMarkdown(body.reason, outline);
  const kw = article?.targetKeyword || targetKeyword;
  const slug = await ensureUniqueSlug(article?.slug || slugify(finalTitle));

  const post = await prisma.blogPost.create({
    data: {
      title: finalTitle,
      slug,
      content,
      metaTitle: article?.metaTitle ?? null,
      metaDescription: article?.metaDescription ?? null,
      imageAlt: article?.imageAlt ?? null,
      category: body.category ?? "Z konkurencie",
      targetKeyword: kw,
      status: "draft",
      seoScore: analyzeSeo({
        title: finalTitle,
        content,
        targetKeyword: kw,
        metaTitle: article?.metaTitle,
        metaDescription: article?.metaDescription,
      }).score,
    },
  });

  return NextResponse.json({ post: serialize(post) });
}
