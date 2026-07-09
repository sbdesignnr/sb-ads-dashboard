// Self-hosted email discovery for leads — no paid external APIs.
// Step 1: scrape the company's own pages (mailto links + full HTML).
// Step 2: fall back to the free Jina reader on the contact page.
// All fetches are server-side.
//
// Freemail (gmail/yahoo/hotmail/centrum.sk/azet.sk) is VALID — small SK/CZ firms
// routinely use it as their contact address, so it is never filtered out.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const UA = "Mozilla/5.0 (compatible; SBDesignBot/1.0; +https://sbdesign.sk)";

// Domains that are never a real company contact.
const IGNORED_DOMAINS = [
  "sentry.io", "example.com", "wixpress.com", "wordpress.com",
  "squarespace.com", "googleapis.com", "yourdomain", "domain.com",
];
// Local-parts that are system addresses or asset references (logo@2x.png…).
const IGNORED_LOCAL_PREFIX = ["noreply", "no-reply", "donotreply", "sprite", "icon", "logo"];

function cleanEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/[.,;:)]+$/, "");
}

function isJunk(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1) return true;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (IGNORED_DOMAINS.some((d) => domain.includes(d))) return true;
  if (IGNORED_LOCAL_PREFIX.some((p) => local.startsWith(p))) return true;
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

/** Pick the first valid email from a page: mailto links first, then anywhere in the raw HTML. */
function pickEmail(html: string): string | null {
  // mailto: links are the most reliable.
  const mailtos = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi) ?? [];
  for (const m of mailtos) {
    const email = cleanEmail(m.replace(/mailto:/i, "").split("?")[0]);
    if (!isJunk(email)) return email;
  }
  // Otherwise scan the WHOLE HTML (not just visible text) — freemail counts.
  const all = (html.match(EMAIL_RE) ?? []).map(cleanEmail).filter((e) => !isJunk(e));
  return all[0] ?? null;
}

// Homepage + common contact / legal subpages where an email usually lives.
const CONTACT_PATHS = [
  "",
  "/kontakt", "/kontakty", "/contact", "/contacts",
  "/o-nas", "/o-nás", "/about", "/about-us",
  "/impressum", "/impresum", "/gdpr", "/ochrana-osobnych-udajov",
];

async function scrapeEmailFromWebsite(baseUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return null;
  }
  for (const path of CONTACT_PATHS) {
    const html = await fetchText(`${origin}${path}`, 5000);
    if (!html) continue;
    const email = pickEmail(html);
    if (email) return email; // first hit wins (loop stops early)
  }
  return null;
}

/**
 * Fallback via the free Jina reader (r.jina.ai) — renders the contact page to
 * clean text, surfacing emails hidden behind JS. Prefers an address on the
 * company's own domain, otherwise the first valid one (freemail included).
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
  return onDomain ?? all[0] ?? null;
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
