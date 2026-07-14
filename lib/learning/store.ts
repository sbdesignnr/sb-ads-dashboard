import type { BookNote, LearningBook } from "@prisma/client";

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

export interface BookNoteDTO {
  id: string;
  bookId: string;
  title: string;
  /** HTML z editora — už prefiltrované (lib/learning/sanitize.ts). */
  content: string;
  sortOrder: number;
  updatedAt: string;
}

export function serializeNote(n: BookNote): BookNoteDTO {
  return {
    id: n.id,
    bookId: n.bookId,
    title: n.title,
    content: n.content,
    sortOrder: n.sortOrder,
    updatedAt: n.updatedAt.toISOString(),
  };
}

/**
 * Hrubý odhad, koľko je v kapitole naozaj textu — HTML značky sa nerátajú.
 * Slúži na prehľad ("3 kapitoly · 480 slov"), nie na presnú štatistiku.
 */
export function noteWordCount(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, "")
    .trim();
  return text ? text.split(/\s+/).length : 0;
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
