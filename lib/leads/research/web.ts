// Zber overiteľných dát z verejných webov (bez AI): text stránok, odkazy, technické
// vlastnosti webu. Všetko sa dá otvoriť a overiť — dôkazy potom citujú tento text.

import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (compatible; SBDesignResearchBot/1.0; +https://sbdesign.sk)";

/** Len verejné http(s) adresy (nie localhost / privátne siete). */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export async function fetchHtml(
  url: string,
  timeoutMs = 10000,
): Promise<{ html: string; finalUrl: string; headers: Headers } | null> {
  if (!isPublicHttpUrl(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": "sk,cs;q=0.9,en;q=0.5" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    const html = (await res.text()).slice(0, 500_000);
    return { html, finalUrl: res.url, headers: res.headers };
  } catch {
    return null;
  }
}

export interface PageDigest {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
  links: { href: string; text: string }[];
}

/** Zhrnutie stránky: názov, popis, nadpisy a čitateľný text (bez skriptov/štýlov). */
export function digestPage(
  html: string,
  url: string,
  maxChars = 2600,
  /** Texty už použité na iných stránkach toho istého webu (menu, pätička) — preskočia sa. */
  seenGlobal?: Set<string>,
): PageDigest {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const description =
    $('meta[name="description"]').attr("content")?.replace(/\s+/g, " ").trim() ?? "";

  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    try {
      links.push({ href: new URL(href, url).toString(), text });
    } catch {
      /* neplatný odkaz */
    }
  });

  $("script,style,noscript,svg,iframe,form,select,option,nav").remove();
  const headings: string[] = [];
  $("h1,h2,h3").each((_, h) => {
    const t = $(h).text().replace(/\s+/g, " ").trim();
    if (t && t.length < 140 && headings.length < 24) headings.push(t);
  });
  const seen = new Set<string>();
  const chunks: string[] = [];
  $("h1,h2,h3,h4,p,li,td,dd").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length < 20 || seen.has(t) || seenGlobal?.has(t)) return;
    seen.add(t);
    seenGlobal?.add(t);
    chunks.push(t);
  });
  let text = chunks.join("\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + "…";
  return { url, title, description, headings, text, links };
}

const SUBPAGE_PRIORITY: [RegExp, number][] = [
  [/(služb|sluzb|služby|ponuk|čo robíme|co robime|zákrok|zakrok|liečb|liecb|terapi|menu|jedál|produkty|realizáci|realizaci)/i, 1],
  [/(cenn|cena|price|pricing)/i, 2],
  [/(o[-\s]?n[áa]s|o[-\s]?mne|o[-\s]?n[aá]s|príbeh|pribeh|about|kto sme|kto som)/i, 3],
  [/(tím|tim|team|ľudia|ludia|lekár|lekar|terapeut)/i, 4],
  [/(referenci|recenz|pacient|klient|reviews|testimon)/i, 5],
  [/(objedn|rezerv|booking|termín|termin)/i, 6],
  [/(blog|aktual|novink|magaz)/i, 7],
];

/** Vyberie až 4 podstránky toho istého webu, ktoré najviac prezradia o firme. */
export function pickSubpages(links: { href: string; text: string }[], homeUrl: string): string[] {
  const host = hostOf(homeUrl);
  const scored = new Map<string, number>();
  for (const l of links) {
    if (hostOf(l.href) !== host) continue;
    const path = (() => {
      try {
        return new URL(l.href).pathname;
      } catch {
        return "";
      }
    })();
    if (!path || path === "/" || /\.(jpg|jpeg|png|gif|pdf|zip|svg|webp)$/i.test(path)) continue;
    const label = `${l.text} ${path}`;
    const hit = SUBPAGE_PRIORITY.find(([re]) => re.test(label));
    if (!hit) continue;
    const key = l.href.split("#")[0].replace(/\/$/, "");
    if (!scored.has(key) || hit[1] < (scored.get(key) ?? 99)) scored.set(key, hit[1]);
  }
  // po jednej stránke z každej kategórie, najdôležitejšie prvé
  const byCategory = new Map<number, string>();
  for (const [href, cat] of [...scored.entries()].sort((a, b) => a[1] - b[1])) {
    if (!byCategory.has(cat)) byCategory.set(cat, href);
  }
  return [...byCategory.values()].slice(0, 4);
}

export interface SiteFeatures {
  https: boolean;
  hasBooking: boolean;
  hasForm: boolean;
  hasAnalytics: boolean;
  hasSchema: boolean;
  mobileViewport: boolean;
  copyrightYear: number | null;
  platform: string | null;
}

/** Technické a obchodné vlastnosti webu z HTML (bez AI) — porovnateľné medzi firmami. */
export function siteFeatures(html: string, url: string): SiteFeatures {
  const lower = html.toLowerCase();
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,25}((?:19|20)\d{2})/gi)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1995 && y <= new Date().getFullYear() + 1);
  const platform =
    /wp-content|wp-includes/.test(lower)
      ? "WordPress"
      : /wixstatic|wix\.com/.test(lower)
        ? "Wix"
        : /webnode/.test(lower)
          ? "Webnode"
          : /shoptet/.test(lower)
            ? "Shoptet"
            : /joomla/.test(lower)
              ? "Joomla"
              : /squarespace/.test(lower)
                ? "Squarespace"
                : /webflow/.test(lower)
                  ? "Webflow"
                  : /_next\/static|__next/.test(lower)
                    ? "Next.js"
                    : null;
  return {
    https: url.startsWith("https://"),
    hasBooking:
      /(calendly|reservio|bookio|reservanto|noona|simplybook|bookla|superbook|setmore|timify|medicalc|reservanto|reserv\.|rezerva[čc]n|objedna[ťt]\s+sa|online\s+rezerv|vyberte?\s+term[ií]n|zvo[ľl]te?\s+term[ií]n|href=["'][^"']*(objedn|rezervac|booking|termin)[^"']*["'])/i.test(
        lower,
      ),
    hasForm: /<form[\s>]/i.test(html),
    hasAnalytics:
      /(gtag\(|google-analytics\.com|googletagmanager\.com|fbevents|connect\.facebook\.net|_paq|plausible|matomo)/i.test(lower),
    hasSchema: /application\/ld\+json|schema\.org/i.test(lower),
    mobileViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    copyrightYear: years.length ? Math.max(...years) : null,
    platform,
  };
}
