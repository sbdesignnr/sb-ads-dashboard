// Ateliér kit: pomocné funkcie pre vykresľovanie modulov.
import { art, pickArt } from "./art";
import type { Cta, Ctx, Fact } from "./types";

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const cut = (s: unknown, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

export const safeHref = (h?: string) => (h && /^(https?:|mailto:|tel:|#|\/)/i.test(h) ? h : "#");

export const imgUrl = (c: Ctx, i?: number | null) =>
  i && i >= 1 && i <= c.assets.images.length ? c.assets.images[i - 1] : null;

/** Fotka (ak existuje), inak vektorová grafika. Grafika je vždy pod fotkou (záloha, keď sa fotka nenačíta). */
export function media(c: Ctx, i: number | null | undefined, alt: string, cls = "", extra = ""): string {
  const u = imgUrl(c, i);
  const under = art(pickArt(c.artSeed++), c.artSeed, c.theme.palette);
  const inner = u
    ? `${under}<img src="${esc(u)}" alt="${esc(alt)}" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
    : under;
  return `<div class="img ${cls}" ${extra}>${inner}</div>`;
}

const weakRating = (v: string, label = "") => {
  // hodnotenie pod 4,3 z Google nikdy nezvýrazňujeme (kontraproduktívne)
  const n = parseFloat(String(v).replace(",", "."));
  return /google|recenz|hodnoten/i.test(label + " " + v) && n > 0 && n <= 5 && n < 4.3;
};
export { weakRating };

const goodFacts = (f?: Fact[]) => (f ?? []).filter((x) => x.value && String(x.value).length <= 10 && !weakRating(x.value, x.label));

export const facts = (f0?: Fact[]) => {
  const f = goodFacts(f0);
  return f.length
    ? `<div class="facts">${f.slice(0, 4).map((x) => `<div class="reveal"><strong class="num" data-count>${esc(cut(x.value, 14))}</strong><span>${esc(cut(x.label, 40))}</span></div>`).join("")}</div>`
    : "";
};

export const ctas = (p?: Cta, s?: Cta) =>
  p || s
    ? `<div class="cta">${p ? `<a class="btn btn--primary" href="${safeHref(p.href)}">${esc(cut(p.label, 34))}</a>` : ""}${s ? `<a class="btn btn--ghost" href="${safeHref(s.href)}">${esc(cut(s.label, 34))}</a>` : ""}</div>`
    : "";

export function titleHtml(title: string, accent?: string): string {
  const t = esc(cut(title, 90));
  if (!accent) return t;
  const a = esc(accent);
  return t.includes(a) ? t.replace(a, `<em>${a}</em>`) : t;
}

export const eyebrow = (s?: string) => (s ? `<p class="eyebrow reveal">${esc(cut(s, 60))}</p>` : "");

export const pad = (n: number) => String(n + 1).padStart(2, "0");
