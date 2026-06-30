import type { BlogPost } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BlogPostDTO, BlogStatus } from "./types";

export function serialize(p: BlogPost): BlogPostDTO {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    content: p.content,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    status: (p.status === "published" ? "published" : "draft") as BlogStatus,
    category: p.category,
    targetKeyword: p.targetKeyword,
    seoScore: p.seoScore,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
  };
}

/** Returns a slug unique across blog_posts (optionally excluding one id). */
export async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  for (let i = 2; i <= 50; i++) {
    const existing = await prisma.blogPost.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
