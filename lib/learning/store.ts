import type { LearningBook } from "@prisma/client";

export interface LearningBookDTO {
  id: string;
  title: string;
  originalTitle: string | null;
  language: string | null;
  author: string;
  category: string;
  coverUrl: string | null;
  isbn: string | null;
  publishedYear: number | null;
  why: string;
  howToApply: string;
  takeaways: string[];
  priority: number;
  status: string;
  rating: number | null;
  notes: string;
  startedAt: string | null;
  finishedAt: string | null;
  source: string;
}

export function serializeBook(b: LearningBook): LearningBookDTO {
  return {
    id: b.id,
    title: b.title,
    originalTitle: b.originalTitle,
    language: b.language,
    author: b.author,
    category: b.category,
    coverUrl: b.coverUrl,
    isbn: b.isbn,
    publishedYear: b.publishedYear,
    why: b.why,
    howToApply: b.howToApply,
    takeaways: b.takeaways,
    priority: b.priority,
    status: b.status,
    rating: b.rating,
    notes: b.notes,
    startedAt: b.startedAt?.toISOString() ?? null,
    finishedAt: b.finishedAt?.toISOString() ?? null,
    source: b.source,
  };
}

/** Normalised title key for dedup (strip diacritics/punctuation). */
export function bookKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
