// Website "outdatedness" analyzer. A HIGHER websiteScore means a more outdated
// site — i.e. a better lead for us. Qualified when websiteScore >= 40.

export interface WebsiteAnalysis {
  websiteScore: number; // 0-100, higher = more outdated
  qualified: boolean; // score >= 40
  pageSpeedMobile: number | null;
  pageSpeedDesktop: number | null;
  hasSsl: boolean;
  isMobileFriendly: boolean; // has meta viewport
  websiteTechnology: string | null;
  websiteAge: number | null; // years since footer copyright
  reasons: string[];
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
    const res = await fetch(`${PAGESPEED_API}?${q.toString()}`, { signal: AbortSignal.timeout(40000) });
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

export async function analyzeWebsite(rawUrl: string): Promise<WebsiteAnalysis> {
  const url = normalizeUrl(rawUrl);
  const [site, psMobile, psDesktop] = await Promise.all([
    loadSite(url),
    pageSpeed(url, "mobile"),
    pageSpeed(url, "desktop"),
  ]);

  const platform = detectPlatform(site.html, site.headers);
  const jqOld = jqueryOld(site.html);
  const isOldTech = platform.isOld || jqOld;
  const hasViewport = site.reachable && /<meta[^>]+name=["']viewport["']/i.test(site.html);
  const cy = copyrightYear(site.html);
  const currentYear = new Date().getFullYear();

  let score = 0;
  const reasons: string[] = [];
  if (psMobile !== null && psMobile < 50) {
    score += 30;
    reasons.push(`Pomalý web na mobile (PageSpeed ${psMobile}/100)`);
  }
  if (isOldTech) {
    score += 20;
    reasons.push(`Zastaraná technológia (${platform.technology ?? (jqOld ? "staré jQuery <3" : "neznáma")})`);
  }
  if (!site.hasSsl) {
    score += 20;
    reasons.push("Chýba SSL certifikát (HTTPS)");
  }
  if (cy && cy < 2022) {
    score += 15;
    reasons.push(`Zastaraný copyright v pätičke (${cy})`);
  }
  if (!hasViewport) {
    score += 15;
    reasons.push("Nie je mobilne responzívny (chýba meta viewport)");
  }
  score = Math.min(100, score);

  return {
    websiteScore: score,
    qualified: score >= 40,
    pageSpeedMobile: psMobile,
    pageSpeedDesktop: psDesktop,
    hasSsl: site.hasSsl,
    isMobileFriendly: hasViewport,
    websiteTechnology: platform.technology ?? (jqOld ? "jQuery <3" : null),
    websiteAge: cy ? Math.max(0, currentYear - cy) : null,
    reasons,
  };
}
