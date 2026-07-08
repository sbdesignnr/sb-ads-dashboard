// Website "outdatedness" analyzer. A HIGHER websiteScore means a more outdated
// site — i.e. a better lead for us. The score splits into a technical part
// (0-40, measurable signals) and a visual part (0-60, AI judgement of how dated
// the design looks), totalling 0-100. A lead qualifies at total >= QUALIFY_AT.
// Modern-framework / broken / parked / social sites are disqualified outright.

import Anthropic from "@anthropic-ai/sdk";
import { captureScreenshot } from "./screenshot";

const QUALIFY_AT = 65;

export interface WebsiteAnalysis {
  // Total 0-100, higher = more outdated. websiteScore is kept as the canonical
  // name the rest of the app already reads; totalScore is an explicit alias.
  websiteScore: number;
  totalScore: number;
  qualified: boolean; // !disqualified && total >= QUALIFY_AT
  isQualified: boolean; // alias of qualified
  disqualifyReason: string | null; // why the lead was filtered out (null if kept)

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

  // AI visual judgement.
  aiVisualReason: string | null;
  visualIssues: string[]; // main visual problems, e.g. ["malé písmo", "table layout"]
  screenshotUrl: string | null;

  reasons: string[];
  // Concrete business gaps we can turn into pain points / opportunities.
  issues: string[];
  // Contact data + text scraped from the site itself (home + contact/about pages).
  extractedEmails: string[];
  extractedPhones: string[];
  extractedIco: string | null; // IČO from the footer/contact — enables exact ORSR match
  pageText: string;
}

const UA = "Mozilla/5.0 (compatible; SBDesignLeadBot/1.0; +https://sbdesign.sk)";
const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function pagespeedKey(): string | undefined {
  return process.env.PAGESPEED_API_KEY?.trim() || process.env.YOUTUBE_API_KEY?.trim() || undefined;
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
): Promise<{ html: string; headers: Headers; hasSsl: boolean; reachable: boolean }> {
  let host = "";
  let path = "/";
  try {
    const parsed = new URL(normalized);
    host = parsed.host;
    path = parsed.pathname + parsed.search;
  } catch {
    return { html: "", headers: new Headers(), hasSsl: false, reachable: false };
  }

  const https = await fetchOnce(`https://${host}${path}`);
  if (https && https.ok) {
    return { html: https.html, headers: https.headers, hasSsl: https.finalUrl.startsWith("https://"), reachable: true };
  }
  const http = await fetchOnce(`http://${host}${path}`);
  if (http && http.ok) {
    return { html: http.html, headers: http.headers, hasSsl: false, reachable: true };
  }
  return { html: "", headers: new Headers(), hasSsl: false, reachable: false };
}

async function pageSpeed(url: string, strategy: "mobile" | "desktop"): Promise<number | null> {
  const key = pagespeedKey();
  const q = new URLSearchParams({ url, strategy, category: "performance" });
  if (key) q.set("key", key);
  try {
    const res = await fetch(`${PAGESPEED_API}?${q.toString()}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const score = data.lighthouseResult?.categories?.performance?.score;
    return typeof score === "number" ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}

function detectPlatform(html: string, headers: Headers): { technology: string | null; isOld: boolean } {
  const lower = html.toLowerCase();
  const poweredBy = headers.get("x-powered-by") ?? "";
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? "";

  if (/wixstatic\.com|_wix|wix\.com\/website|X-Wix/i.test(html) || headers.get("x-wix-request-id"))
    return { technology: "Wix", isOld: true };
  if (/webnode/i.test(lower) || /webnode/i.test(generator)) return { technology: "Webnode", isOld: true };
  if (/joomla/i.test(generator) || /\/components\/com_|joomla/i.test(lower)) return { technology: "Joomla", isOld: true };
  if (/wordpress/i.test(generator) || /wp-content|wp-includes/i.test(lower)) {
    const v = /wordpress\s+([\d.]+)/i.exec(generator)?.[1];
    const major = v ? Number(v.split(".")[0]) : null;
    return { technology: v ? `WordPress ${v}` : "WordPress", isOld: major !== null && major < 6 };
  }
  if (/shoptet/i.test(lower)) return { technology: "Shoptet", isOld: false };
  if (poweredBy) return { technology: poweredBy, isOld: /php\/[45]\b/i.test(poweredBy) || /asp\.net/i.test(poweredBy) };
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
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,25}((?:19|20)\d{2})/gi)]
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

  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i.test(html))
    gaps.push("Chýba SEO popis stránky (meta description) – web sa horšie nájde v Google, uniká bezplatná návštevnosť");

  if (!/<meta[^>]+property=["']og:(title|image)["']/i.test(html))
    gaps.push("Chýba náhľad pri zdieľaní (Open Graph) – odkaz na Facebooku/Instagrame vyzerá neprofesionálne");

  const hasTel = /href=["']tel:/i.test(html);
  const hasMailto = /href=["']mailto:/i.test(html);
  const hasForm = /<form[\s>]/i.test(html);
  if (!hasForm && !hasMailto && !hasTel)
    gaps.push("Nemá kontaktný formulár ani klikací telefón/e-mail – návštevník sa len ťažko ozve");
  else if (!hasForm)
    gaps.push("Chýba kontaktný/dopytový formulár – potenciálni klienti odchádzajú bez zanechania kontaktu");

  if (!/(calendly|reservio|bookio|reservanto|noona|simplybook|bookla|rezerva[čc]|online\s+objedn|objedna[ťt]\s+sa\s+online|book\s+now)/i.test(lower))
    gaps.push("Chýba online rezervácia/objednávka – klienti musia volať a časť z nich to vzdá (priamo stratené tržby)");

  if (!/(gtag\(|google-analytics\.com|googletagmanager\.com|fbevents|connect\.facebook\.net|_paq|plausible|matomo)/i.test(lower))
    gaps.push("Web nemeria návštevnosť (chýba Analytics/pixel) – firma nevie, čo funguje, a nedá sa efektívne inzerovať");

  if (!/application\/ld\+json|schema\.org/i.test(lower))
    gaps.push("Chýbajú štruktúrované dáta (schema.org) – Google nezobrazí hodnotenia, otváracie hodiny či adresu priamo vo výsledkoch");

  return gaps;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/gi, "&");
}

function extractEmails(html: string): string[] {
  const decoded = decodeEntities(html.replace(/\s*(?:\[at\]|\(at\)|&#64;|\s+at\s+)\s*/gi, "@"));
  const found = new Set<string>();
  for (const m of decoded.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const e = m[0].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/.test(e)) continue;
    if (/(sentry|wixpress|example\.com|yourdomain|domain\.com|email\.com|@2x|u003)/.test(e)) continue;
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
  for (const m of text.matchAll(/(?:\+421|00421|0)\s?\d{2}[\s/-]?\d{3}[\s/-]?\d{2}[\s/-]?\d{2}\b/g)) {
    found.add(m[0].replace(/[\s/-]+/g, " ").trim());
  }
  return [...found].slice(0, 5);
}

function extractIco(html: string): string | null {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " "));
  const m = text.match(/I[ČC]O\s*[:\-]?\s*(\d{2}\s?\d{3}\s?\d{3})\b/i);
  if (!m) return null;
  const ico = m[1].replace(/\s/g, "");
  return ico.length === 8 ? ico : null;
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CONTACT_PATHS = ["/kontakt", "/kontakty", "/contact", "/o-nas", "/o-nás", "/about"];

async function loadContactPages(origin: string): Promise<string> {
  let combined = "";
  let fetched = 0;
  for (const path of CONTACT_PATHS) {
    if (fetched >= 2) break;
    const r = await fetchOnce(`${origin}${path}`);
    if (r && r.ok && r.html) {
      combined += " " + r.html;
      fetched++;
    }
  }
  return combined;
}

/**
 * Detect a modern site builder / JS framework. These sites are already modern,
 * so per our philosophy (we sell rebuilds of OLD sites) they're disqualified.
 */
function detectModernFramework(html: string, headers: Headers): { modern: boolean; name: string | null } {
  const lower = html.toLowerCase();
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]?.toLowerCase() ?? "";

  if (/__next_data__|\/_next\/static/i.test(html)) return { modern: true, name: "Next.js" };
  if (/data-reactroot|data-reactid|react-dom|_reactlisten/i.test(html)) return { modern: true, name: "React" };
  if (/__nuxt__|id=["']__nuxt["']|data-v-[0-9a-f]{8}|vue\.runtime/i.test(html)) return { modern: true, name: "Vue/Nuxt" };
  if (/webflow/i.test(lower) || /\bwf-|data-wf-(page|site)/i.test(html) || /webflow/i.test(generator))
    return { modern: true, name: "Webflow" };
  if (/framerusercontent|__framer|framer\.(com|website)/i.test(lower)) return { modern: true, name: "Framer" };
  if (/squarespace/i.test(lower) || /squarespace/i.test(generator)) return { modern: true, name: "Squarespace" };
  if (/wixstatic\.com|_wixcssingredients|wix\.com\/website|X-Wix/i.test(html) || headers.get("x-wix-request-id"))
    return { modern: true, name: "Wix" };
  if (/cdn\.shopify\.com|shopify\.com/i.test(lower)) return { modern: true, name: "Shopify" };
  if (/astro-island|data-astro-cid/i.test(html)) return { modern: true, name: "Astro" };
  if (/__gatsby|id=["']___gatsby["']/i.test(html)) return { modern: true, name: "Gatsby" };
  if (/__sveltekit|svelte-announcer/i.test(html)) return { modern: true, name: "SvelteKit" };
  return { modern: false, name: null };
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
    return /(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|wa\.me)$/.test(h);
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
  screenshotUrl: string | null;
}

function parseVisualJson(text: string): { score: number; reason: string; mainIssues: string[] } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { score?: unknown; reason?: unknown; mainIssues?: unknown };
    const score = Math.max(0, Math.min(60, Math.round(Number(j.score))));
    if (!Number.isFinite(score)) return null;
    return {
      score,
      reason: String(j.reason ?? "").trim() || "Vizuál pôsobí zastaralo.",
      mainIssues: Array.isArray(j.mainIssues) ? j.mainIssues.map(String).slice(0, 5) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Score the visual outdatedness 0-60. Prefers a real screenshot + Claude vision
 * (needs SCREENSHOT_API_KEY); falls back to judging the page's HTML/text when no
 * screenshot service is configured, so scanning still works. Returns nulls only
 * when there is no ANTHROPIC_API_KEY at all.
 */
async function analyzeVisual(url: string, pageText: string): Promise<VisualResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { score: null, reason: null, mainIssues: [], screenshotUrl: null };
  }

  const client = new Anthropic();
  const shot = await captureScreenshot(url).catch(() => null);

  try {
    const content: Anthropic.MessageParam["content"] = shot
      ? [
          { type: "image", source: { type: "base64", media_type: shot.mediaType, data: shot.base64 } },
          { type: "text", text: "Ohodnoť vizuálnu zastaralosť tohto webu podľa kritérií." },
        ]
      : [
          {
            type: "text",
            text: `Nemám screenshot, hodnoť z HTML/textového obsahu webu (${url}). Ak je obsah príliš chudobný, odhadni konzervatívne.\n\nOBSAH:\n${pageText.slice(0, 4000)}`,
          },
        ];

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: VISUAL_SYSTEM,
      messages: [{ role: "user", content }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = parseVisualJson(text);
    if (!parsed) return { score: null, reason: null, mainIssues: [], screenshotUrl: null };
    // Note: screenshotUrl stays null — the screenshot bytes are used transiently
    // for the AI only (the key must never be persisted in a URL). Persisting a
    // viewable screenshot via Supabase storage is a later enhancement.
    return { score: parsed.score, reason: parsed.reason, mainIssues: parsed.mainIssues, screenshotUrl: null };
  } catch {
    return { score: null, reason: null, mainIssues: [], screenshotUrl: null };
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
  const contactHtml = site.reachable && origin ? await loadContactPages(origin) : "";
  const combinedHtml = site.html + contactHtml;
  const extractedEmails = site.reachable ? extractEmails(combinedHtml) : [];
  const extractedPhones = site.reachable ? extractPhones(combinedHtml) : [];
  const extractedIco = site.reachable ? extractIco(combinedHtml) : null;
  const pageText = site.reachable ? visibleText(combinedHtml).slice(0, 5000) : "";

  const platform = detectPlatform(site.html, site.headers);
  const jqOld = jqueryOld(site.html);
  const fw = detectModernFramework(site.html, site.headers);
  const hasViewport = site.reachable && /<meta[^>]+name=["']viewport["']/i.test(site.html);
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
      reasons.push(`Podpriemerná rýchlosť na mobile (PageSpeed ${psMobile}/100)`);
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
  if (fw.modern) technical -= 20; // a modern stack pulls the technical score down
  const technicalScore = Math.max(0, Math.min(40, technical));

  // ---- Visual score (0-60): AI judgement of how dated the design looks ----
  const visual = site.reachable
    ? await analyzeVisual(url, pageText)
    : { score: null, reason: null, mainIssues: [], screenshotUrl: null };
  const visualScore = visual.score;

  const totalScore = Math.max(0, Math.min(100, technicalScore + (visualScore ?? 0)));

  // ---- Disqualification (lead is filtered out, not added to the pipeline) ----
  let disqualifyReason: string | null = null;
  if (isSocialUrl(url)) disqualifyReason = "Odkaz je profil na sociálnej sieti, nie vlastný web.";
  else if (!site.reachable) disqualifyReason = "Web sa nenačítal (404/500 alebo nedostupný).";
  else if (isParkedDomain(site.html)) disqualifyReason = "Parkovaná / nepoužívaná doména.";
  else if (fw.modern) disqualifyReason = `Web už beží na modernom nástroji (${fw.name}).`;
  else if (totalScore < 40) disqualifyReason = `Web je dostatočne dobrý (skóre ${totalScore}/100).`;
  else if (totalScore < QUALIFY_AT) disqualifyReason = `Skóre ${totalScore}/100 – pod prahom ${QUALIFY_AT}.`;

  const qualified = !disqualifyReason && totalScore >= QUALIFY_AT;

  // The concrete findings the AI turns into pain points: scoring reasons plus
  // the business gaps (only when the page actually loaded).
  const issues = [...reasons];
  if (site.reachable) issues.push(...detectBusinessGaps(site.html));

  const technology = fw.name ?? platform.technology ?? (jqOld ? "jQuery <3" : null);

  return {
    websiteScore: totalScore,
    totalScore,
    qualified,
    isQualified: qualified,
    disqualifyReason,
    technicalScore,
    visualScore,
    pageSpeedMobile: psMobile,
    pageSpeedDesktop: psDesktop,
    hasSsl: site.hasSsl,
    isMobileFriendly: hasViewport,
    isResponsive,
    websiteTechnology: technology,
    hasModernFramework: fw.modern,
    websiteAge: cy ? Math.max(0, currentYear - cy) : null,
    copyrightYear: cy,
    aiVisualReason: visual.reason,
    visualIssues: visual.mainIssues,
    screenshotUrl: visual.screenshotUrl,
    reasons,
    issues,
    extractedEmails,
    extractedPhones,
    extractedIco,
    pageText,
  };
}
