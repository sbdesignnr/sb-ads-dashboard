import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateFullArticle } from "@/lib/blog/ai";
import { generateWeeklyPlan } from "@/lib/blog/weekly-plan";
import { ensureUniqueSlug } from "@/lib/blog/store";
import { slugify } from "@/lib/blog/slug";
import { analyzeSeo } from "@/lib/blog/analyze";
import { webAutofixable, generateWebFix } from "@/lib/seo/autofix-web";
import { githubConfigured, getFile, createBranch, commitFile, openPr } from "@/lib/seo/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ARTICLE_CHECKS = new Set(["content:no-topical-authority"]);

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

// "Vyriešiť za mňa": content tasks → a review-ready article draft; website tasks →
// an AI change committed to a fresh branch as a PR the user reviews + previews.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.seoTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ---- Website fix → GitHub PR ----
  if (webAutofixable(task.checkKey)) {
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
    if (!githubConfigured()) return NextResponse.json({ error: "GitHub nie je pripojený (GITHUB_TOKEN/REPO)." }, { status: 503 });
    if (task.fixPrUrl && task.fixPrState === "open") {
      return NextResponse.json({ ok: true, kind: "web_pr", pr: { url: task.fixPrUrl, number: task.fixPrNumber } });
    }
    try {
      const fix = await generateWebFix(task);
      const branch = `seo/${task.checkKey.replace(/[^a-z0-9]+/gi, "-")}-${Date.now().toString(36)}`;
      await createBranch(branch);
      const existing = await getFile(fix.file, branch);
      await commitFile(branch, fix.file, fix.newContent, `SEO: ${fix.summary}`, existing?.sha);
      const pr = await openPr(
        branch,
        `SEO: ${task.title}`,
        `Automatická SEO úprava zo SB Ads dashboardu.\n\n**Úloha:** ${task.title}\n**Zmena:** ${fix.summary}\n**Súbor:** \`${fix.file}\`\n\nSkontroluj náhľadový deploy a ak je OK, klikni „Nasadiť" v dashboarde (alebo Merge tu).`,
      );
      await prisma.seoTask.update({
        where: { id },
        data: { status: "doing", fixBranch: branch, fixPrNumber: pr.number, fixPrUrl: pr.html_url, fixPrState: "open" },
      });
      return NextResponse.json({ ok: true, kind: "web_pr", pr: { url: pr.html_url, number: pr.number, summary: fix.summary } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ---- Content task → article draft ----
  if (ARTICLE_CHECKS.has(task.checkKey)) {
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI nie je nakonfigurované." }, { status: 503 });
    const topics = await generateWeeklyPlan();
    if (!topics.length) return NextResponse.json({ error: "no_topic" }, { status: 500 });
    const posts = await prisma.blogPost.findMany({ select: { title: true, targetKeyword: true } });
    const usedKw = new Set(posts.map((p) => p.targetKeyword?.toLowerCase().trim()).filter(Boolean) as string[]);
    const usedTitles = new Set(posts.map((p) => titleKey(p.title)));
    const topic =
      topics.find((t) => !usedKw.has(t.targetKeyword.toLowerCase().trim()) && !usedTitles.has(titleKey(t.title))) ??
      topics[0];

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
    await prisma.seoTask.update({ where: { id }, data: { status: "doing" } });
    return NextResponse.json({ ok: true, kind: "article_draft", post: { id: post.id, title: post.title, seoScore } });
  }

  return NextResponse.json({ error: "not_autofixable", kind: "manual" }, { status: 400 });
}
