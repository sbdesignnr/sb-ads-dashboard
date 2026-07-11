/**
 * Ground an AI book suggestion in real data: fetch the real cover + ISBN + year.
 * Google Books first (best covers/metadata, needs the Books API enabled on the
 * key's project), then Open Library (keyless, spottier), then null — the UI shows
 * a generated placeholder so a missing cover never looks broken.
 */

export interface BookMeta {
  title: string; // authoritative title from the real catalog (localized if a translation exists)
  author: string;
  coverUrl: string | null;
  isbn: string | null;
  publishedYear: number | null;
  resolvedLanguage: "SK" | "CZ" | "en";
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

async function fromGoogle(title: string, author: string, lang?: string): Promise<BookMeta | null> {
  const key = booksKey();
  const q = `intitle:${title}${author ? `+inauthor:${author}` : ""}`;
  const langParam = lang && lang !== "en" ? `&langRestrict=${lang.toLowerCase()}` : "";
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&country=SK${langParam}${key ? `&key=${key}` : ""}`;
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
    return { title: v.title, author: v.authors?.join(", ") ?? author, coverUrl: cover, isbn, publishedYear: year, resolvedLanguage: "en" };
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
      resolvedLanguage: "en",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a book's REAL title + cover from the catalog, preferring a Slovak, then
 * Czech, edition. The returned `title` is authoritative (from Google Books) — this
 * is what corrects the AI's guessed translations. `hintTitle` (the AI's localized
 * guess) only seeds the search; `originalTitle` is the canonical English title.
 * Needs Google Books enabled for real SK/CZ editions; without it, falls back to
 * the original edition (accurate, just English).
 */
export async function lookupBook(
  originalTitle: string,
  author: string,
  opts: { hintTitle?: string } = {},
): Promise<BookMeta> {
  const seed = opts.hintTitle || originalTitle;

  // 1) Real Slovak edition, then Czech — the RESULT title is authoritative.
  const sk = await fromGoogle(seed, author, "sk");
  if (sk?.coverUrl) return { ...sk, resolvedLanguage: "SK" };
  const cs = await fromGoogle(seed, author, "cs");
  if (cs?.coverUrl) return { ...cs, resolvedLanguage: "CZ" };

  // 2) No translation found → original edition (accurate, English).
  const en = await fromGoogle(originalTitle, author);
  if (en?.coverUrl) return { ...en, title: originalTitle, resolvedLanguage: "en" };
  const ol = await fromOpenLibrary(originalTitle, author);
  if (ol?.coverUrl) return { ...ol, title: originalTitle, resolvedLanguage: "en" };

  // 3) Nothing — placeholder spine with the original title.
  return { title: originalTitle, author, coverUrl: null, isbn: null, publishedYear: null, resolvedLanguage: "en" };
}
