import * as cheerio from "cheerio";
import { SERVICE_KEYWORDS, TECH_SIGNATURES } from "./constants";
import type { BlogPost, ScrapedData } from "./types";

const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SBDesignCompetitorBot/1.0; +https://sbdesign.sk)";

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));

function emptyResult(url: string, error?: string): ScrapedData {
  return {
    url,
    ok: !error,
    title: "",
    metaDescription: "",
    headings: { h1: [], h2: [], h3: [] },
    services: [],
    pricing: [],
    blogPosts: [],
    contact: { emails: [], phones: [] },
    techStack: [],
    rawContent: "",
    error,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchHtml(url: string): Promise<{ html: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "sk,en;q=0.8",
      },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    return { html };
  } catch (err) {
    const e = err as Error;
    return { error: e.name === "AbortError" ? "Časový limit (10s) vypršal" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function extractHeadings($: cheerio.CheerioAPI, sel: string, limit: number): string[] {
  const out: string[] = [];
  $(sel).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length <= 120) out.push(t);
  });
  return uniq(out).slice(0, limit);
}

function detectServices(haystack: string): string[] {
  const lower = haystack.toLowerCase();
  const found: string[] = [];
  for (const { match, tag } of SERVICE_KEYWORDS) {
    if (match.some((m) => lower.includes(m))) found.push(tag);
  }
  return uniq(found);
}

function detectTech(html: string): string[] {
  const lower = html.toLowerCase();
  const found: string[] = [];
  for (const { match, tag } of TECH_SIGNATURES) {
    if (match.some((m) => lower.includes(m))) found.push(tag);
  }
  return uniq(found);
}

function detectPricing(text: string): string[] {
  const out: string[] = [];
  // "od 1500 €", "1 500 €", "od 150 €/mes", "2 200€"
  const regex = /(?:od\s*)?\d[\d\s.,]{1,7}\s?(?:€|eur)(?:\s?\/\s?(?:mes|mesiac|hod|rok))?/gi;
  const matches = text.match(regex) ?? [];
  for (const m of matches) {
    const cleaned = m.replace(/\s+/g, " ").trim();
    out.push(cleaned);
  }
  return uniq(out).slice(0, 10);
}

function detectContact(text: string): { emails: string[]; phones: string[] } {
  const emails = uniq(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).slice(0, 5);
  const phones = uniq(
    (text.match(/(?:\+421|00421|0)\s?\d(?:[\s./-]?\d){7,9}/g) ?? []).map((p) => p.trim()),
  ).slice(0, 5);
  return { emails, phones };
}

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const result = await fetchHtml(url);
  if ("error" in result) return emptyResult(url, result.error);

  try {
    const $ = cheerio.load(result.html);
    $("script, style, noscript, svg").remove();

    const title =
      $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      "";
    const metaDescription =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";

    const headings = {
      h1: extractHeadings($, "h1", 6),
      h2: extractHeadings($, "h2", 20),
      h3: extractHeadings($, "h3", 30),
    };

    const navText = $("nav, header").text();
    const listText = $("li, .service, .sluzby, [class*='service']").text();
    const serviceHaystack = [
      headings.h1.join(" "),
      headings.h2.join(" "),
      headings.h3.join(" "),
      navText,
      listText,
      metaDescription,
    ].join(" ");

    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    const generator = $('meta[name="generator"]').attr("content");
    const techStack = uniq([
      ...(generator ? [generator.split(" ")[0]] : []),
      ...detectTech(result.html),
    ]);

    return {
      url,
      ok: true,
      title,
      metaDescription,
      headings,
      services: detectServices(serviceHaystack),
      pricing: detectPricing(bodyText),
      blogPosts: [],
      contact: detectContact(bodyText),
      techStack,
      rawContent: bodyText.slice(0, 6000),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return emptyResult(url, `Chyba pri parsovaní: ${(err as Error).message}`);
  }
}

const BLOG_PATHS = ["/blog", "/blog/", "/clanky", "/clanky/", "/novinky", "/aktuality", "/magazin"];
const DATE_REGEX = /\b(\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{4}-\d{2}-\d{2})\b/;

export async function scrapeBlogPosts(baseUrl: string): Promise<BlogPost[]> {
  const origin = baseUrl.replace(/\/$/, "");
  for (const path of BLOG_PATHS) {
    const result = await fetchHtml(origin + path);
    if ("error" in result) continue;

    try {
      const $ = cheerio.load(result.html);
      const posts: BlogPost[] = [];

      const candidates = $(
        "article, .post, .blog-post, .article, .blog__item, .news-item, [class*='post'], [class*='clanok']",
      );

      candidates.each((_, el) => {
        if (posts.length >= 10) return;
        const node = $(el);
        const titleEl = node.find("h1, h2, h3, .title, a").first();
        const title = titleEl.text().replace(/\s+/g, " ").trim();
        if (!title || title.length < 6 || title.length > 160) return;
        const dateAttr = node.find("time").attr("datetime");
        const dateText = node.find("time").text().trim() || node.text().match(DATE_REGEX)?.[0];
        const href = node.find("a").attr("href");
        posts.push({
          title,
          date: dateAttr || dateText || undefined,
          url: href ? new URL(href, origin).href : undefined,
        });
      });

      // Fallback: heading links if no structured posts found.
      if (posts.length === 0) {
        $("h2 a, h3 a").each((_, el) => {
          if (posts.length >= 10) return;
          const t = $(el).text().replace(/\s+/g, " ").trim();
          if (t && t.length >= 6 && t.length <= 160) {
            posts.push({ title: t, url: $(el).attr("href") });
          }
        });
      }

      const seen = new Set<string>();
      const deduped = posts.filter((p) => {
        if (seen.has(p.title)) return false;
        seen.add(p.title);
        return true;
      });

      if (deduped.length > 0) return deduped.slice(0, 10);
    } catch {
      // try next path
    }
  }
  return [];
}
