import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blog/slug";
import { computeSeoScore } from "@/lib/blog/seo";
import { ensureUniqueSlug, serialize } from "@/lib/blog/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const posts = await prisma.blogPost.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ posts: posts.map(serialize) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    title?: string;
    content?: string;
    category?: string;
    targetKeyword?: string;
    metaTitle?: string;
    metaDescription?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body → blank draft */
  }

  const title = (body.title ?? "").trim();
  const content = body.content ?? "";
  const slug = await ensureUniqueSlug(slugify(title || "novy-clanok"));

  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      content,
      category: body.category ?? null,
      targetKeyword: body.targetKeyword ?? null,
      metaTitle: body.metaTitle ?? null,
      metaDescription: body.metaDescription ?? null,
      status: "draft",
      seoScore: computeSeoScore({
        title,
        content,
        targetKeyword: body.targetKeyword,
        metaTitle: body.metaTitle,
        metaDescription: body.metaDescription,
      }),
    },
  });

  return NextResponse.json({ post: serialize(post) });
}
