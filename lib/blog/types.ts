export type BlogStatus = "draft" | "published";

export interface BlogPostDTO {
  id: string;
  title: string;
  slug: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  status: BlogStatus;
  category: string | null;
  targetKeyword: string | null;
  seoScore: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export type BlogPostListItem = Pick<
  BlogPostDTO,
  "id" | "title" | "slug" | "status" | "category" | "targetKeyword" | "seoScore" | "updatedAt" | "publishedAt"
>;
