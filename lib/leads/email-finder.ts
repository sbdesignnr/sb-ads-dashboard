// Self-hosted email discovery for leads — no paid external APIs.
// Step 1: scrape the company's own pages (mailto links + visible text).
// Step 2: fall back to the free Jina reader on the contact page.
// All fetches are server-side.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UA = "Mozilla/5.0 (compatible; SBDesignBot/1.0; +https://sbdesign.sk)";

// System / third-party addresses we never want to return.
const IGNORED = [
  "noreply", "no-reply", "donotreply", "no.reply",
  "sentry.io", "example.com", "wixpress.com", "wordpress.com",
  "squarespace.com", "googleapis.com", "goo.gl", "wix.com",
  "yourdomain", "domain.com", "email.com", "sentry",
];

// Free-mail providers: acceptable, but a company address is preferred.
const FREEMAIL = ["gmail", "yahoo", "hotmail", "outlook", "icloud", "centrum.sk", "azet.sk", "zoznam.sk"];

function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/[.,;:)]+$/, "");
}

function isJunk(email: string): boolean {
  if (IGNORED.some((p) => email.includes(p))) return true;
  // Asset filenames that look like emails (e.g. sprite@2x.png, hash@sha256.js).
  if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?|ico)$/i.test(email)) return true;
  return false;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Pick the best email from an HTML page: mailto first, then a corporate address, then any. */
function pickEmail(html: string): string | null {
  const mailtos = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) ?? [];
  for (const m of mailtos) {
    const email = cleanEmail(m.replace(/mailto:/i, "").split("?")[0]);
    if (!isJunk(email)) return email; // mailto links are the most reliable
  }
  const all = (html.match(EMAIL_RE) ?? []).map(cleanEmail).filter((e) => !isJunk(e));
  const corporate = all.find((e) => !FREEMAIL.some((f) => e.includes(f)));
  return corporate ?? all[0] ?? null; // corporate preferred, otherwise freemail fallback
}

async function scrapeEmailFromWebsite(baseUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return null;
  }
  const paths = ["", "/kontakt", "/kontakty", "/contact", "/o-nas", "/o-nás", "/about", "/impressum"];
  for (const path of paths) {
    const html = await fetchText(`${origin}${path}`, 5000);
    if (!html) continue;
    const email = pickEmail(html);
    if (email) return email;
  }
  return null;
}

/**
 * Fallback via the free Jina reader (r.jina.ai) — it renders the contact page to
 * clean text, which surfaces emails hidden behind JS. Prefers an address on the
 * company's own domain.
 */
async function findEmailViaJina(websiteUrl: string): Promise<string | null> {
  let origin: string;
  let brand = "";
  try {
    const u = new URL(websiteUrl);
    origin = u.origin;
    brand = u.hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return null;
  }
  const text = await fetchText(`https://r.jina.ai/${origin}/kontakt`, 8000);
  if (!text) return null;
  const all = (text.match(EMAIL_RE) ?? []).map(cleanEmail).filter((e) => !isJunk(e));
  const onDomain = brand ? all.find((e) => e.includes(brand)) : undefined;
  return onDomain ?? all.find((e) => !FREEMAIL.some((f) => e.includes(f))) ?? all[0] ?? null;
}

/** Find the best contact email for a lead. Returns null if none is found. */
export async function findEmailForLead(websiteUrl: string | null, companyName: string): Promise<string | null> {
  void companyName; // reserved for a future name-based search; unused for now
  if (!websiteUrl) return null;

  const fromWeb = await scrapeEmailFromWebsite(websiteUrl);
  if (fromWeb) return fromWeb;

  const fromJina = await findEmailViaJina(websiteUrl);
  if (fromJina) return fromJina;

  return null;
}
