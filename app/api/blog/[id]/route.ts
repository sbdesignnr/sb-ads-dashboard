import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blog/slug";
import { analyzeSeo } from "@/lib/blog/analyze";
import { ensureUniqueSlug, serialize } from "@/lib/blog/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ post: serialize(post) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const current = await prisma.blogPost.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const str = (v: unknown, fallback: string | null) =>
    typeof v === "string" ? v : v === null ? null : fallback;

  const title = typeof body.title === "string" ? body.title : current.title;
  const content = typeof body.content === "string" ? body.content : current.content;
  const metaTitle = body.metaTitle === undefined ? current.metaTitle : str(body.metaTitle, current.metaTitle);
  const metaDescription =
    body.metaDescription === undefined ? current.metaDescription : str(body.metaDescription, current.metaDescription);
  const category = body.category === undefined ? current.category : str(body.category, current.category);
  const targetKeyword =
    body.targetKeyword === undefined ? current.targetKeyword : str(body.targetKeyword, current.targetKeyword);
  const imageUrl = body.imageUrl === undefined ? current.imageUrl : str(body.imageUrl, current.imageUrl);
  const imageAlt = body.imageAlt === undefined ? current.imageAlt : str(body.imageAlt, current.imageAlt);

  // Slug: explicit override, else keep; regenerate from title only if slug becomes empty.
  let slug = current.slug;
  if (typeof body.slug === "string" && body.slug.trim()) {
    slug = await ensureUniqueSlug(slugify(body.slug), id);
  }

  // Status + publishedAt.
  let status = current.status;
  let publishedAt = current.publishedAt;
  if (body.status === "published" || body.status === "draft") {
    status = body.status;
    if (status === "published" && !publishedAt) publishedAt = new Date();
  }

  const seoScore = analyzeSeo({
    title,
    content,
    metaTitle,
    metaDescription,
    targetKeyword,
    imageUrl,
    imageAlt,
  }).score;

  const post = await prisma.blogPost.update({
    where: { id },
    data: {
      title,
      slug,
      content,
      metaTitle,
      metaDescription,
      imageUrl,
      imageAlt,
      category,
      targetKeyword,
      status,
      publishedAt,
      seoScore,
    },
  });

  return NextResponse.json({ post: serialize(post) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await prisma.blogPost.deleteMany({ where: { id } });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
