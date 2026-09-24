// Ateliér, krok 1: zber reálnych podkladov z webu firmy (logo, fotky, farby značky, texty, kontakty).
// Návrh nového webu sa robí z ICH vlastného obsahu, nie z vymyslených vecí.
import * as cheerio from "cheerio";
import sharp from "sharp";
import { fetchHtml, isPublicHttpUrl } from "../../leads/research/web";

export interface HarvestedImage {
  url: string;
  w: number;
  h: number;
  alt: string;
  bytes: number;
  /** foto = skutočná fotografia; logo = logo/odznak/ilustrácia (nepoužíva sa ako fotka) */
  kind: "foto" | "logo";
}

export interface SiteAssets {
  url: string;
  origin: string;
  title: string;
  description: string;
  lang: string;
  logo: string | null;
  ogImage: string | null;
  images: HarvestedImage[];
  /** loga a odznaky nájdené na webe (nie fotky) */
  logos: HarvestedImage[];
  /** farby značky zoradené podľa výskytu (hex), bez šedých */
  colors: string[];
  themeColor: string | null;
  fonts: string[];
  nav: string[];
  headings: string[];
  paragraphs: string[];
  contact: { phones: string[]; emails: string[]; address: string | null };
  social: string[];
}

const UA = "Mozilla/5.0 (compatible; SBDesignBot/1.0)";
const SKIP_IMG = /sprite|icon|favicon|pixel|spacer|blank|loading|loader|arrow|bullet|button|1x1|tracking|emoji|flag|logo-?small|captcha|badge/i;

const abs = (base: string, href: string | undefined | null): string | null => {
  if (!href) return null;
  const h = href.trim().split(/\s+/)[0];
  if (!h || h.startsWith("data:") || h.startsWith("javascript:")) return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
};

const isGrayish = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min < 28 || max < 40 || min > 225;
};

const norm3 = (h: string) => (h.length === 4 ? "#" + h.slice(1).split("").map((c) => c + c).join("") : h).toLowerCase();

async function fetchText(url: string, ms = 8000, max = 300_000): Promise<string> {
  try {
    if (!isPublicHttpUrl(url)) return "";
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return "";
    return (await r.text()).slice(0, max);
  } catch {
    return "";
  }
}

async function probeImage(url: string, referer: string): Promise<HarvestedImage | null> {
  try {
    if (!isPublicHttpUrl(url)) return null;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "image/*" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 4000 || buf.length > 6_000_000) return null;
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    // logo/odznak: priehľadné pozadie alebo takmer štvorec menší než fotka
    const logoLike = Boolean(meta.hasAlpha) || (meta.width <= 900 && Math.abs(meta.width / meta.height - 1) < 0.22);
    return { url, w: meta.width, h: meta.height, alt: "", bytes: buf.length, kind: logoLike ? "logo" : "foto" };
  } catch {
    return null;
  }
}

/** Dominantné sýte farby z obrázka (logo/hero) — hrubé 4-bitové vederká. */
async function paletteOf(url: string, referer: string): Promise<string[]> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: referer }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const { data } = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(48, 48, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i + 2 < data.length; i += 3) {
      const key = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
      const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      b.n++;
      b.r += data[i];
      b.g += data[i + 1];
      b.b += data[i + 2];
      buckets.set(key, b);
    }
    return [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .map((b) => "#" + [b.r, b.g, b.b].map((v) => Math.round(v / b.n).toString(16).padStart(2, "0")).join(""))
      .filter((h) => !isGrayish(h))
      .slice(0, 3);
  } catch {
    return [];
  }
}

export async function harvestSite(url: string): Promise<SiteAssets | null> {
  const page = await fetchHtml(url, 12000);
  if (!page) return null;
  const base = page.finalUrl;
  const $ = cheerio.load(page.html);
  const origin = new URL(base).origin;

  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const themeColor = $('meta[name="theme-color"]').attr("content")?.trim() ?? null;
  const ogImage = abs(base, $('meta[property="og:image"]').attr("content"));

  // logo
  let logo: string | null = null;
  const logoImg = $("header img, .logo img, #logo img, a[class*=logo] img, img[class*=logo], img[id*=logo], img[alt*=logo i], img[src*=logo i]").first();
  if (logoImg.length) logo = abs(base, logoImg.attr("src") || logoImg.attr("data-src"));
  if (!logo) logo = abs(base, $('link[rel="apple-touch-icon"]').attr("href") || $('link[rel~="icon"]').attr("href"));

  // kandidáti na fotky
  const cand = new Map<string, string>();
  const addImg = (u: string | null, alt = "") => {
    if (!u || SKIP_IMG.test(u) || /\.(svg|gif|ico)(\?|$)/i.test(u)) return;
    if (!cand.has(u)) cand.set(u, alt);
  };
  addImg(ogImage);
  $("img").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset") || $el.attr("data-srcset");
    let best = $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src");
    if (srcset) {
      const parts = srcset.split(",").map((p) => p.trim().split(/\s+/));
      parts.sort((a, b) => parseInt(b[1] ?? "0") - parseInt(a[1] ?? "0"));
      best = parts[0]?.[0] || best;
    }
    addImg(abs(base, best), $el.attr("alt") ?? "");
  });
  $("[style*='background']").each((_, el) => {
    const m = ($(el).attr("style") ?? "").match(/url\(['"]?([^'")]+)['"]?\)/i);
    if (m) addImg(abs(base, m[1]));
  });
  $("source[srcset]").each((_, el) => addImg(abs(base, $(el).attr("srcset"))));

  const probed = (
    await Promise.all([...cand.entries()].slice(0, 28).map(async ([u, alt]) => {
      const p = await probeImage(u, base);
      return p ? { ...p, alt } : null;
    }))
  )
    .filter((x): x is HarvestedImage => Boolean(x))
    .filter((x) => x.w >= 480 && x.h >= 260)
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const photos = probed.filter((x) => x.kind === "foto").slice(0, 10);
  const logos = probed.filter((x) => x.kind === "logo").slice(0, 3);

  // farby: z CSS (najčastejšie sýte hex) + z loga
  const cssUrls = $('link[rel="stylesheet"]').map((_, el) => abs(base, $(el).attr("href"))).get().filter(Boolean).slice(0, 3) as string[];
  const css = ($("style").text() + (await Promise.all(cssUrls.map((u) => fetchText(u)))).join("\n")).slice(0, 600_000);
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const h = norm3("#" + m[1]);
    if (!isGrayish(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const cssColors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 4);
  const logoColors = logo ? await paletteOf(logo, base) : [];
  const colors = [...new Set([...(themeColor && /^#/.test(themeColor) ? [norm3(themeColor)] : []), ...logoColors, ...cssColors])].slice(0, 5);

  const fonts = [...new Set([...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map((m) => m[1].split(",")[0].replace(/['"]/g, "").trim()).filter((f) => f && !/inherit|sans-serif|serif|monospace|initial/i.test(f)))].slice(0, 4);

  // texty
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  $("script, style, noscript, svg, iframe").remove();
  const nav = [...new Set($("nav a, header a, .menu a").map((_, el) => clean($(el).text())).get().filter((t) => t.length > 1 && t.length < 40))].slice(0, 14);
  const headings = [...new Set($("h1, h2, h3").map((_, el) => clean($(el).text())).get().filter((t) => t.length > 3 && t.length < 140))].slice(0, 24);
  const paragraphs = [...new Set($("main p, article p, section p, .content p, p").map((_, el) => clean($(el).text())).get().filter((t) => t.length > 50 && t.length < 500))].slice(0, 14);

  const text = $("body").text();
  const phones = [...new Set([...(text.match(/(?:\+42[01]\s?)?(?:0\d{3}|\d{3})[\s/-]?\d{3}[\s-]?\d{3}/g) ?? [])].map((p) => clean(p)))].slice(0, 3);
  const emails = [...new Set([...(page.html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])].filter((e) => !/\.(png|jpg|jpeg|gif|webp)$/i.test(e)))].slice(0, 3);
  const addr = clean($("address").first().text()) || null;
  const social = [...new Set($("a[href]").map((_, el) => $(el).attr("href") ?? "").get().filter((h) => /facebook\.com|instagram\.com|linkedin\.com|youtube\.com/i.test(h)))].slice(0, 4);

  return {
    url: base,
    origin,
    title,
    description,
    lang: $("html").attr("lang") ?? "sk",
    logo,
    ogImage,
    images: photos,
    logos,
    colors,
    themeColor,
    fonts,
    nav,
    headings,
    paragraphs,
    contact: { phones, emails, address: addr },
    social,
  };
}
