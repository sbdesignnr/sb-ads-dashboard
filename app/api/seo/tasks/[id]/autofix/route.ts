import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateFullArticle } from "@/lib/blog/ai";
import { generateWeeklyPlan } from "@/lib/blog/weekly-plan";
import { ensureUniqueSlug } from "@/lib/blog/store";
import { slugify } from "@/lib/blog/slug";
import { analyzeSeo } from "@/lib/blog/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Which checks the autopilot can currently resolve on its own (no external app).
const ARTICLE_CHECKS = new Set(["content:no-topical-authority"]);

/** Normalised title fingerprint — avoids drafting a topic we already covered. */
function titleKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

// "Vyriešiť za mňa" for content tasks: pick a fresh topic and draft a full,
// review-ready article. The user only reads it and hits Publish.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });

  const { id } = await params;
  const task = await prisma.seoTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!ARTICLE_CHECKS.has(task.checkKey)) {
    return NextResponse.json({ error: "not_autofixable", kind: "manual" }, { status: 400 });
  }

  // Pick the best weekly-plan topic that isn't already a post.
  const topics = await generateWeeklyPlan();
  if (!topics.length) return NextResponse.json({ error: "no_topic" }, { status: 500 });
  const posts = await prisma.blogPost.findMany({ select: { title: true, targetKeyword: true } });
  const usedKw = new Set(posts.map((p) => p.targetKeyword?.toLowerCase().trim()).filter(Boolean) as string[]);
  const usedTitles = new Set(posts.map((p) => titleKey(p.title)));
  const topic =
    topics.find((t) => !usedKw.has(t.targetKeyword.toLowerCase().trim()) && !usedTitles.has(titleKey(t.title))) ?? topics[0];

  const article = await generateFullArticle({
    title: topic.title,
    targetKeyword: topic.targetKeyword,
    reason: topic.reason,
    outline: topic.outline,
  });

  const slug = await ensureUniqueSlug(slugify(article.slug || article.title));
  const seoScore = analyzeSeo({
    title: article.title,
    content: article.content,
    targetKeyword: article.targetKeyword,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    imageAlt: article.imageAlt,
  }).score;

  const post = await prisma.blogPost.create({
    data: {
      title: article.title,
      slug,
      content: article.content,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      imageAlt: article.imageAlt,
      targetKeyword: article.targetKeyword,
      status: "draft",
      seoScore,
    },
  });

  // Mark the task in-progress — it fully resolves once ≥3 posts are published.
  await prisma.seoTask.update({ where: { id }, data: { status: "doing" } });

  return NextResponse.json({
    ok: true,
    kind: "article_draft",
    post: { id: post.id, title: post.title, slug: post.slug, seoScore },
  });
}
