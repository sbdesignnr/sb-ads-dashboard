import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, read-only feed of PUBLISHED posts for the sbdesign.sk website to
// render in its own design. No auth; CORS-open for read.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

export function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");

  if (slug) {
    const post = await prisma.blogPost.findFirst({ where: { slug, status: "published" } });
    if (!post) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });
    return NextResponse.json(
      {
        post: {
          title: post.title,
          slug: post.slug,
          content: post.content,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          imageUrl: post.imageUrl,
          imageAlt: post.imageAlt,
          category: post.category,
          publishedAt: post.publishedAt?.toISOString() ?? null,
        },
      },
      { headers: CORS },
    );
  }

  const posts = await prisma.blogPost.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 200,
    select: {
      title: true,
      slug: true,
      metaTitle: true,
      metaDescription: true,
      imageUrl: true,
      imageAlt: true,
      category: true,
      publishedAt: true,
    },
  });
  return NextResponse.json(
    { posts: posts.map((p) => ({ ...p, publishedAt: p.publishedAt?.toISOString() ?? null })) },
    { headers: CORS },
  );
}
