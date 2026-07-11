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
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    language?: string; // "sk" | "cs" | "en" | …
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

function mapVolume(v: NonNullable<GoogleVolume["volumeInfo"]>, author: string): BookMeta | null {
  if (!v.title) return null;
  const isbn =
    v.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ??
    v.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ??
    null;
  const cover =
    (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null)
      ?.replace(/^http:/, "https:")
      .replace(/&edge=curl/, "")
      .replace(/zoom=\d/, "zoom=1") ?? null;
  const year = v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null;
  const vlang = v.language?.toLowerCase();
  return {
    title: v.title,
    author: v.authors?.join(", ") ?? author,
    coverUrl: cover,
    isbn,
    publishedYear: year,
    // Trust the volume's ACTUAL language, not langRestrict (which leaks other langs).
    resolvedLanguage: vlang === "sk" ? "SK" : vlang === "cs" ? "CZ" : "en",
  };
}

/** Up to `max` volumes for a query (optionally biased to a language). */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchGoogle(title: string, author: string, lang?: string, max = 6): Promise<BookMeta[]> {
  const key = booksKey();
  // Plain relevance query — the `intitle:`/`inauthor:` operators are too strict for
  // translated editions (the author name + exact title differ from the original).
  const q = `${title} ${author}`.trim();
  const langParam = lang ? `&langRestrict=${lang.toLowerCase()}` : "";
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&country=SK${langParam}${key ? `&key=${key}` : ""}`;

  // Google Books intermittently 503/429s under a burst — retry a couple of times.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = (await res.json()) as { items?: GoogleVolume[] };
        return (data.items ?? []).map((it) => mapVolume(it.volumeInfo ?? {}, author)).filter((b): b is BookMeta => b !== null);
      }
      if (res.status !== 503 && res.status !== 429) return []; // hard error — don't retry
    } catch {
      /* timeout — retry */
    }
    await sleep(600 * (attempt + 1));
  }
  return [];
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");

/** The candidate's author must contain the original author's surname. */
function authorMatches(candidate: string, original: string): boolean {
  const parts = fold(original).split(/\s+/).filter(Boolean);
  const surname = parts[parts.length - 1] ?? "";
  return surname.length >= 3 && fold(candidate).includes(surname);
}

/** Candidate title must share a meaningful word with one of the seeds. */
function titleRelated(candidate: string, seeds: string[]): boolean {
  const cw = new Set(fold(candidate).split(/\s+/).filter((w) => w.length >= 4));
  return seeds.some((s) => fold(s).split(/\s+/).some((w) => w.length >= 4 && cw.has(w)));
}

/** A candidate is the real localized edition if language + author + title all line up. */
function isRealEdition(b: BookMeta, author: string, seeds: string[]): boolean {
  return (
    (b.resolvedLanguage === "CZ" || b.resolvedLanguage === "SK") &&
    Boolean(b.coverUrl) &&
    authorMatches(b.author, author) &&
    titleRelated(b.title, seeds)
  );
}

async function fromGoogle(title: string, author: string): Promise<BookMeta | null> {
  return (await searchGoogle(title, author, undefined, 3)).find((b) => b.coverUrl) ?? null;
}

interface OpenLibDoc {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  first_publish_year?: number;
}

/**
 * Manual add: resolve whatever the user typed (any language) to the best real
 * match with a cover. They typed the exact edition they want, so we take the top
 * cover-bearing result as-is and read its real title/author/language.
 */
export async function lookupByTitle(query: string, author?: string): Promise<BookMeta | null> {
  const results = await searchGoogle(query, author ?? "", undefined, 8);
  // Require the result to actually match the query title (+ author if given) —
  // otherwise the top cover-bearing result can be an unrelated book.
  const hit = results.find(
    (b) => b.coverUrl && titleRelated(b.title, [query]) && (!author || authorMatches(b.author, author)),
  );
  if (hit) return hit;
  const ol = await fromOpenLibrary(query, author ?? "");
  return ol?.coverUrl && titleRelated(ol.title, [query]) ? ol : null;
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
  opts: { hintTitle?: string; hintLanguage?: string } = {},
): Promise<BookMeta> {
  // Search the language the AI says a translation exists in FIRST (its hint title
  // is the seed that surfaces that edition), then the other Slavic language. This
  // keeps queries to ~2/book — the batch was 503-ing Google Books at 5/book.
  const hint = opts.hintTitle;

  // 1) One localized search, seeded by the AI's SK/CZ hint. A Czech/Slovak query
  //    naturally returns localized editions WITHOUT langRestrict (which is loose and
  //    burns quota) — we just verify language + author + title. Keeping it to a
  //    single query per book is what stops Google Books 503-ing mid-batch.
  if (hint && opts.hintLanguage && opts.hintLanguage !== "en") {
    const seeds = [hint, originalTitle];
    const hit = (await searchGoogle(hint, author, undefined, 8)).find((b) => isRealEdition(b, author, seeds));
    if (hit) return hit;
  }

  // 2) No real SK/CZ edition (or AI knows there isn't one) → original edition.
  const en = await fromGoogle(originalTitle, author);
  if (en?.coverUrl) return { ...en, title: originalTitle, resolvedLanguage: "en" };
  const ol = await fromOpenLibrary(originalTitle, author);
  if (ol?.coverUrl) return { ...ol, title: originalTitle, resolvedLanguage: "en" };

  // 3) Nothing — placeholder spine with the original title.
  return { title: originalTitle, author, coverUrl: null, isbn: null, publishedYear: null, resolvedLanguage: "en" };
}
