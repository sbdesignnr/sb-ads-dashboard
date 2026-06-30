import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getArticlePerformance } from "@/lib/blog/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const post = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true } });
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const perf = await getArticlePerformance(post.slug);
  return NextResponse.json(perf);
}
