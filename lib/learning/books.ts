/**
 * Ground an AI book suggestion in real data: fetch the real cover + ISBN + year.
 * Google Books first (best covers/metadata, needs the Books API enabled on the
 * key's project), then Open Library (keyless, spottier), then null — the UI shows
 * a generated placeholder so a missing cover never looks broken.
 */

export interface BookMeta {
  title: string;
  author: string;
  coverUrl: string | null;
  isbn: string | null;
  publishedYear: number | null;
}

function booksKey(): string | undefined {
  return (
    process.env.GOOGLE_BOOKS_API_KEY?.trim() ||
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.YOUTUBE_API_KEY?.trim() ||
    undefined
  );
}

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

async function fromGoogle(title: string, author: string): Promise<BookMeta | null> {
  const key = booksKey();
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ""}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=SK${key ? `&key=${key}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: GoogleVolume[] };
    const v = data.items?.[0]?.volumeInfo;
    if (!v?.title) return null;
    const isbn =
      v.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
      v.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
      null;
    // Bump the thumbnail to a larger, https, un-curled cover.
    const cover =
      (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null)
        ?.replace(/^http:/, "https:")
        .replace(/&edge=curl/, "")
        .replace(/zoom=\d/, "zoom=1") ?? null;
    const year = v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null;
    return { title: v.title, author: v.authors?.join(", ") ?? author, coverUrl: cover, isbn, publishedYear: year };
  } catch {
    return null;
  }
}

interface OpenLibDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  first_publish_year?: number;
}

async function fromOpenLibrary(title: string, author: string): Promise<BookMeta | null> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(`${title} ${author}`)}&limit=1&fields=title,author_name,cover_i,isbn,first_publish_year`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { docs?: OpenLibDoc[] };
    const d = data.docs?.[0];
    if (!d?.title) return null;
    return {
      title: d.title,
      author: d.author_name?.join(", ") ?? author,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
      isbn: d.isbn?.[0] ?? null,
      publishedYear: d.first_publish_year ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a real cover + metadata for a title/author. Keeps the AI's title/author
 * if the lookups only add a cover; falls back to the AI values when nothing hits.
 */
export async function lookupBook(title: string, author: string): Promise<BookMeta> {
  const google = await fromGoogle(title, author);
  if (google?.coverUrl) return google;
  const openlib = await fromOpenLibrary(title, author);
  if (openlib?.coverUrl) return openlib;
  // Neither had a cover — return the best metadata we got, cover null (UI placeholder).
  return google ?? openlib ?? { title, author, coverUrl: null, isbn: null, publishedYear: null };
}
