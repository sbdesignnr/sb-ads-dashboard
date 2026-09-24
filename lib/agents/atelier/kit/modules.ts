// Ateliér kit: moduly stránky (hero, služby, register, galéria, kroky, recenzia, čísla, o nás,
// tím, ticker, FAQ, výzva, kontakt, pätička) a zloženie celého HTML dokumentu z JSON špecifikácie.
// Model volí a vypĺňa moduly (obsah + téma); rozloženie je vždy ručne odladené v CSS.
import { art, pickArt } from "./art";
import { BASE_CSS, MODULE_CSS } from "./css";
import { normalizeTheme, type Theme } from "./theme";

export interface Cta {
  label: string;
  href?: string;
}
export interface Fact {
  value: string;
  label: string;
}

export type Section =
  | { module: "hero"; variant?: "poster" | "split" | "fullbleed" | "statement"; eyebrow?: string; title: string; titleAccent?: string; sub?: string; primary?: Cta; secondary?: Cta; img?: number | null; facts?: Fact[]; meta?: { label?: string; lines: string[] }; stripLabels?: string[]; stamp?: { center?: string; ring: string } }
  | { module: "index"; eyebrow?: string; title: string; intro?: string; items: { title: string; text?: string; tag?: string }[] }
  | { module: "register"; eyebrow?: string; title: string; rows: { title: string; place?: string; value?: string; unit?: string; go?: string; img?: number | null }[]; footLabel?: string }
  | { module: "gallery"; eyebrow?: string; title: string; items: { title: string; caption?: string; img?: number | null }[] }
  | { module: "steps"; eyebrow?: string; title: string; steps: { title: string; text?: string }[] }
  | { module: "quote"; eyebrow?: string; quote: string; author?: string; rating?: { value: string; label: string } }
  | { module: "stats"; items: Fact[] }
  | { module: "about"; eyebrow?: string; title: string; paragraphs: string[]; pull?: string; img?: number | null }
  | { module: "team"; eyebrow?: string; title: string; people: { name: string; role?: string; phone?: string; email?: string }[] }
  | { module: "ticker"; items: string[] }
  | { module: "faq"; eyebrow?: string; title: string; items: { q: string; a: string }[] }
  | { module: "cta"; title: string; sub?: string; button: Cta }
  | { module: "contact"; eyebrow?: string; title: string; details: { label: string; value: string; href?: string }[]; form?: { title: string; fields: string[]; submit: string } };

export interface PageSpec {
  theme?: Partial<Theme>;
  lang?: string;
  title?: string;
  description?: string;
  header?: { logoText: string; logoImg?: string | null; nav: Cta[]; cta?: Cta };
  sections: Section[];
  footer?: { mark: string; lines?: string[]; links?: Cta[] };
}

export interface KitAssets {
  /** URL fotiek v poradí (indexy v špecifikácii sú 1-based) */
  images: string[];
  logo?: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const cut = (s: unknown, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};
const safeHref = (h?: string) => (h && /^(https?:|mailto:|tel:|#|\/)/i.test(h) ? h : "#");

type Ctx = { theme: Theme; assets: KitAssets; artSeed: number };

const imgUrl = (c: Ctx, i?: number | null) => (i && i >= 1 && i <= c.assets.images.length ? c.assets.images[i - 1] : null);

/** Fotka (ak existuje), inak vektorová grafika. `cls` = trieda obalu. */
function media(c: Ctx, i: number | null | undefined, alt: string, cls = ""): string {
  const u = imgUrl(c, i);
  // grafika je vždy pod fotkou: keď sa fotka nenačíta, ostane pekná plocha, nie prázdno
  const under = art(pickArt(c.artSeed++), c.artSeed, c.theme.palette);
  const inner = u
    ? `${under}<img src="${esc(u)}" alt="${esc(alt)}" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
    : under;
  return `<div class="img ${cls}">${inner}</div>`;
}

const weakRating = (v: string, label = "") => {
  // hodnotenie pod 4,3 z Google nikdy nezvýrazňujeme (kontraproduktívne)
  const n = parseFloat(String(v).replace(",", "."));
  return /google|recenz|hodnoten/i.test(label + " " + v) && n > 0 && n <= 5 && n < 4.3;
};
const goodFacts = (f?: Fact[]) => (f ?? []).filter((x) => x.value && String(x.value).length <= 10 && !weakRating(x.value, x.label));
const facts = (f0?: Fact[]) => {
  const f = goodFacts(f0);
  return f.length
    ? `<div class="facts">${f.slice(0, 4).map((x) => `<div class="reveal"><strong class="num">${esc(cut(x.value, 14))}</strong><span>${esc(cut(x.label, 40))}</span></div>`).join("")}</div>`
    : "";
};

const ctas = (p?: Cta, s?: Cta) =>
  p || s
    ? `<div class="cta">${p ? `<a class="btn btn--primary" href="${safeHref(p.href)}">${esc(cut(p.label, 34))}</a>` : ""}${s ? `<a class="btn btn--ghost" href="${safeHref(s.href)}">${esc(cut(s.label, 34))}</a>` : ""}</div>`
    : "";

function titleHtml(title: string, accent?: string): string {
  const t = esc(cut(title, 90));
  if (!accent) return t;
  const a = esc(accent);
  return t.includes(a) ? t.replace(a, `<em>${a}</em>`) : t;
}

const eyebrow = (s?: string) => (s ? `<p class="eyebrow reveal">${esc(cut(s, 60))}</p>` : "");

function hero(s: Extract<Section, { module: "hero" }>, c: Ctx): string {
  const v = s.variant ?? "poster";
  const title = `<h1 class="display reveal">${titleHtml(s.title, s.titleAccent)}</h1>`;
  const sub = s.sub ? `<p class="lead reveal" data-d="1">${esc(cut(s.sub, 240))}</p>` : "";
  const stampOk = s.stamp?.ring && !weakRating(s.stamp.center ?? "", `${s.stamp.ring} ${s.stamp.center ?? ""}`);
  const stamp = stampOk && s.stamp?.ring
    ? `<div class="stamp reveal" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="ring" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"/></defs><text><textPath href="#ring" startOffset="0" textLength="284" lengthAdjust="spacing">${esc(cut(s.stamp.ring, 30))} · </textPath></text></svg>${s.stamp.center ? `<b>${esc(cut(s.stamp.center, 6))}</b>` : ""}</div>`
    : "";
  const meta = s.meta?.lines?.length
    ? `<aside class="card reveal" data-d="2">${s.meta.label ? `<span class="eyebrow">${esc(cut(s.meta.label, 40))}</span>` : ""}${s.meta.lines.slice(0, 6).map((l) => `<p>${esc(cut(l, 70))}</p>`).join("")}</aside>`
    : "";

  if (v === "split")
    return `<section class="hero hero--split"><div class="wrap hero__grid"><div>${eyebrow(s.eyebrow)}${title}${sub}${ctas(s.primary, s.secondary)}${facts(s.facts)}</div><figure class="hero__media reveal" data-d="2">${media(c, s.img, s.title)}${s.stripLabels?.[0] ? `<span class="tag">${esc(cut(s.stripLabels[0], 28))}</span>` : ""}${stamp}</figure></div></section>`;

  if (v === "fullbleed") {
    const u = imgUrl(c, s.img);
    const bg = u
      ? `<img src="${esc(u)}" alt="" loading="eager" referrerpolicy="no-referrer">`
      : art(pickArt(c.artSeed++), c.artSeed, c.theme.palette);
    return `<section class="hero hero--full"><div class="hero__bg">${bg}</div><div class="wrap hero__in">${eyebrow(s.eyebrow)}${title}${sub}${ctas(s.primary, s.secondary)}${facts(s.facts)}</div></section>`;
  }

  if (v === "statement")
    return `<section class="hero hero--statement"><div class="wrap hero__grid"><div>${eyebrow(s.eyebrow)}${title}${sub}${ctas(s.primary, s.secondary)}${facts(s.facts)}</div>${meta ? `<div>${meta}</div>` : media(c, s.img, s.title)}</div></section>`;

  // poster
  return `<section class="hero hero--poster"><div class="wrap"><div class="hero__top">${eyebrow(s.eyebrow)}${s.stripLabels?.[1] ? `<span class="eyebrow">${esc(cut(s.stripLabels[1], 40))}</span>` : ""}</div>${title}<div class="hero__row"><div>${sub}${ctas(s.primary, s.secondary)}</div>${meta}</div>${facts(s.facts)}<figure class="hero__strip reveal" style="position:relative">${stamp}${media(c, s.img, s.title).replace('class="img "', 'class="img" style="position:absolute;inset:0"')}${s.stripLabels?.[0] ? `<span class="mark">${esc(cut(s.stripLabels[0], 32))}</span>` : ""}</figure></div></section>`;
}

const pad = (n: number) => String(n + 1).padStart(2, "0");

function indexMod(s: Extract<Section, { module: "index" }>): string {
  return `<section class="index"><div class="wrap index__grid"><div class="index__head">${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 70))}</h2>${s.intro ? `<p class="reveal" data-d="1">${esc(cut(s.intro, 220))}</p>` : ""}</div><div class="index__list">${s.items.slice(0, 7).map((it, i) => `<article class="index__row reveal"><span class="index__n">${pad(i)}</span><div><h3 class="display">${esc(cut(it.title, 56))}</h3>${it.text ? `<p>${esc(cut(it.text, 200))}</p>` : ""}</div>${it.tag ? `<span class="tag">${esc(cut(it.tag, 22))}</span>` : ""}</article>`).join("")}</div></div></section>`;
}

function register(s: Extract<Section, { module: "register" }>, c: Ctx): string {
  const rows = s.rows.slice(0, 8);
  const anyThumb = rows.some((r) => imgUrl(c, r.img));
  return `<section class="reg"><div class="wrap"><div class="reg__head"><div>${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 60))}</h2></div></div><div class="reg__list">${rows.map((r, i) => `<a class="reg__row reveal" href="#kontakt"><div class="reg__thumb">${anyThumb ? media(c, r.img, r.title) : `<span class="index__n">${pad(i)}</span>`}</div><div class="reg__main"><div class="reg__title">${esc(cut(r.title, 70))}</div>${r.place ? `<div class="reg__place">${esc(cut(r.place, 70))}</div>` : ""}</div><div class="reg__valw">${r.value && !/^[\s–—-]*$/.test(r.value) ? `<div class="reg__val num">${esc(cut(r.value, 12))}${r.unit ? `<small>${esc(cut(r.unit, 8))}</small>` : ""}</div>` : ""}</div><span class="reg__go">${esc(cut(r.go ?? "Zistiť viac", 26))}</span></a>`).join("")}</div>${s.footLabel ? `<p class="reg__foot reveal"><a class="btn btn--ghost" href="#kontakt">${esc(cut(s.footLabel, 34))}</a></p>` : ""}</div></section>`;
}

function gallery(s: Extract<Section, { module: "gallery" }>, c: Ctx): string {
  return `<section class="gal"><div class="wrap"><div class="gal__head">${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 60))}</h2></div><div class="gal__grid">${s.items.slice(0, 7).map((it) => `<figure class="gal__it reveal">${media(c, it.img, it.title)}<figcaption>${esc(cut(it.title, 50))}${it.caption ? `<span>${esc(cut(it.caption, 40))}</span>` : ""}</figcaption></figure>`).join("")}</div></div></section>`;
}

function steps(s: Extract<Section, { module: "steps" }>): string {
  return `<section class="steps"><div class="wrap"><div class="steps__head">${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 70))}</h2></div><ol class="steps__list">${s.steps.slice(0, 5).map((st, i) => `<li class="steps__it reveal" data-d="${Math.min(i, 3)}"><h3 class="display">${esc(cut(st.title, 40))}</h3>${st.text ? `<p>${esc(cut(st.text, 150))}</p>` : ""}</li>`).join("")}</ol></div></section>`;
}

function quote(s: Extract<Section, { module: "quote" }>): string {
  const rate = s.rating && parseFloat(String(s.rating.value).replace(",", ".")) >= 4.3 ? s.rating : undefined;
  return `<section class="q"><div class="wrap q__grid">${rate ? `<div class="q__rate reveal"><strong class="num">${esc(cut(rate.value, 5))}</strong><span class="eyebrow">${esc(cut(rate.label, 50))}</span></div>` : `<div class="q__rate reveal">${eyebrow(s.eyebrow ?? "Čo o nás hovoria")}</div>`}<blockquote class="reveal" data-d="1"><p>${esc(cut(s.quote, 240))}</p>${s.author ? `<footer class="eyebrow">${esc(cut(s.author, 60))}</footer>` : ""}</blockquote></div></section>`;
}

const stats = (s: Extract<Section, { module: "stats" }>) =>
  `<section class="stats"><div class="wrap stats__grid">${s.items.slice(0, 4).map((x) => `<div class="stats__it reveal"><strong class="num">${esc(cut(x.value, 12))}</strong><span>${esc(cut(x.label, 44))}</span></div>`).join("")}</div></section>`;

function about(s: Extract<Section, { module: "about" }>, c: Ctx): string {
  return `<section class="about"><div class="wrap about__grid"><div>${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 70))}</h2>${s.pull ? `<p class="about__pull reveal" data-d="1">${esc(cut(s.pull, 200))}</p>` : ""}</div><div class="about__body">${s.paragraphs.slice(0, 3).map((p) => `<p class="reveal">${esc(cut(p, 420))}</p>`).join("")}${s.img ? `<div class="reveal">${media(c, s.img, s.title)}</div>` : ""}</div></div></section>`;
}

const team = (s: Extract<Section, { module: "team" }>) =>
  `<section class="team"><div class="wrap">${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 60))}</h2><div class="team__list">${s.people.slice(0, 6).map((p) => `<div class="team__row reveal"><h3 class="display">${esc(cut(p.name, 40))}</h3><span class="role">${esc(cut(p.role ?? "", 60))}</span><div>${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ""))}">${esc(p.phone)}</a>` : ""}${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}</div></div>`).join("")}</div></div></section>`;

const ticker = (s: Extract<Section, { module: "ticker" }>) => {
  const items = s.items.slice(0, 8).map((i) => `<span>${esc(cut(i, 30))}</span>`).join("");
  return `<section class="ticker" aria-hidden="true"><div class="ticker__t">${items}${items}</div></section>`;
};

const faq = (s: Extract<Section, { module: "faq" }>) =>
  `<section class="faq"><div class="wrap">${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 60))}</h2><div class="faq__list">${s.items.slice(0, 6).map((i, n) => `<details${n === 0 ? " open" : ""} class="reveal"><summary>${esc(cut(i.q, 100))}</summary><p>${esc(cut(i.a, 320))}</p></details>`).join("")}</div></div></section>`;

const ctaBand = (s: Extract<Section, { module: "cta" }>) =>
  `<section class="cta-band"><div class="wrap"><div><h2 class="display reveal">${esc(cut(s.title, 70))}</h2>${s.sub ? `<p class="lead reveal" data-d="1">${esc(cut(s.sub, 200))}</p>` : ""}</div><a class="btn reveal" data-d="2" href="${safeHref(s.button.href)}">${esc(cut(s.button.label, 32))}</a></div></section>`;

function contact(s: Extract<Section, { module: "contact" }>): string {
  const form = s.form
    ? `<form class="form reveal" data-d="1" onsubmit="return false"><h3 class="display">${esc(cut(s.form.title, 50))}</h3>${s.form.fields.slice(0, 5).map((f) => (/správ|správ|message|poznám|text/i.test(f) ? `<label>${esc(cut(f, 30))}<textarea rows="3"></textarea></label>` : `<label>${esc(cut(f, 30))}<input type="text"></label>`)).join("")}<button class="btn btn--primary" type="submit">${esc(cut(s.form.submit, 30))}</button></form>`
    : "";
  return `<section class="contact" id="kontakt"><div class="wrap contact__grid"><div>${eyebrow(s.eyebrow)}<h2 class="display reveal">${esc(cut(s.title, 60))}</h2><dl class="reveal" data-d="1">${s.details.slice(0, 6).map((d) => `<div><dt>${esc(cut(d.label, 20))}</dt><dd>${d.href ? `<a href="${safeHref(d.href)}">${esc(cut(d.value, 70))}</a>` : esc(cut(d.value, 90))}</dd></div>`).join("")}</dl></div>${form}</div></section>`;
}

/** Overí a orežie špecifikáciu od modelu: neznáme moduly preč, dĺžky, poradie, indexy fotiek. */
export function sanitizeSpec(spec: PageSpec, imageCount: number): { spec: PageSpec; warnings: string[] } {
  const warnings: string[] = [];
  const known = new Set(["hero", "index", "register", "gallery", "steps", "quote", "stats", "about", "team", "ticker", "faq", "cta", "contact"]);
  let sections = (Array.isArray(spec.sections) ? spec.sections : []).filter((s) => s && known.has((s as { module: string }).module));
  if (sections.length !== (spec.sections ?? []).length) warnings.push("Neznáme moduly boli vynechané.");
  const heroIdx = sections.findIndex((s) => s.module === "hero");
  if (heroIdx > 0) {
    const [h] = sections.splice(heroIdx, 1);
    sections.unshift(h);
    warnings.push("Hero presunuté na začiatok.");
  }
  if (heroIdx < 0) warnings.push("Chýba hero.");
  // kontakt vždy na konci (pred prípadnou výzvou)
  sections = sections.slice(0, 10);
  const fixImg = (i: unknown) => (typeof i === "number" && i >= 1 && i <= imageCount ? i : null);
  for (const s of sections as Section[]) {
    const a = s as unknown as { img?: unknown; rows?: { img?: unknown }[]; items?: { img?: unknown }[] };
    if ("img" in a) a.img = fixImg(a.img);
    if (Array.isArray(a.rows)) for (const r of a.rows) r.img = fixImg(r.img);
    if (s.module === "gallery") for (const r of s.items) r.img = fixImg(r.img);
  }
  return { spec: { ...spec, sections }, warnings };
}

const NAV_ANCHOR = "#kontakt";

/** Zloží kompletný HTML dokument. */
export function renderPage(input: PageSpec, assets: KitAssets): string {
  const theme = normalizeTheme(input.theme);
  const { spec } = sanitizeSpec(input, assets.images.length);
  const c: Ctx = { theme, assets, artSeed: 3 };
  const p = theme.palette;
  const r = theme.radius === "pill" ? "999px" : theme.radius === "soft" ? "14px" : "0px";
  const rt = theme.radius === "sharp" ? "0px" : "999px";
  const gutter = theme.density === "tight" ? "clamp(16px,3vw,40px)" : "clamp(20px,4vw,64px)";

  const vars = `--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--accent2:${p.accent2};--accent-ink:${p.accentInk};--font-d:'${theme.fonts.display}';--font-b:'${theme.fonts.body}';--dw:${theme.fonts.displayWeight};--dt:${theme.fonts.displayTracking}em;--dc:${theme.fonts.displayCase === "upper" ? "uppercase" : "none"};--r:${r};--r-tag:${rt};--maxw:1360px;--gutter:${gutter}`;

  const h = spec.header;
  const header = h
    ? `<header class="hd"><div class="wrap hd__in"><a class="hd__logo" href="#">${assets.logo && h.logoImg !== null ? `<img src="${esc(assets.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span>${esc(cut(h.logoText, 28))}</span></a><nav>${h.nav.slice(0, 6).map((n) => `<a href="${safeHref(n.href ?? NAV_ANCHOR)}">${esc(cut(n.label, 22))}</a>`).join("")}</nav>${h.cta ? `<a class="btn btn--primary" href="${safeHref(h.cta.href ?? NAV_ANCHOR)}">${esc(cut(h.cta.label, 24))}</a>` : ""}</div></header>`
    : "";

  const body = spec.sections
    .map((s) => {
      switch (s.module) {
        case "hero": return hero(s, c);
        case "index": return indexMod(s);
        case "register": return register(s, c);
        case "gallery": return gallery(s, c);
        case "steps": return steps(s);
        case "quote": return quote(s);
        case "stats": return stats(s);
        case "about": return about(s, c);
        case "team": return team(s);
        case "ticker": return ticker(s);
        case "faq": return faq(s);
        case "cta": return ctaBand(s);
        case "contact": return contact(s);
      }
    })
    .join("\n");

  const f = spec.footer;
  const footer = f
    ? `<footer class="ft"><div class="wrap"><div class="ft__mark">${esc(cut(f.mark, 26))}</div><div class="ft__cols"><div>${(f.lines ?? []).slice(0, 4).map((l) => `<div>${esc(cut(l, 60))}</div>`).join("")}</div><div>${(f.links ?? []).slice(0, 4).map((l) => `<div><a href="${safeHref(l.href)}">${esc(cut(l.label, 30))}</a></div>`).join("")}</div></div><p class="ft__credit">Návrh pripravil SB Design · ukážka, nie finálny web</p></div></footer>`
    : "";

  const script = `<script>document.documentElement.classList.add('js');(function(){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)})})();</script>`;

  return `<!doctype html>
<html lang="${esc(spec.lang ?? "sk")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(spec.title ?? h?.logoText ?? "Návrh")}</title>
<meta name="description" content="${esc(spec.description ?? "")}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${esc(theme.fonts.href)}" rel="stylesheet">
<style>:root{${vars}}${BASE_CSS}${MODULE_CSS}</style>
</head>
<body data-texture="${theme.texture}" data-img="${theme.imageTreatment}">
${header}
<main>
${body}
</main>
${footer}
${script}
</body>
</html>`;
}
