// Ateliér kit: bohatšie moduly a funkcie na mieru podľa odboru (kalkulačka, mapa tela, konfigurátor,
// rezervácia, bento, blueprint, mozaika, obrie písmo, horizontálna galéria) + vlastný "signature" blok.
import { cut, ctas, esc, eyebrow, facts, imgUrl, media, pad, safeHref, titleHtml } from "./util";
import type { Ctx, Section } from "./types";

type S<M extends Section["module"]> = Extract<Section, { module: M }>;

// ── hero varianty ─────────────────────────────────────────────────────────

export function heroGiant(s: S<"hero">, c: Ctx): string {
  const u = imgUrl(c, s.img);
  const meta = s.meta?.lines?.length
    ? `<aside class="card reveal" data-d="2">${s.meta.label ? `<span class="eyebrow">${esc(cut(s.meta.label, 40))}</span>` : ""}${s.meta.lines.slice(0, 6).map((l) => `<p>${esc(cut(l, 70))}</p>`).join("")}</aside>`
    : "";
  return `<section class="hero hero--giant"><div class="spot"></div><div class="wrap"><div class="hero__top">${eyebrow(s.eyebrow)}${s.stripLabels?.[1] ? `<span class="eyebrow">${esc(cut(s.stripLabels[1], 40))}</span>` : ""}</div><h1 class="display giant reveal"${u ? ` style="--em-img:url('${esc(u)}')"` : ""}>${titleHtml(s.title, s.titleAccent)}</h1><div class="hero__row"><div>${s.sub ? `<p class="lead reveal" data-d="1">${esc(cut(s.sub, 240))}</p>` : ""}${ctas(s.primary, s.secondary)}</div>${meta}</div>${facts(s.facts)}</div></section>`;
}

export function heroMosaic(s: S<"hero">, c: Ctx): string {
  const ids: (number | null)[] = (s.imgs?.length ? s.imgs : [s.img]).filter((x): x is number => typeof x === "number").slice(0, 3);
  while (ids.length < 3) ids.push(null);
  const pieces = ids
    .map((id, i) => `<div class="mos__p mos__p${i + 1} reveal" data-d="${i + 1}" data-par="${[0.06, -0.09, 0.14][i]}">${media(c, id, s.title, "tilt")}</div>`)
    .join("");
  return `<section class="hero hero--mosaic"><div class="spot"></div><div class="wrap hero__grid"><div>${eyebrow(s.eyebrow)}<h1 class="display" data-split>${titleHtml(s.title, s.titleAccent)}</h1>${s.sub ? `<p class="lead reveal" data-d="1">${esc(cut(s.sub, 240))}</p>` : ""}${ctas(s.primary, s.secondary)}${facts(s.facts)}</div><div class="mos"><div class="mos__bar"></div>${pieces}</div></div></section>`;
}

function blueprintSvg(labels: string[]): string {
  const L = (i: number, d: string) => esc(cut(labels[i] ?? d, 22));
  return `<svg class="bp" viewBox="0 0 600 460" role="img" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
<g class="bp__g" stroke-width="1" opacity=".28">${Array.from({ length: 13 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="460"/>`).join("")}${Array.from({ length: 10 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="600" y2="${i * 50}"/>`).join("")}</g>
<g stroke-width="2.4" class="bp__d">
<path pathLength="1" style="--i:0" d="M90,360 L90,190 L300,90 L510,190 L510,360 Z"/>
<path pathLength="1" style="--i:1" d="M60,360 L540,360"/>
<path pathLength="1" style="--i:2" d="M90,190 L510,190"/>
<path pathLength="1" style="--i:3" d="M130,360 L130,250 L190,250 L190,360"/>
<path pathLength="1" style="--i:4" d="M250,290 L250,230 L350,230 L350,290 Z M300,230 L300,290 M250,260 L350,260"/>
<path pathLength="1" style="--i:5" d="M400,300 L400,230 L470,230 L470,300 Z M435,230 L435,300"/>
<path pathLength="1" style="--i:6" d="M270,120 L270,150 L330,150 L330,120" />
</g>
<g stroke-width="1.6" class="bp__dim" style="color:var(--accent2)">
<path pathLength="1" style="--i:7" d="M90,400 L510,400 M90,390 L90,410 M510,390 L510,410"/>
<path pathLength="1" style="--i:8" d="M560,190 L560,360 M550,190 L570,190 M550,360 L570,360"/>
<path pathLength="1" style="--i:9" d="M300,60 L300,20 M290,30 L300,20 L310,30"/>
</g>
<g font-family="var(--font-b)" font-size="12" font-weight="700" letter-spacing="2" fill="currentColor" stroke="none" text-anchor="middle" style="color:var(--accent2)">
<text x="300" y="424">${L(0, "ROZMER")}</text><text x="592" y="280" transform="rotate(90 592 280)">${L(1, "VÝŠKA")}</text><text x="300" y="14">${L(2, "ZDRUŽENÉ RIEŠENIE")}</text></g></svg>`;
}

export function heroBlueprint(s: S<"hero">): string {
  return `<section class="hero hero--blueprint"><div class="spot"></div><div class="wrap hero__grid"><div>${eyebrow(s.eyebrow)}<h1 class="display" data-split>${titleHtml(s.title, s.titleAccent)}</h1>${s.sub ? `<p class="lead reveal" data-d="1">${esc(cut(s.sub, 240))}</p>` : ""}${ctas(s.primary, s.secondary)}${facts(s.facts)}</div><div class="bp__wrap reveal" data-d="2">${blueprintSvg(s.stripLabels ?? [])}</div></div></section>`;
}

// ── bento, horizontálna galéria, stohované kroky ──────────────────────────

export function bento(s: S<"bento">, c: Ctx): string {
  return `<section class="bento"><div class="wrap">${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 70))}</h2><div class="bento__grid">${s.tiles.slice(0, 7).map((t, i) => {
    const size = ["s", "m", "l", "w", "t"].includes(t.size ?? "") ? t.size : "s";
    const inner =
      t.kind === "stat"
        ? `<strong class="num" data-count>${esc(cut(t.value ?? "", 10))}</strong><span>${esc(cut(t.label ?? "", 44))}</span>`
        : t.kind === "img"
          ? media(c, t.img, t.title ?? "", "bento__img", 'data-par="0.05"') + (t.title ? `<figcaption>${esc(cut(t.title, 40))}</figcaption>` : "")
          : t.kind === "quote"
            ? `<blockquote>${esc(cut(t.text ?? "", 150))}</blockquote>${t.label ? `<span>${esc(cut(t.label, 40))}</span>` : ""}`
            : `<h3 class="display">${esc(cut(t.title ?? "", 44))}</h3><p>${esc(cut(t.text ?? "", 150))}</p>`;
    return `<article class="bento__t bento__t--${size} bento__k--${t.kind} reveal" data-d="${i % 3}">${inner}</article>`;
  }).join("")}</div></div></section>`;
}

export function galleryHscroll(s: S<"gallery">, c: Ctx): string {
  return `<section class="hs"><div class="hs__stick"><div class="hs__head">${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 60))}</h2></div><div class="hs__track">${s.items.slice(0, 8).map((it) => `<figure class="hs__it">${media(c, it.img, it.title, "tilt")}<figcaption>${esc(cut(it.title, 50))}${it.caption ? `<span>${esc(cut(it.caption, 40))}</span>` : ""}</figcaption></figure>`).join("")}</div></div></section>`;
}

export function stepsStack(s: S<"steps">): string {
  return `<section class="stk"><div class="wrap stk__grid"><div class="stk__head">${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 70))}</h2></div><ol class="stk__list">${s.steps.slice(0, 5).map((st, i) => `<li class="stk__c" style="--i:${i}"><span class="stk__n">${pad(i)}</span><h3 class="display">${esc(cut(st.title, 40))}</h3>${st.text ? `<p>${esc(cut(st.text, 170))}</p>` : ""}</li>`).join("")}</ol></div></section>`;
}

// ── funkcie na mieru ──────────────────────────────────────────────────────

/** Orientačná kalkulačka splátky (počíta sa z hodnôt, ktoré si používateľ nastaví; žiadne vymyslené ceny). */
export function calc(s: S<"calc">): string {
  const min = Math.max(1000, Math.round(s.priceMin ?? 50_000));
  const max = Math.max(min + 1000, Math.round(s.priceMax ?? 500_000));
  const def = Math.min(max, Math.max(min, Math.round(s.priceDefault ?? (min + max) / 3)));
  const yrs = Math.min(35, Math.max(5, Math.round(s.years ?? 25)));
  const rate = Math.min(12, Math.max(0.5, s.rate ?? 4.5));
  return `<section class="calc" id="kalkulacka"><div class="wrap calc__grid"><div>${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 60))}</h2>${s.intro ? `<p class="lead reveal" data-d="1">${esc(cut(s.intro, 200))}</p>` : ""}</div><div class="calc__box reveal" data-d="1" data-calc><label><span>Cena <b data-o="price"></b></span><input type="range" min="${min}" max="${max}" step="1000" value="${def}" data-i="price"></label><label><span>Vlastné zdroje <b data-o="own"></b></span><input type="range" min="0" max="60" step="5" value="20" data-i="own"></label><label><span>Doba splácania <b data-o="years"></b></span><input type="range" min="5" max="35" step="1" value="${yrs}" data-i="years"></label><label><span>Úrok p. a. (upraviteľný) <b data-o="rate"></b></span><input type="range" min="0.5" max="12" step="0.1" value="${rate}" data-i="rate"></label><div class="calc__out"><span class="eyebrow">Orientačná splátka</span><strong class="num" data-o="pmt">–</strong><small>${esc(cut(s.note ?? "Nezáväzný orientačný výpočet, nie ponuka banky.", 90))}</small></div>${s.cta ? `<a class="btn btn--primary" href="${safeHref(s.cta.href ?? "#kontakt")}">${esc(cut(s.cta.label, 30))}</a>` : ""}</div></div></section>`;
}

const BODY: Record<string, [number, number]> = {
  head: [100, 34], neck: [100, 66], shoulder: [68, 84], back: [100, 128], elbow: [42, 146], hip: [84, 216], knee: [80, 300], ankle: [78, 380],
};

export function bodymap(s: S<"bodymap">): string {
  const areas = s.areas.filter((a) => BODY[a.id]).slice(0, 8);
  const dots = areas.map((a, i) => `<button class="bm__dot${i === 0 ? " on" : ""}" style="left:${(BODY[a.id][0] / 200) * 100}%;top:${(BODY[a.id][1] / 420) * 100}%" data-a="${i}" aria-label="${esc(a.title)}"><i></i></button>`).join("");
  const panels = areas.map((a, i) => `<div class="bm__p${i === 0 ? " on" : ""}" data-p="${i}"><span class="eyebrow">Kde to bolí</span><h3 class="display">${esc(cut(a.title, 40))}</h3><p>${esc(cut(a.text, 260))}</p></div>`).join("");
  return `<section class="bm" id="mapa-tela"><div class="wrap bm__grid"><div class="bm__fig reveal"><svg viewBox="0 0 200 420" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="var(--ink)" stroke-width="21"><path d="M70,80 Q46,92 42,140 L36,196"/><path d="M130,80 Q154,92 158,140 L164,196"/><path d="M84,214 L80,300 L78,384"/><path d="M116,214 L120,300 L122,384"/></g><g stroke="var(--surface)" stroke-width="18"><path d="M70,80 Q46,92 42,140 L36,196"/><path d="M130,80 Q154,92 158,140 L164,196"/><path d="M84,214 L80,300 L78,384"/><path d="M116,214 L120,300 L122,384"/></g><path d="M68,76 Q100,60 132,76 L140,128 Q142,168 130,206 L70,206 Q58,168 60,128 Z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.8"/><path d="M92,58 L108,58 L110,72 Q100,78 90,72 Z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.8"/><circle cx="100" cy="34" r="22" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.8"/><path d="M92,36 h0.01 M108,36 h0.01" stroke="var(--ink)" stroke-width="3"/></svg>${dots}</div><div class="bm__txt">${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 60))}</h2>${s.intro ? `<p class="lead reveal" data-d="1">${esc(cut(s.intro, 180))}</p>` : ""}<div class="bm__panels">${panels}</div>${s.cta ? `<div class="cta"><a class="btn btn--primary" href="${safeHref(s.cta.href ?? "#kontakt")}">${esc(cut(s.cta.label, 30))}</a></div>` : ""}</div></div></section>`;
}

export function configurator(s: S<"configurator">): string {
  const groups = s.groups.slice(0, 3).map((g, gi) => `<fieldset class="cfg__g" data-g="${gi}"><legend class="eyebrow">${esc(cut(g.label, 30))}</legend><div>${g.options.slice(0, 7).map((o, oi) => `<button type="button" class="chip${oi === 0 ? " on" : ""}" data-o="${esc(cut(o, 30))}">${esc(cut(o, 30))}</button>`).join("")}</div></fieldset>`).join("");
  return `<section class="cfg" id="poptavka"><div class="wrap cfg__grid"><div>${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 60))}</h2>${s.intro ? `<p class="lead reveal" data-d="1">${esc(cut(s.intro, 200))}</p>` : ""}</div><div class="cfg__box reveal" data-d="1" data-cfg>${groups}<div class="cfg__sum"><span class="eyebrow">Vaša požiadavka</span><p data-sum></p></div><a class="btn btn--primary" href="${safeHref(s.href ?? "#kontakt")}">${esc(cut(s.submit, 30))}</a></div></div></section>`;
}

/** Ukážka rezervácie termínu (všetky sloty sú "voľné (ukážka)", nič sa neodosiela). */
export function booking(s: S<"booking">): string {
  const days = (s.days?.length ? s.days : ["Po", "Ut", "St", "Št", "Pi"]).slice(0, 6);
  const slots = s.slots.slice(0, 6);
  return `<section class="bk" id="rezervacia"><div class="wrap bk__grid"><div>${eyebrow(s.eyebrow)}<h2 class="display" data-split>${esc(cut(s.title, 60))}</h2>${s.intro ? `<p class="lead reveal" data-d="1">${esc(cut(s.intro, 200))}</p>` : ""}</div><div class="bk__box reveal" data-d="1" data-bk><div class="bk__cols" style="--n:${days.length}">${days.map((d) => `<div class="bk__col"><b>${esc(cut(d, 4))}</b>${slots.map((t) => `<button type="button" class="slot" data-d="${esc(d)}" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>`).join("")}</div><div class="bk__sel"><p data-sel>Vyberte si termín.</p><small>${esc(cut(s.note ?? "Ukážka rezervácie. Termín sa potvrdzuje telefonicky.", 90))}</small>${s.cta ? `<a class="btn btn--primary" href="${safeHref(s.cta.href ?? "#kontakt")}">${esc(cut(s.cta.label, 30))}</a>` : ""}</div></div></div></section>`;
}

// ── signature: vlastný blok od modelu (prísne overený) ────────────────────

const BAD_JS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function|import|require|localStorage|sessionStorage|indexedDB|document\.cookie|window\.open|location\s*=|location\.(href|assign|replace)|navigator\.sendBeacon|postMessage|innerHTML\s*=|document\.write)\b/;
const BAD_CSS = /@import|expression\(|behavior:|url\(\s*['"]?\s*https?:|javascript:/i;

export function signature(s: S<"signature">): { html: string; ok: boolean; reason?: string } {
  const html = String(s.html ?? "").slice(0, 6000);
  const css = String(s.css ?? "").slice(0, 5000);
  const js = String(s.js ?? "").slice(0, 4000);
  if (!html.trim()) return { html: "", ok: false, reason: "prázdny blok" };
  if (/<\s*(script|iframe|object|embed|link|meta|form)\b/i.test(html)) return { html: "", ok: false, reason: "nepovolené značky" };
  if (/\son\w+\s*=|javascript:|src\s*=\s*['"]?\s*https?:|href\s*=\s*['"]?\s*javascript:/i.test(html)) return { html: "", ok: false, reason: "nepovolené atribúty" };
  if (BAD_CSS.test(css)) return { html: "", ok: false, reason: "nepovolené CSS" };
  if (js && BAD_JS.test(js)) return { html: "", ok: false, reason: "nepovolený JS" };
  // CSS sa viaže na vlastný obal, aby nemohlo rozbiť zvyšok stránky
  const scoped = css.replace(/(^|})\s*([^@}{][^{]*)\{/g, (_m, brace, sel) => `${brace}${String(sel).split(",").map((x: string) => `.sig-in ${x.trim()}`).join(",")}{`);
  return {
    ok: true,
    html: `<section class="sig">${s.title ? `<div class="wrap"><h2 class="display" data-split>${esc(cut(s.title, 60))}</h2></div>` : ""}<div class="wrap sig-in">${html}</div>${css ? `<style>${scoped}</style>` : ""}${js ? `<script>(function(root){try{${js}}catch(e){}})(document.currentScript.parentNode.querySelector('.sig-in'));</script>` : ""}</section>`,
  };
}

export const MODULE_CSS2 = String.raw`
/* hero: obrie písmo */
.hero--giant{overflow:hidden}
.hero--giant h1{font-size:clamp(60px,15vw,244px);line-height:.84;max-width:none;letter-spacing:-.035em}
.hero--giant h1 em{text-decoration:none;color:var(--accent2)}
.hero--giant h1[style*="--em-img"] em{color:transparent;background:var(--em-img) center/cover no-repeat;-webkit-background-clip:text;background-clip:text;-webkit-text-stroke:1.5px var(--ink)}
.hero--giant .hero__row{margin-top:clamp(28px,4vw,60px)}
/* hero: mozaika */
.hero--mosaic .hero__grid{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:clamp(24px,5vw,80px);align-items:center}
.mos{position:relative;aspect-ratio:1/1.02;min-height:340px}
.mos__bar{position:absolute;left:8%;top:10%;right:-3%;bottom:2%;background:var(--accent);opacity:.92;border-radius:var(--r)}
.mos__p{position:absolute}
.mos__p .img{width:100%;height:100%;box-shadow:0 30px 60px -28px rgba(0,0,0,.45)}
.mos__p1{left:0;top:0;width:58%;height:58%}
.mos__p2{right:0;top:22%;width:46%;height:52%}
.mos__p3{left:14%;bottom:0;width:38%;height:34%}
@media (max-width:900px){.hero--mosaic .hero__grid{grid-template-columns:1fr}}
/* hero: blueprint */
.hero--blueprint .hero__grid{display:grid;grid-template-columns:minmax(0,6fr) minmax(0,6fr);gap:clamp(24px,5vw,80px);align-items:center}
.bp__wrap{color:var(--ink)}
.bp{width:100%;height:auto;overflow:visible}
.js .bp__d path,.js .bp__dim path{stroke-dasharray:1;stroke-dashoffset:1}
.js .bp__wrap.in .bp__d path,.js .bp__wrap.in .bp__dim path{animation:draw 1.8s cubic-bezier(.6,0,.2,1) calc(var(--i)*.22s + .2s) forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@media (max-width:900px){.hero--blueprint .hero__grid{grid-template-columns:1fr}}
.hero{overflow:hidden}
.hero .wrap{position:relative;z-index:1}
/* bento */
.bento__grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(200px,auto);gap:clamp(12px,1.4vw,20px);margin-top:clamp(28px,4vw,56px)}
.bento__t{position:relative;padding:clamp(20px,2vw,32px);background:var(--surface);border-radius:var(--r);display:flex;flex-direction:column;justify-content:space-between;gap:16px;overflow:hidden}
.bento__t--s{grid-column:span 1}.bento__t--m{grid-column:span 2}.bento__t--l{grid-column:span 2;grid-row:span 2}.bento__t--w{grid-column:span 3}.bento__t--t{grid-row:span 2}
.bento__t:nth-child(4n+2){background:var(--ink);color:var(--bg)}
.bento__t:nth-child(4n+3){background:var(--accent);color:var(--accent-ink)}
.bento__k--stat strong{font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(44px,6vw,96px);line-height:.9;letter-spacing:var(--dt)}
.bento__k--stat span{font:600 12px/1.4 var(--font-b);letter-spacing:.12em;text-transform:uppercase;opacity:.8}
.bento__k--text p{opacity:.85;font-size:15px}
.bento__k--quote blockquote{font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(20px,2vw,30px);line-height:1.1;letter-spacing:var(--dt)}
.bento__k--quote span{font:600 11px/1.4 var(--font-b);letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.bento__k--img{padding:0}
.bento__k--img .img{position:absolute;inset:0;border-radius:0}
.bento__k--img figcaption{position:absolute;left:14px;bottom:14px;z-index:2;background:var(--bg);color:var(--ink);padding:.5em .8em;font:600 11px/1 var(--font-b);letter-spacing:.12em;text-transform:uppercase}
@media (max-width:980px){.bento__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bento__t--w,.bento__t--l{grid-column:span 2}}
@media (max-width:560px){.bento__grid{grid-template-columns:1fr}.bento__t--m,.bento__t--w,.bento__t--l{grid-column:span 1}.bento__t--l,.bento__t--t{grid-row:span 1}.bento__k--img{min-height:220px}}
/* stohované kroky */
.stk__grid{display:grid;grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:clamp(28px,6vw,96px);align-items:start}
.stk__head{position:sticky;top:110px}
.stk__list{list-style:none;padding:0;display:grid;gap:18px}
.stk__c{position:sticky;top:calc(96px + var(--i) * 22px);background:var(--surface);border:1px solid color-mix(in srgb,var(--ink) 18%,transparent);border-radius:var(--r);padding:clamp(22px,2.6vw,40px);min-height:200px;box-shadow:0 -14px 30px -18px rgba(0,0,0,.25)}
.stk__c:nth-child(even){background:var(--ink);color:var(--bg)}
.stk__n{font:700 13px/1 var(--font-b);letter-spacing:.14em;opacity:.65}
.stk__c h3{margin:14px 0 10px}
.stk__c p{max-width:34em;opacity:.85}
@media (max-width:900px){.stk__grid{grid-template-columns:1fr}.stk__head,.stk__c{position:static}}
/* kalkulačka */
.calc__grid,.bm__grid,.cfg__grid,.bk__grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(28px,6vw,96px);align-items:start}
.calc__box,.cfg__box,.bk__box{background:var(--surface);padding:clamp(22px,3vw,44px);border-radius:var(--r);display:grid;gap:22px}
.calc__box label{display:grid;gap:10px;font:600 12px/1.3 var(--font-b);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.calc__box label span{display:flex;justify-content:space-between}.calc__box label b{color:var(--ink)}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;background:color-mix(in srgb,var(--ink) 22%,transparent);border-radius:99px;outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--accent);border:3px solid var(--bg);box-shadow:0 0 0 1.5px var(--ink);cursor:pointer}
input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--accent);border:3px solid var(--bg);box-shadow:0 0 0 1.5px var(--ink);cursor:pointer}
.calc__out{display:grid;gap:6px;padding-top:18px;border-top:1px solid color-mix(in srgb,var(--ink) 25%,transparent)}
.calc__out strong{font-family:var(--font-d);font-weight:var(--dw);font-size:clamp(44px,5.4vw,84px);line-height:1;letter-spacing:var(--dt);color:var(--accent2)}
.calc__out small{color:var(--muted)}
@media (max-width:900px){.calc__grid,.bm__grid,.cfg__grid,.bk__grid{grid-template-columns:1fr}}
/* mapa tela */
.bm__fig{position:relative;max-width:360px;justify-self:center;width:100%}
.bm__fig svg{width:100%;height:auto;display:block}
.bm__dot{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border:0;background:transparent;cursor:pointer;padding:0}
.bm__dot i{display:block;width:100%;height:100%;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent);animation:pulse 2s infinite}
.bm__dot.on i{background:var(--ink);animation:none;box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 40%,transparent)}
@keyframes pulse{70%{box-shadow:0 0 0 14px transparent}100%{box-shadow:0 0 0 0 transparent}}
.bm__panels{margin-top:28px;min-height:170px;position:relative}
.bm__p{display:none}.bm__p.on{display:block;animation:fadein .5s both}
.bm__p h3{margin:8px 0 10px}
@keyframes fadein{from{opacity:0;transform:translateY(10px)}}
/* konfigurátor */
.cfg__g{border:0;padding:0;display:grid;gap:10px}
.cfg__g>div{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:.7em 1.1em;border:1.5px solid color-mix(in srgb,var(--ink) 35%,transparent);background:var(--bg);color:var(--ink);border-radius:99px;font:600 13px/1 var(--font-b);cursor:pointer;transition:all .2s}
.chip:hover{border-color:var(--ink)}.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.cfg__sum{padding:16px;border:1px dashed color-mix(in srgb,var(--ink) 40%,transparent);border-radius:var(--r);display:grid;gap:6px}
.cfg__sum p{font:600 clamp(16px,1.4vw,20px)/1.4 var(--font-b)}
/* rezervácia */
.bk__cols{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:10px}
.bk__col{display:grid;gap:8px;align-content:start}
.bk__col b{font:700 12px/1 var(--font-b);letter-spacing:.14em;text-transform:uppercase;text-align:center;color:var(--muted);padding-bottom:6px}
.slot{padding:.9em .4em;border:1.5px solid color-mix(in srgb,var(--ink) 30%,transparent);background:var(--bg);color:var(--ink);border-radius:var(--r);font:600 14px/1 var(--font-b);cursor:pointer;transition:all .18s}
.slot:hover{border-color:var(--accent);transform:translateY(-2px)}.slot.on{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.bk__sel{display:grid;gap:8px;padding-top:16px;border-top:1px solid color-mix(in srgb,var(--ink) 25%,transparent)}
.bk__sel p{font:600 clamp(18px,1.6vw,24px)/1.3 var(--font-b)}.bk__sel small{color:var(--muted)}
/* filter registra */
.reg__filters{display:flex;flex-wrap:wrap;gap:8px}
.reg__row[hidden]{display:none}
/* signature */
.sig .display{margin-bottom:clamp(20px,3vw,40px)}
`;

/** Skript pre funkcie (kalkulačka, mapa tela, konfigurátor, rezervácia, filter registra). */
export const WIDGET_JS = String.raw`
(function(){var d=document;
function fmt(n){return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ')}
d.querySelectorAll('[data-calc]').forEach(function(box){var q=function(k){return box.querySelector('[data-i="'+k+'"]')},o=function(k){return box.querySelector('[data-o="'+k+'"]')};
function upd(){var price=+q('price').value,own=+q('own').value,yrs=+q('years').value,rate=+q('rate').value;var P=price*(1-own/100),r=rate/100/12,n=yrs*12;var pmt=r>0?P*r/(1-Math.pow(1+r,-n)):P/n;o('price').textContent=fmt(price)+' €';o('own').textContent=own+' %';o('years').textContent=yrs+' r.';o('rate').textContent=rate.toFixed(1).replace('.',',')+' %';o('pmt').textContent=fmt(pmt)+' € / mes.'}
box.querySelectorAll('input').forEach(function(i){i.addEventListener('input',upd)});upd()});
d.querySelectorAll('.bm').forEach(function(bm){var dots=[].slice.call(bm.querySelectorAll('.bm__dot')),ps=[].slice.call(bm.querySelectorAll('.bm__p'));dots.forEach(function(x,i){x.addEventListener('click',function(){dots.forEach(function(y){y.classList.remove('on')});ps.forEach(function(y){y.classList.remove('on')});x.classList.add('on');if(ps[i])ps[i].classList.add('on')})})});
d.querySelectorAll('[data-cfg]').forEach(function(box){var sum=box.querySelector('[data-sum]');function upd(){var v=[].slice.call(box.querySelectorAll('.chip.on')).map(function(c){return c.getAttribute('data-o')});sum.textContent=v.join(' · ')}
box.querySelectorAll('.cfg__g').forEach(function(g){g.querySelectorAll('.chip').forEach(function(c){c.addEventListener('click',function(){g.querySelectorAll('.chip').forEach(function(x){x.classList.remove('on')});c.classList.add('on');upd()})})});upd()});
d.querySelectorAll('[data-bk]').forEach(function(box){var sel=box.querySelector('[data-sel]');box.querySelectorAll('.slot').forEach(function(s){s.addEventListener('click',function(){box.querySelectorAll('.slot').forEach(function(x){x.classList.remove('on')});s.classList.add('on');sel.textContent='Vybraný termín: '+s.getAttribute('data-d')+' '+s.getAttribute('data-t')+' (ukážka)'})})});
d.querySelectorAll('.reg').forEach(function(reg){var fs=[].slice.call(reg.querySelectorAll('[data-f]'));fs.forEach(function(f){f.addEventListener('click',function(){fs.forEach(function(x){x.classList.remove('on')});f.classList.add('on');var t=f.getAttribute('data-f');reg.querySelectorAll('.reg__row').forEach(function(r){r.hidden=!!t&&r.getAttribute('data-tag')!==t})})})});
})();
`;
