/**
 * Minimal, dependency-free crawler for our own site. Reads sitemap.xml (the
 * canonical list of what we *want* indexed), then fetches each page and extracts
 * the on-page signals the SEO checks reason over.
 *
 * Deliberately regex-based (same approach as lib/leads/website-analyzer.ts) —
 * no parser dependency, and we only ever crawl our own, well-formed pages.
 */

const UA = "Mozilla/5.0 (compatible; SBDesignSeoBot/1.0; +https://sbdesign.sk)";

export interface CrawledPage {
  url: string;
  status: number;
  ok: boolean;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1: string[];
  h2: string[];
  wordCount: number;
  jsonLdTypes: string[];
  images: { src: string; alt: string | null }[];
  internalLinks: string[];
  externalLinks: string[];
  htmlBytes: number;
}

export interface CrawlResult {
  origin: string;
  robotsTxt: { found: boolean; disallowsAll: boolean; sitemapUrls: string[] };
  sitemap: { found: boolean; urlCount: number; urls: string[] };
  pages: CrawledPage[];
}

async function get(url: string, timeoutMs = 15000): Promise<{ status: number; text: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, text: (await res.text()).slice(0, 800_000) };
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag);
  return m ? m[1].trim() : null;
}

function metaContent(html: string, nameOrProp: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  return tag ? attr(tag, "content") : null;
}

function headings(html: string, level: 1 | 2): string[] {
  return [...html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "gi"))].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdTypes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const collect = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (node && typeof node === "object") {
          const o = node as Record<string, unknown>;
          if (typeof o["@type"] === "string") out.push(o["@type"] as string);
          if (Array.isArray(o["@type"])) out.push(...(o["@type"] as string[]));
          Object.values(o).forEach(collect);
        }
      };
      collect(JSON.parse(m[1].trim()));
    } catch {
      /* malformed block — the checks will flag the missing type anyway */
    }
  }
  return [...new Set(out)];
}

function extractPage(url: string, status: number, html: string): CrawledPage {
  const origin = new URL(url).origin;
  const canonicalTag = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0] ?? null;

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({
    src: attr(m[0], "src") ?? "",
    alt: attr(m[0], "alt"),
  }));

  const internal: string[] = [];
  const external: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) {
    const href = m[1];
    if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const abs = new URL(href, url);
      if (abs.origin === origin) internal.push(abs.toString().replace(/\/$/, ""));
      else if (abs.protocol.startsWith("http")) external.push(abs.toString());
    } catch {
      /* skip */
    }
  }

  return {
    url,
    status,
    ok: status >= 200 && status < 300,
    title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null,
    metaDescription: metaContent(html, "description"),
    canonical: canonicalTag ? attr(canonicalTag, "href") : null,
    robotsMeta: metaContent(html, "robots"),
    h1: headings(html, 1),
    h2: headings(html, 2),
    wordCount: textOf(html).split(/\s+/).filter(Boolean).length,
    jsonLdTypes: jsonLdTypes(html),
    images,
    internalLinks: [...new Set(internal)],
    externalLinks: [...new Set(external)],
    htmlBytes: Buffer.byteLength(html, "utf8"),
  };
}

function parseSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** Crawl our own site: robots.txt → sitemap.xml → up to `maxPages` pages. */
export async function crawlSite(origin: string, maxPages = 40): Promise<CrawlResult> {
  const base = origin.replace(/\/$/, "");

  const robotsRes = await get(`${base}/robots.txt`);
  const robotsBody = robotsRes?.status === 200 ? robotsRes.text : "";
  const robots = {
    found: robotsRes?.status === 200,
    // "Disallow: /" under a wildcard agent blocks the whole site.
    disallowsAll: /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(robotsBody),
    sitemapUrls: [...robotsBody.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]),
  };

  // Prefer a sitemap declared in robots.txt, else the conventional location.
  const sitemapUrl = robots.sitemapUrls[0] ?? `${base}/sitemap.xml`;
  const smRes = await get(sitemapUrl);
  let urls: string[] = [];
  if (smRes?.status === 200) {
    urls = parseSitemap(smRes.text);
    // Sitemap index → expand one level.
    if (/<sitemapindex/i.test(smRes.text)) {
      const children = urls.slice(0, 5);
      urls = [];
      for (const c of children) {
        const child = await get(c);
        if (child?.status === 200) urls.push(...parseSitemap(child.text));
      }
    }
  }
  const sitemap = { found: Boolean(smRes && smRes.status === 200), urlCount: urls.length, urls };

  const targets = urls.length ? urls.slice(0, maxPages) : [base];
  const pages: CrawledPage[] = [];
  for (const u of targets) {
    const r = await get(u);
    if (!r) continue;
    pages.push(extractPage(u, r.status, r.text));
  }

  return { origin: base, robotsTxt: robots, sitemap, pages };
}
