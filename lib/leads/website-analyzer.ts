// Website "outdatedness" analyzer. A HIGHER websiteScore means a more outdated
// site — i.e. a better lead for us. The score splits into a technical part
// (0-40, measurable signals) and a visual part (0-60, AI judgement of how dated
// the design looks), totalling 0-100. A lead qualifies at total >= QUALIFY_AT.
// Modern-framework / broken / parked / social sites are disqualified outright.

import Anthropic from "@anthropic-ai/sdk";

const QUALIFY_AT = 65;

export interface WebsiteAnalysis {
  // Total 0-100, higher = more outdated. websiteScore is kept as the canonical
  // name the rest of the app already reads; totalScore is an explicit alias.
  websiteScore: number;
  totalScore: number;
  qualified: boolean; // !disqualified && total >= QUALIFY_AT
  isQualified: boolean; // alias of qualified
  disqualifyReason: string | null; // why the lead was filtered out (null if kept)
  hardDisqualified: boolean; // broken / parked / social / modern framework — NOT a low score

  technicalScore: number; // 0-40
  visualScore: number | null; // 0-60 (null if the AI could not judge it)

  pageSpeedMobile: number | null;
  pageSpeedDesktop: number | null;
  hasSsl: boolean;
  isMobileFriendly: boolean; // has meta viewport
  isResponsive: boolean; // alias of isMobileFriendly
  websiteTechnology: string | null;
  hasModernFramework: boolean; // Next/React/Vue/Webflow/Framer/Squarespace/Wix…
  websiteAge: number | null; // years since footer copyright
  copyrightYear: number | null;

  // AI visual judgement (from the page's HTML/text).
  aiVisualReason: string | null;
  visualIssues: string[]; // main visual problems, e.g. ["malé písmo", "table layout"]

  reasons: string[];
  // Concrete business gaps we can turn into pain points / opportunities.
  issues: string[];
  // Contact data + text scraped from the site itself (home + contact/about pages).
  extractedEmails: string[];
  extractedPhones: string[];
  extractedIco: string | null; // IČO from the footer/contact — enables exact ORSR match
  pageText: string;
}

const UA =
  "Mozilla/5.0 (compatible; SBDesignLeadBot/1.0; +https://sbdesign.sk)";
const PAGESPEED_API =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function pagespeedKey(): string | undefined {
  return (
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.YOUTUBE_API_KEY?.trim() ||
    undefined
  );
}

function normalizeUrl(u: string): string {
  const s = u.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

async function fetchOnce(url: string) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(12000),
    });
    const html = (await res.text()).slice(0, 400_000);
    return { ok: res.ok, finalUrl: res.url, headers: res.headers, html };
  } catch {
    return null;
  }
}

async function loadSite(
  normalized: string,
): Promise<{
  html: string;
  headers: Headers;
  hasSsl: boolean;
  reachable: boolean;
}> {
  let host = "";
  let path = "/";
  try {
    const parsed = new URL(normalized);
    host = parsed.host;
    path = parsed.pathname + parsed.search;
  } catch {
    return {
      html: "",
      headers: new Headers(),
      hasSsl: false,
      reachable: false,
    };
  }

  const https = await fetchOnce(`https://${host}${path}`);
  if (https && https.ok) {
    return {
      html: https.html,
      headers: https.headers,
      hasSsl: https.finalUrl.startsWith("https://"),
      reachable: true,
    };
  }
  const http = await fetchOnce(`http://${host}${path}`);
  if (http && http.ok) {
    return {
      html: http.html,
      headers: http.headers,
      hasSsl: false,
      reachable: true,
    };
  }
  return { html: "", headers: new Headers(), hasSsl: false, reachable: false };
}

async function pageSpeed(
  url: string,
  strategy: "mobile" | "desktop",
): Promise<number | null> {
  const key = pagespeedKey();
  const q = new URLSearchParams({ url, strategy, category: "performance" });
  if (key) q.set("key", key);
  try {
    const res = await fetch(`${PAGESPEED_API}?${q.toString()}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = data.lighthouseResult?.categories?.performance?.score;
    return typeof score === "number" ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}

function detectPlatform(
  html: string,
  headers: Headers,
): { technology: string | null; isOld: boolean } {
  const lower = html.toLowerCase();
  const poweredBy = headers.get("x-powered-by") ?? "";
  const generator =
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ?? "";

  if (
    /wixstatic\.com|_wix|wix\.com\/website|X-Wix/i.test(html) ||
    headers.get("x-wix-request-id")
  )
    return { technology: "Wix", isOld: true };
  if (/webnode/i.test(lower) || /webnode/i.test(generator))
    return { technology: "Webnode", isOld: true };
  if (/joomla/i.test(generator) || /\/components\/com_|joomla/i.test(lower))
    return { technology: "Joomla", isOld: true };
  if (/wordpress/i.test(generator) || /wp-content|wp-includes/i.test(lower)) {
    const v = /wordpress\s+([\d.]+)/i.exec(generator)?.[1];
    const major = v ? Number(v.split(".")[0]) : null;
    return {
      technology: v ? `WordPress ${v}` : "WordPress",
      isOld: major !== null && major < 6,
    };
  }
  if (/shoptet/i.test(lower)) return { technology: "Shoptet", isOld: false };
  if (poweredBy)
    return {
      technology: poweredBy,
      isOld: /php\/[45]\b/i.test(poweredBy) || /asp\.net/i.test(poweredBy),
    };
  if (generator) return { technology: generator, isOld: false };
  return { technology: null, isOld: false };
}

function jqueryOld(html: string): boolean {
  const m =
    /jquery[.-]?v?(\d+)\.(\d+)(?:\.\d+)?(?:\.min)?\.js/i.exec(html) ??
    /jquery["'\s:=]+v?(\d+)\.(\d+)/i.exec(html);
  return m ? Number(m[1]) < 3 : false;
}

function copyrightYear(html: string): number | null {
  const years = [
    ...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,25}((?:19|20)\d{2})/gi),
  ]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1995 && y <= new Date().getFullYear() + 1);
  return years.length ? Math.max(...years) : null;
}

/**
 * Concrete, business-relevant gaps we can turn into money-making opportunities.
 * Each is phrased as an outcome the owner feels, not a technical detail.
 * Only meaningful when the page HTML actually loaded.
 */
function detectBusinessGaps(html: string): string[] {
  const lower = html.toLowerCase();
  const gaps: string[] = [];

  if (
    !/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i.test(
      html,
    )
  )
    gaps.push(
      "Chýba SEO popis stránky (meta description) – web sa horšie nájde v Google, uniká bezplatná návštevnosť",
    );

  if (!/<meta[^>]+property=["']og:(title|image)["']/i.test(html))
    gaps.push(
      "Chýba náhľad pri zdieľaní (Open Graph) – odkaz na Facebooku/Instagrame vyzerá neprofesionálne",
    );

  const hasTel = /href=["']tel:/i.test(html);
  const hasMailto = /href=["']mailto:/i.test(html);
  const hasForm = /<form[\s>]/i.test(html);
  if (!hasForm && !hasMailto && !hasTel)
    gaps.push(
      "Nemá kontaktný formulár ani klikací telefón/e-mail – návštevník sa len ťažko ozve",
    );
  else if (!hasForm)
    gaps.push(
      "Chýba kontaktný/dopytový formulár – potenciálni klienti odchádzajú bez zanechania kontaktu",
    );

  if (
    !/(calendly|reservio|bookio|reservanto|noona|simplybook|bookla|rezerva[čc]|online\s+objedn|objedna[ťt]\s+sa\s+online|book\s+now)/i.test(
      lower,
    )
  )
    gaps.push(
      "Chýba online rezervácia/objednávka – klienti musia volať a časť z nich to vzdá (priamo stratené tržby)",
    );

  if (
    !/(gtag\(|google-analytics\.com|googletagmanager\.com|fbevents|connect\.facebook\.net|_paq|plausible|matomo)/i.test(
      lower,
    )
  )
    gaps.push(
      "Web nemeria návštevnosť (chýba Analytics/pixel) – firma nevie, čo funguje, a nedá sa efektívne inzerovať",
    );

  if (!/application\/ld\+json|schema\.org/i.test(lower))
    gaps.push(
      "Chýbajú štruktúrované dáta (schema.org) – Google nezobrazí hodnotenia, otváracie hodiny či adresu priamo vo výsledkoch",
    );

  return gaps;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&amp;/gi, "&");
}

function extractEmails(html: string): string[] {
  const decoded = decodeEntities(
    html.replace(/\s*(?:\[at\]|\(at\)|&#64;|\s+at\s+)\s*/gi, "@"),
  );
  const found = new Set<string>();
  for (const m of decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/.test(e)) continue;
    if (
      /(sentry|wixpress|example\.com|yourdomain|domain\.com|email\.com|@2x|u003)/.test(
        e,
      )
    )
      continue;
    found.add(e);
  }
  return [...found].slice(0, 5);
}

function extractPhones(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    const p = m[1].replace(/[^\d+]/g, "");
    if (p.replace(/\D/g, "").length >= 9) found.add(p);
  }
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "));
  for (const m of text.matchAll(
    /(?:\+421|00421|0)\s?\d{2}[\s/-]?\d{3}[\s/-]?\d{2}[\s/-]?\d{2}\b/g,
  )) {
    found.add(m[0].replace(/[\s/-]+/g, " ").trim());
  }
  return [...found].slice(0, 5);
}

/**
 * SK/CZ IČO má kontrolnú číslicu (mod 11). Overenie odfiltruje náhodné 8-ciferné
 * čísla (telefóny, dátumy, čísla účtov), ktoré stoja blízko slova „IČO".
 */
export function icoChecksumValid(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i);
  const rem = sum % 11;
  const check = rem === 0 ? 1 : rem === 1 ? 0 : 11 - rem;
  return check === Number(ico[7]);
}

/**
 * Nájde IČO v texte stránky. Značka „IČO"/„IČ" býva písaná rôzne (medzery, bodky,
 * dvojbodka, aj bez oddeľovača), číslo býva zoskupené „36 356 789" aj spojené.
 * Kandidátov pri značke pozbierame a uprednostníme ten s platným kontrolným
 * súčtom — inak vezmeme prvý pri značke. „IČ DPH"/„DIČ" (10+ číslic) vypadnú samy
 * cez kontrolu dĺžky na 8.
 */
export function extractIco(html: string): string | null {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "));
  // I[ČC] + voliteľné O, potom oddeľovač, potom 8 číslic prípadne s medzerou/bodkou.
  // Negatívny lookahead na „DPH" a na SK/CZ predponu vylúči IČ DPH a DIČ.
  const re =
    /I[ČC]\s*O?\s*(?!DPH)[:.\-]?\s*([0-9](?:[ .]?[0-9]){7})(?![0-9])/gi;
  const labelled: string[] = [];
  for (const m of text.matchAll(re)) {
    const digits = m[1].replace(/[ .]/g, "");
    if (digits.length === 8 && !labelled.includes(digits))
      labelled.push(digits);
  }
  if (!labelled.length) return null;
  return labelled.find(icoChecksumValid) ?? labelled[0];
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Stránky, kde býva IČO a meno konateľa. Právne stránky (GDPR, obchodné
// podmienky, ochrana údajov, impressum) sú najbohatší zdroj IČO — presne tam,
// kde ho firmy uvádzajú, aj keď v pätičke nie je.
const LEGAL_RE =
  /gdpr|ochran|osobn[ýy]ch|s[uú]krom|privacy|podmienk|obchodn|\bvop\b|terms|impress?um|z[aá]sady|reklama[čc]|fakturačn|prevádzkovate[ľl]/i;
const CONTACT_RE =
  /kontakt|contact|o-?n[aá]s|o\s*nas|\babout\b|firma|spolo[čc]nos|t[ií]m\b/i;
// Priame cesty ako záloha, keď sa odkazy nedajú vyčítať (napr. JS menu).
const FALLBACK_PATHS = [
  "/kontakt",
  "/kontakty",
  "/contact",
  "/o-nas",
  "/o-nás",
  "/about",
  "/obchodne-podmienky",
  "/vop",
  "/gdpr",
  "/ochrana-osobnych-udajov",
  "/zasady-ochrany-osobnych-udajov",
  "/podmienky",
  "/impressum",
];

/** Z HTML domovskej stránky vytiahne odkazy na právne + kontaktné stránky (rovnaká doména). */
function discoverPageLinks(homeHtml: string, origin: string): string[] {
  let host: string;
  try {
    host = new URL(origin).host.replace(/^www\./, "");
  } catch {
    return [];
  }
  const legal = new Set<string>();
  const contact = new Set<string>();
  for (const m of homeHtml.matchAll(
    /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${label}`;
    let abs: string;
    try {
      abs = new URL(href, origin).toString();
      if (new URL(abs).host.replace(/^www\./, "") !== host) continue; // len vlastná doména
    } catch {
      continue;
    }
    if (LEGAL_RE.test(hay)) legal.add(abs.split("#")[0]);
    else if (CONTACT_RE.test(hay)) contact.add(abs.split("#")[0]);
  }
  // Právne stránky prvé (kvôli IČO), potom kontaktné.
  return [...legal, ...contact];
}

/**
 * Stiahne kontaktné + právne podstránky (max 4) — odtiaľ sa berie IČO, meno
 * konateľa, e-mail a telefón. Najprv skúsi odkazy z domovskej stránky, potom
 * doplní zopár typických ciest, ktoré ešte nemáme.
 */
async function loadExtraPages(
  origin: string,
  homeHtml: string,
): Promise<string> {
  const discovered = discoverPageLinks(homeHtml, origin);
  const seen = new Set(discovered.map((u) => u.replace(/\/$/, "")));
  const queue = [...discovered];
  for (const p of FALLBACK_PATHS) {
    const u = `${origin}${p}`;
    if (!seen.has(u.replace(/\/$/, ""))) {
      seen.add(u.replace(/\/$/, ""));
      queue.push(u);
    }
  }

  let combined = "";
  let fetched = 0;
  for (const url of queue) {
    if (fetched >= 4) break;
    const r = await fetchOnce(url);
    if (r && r.ok && r.html) {
      combined += " " + r.html;
      fetched++;
    }
  }
  return combined;
}

/**
 * Detect a modern site builder / JS framework.
 * - "hard": code frameworks (Next/React/Vue/Nuxt/Gatsby…) + Webflow/Framer — these
 *   are always modern, so per our philosophy (we sell rebuilds of OLD sites) they
 *   are disqualified outright.
 * - "soft": hosted builders (Wix/Squarespace/WordPress/Shopify) — design quality
 *   varies wildly (a 2015 Wix looks as dated as an old WordPress), so we DON'T
 *   disqualify; they take a small technical penalty and the score decides.
 */
function detectModernFramework(
  html: string,
  headers: Headers,
): { kind: "hard" | "soft" | "none"; name: string | null } {
  const lower = html.toLowerCase();
  const generator =
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i
      .exec(html)?.[1]
      ?.toLowerCase() ?? "";

  // Hard-modern → disqualify.
  if (/__next_data__|\/_next\/static/i.test(html))
    return { kind: "hard", name: "Next.js" };
  if (/__nuxt__|id=["']__nuxt["']|data-v-[0-9a-f]{8}|vue\.runtime/i.test(html))
    return { kind: "hard", name: "Vue/Nuxt" };
  if (/__gatsby|id=["']___gatsby["']/i.test(html))
    return { kind: "hard", name: "Gatsby" };
  if (/data-reactroot|data-reactid|react-dom|_reactlisten/i.test(html))
    return { kind: "hard", name: "React" };
  if (
    /webflow/i.test(lower) ||
    /\bwf-|data-wf-(page|site)/i.test(html) ||
    /webflow/i.test(generator)
  )
    return { kind: "hard", name: "Webflow" };
  if (/framerusercontent|__framer|framer\.(com|website)/i.test(lower))
    return { kind: "hard", name: "Framer" };
  if (/astro-island|data-astro-cid/i.test(html))
    return { kind: "hard", name: "Astro" };
  if (/__sveltekit|svelte-announcer/i.test(html))
    return { kind: "hard", name: "SvelteKit" };

  // Soft builders → small penalty, keep the lead if the score still qualifies.
  if (
    /wixstatic\.com|_wixcssingredients|wix\.com\/website|X-Wix/i.test(html) ||
    headers.get("x-wix-request-id")
  )
    return { kind: "soft", name: "Wix" };
  if (/squarespace/i.test(lower) || /squarespace/i.test(generator))
    return { kind: "soft", name: "Squarespace" };
  if (/wordpress/i.test(generator) || /wp-content|wp-includes/i.test(lower))
    return { kind: "soft", name: "WordPress" };
  if (/cdn\.shopify\.com|shopify\.com/i.test(lower))
    return { kind: "soft", name: "Shopify" };

  return { kind: "none", name: null };
}

/** A parked / for-sale domain has essentially no real content — not a lead. */
function isParkedDomain(html: string): boolean {
  const t = visibleText(html).toLowerCase();
  return /(this domain is for sale|domain is parked|buy this domain|dom[eé]na (je )?na predaj|parkovan[aá] dom[eé]na|sedoparking|hugedomains|dan\.com|afternic|godaddy.*parking)/i.test(
    t,
  );
}

/** Places sometimes returns a Facebook/Instagram profile instead of a real site. */
function isSocialUrl(url: string): boolean {
  try {
    const h = new URL(url).host.replace(/^www\./, "").toLowerCase();
    return /(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|wa\.me)$/.test(
      h,
    );
  } catch {
    return false;
  }
}

const VISUAL_SYSTEM = `Si expert na web dizajn. Ohodnoť vizuálnu zastaralosť webu na škále 0-60, kde 60 = extrémne zastaralý dizajn z 90-tych/2000-tych rokov, 0 = moderný profesionálny web.

Kritériá hodnotenia:
- Typografia: malé písmo, Comic Sans, Times New Roman, Arial pod 14px = zastaralé (+10)
- Layout: table-based, fixed width, úzky vycentrovaný obsah = zastaralé (+15)
- Farby: príliš veľa farieb, neónové farby, nevhodný kontrast = (+10)
- Obrázky: nízka kvalita, štvorhranné bez zaoblenia, staré stock fotky = (+10)
- Celkový dojem: pôsobila by firma na prvý pohľad profesionálne? (+15)

Odpovedz VÝHRADNE v JSON (žiadny iný text):
{"score": číslo 0-60, "reason": "stručný dôvod po slovensky, max 2 vety", "mainIssues": ["problém1","problém2","problém3"]}`;

interface VisualResult {
  score: number | null;
  reason: string | null;
  mainIssues: string[];
}

function parseVisualJson(
  text: string,
): { score: number; reason: string; mainIssues: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as {
      score?: unknown;
      reason?: unknown;
      mainIssues?: unknown;
    };
    const score = Math.max(0, Math.min(60, Math.round(Number(j.score))));
    if (!Number.isFinite(score)) return null;
    return {
      score,
      reason: String(j.reason ?? "").trim() || "Vizuál pôsobí zastaralo.",
      mainIssues: Array.isArray(j.mainIssues)
        ? j.mainIssues.map(String).slice(0, 5)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Score the visual outdatedness 0-60 from the page's HTML/text via Claude.
 * Returns nulls when there is no ANTHROPIC_API_KEY or on any failure.
 */
async function analyzeVisual(
  url: string,
  pageText: string,
): Promise<VisualResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { score: null, reason: null, mainIssues: [] };
  }

  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: VISUAL_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Hodnoť vizuálnu zastaralosť webu (${url}) z jeho HTML/textového obsahu. Ak je obsah príliš chudobný, odhadni konzervatívne.\n\nOBSAH:\n${pageText.slice(0, 4000)}`,
        },
      ],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = parseVisualJson(text);
    if (!parsed) return { score: null, reason: null, mainIssues: [] };
    return {
      score: parsed.score,
      reason: parsed.reason,
      mainIssues: parsed.mainIssues,
    };
  } catch {
    return { score: null, reason: null, mainIssues: [] };
  }
}

export async function analyzeWebsite(rawUrl: string): Promise<WebsiteAnalysis> {
  const url = normalizeUrl(rawUrl);
  const [site, psMobile, psDesktop] = await Promise.all([
    loadSite(url),
    pageSpeed(url, "mobile"),
    pageSpeed(url, "desktop"),
  ]);

  // Scrape contact/about pages too — that's where the owner name, e-mail and
  // phone usually live (and Places/ORSR often miss them).
  let origin = "";
  try {
    origin = new URL(site.reachable ? url : url).origin;
  } catch {
    /* ignore */
  }
  const contactHtml =
    site.reachable && origin ? await loadExtraPages(origin, site.html) : "";
  const combinedHtml = site.html + contactHtml;
  const extractedEmails = site.reachable ? extractEmails(combinedHtml) : [];
  const extractedPhones = site.reachable ? extractPhones(combinedHtml) : [];
  const extractedIco = site.reachable ? extractIco(combinedHtml) : null;
  const pageText = site.reachable
    ? visibleText(combinedHtml).slice(0, 5000)
    : "";

  const platform = detectPlatform(site.html, site.headers);
  const jqOld = jqueryOld(site.html);
  const fw = detectModernFramework(site.html, site.headers);
  const hasViewport =
    site.reachable && /<meta[^>]+name=["']viewport["']/i.test(site.html);
  const isResponsive = hasViewport;
  const cy = copyrightYear(site.html);
  const currentYear = new Date().getFullYear();

  // ---- Technical score (0-40): measurable signals ----
  let technical = 0;
  const reasons: string[] = [];

  if (psMobile !== null) {
    if (psMobile < 30) {
      technical += 20;
      reasons.push(`Veľmi pomalý na mobile (PageSpeed ${psMobile}/100)`);
    } else if (psMobile < 50) {
      technical += 15;
      reasons.push(`Pomalý na mobile (PageSpeed ${psMobile}/100)`);
    } else if (psMobile < 70) {
      technical += 8;
      reasons.push(
        `Podpriemerná rýchlosť na mobile (PageSpeed ${psMobile}/100)`,
      );
    }
  }
  if (site.reachable && !isResponsive) {
    technical += 12;
    reasons.push("Nie je responzívny (chýba meta viewport)");
  }
  if (cy !== null) {
    if (cy < 2018) {
      technical += 8;
      reasons.push(`Veľmi zastaraný copyright (${cy})`);
    } else if (cy <= 2020) {
      technical += 4;
      reasons.push(`Zastaraný copyright (${cy})`);
    }
  }
  if (site.reachable && !site.hasSsl) {
    technical += 6;
    reasons.push("Chýba HTTPS/SSL");
  }
  // Hard-modern stacks are disqualified below; soft builders take a small hit.
  if (fw.kind === "hard") technical -= 20;
  else if (fw.kind === "soft") technical -= 10;
  const technicalScore = Math.max(0, Math.min(40, technical));

  // ---- Cheap disqualifiers FIRST, so we skip the expensive visual AI (Claude)
  // on sites we'd reject anyway: modern stack, broken, parked, or a social
  // profile. Critical for scanning large volumes. ----
  let disqualifyReason: string | null = null;
  if (isSocialUrl(url))
    disqualifyReason = "Odkaz je profil na sociálnej sieti, nie vlastný web.";
  else if (!site.reachable)
    disqualifyReason = "Web sa nenačítal (404/500 alebo nedostupný).";
  else if (isParkedDomain(site.html))
    disqualifyReason = "Parkovaná / nepoužívaná doména.";
  else if (fw.kind === "hard")
    disqualifyReason = `Web už beží na modernom nástroji (${fw.name}).`;

  // Only the cheap pre-checks above are "hard" disqualifiers (not-a-lead). A low
  // score alone must NOT reject a lead — the score is just a quality indicator.
  const hardDisqualified = disqualifyReason !== null;

  // ---- Visual score (0-60): only spent on real candidates ----
  const visual =
    !disqualifyReason && site.reachable
      ? await analyzeVisual(url, pageText)
      : { score: null, reason: null, mainIssues: [] };
  const visualScore = visual.score;

  const totalScore = Math.max(
    0,
    Math.min(100, technicalScore + (visualScore ?? 0)),
  );

  // ---- Score-based disqualifiers (only if not already disqualified) ----
  if (!disqualifyReason) {
    if (totalScore < 40)
      disqualifyReason = `Web je dostatočne dobrý (skóre ${totalScore}/100).`;
    else if (totalScore < QUALIFY_AT)
      disqualifyReason = `Skóre ${totalScore}/100 – pod prahom ${QUALIFY_AT}.`;
  }

  const qualified = !disqualifyReason && totalScore >= QUALIFY_AT;

  // The concrete findings the AI turns into pain points: scoring reasons plus
  // the business gaps (only when the page actually loaded).
  const issues = [...reasons];
  if (site.reachable) issues.push(...detectBusinessGaps(site.html));

  const technology =
    fw.name ?? platform.technology ?? (jqOld ? "jQuery <3" : null);

  return {
    websiteScore: totalScore,
    totalScore,
    qualified,
    isQualified: qualified,
    disqualifyReason,
    hardDisqualified,
    technicalScore,
    visualScore,
    pageSpeedMobile: psMobile,
    pageSpeedDesktop: psDesktop,
    hasSsl: site.hasSsl,
    isMobileFriendly: hasViewport,
    isResponsive,
    websiteTechnology: technology,
    hasModernFramework: fw.kind === "hard",
    websiteAge: cy ? Math.max(0, currentYear - cy) : null,
    copyrightYear: cy,
    aiVisualReason: visual.reason,
    visualIssues: visual.mainIssues,
    reasons,
    issues,
    extractedEmails,
    extractedPhones,
    extractedIco,
    pageText,
  };
}
