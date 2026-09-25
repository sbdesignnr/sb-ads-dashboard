// Ateliér: prémiový návrh písaný art directorom od nuly (Opus). Tri kroky: (1) koncept a plán
// momentov, (2) stavba celej stránky (HTML/CSS/JS) nad hotovým pohybovým runtimom, (3) oprava
// cielenými zmenami podľa programovej kontroly a kritiky. Kód sa pred zverejnením čistí
// (žiadne cudzie skripty, siete ani odkazy) a beží pod prísnou CSP.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../../leads/ai";
import { anthropicEur } from "../budget";
import { assetsText, type DesignBrief, type StageCost } from "./design";
import { FONT_PAIRS, fontPair } from "./kit/fonts";
import type { ImagePrompt } from "./kit/imagery";
import { RT_CSS, RT_JS } from "./kit/runtime";

export const FREEFORM_MODEL = process.env.ATELIER_PREMIUM_MODEL?.trim() || "claude-opus-5-5";

export interface FreeConcept {
  big_idea: string;
  why_them: string;
  mood: string[];
  palette: { bg: string; surface: string; ink: string; muted: string; accent: string; accent2?: string };
  font_pair: string;
  type_notes: string;
  hero: { headline: string; sub: string; composition: string; motion: string };
  moments: { name: string; experience: string; how: string; section: string }[];
  instrument: { kind: string; spec: string } | null;
  sections: { id: string; title: string; purpose: string; layout: string; motion: string }[];
  generated_images: (ImagePrompt & { id: string; role?: string })[];
}

const TOOLKIT = `POHYBOVÝ RUNTIME (hotový, odladený; do HTML len pridávaš atribúty, JS na tieto veci NEPÍŠ)
- data-reveal ["up" predvolene | left | right | zoom | clip | clip-x]: prvok sa odhalí pri scrolle; "clip" odhaľuje obrázok/blok maskou. data-delay="200" (ms). Na rodiča daj data-stagger a deti s data-reveal naskočia postupne.
- data-split: nadpis sa odhalí po slovách (nadpisy h1/h2, vnorené <em>/<span> ostávajú).
- data-scrub: odsek/veľká veta sa rozsvieti slovo po slove podľa scrollu (výborné na manifest).
- data-count: číslo v prvku sa rozbehne od nuly (text musí obsahovať len fakt zo zadania).
- data-par="0.15": paralaxa prvku (kladné = pomalší, záporné = rýchlejší pohyb). Obrázok daj do obalu s overflow:hidden a zväčši ho (scale 1.15).
- data-marquee="40": obsah sa zopakuje a nekonečne beží (pás slov/čísel/značiek; hodnota = sekundy na kolo). Deti daj inline-flex s medzerou.
- data-hscroll na <section> s vnútrom <div class="hs-pin"><div class="hs-track">…položky s pevnou šírkou…</div></div>: sekcia sa pripne a posúva sa vodorovne pri scrolle (na mobile obyčajný posúvací pás).
- data-p na prvku: runtime mu priebežne nastavuje CSS premennú --p (0→1, ako prechádza obrazovkou). V CSS potom píšeš napr. transform:translateX(calc(var(--p) * -30vw)) alebo clip-path:inset(0 calc((1 - var(--p)) * 60%) 0 0).
- data-story na vysokej sekcii (napr. height:400vh) s vnútrom <div style="position:sticky;top:0;height:100vh">: runtime nastavuje --sp (0→1) na sekcii = pokrok pripnutej scény. Na tom postavíš scroll-scénu (kreslenie čiary cez stroke-dashoffset: calc(1 - var(--sp)), postupné zobrazovanie krokov, zmena obrázka, zväčšovanie…).
- data-magnetic (tlačidlá), data-tilt (karty 3D), data-spot (nastavuje --mx/--my pre svetlo za myšou v sekcii; v CSS napr. radial-gradient(500px circle at var(--mx,70%) var(--my,30%), …)).
- na <body>: data-cursor (vlastný kurzor; prvok s data-cursor-label="Otvoriť" v ňom ukáže text), data-progress (lišta pokroku stránky, farba var(--accent)).
- <div class="rt-ld">…logo/názov…</div> ako prvý prvok v <body>: úvodná opona, ktorá sa sama odsunie (farby cez --ld-bg, --ld-ink).
- --page na <html>: celkový pokrok stránky 0→1 (použiteľný v CSS).
- Formulár bez action: po odoslaní ukáže „Ďakujeme (ukážka)“, nič sa neodosiela.`;

const NICHE_IDEAS = `INŠPIRÁCIE PODĽA ODBORU (vyber a zmeň; nekopíruj doslova)
- realitné kancelárie: pripnutá scéna „mapa/pôdorys sa kreslí a ponuky naskakujú“, ponuky s filtrom podľa rozpočtu a typu, kalkulačka splátky, vodorovná galéria projektov s náhľadom fotky pri hoveri, obrie ceny/plochy ako typografia, mesto ako hrdina
- stavebné firmy a rekonštrukcie: scroll KRESLÍ dom/stavbu (SVG čiary + kóty) a fázy sa odomykajú, konfigurátor (typ práce → rozsah → termín → súhrn), pás materiálov/technológií, „pred a po“ len ak sú reálne fotky, tabuľkové čísla
- fyzioterapia a zdravie: klikacia mapa tela (bolesť → čo robíme), dychový/pokojný pohyb, rezervačný výber termínu podľa ich hodín, teplá typografia, ľudský tón, postup terapie ako príbeh
- iné: nájdi, čo v ich odbore návštevník robí pred rozhodnutím (porovnáva, počíta, vyberá, rezervuje), a urob z toho hru na stránke`;

const CONCEPT_SYSTEM = `Si art director svetovej úrovne (Locomotive, Active Theory, Studio Freight, Pentagram, Hey Studio). Pre konkrétnu slovenskú alebo českú firmu navrhuješ NOVÚ DOMOVSKÚ STRÁNKU, ktorá má prekvapiť majiteľa tak, že povie: „takú stránku nemá nikto v našom odbore, chceme ju.“ Nie je to šablóna a nie je to „AI web“.

AKO PREMÝŠĽAŠ
1. Z ich vlastných textov, recenzií a faktov nájdi JEDNU pravdu, ktorá ich odlišuje, a postav na nej veľkú myšlienku vyjadrenú VIZUÁLNE, nie sloganom. Ak by sa myšlienka dala použiť pre konkurenta výmenou loga, je zlá.
2. Vymysli 3 zapamätateľné momenty: (a) prvé 3 sekundy (hero choreografia), (b) scroll-scéna (pripnutá sekcia, ktorá sa mení s posunom), (c) interaktívny NÁSTROJ šitý na ich odbor, ktorý si návštevník vyskúša (kalkulačka, mapa tela, konfigurátor, plánovač, meradlo…). Ku každému povedz konkrétne, čo návštevník uvidí a čím sa to postaví z runtimu alebo vlastného JS.
3. Typografia je hlavný nástroj: extrémne kontrasty veľkostí (obrie nadpisy 10 až 22 vw proti drobným popiskom), jedna výrazná dvojica písiem.
4. Farba: jedna dominantná neutrálna plocha, jeden razantný akcent, jasný kontrast; vychádza z ich značky, ale odvážnejšie. Zakázané: fialovo-modré prechody, glassmorphism, neónové žiary, tri rovnaké karty s ikonkami, vycentrovaný hero s dvoma tlačidlami.
5. Kompozícia: asymetria, prekrývanie, obrie číslovanie, tenké linky, striedanie hustých a prázdnych sekcií, aspoň jedna sekcia láme mriežku.
6. Fotky: ich vlastné fotky sú hlavný materiál (dostaneš ich zoznam). Ak sú slabé alebo ich je málo, navrhni 0 až 4 generované atmosférické fotografie BEZ ľudí, textov a značiek (interiér, architektúra, detail materiálu, svetlo, textúra). Nikdy „ich“ budovu ani ľudí.
7. Pravdivosť: žiadne vymyslené referencie, čísla, ocenenia ani ľudia. Použiješ len to, čo je v podkladoch.

${TOOLKIT}

${NICHE_IDEAS}

PÍSMA (vyber presne jedno id):
${FONT_PAIRS.map((f) => `- ${f.id}: ${f.feel}`).join("\n")}

Vo vnútri textových hodnôt nepoužívaj rovné úvodzovky ("), používaj „ “. Buď stručný (každé pole max 2 vety). Odpovedz VÝHRADNE jedným JSON objektom bez markdownu:
{"big_idea":"…","why_them":"čo z ich materiálu to podporuje","mood":["3 slová"],"palette":{"bg","surface","ink","muted","accent","accent2"},"font_pair":"id","type_notes":"mierka a štýl nadpisov","hero":{"headline":"max 8 slov v jazyku firmy","sub":"…","composition":"…","motion":"…"},"moments":[{"name","experience","how","section"}],"instrument":{"kind":"calculator|bodymap|configurator|planner|measure|other","spec":"čo presne robí a s akými údajmi"},"sections":[{"id","title","purpose","layout","motion"}],"generated_images":[{"id":"G1","prompt":"English scene description","aspect":"landscape|portrait|square","role":"kde sa použije"}]}
Sekcií 8 až 10 (hero prvá, kontakt posledná).`;

const BUILD_SYSTEM = `Si senior creative developer v štúdiu svetovej úrovne. Podľa konceptu art directora napíšeš KOMPLETNÚ domovskú stránku ako jeden HTML súbor. Výsledok musí vyzerať ako ručná práca drahého štúdia (Awwwards úroveň), pôsobiť ako hotový web, nie ako šablóna, a mať aspoň tri momenty, ktoré sa dajú zažiť pohybom alebo interakciou.

${TOOLKIT}

TECHNICKÉ PRAVIDLÁ (porušenie = návrh sa zahodí)
1. Odpoveď je VÝHRADNE HTML od <!doctype html> po </html>. Na úplný začiatok (pred doctype) napíš <!-- PLAN: 6 riadkov: mriežka, mierka písma, farby, poradie sekcií, tri momenty, ako sú postavené --> a až potom kód.
2. <head>: charset, viewport, <title>, presne JEDEN <link> na písma (odkaz dostaneš v koncepte), jeden <style>. Na konci <body> jeden <script> len pre tvoje VLASTNÉ interakcie (nástroj, scéna); runtime sa pridá sám, nepíš ho znova.
3. Žiadne externé zdroje okrem odkazu na písma: žiadne knižnice (GSAP, jQuery), CDN, iframe, obrázky z iných webov. Vanilla JS. Zakázané: fetch, XMLHttpRequest, WebSocket, eval, new Function, localStorage, sessionStorage, cookies, document.write, zmena location, window.open.
4. Všetky počiatočné skryté alebo posunuté stavy (opacity:0, transform pred animáciou) píš IBA pod selektorom .js (napr. ".js .hero__t{opacity:0}"), aby bola stránka plne viditeľná bez JS aj na screenshote. Vlastné animácie riaď triedou, ktorú pridáš cez IntersectionObserver alebo runtime atribúty.
5. Responzívne: desktop 1440 aj mobil 390, žiadny horizontálny posun (html,body{overflow-x:clip}), clamp() pre písmo a medzery, na mobile jeden stĺpec a nástroj použiteľný prstom. Sekcie s výškou používaj v svh/dvh, nie iba vh. Hero musí byť na 1440×900 hneď pri otvorení KOMPLETNÝ (nadpis, sub, tlačidlo, vizuál).
6. Obrázky: iba tokeny {{P1}}, {{P2}}… (ich vlastné fotky), {{G1}}, {{G2}}… (generované atmosférické) a {{LOGO}} (logo, ak existuje). Token dávaj do src a do url() presne v tvare {{P1}}. Každý obrázok má alt, pevný pomer strán (aspect-ratio) a object-fit:cover; každú fotku spracuj dizajnovo (orez, maska, clip-path, duotón cez mix-blend-mode, prekrytie). Jednu fotku najviac dvakrát. Ak je fotiek málo, silu daj typografii, SVG, farebným plochám, číslovaniu. NIKDY nepridaj URL obrázka z pamäte.
7. Odkazy: navigácia na #kotvy sekcií, telefón tel:, e-mail mailto: iba z podkladov. Iné externé odkazy nepíš.
8. Rozsah: píš KOMPAKTNE, cena stavby rastie s dĺžkou. Cieľ je 55 000 až 65 000 znakov celkom (výstup nesmie presiahnuť ~24 000 tokenov). CSS stručné (premenné, krátke názvy tried, žiadne opakovanie a komentáre), texty krátke, SVG bez zbytočných bodov, JS nástroja max 4 000 znakov. Radšej menej vecí dotiahnutých do detailu než veľa hrubých.
9. Prístupnosť a kvalita: sémantické značky, :focus-visible, kontrast textu min. 4,5:1, prefers-reduced-motion, hover a focus stavy na všetkom klikateľnom, jemné prechody (cubic-bezier).
10. Nástroj/interakcia z konceptu musí FUNGOVAŤ (výpočet, filter, výber, stavy) s ich reálnymi údajmi; ak by potreboval údaje, ktoré nemáš, nevymýšľaj ich (rozsahy posuvníkov sú len ukážka, nie ponuka).

PRAVDIVOSŤ: texty, mená, adresy, telefóny, ponuky, ceny, čísla a citáty iba z podkladov. Nevymýšľaj referencie, roky, ocenenia, štatistiky ani ľudí. Google hodnotenie spomeň len ak je 4,3 a viac. Ak niečo chýba, sekciu vynechaj. Texty v jazyku firmy, krátke, konkrétne, vykanie. Zakázané frázy: „profesionálny prístup“, „komplexné riešenia“, „na mieru vašim potrebám“, „vitajte“, „kvalita a spoľahlivosť“. Nepoužívaj rovné úvodzovky v textoch, používaj „ “. V pätičke jemne: „Návrh pripravil SB Design“.

ZAKÁZANÉ „AI“ ZNAKY: fialovo-modré prechody, glassmorphism, rozmazané farebné škvrny, neónové žiary, tri rovnaké karty s ikonkami v kruhu, emoji ako ikony, všetko vycentrované, nadpisy pod 44 px, Inter/Roboto/Poppins ako jediné písmo, rovnaké zaoblené karty s tieňom všade, žiadny rytmus.`;

const REFINE_SYSTEM = `Si senior creative developer. Dostaneš HTML návrhu (s tokenmi obrázkov {{P1}}, {{G1}}) a zoznam problémov z programovej kontroly a od kreatívneho riaditeľa. Oprav ich cielenými zmenami: vráť VÝHRADNE JSON pole objektov {"find":"presný úsek z HTML","replace":"nový úsek"} (žiadny markdown). "find" musí byť doslovný a v HTML JEDINEČNÝ (5 až 500 znakov), "replace" jeho nová verzia. Max 14 zmien, zoradené podľa dopadu. Zachovaj koncept, texty a funkčnosť nástroja; nič vymyslené nepridávaj. Ak treba zmeniť CSS pravidlo, v "find" použi jeho celé znenie. Prístup: radšej niekoľko silných zmien (mierka písma, medzery, kontrast, zarovnanie, skutočné rozloženie, pohyb) než kozmetika. Pravidlá runtime aj technické pravidlá (bez externých zdrojov, skryté stavy len pod .js) ostávajú v platnosti. V JSON správne escapuj úvodzovky a zalomenia riadkov.`;

const firstJson = (s: string) => {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Odpoveď neobsahuje JSON.");
  try {
    return JSON.parse(m[0]);
  } catch {
    return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1"));
  }
};

async function ask(
  client: Anthropic,
  stage: string,
  system: string,
  content: Anthropic.MessageParam["content"],
  maxTokens: number,
  costs: StageCost[],
  model = FREEFORM_MODEL,
): Promise<{ text: string; truncated: boolean }> {
  const msg = await createMessage(client, { model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] });
  costs.push({ stage, model, eur: anthropicEur(model, msg.usage), input: msg.usage.input_tokens, output: msg.usage.output_tokens });
  return { text: textFrom(msg), truncated: msg.stop_reason === "max_tokens" };
}

/** Krok 1: koncept (a plán obrázkov). Vstup: podklady + screenshot súčasného webu. */
export async function conceive(
  client: Anthropic,
  brief: DesignBrief,
  currentShot: string | null,
  costs: StageCost[],
  direction?: string,
): Promise<FreeConcept> {
  const content: Anthropic.MessageParam["content"] = [];
  if (currentShot) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: currentShot } });
  content.push({
    type: "text",
    text: `${currentShot ? "Obrázok je súčasný web firmy (ukazuje, čo majú a čo z toho je slabé).\n\n" : ""}${assetsText(brief)}${direction ? `\n\nODPORÚČANIE Z PORADY AGENTOV (zohľadni; ak protirečí dostupnému materiálu alebo pravdivosti, materiál a pravda majú prednosť): ${direction}` : ""}`,
  });
  let r = await ask(client, "koncept", CONCEPT_SYSTEM, content, 6000, costs);
  let c: FreeConcept;
  try {
    c = firstJson(r.text) as FreeConcept;
  } catch {
    r = await ask(client, "koncept (opakovanie)", CONCEPT_SYSTEM, content, 12000, costs);
    c = firstJson(r.text) as FreeConcept;
  }
  c.generated_images = (Array.isArray(c.generated_images) ? c.generated_images : []).filter((g) => g && typeof g.prompt === "string" && g.prompt.length > 10).slice(0, 4);
  c.generated_images.forEach((g, i) => (g.id = `G${i + 1}`));
  return c;
}

/** Krok 2: stavba celej stránky. Vráti HTML s tokenmi obrázkov. */
export async function buildFree(
  client: Anthropic,
  brief: DesignBrief,
  concept: FreeConcept,
  generatedOk: boolean[],
  costs: StageCost[],
  extra?: string,
): Promise<string> {
  const fp = fontPair(concept.font_pair);
  const photos = brief.assets.images.map((i, n) => `  {{P${n + 1}}} ${i.w}x${i.h} ${i.w >= i.h ? "na šírku" : "na výšku"}${i.alt ? ` | ${i.alt}` : ""}`).join("\n") || "  (žiadne použiteľné fotky: použi generované, typografiu a grafiku)";
  const gen = concept.generated_images
    .map((g, i) => (generatedOk[i] ? `  {{${g.id}}} ${g.aspect ?? "landscape"} | ${g.role ?? ""} | ${g.prompt.slice(0, 120)}` : null))
    .filter(Boolean)
    .join("\n");
  const text = [
    `KONCEPT (drž sa ho, je to záväzné):\n${JSON.stringify({ ...concept, generated_images: undefined }, null, 1)}`,
    `PÍSMA: font_pair "${fp.id}": display "${fp.display}" (váha ${fp.displayWeight}), body "${fp.body}". Odkaz na písma (vlož ako jediný <link rel="stylesheet">): ${fp.href}`,
    `OBRÁZKY, KTORÉ SMIEŠ POUŽIŤ (iba tieto tokeny):\nVlastné fotky firmy:\n${photos}\nGenerované atmosférické:\n${gen || "  (žiadne)"}\nLogo: ${brief.assets.logo || brief.assets.logos[0] ? "{{LOGO}} (existuje; ak je na tmavom pozadí, daj mu svetlú plochu alebo ho vynechaj a použi názov písmom)" : "neexistuje, použi názov firmy písmom"}`,
    `PODKLADY:\n${assetsText(brief)}`,
    extra ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await ask(client, "stavba", BUILD_SYSTEM, text, 48000, costs);
  const m = r.text.match(/<!doctype html[\s\S]*<\/html>/i);
  if (!m) throw new Error(r.truncated ? "Stavba stránky bola zrezaná (príliš dlhá odpoveď)." : "Odpoveď neobsahuje kompletný HTML dokument.");
  return m[0];
}

/** Krok 3: cielené opravy (find/replace) podľa problémov. Vráti nové HTML a počet použitých zmien. */
export async function refineFree(
  client: Anthropic,
  html: string,
  feedback: string,
  costs: StageCost[],
  stage = "oprava",
): Promise<{ html: string; applied: number; skipped: number }> {
  const r = await ask(client, stage, REFINE_SYSTEM, `PROBLÉMY:\n${feedback}\n\nHTML:\n${html}`, 9000, costs);
  const m = r.text.match(/\[[\s\S]*\]/);
  let edits: { find?: string; replace?: string }[] = [];
  try {
    edits = m ? JSON.parse(m[0]) : [];
  } catch {
    edits = [];
  }
  let applied = 0;
  let skipped = 0;
  let next = html;
  for (const e of edits) {
    if (typeof e.find !== "string" || typeof e.replace !== "string" || e.find.length < 5) {
      skipped++;
      continue;
    }
    const first = next.indexOf(e.find);
    if (first < 0 || next.indexOf(e.find, first + 1) >= 0) {
      skipped++;
      continue;
    }
    next = next.slice(0, first) + e.replace + next.slice(first + e.find.length);
    applied++;
  }
  return { html: next, applied, skipped };
}

// ---------------------------------------------------------------------------------------------
// Čistenie a zloženie výsledku

const BANNED_JS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|localStorage|sessionStorage|indexedDB)\b|new\s+Function|document\s*\.\s*(cookie|write|domain)|navigator\s*\.\s*(sendBeacon|serviceWorker)|window\s*\.\s*open|location\s*(\.\s*(href|assign|replace)\s*[=(]|\s*=[^=])|\bimport\s*\(/;

const registrable = (host: string) => host.replace(/^www\./, "").split(".").slice(-2).join(".");

export interface CleanReport {
  removedScripts: number;
  removedLinks: number;
  removedImages: number;
}

/** Odstráni všetko, čo by mohlo unikať dáta, načítať cudzí kód alebo presmerovať návštevníka. */
export function sanitizeFree(html: string, origin: string): { html: string; report: CleanReport } {
  const report: CleanReport = { removedScripts: 0, removedLinks: 0, removedImages: 0 };
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<(iframe|object|embed|base|applet)\b[\s\S]*?(<\/\1>|\/?>)/gi, "");
  out = out.replace(/<meta[^>]+http-equiv=["']?refresh[^>]*>/gi, "");
  // <link>: len písma z Google Fonts
  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(tag) && !/rel=["']?(preload|prefetch)/i.test(tag)) return tag;
    if (/rel=["']?preconnect["']?/i.test(tag) && /fonts\.(googleapis|gstatic)\.com/i.test(tag)) return tag;
    report.removedLinks++;
    return "";
  });
  // <script>: bez src a bez zakázaných volaní
  out = out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_m, attrs: string, body: string) => {
    if (/\bsrc\s*=/i.test(attrs) || BANNED_JS.test(body)) {
      report.removedScripts++;
      return "";
    }
    return `<script>${body}</script>`;
  });
  // inline handlery (onclick=…) so zakázanými volaniami a javascript: odkazy
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, (m) => (BANNED_JS.test(m) ? "" : m));
  out = out.replace(/\s(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, ' $1="#"');
  out = out.replace(/<form\b([^>]*)>/gi, (_m, attrs: string) => `<form${attrs.replace(/\s(action|method|target)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")}>`);
  // odkazy: #kotvy, tel:, mailto:, a vlastná doména firmy; ostatné na kontakt
  let own = "";
  try {
    own = registrable(new URL(origin).hostname);
  } catch {}
  out = out.replace(/(<a\b[^>]*?\shref\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, _q: string, d: string, s: string) => {
    const href = (d ?? s ?? "").trim();
    if (!href || href.startsWith("#") || /^(tel|mailto):/i.test(href)) return m;
    try {
      const u = new URL(href, origin);
      if (/^https?:$/.test(u.protocol) && own && registrable(u.hostname) === own) return m;
    } catch {}
    report.removedLinks++;
    return `${pre}"#kontakt"`;
  });
  // cieľ odkazov nikdy nie nové okno
  out = out.replace(/\starget\s*=\s*("_blank"|'_blank')/gi, "");
  return { html: out, report };
}

const SVG_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA0IDMnPjxyZWN0IHdpZHRoPSc0JyBoZWlnaHQ9JzMnIGZpbGw9JyMyNjI2MjYnLz48L3N2Zz4=";

export interface Materials {
  photos: string[];
  generated: (string | null)[];
  logo: string | null;
}

/** Nahradí tokeny obrázkov, odstráni neznáme externé obrázky, vloží runtime a meta. */
export function materialize(template: string, mats: Materials, origin: string): { html: string; removedImages: number } {
  const known = new Set<string>([...mats.photos, ...(mats.logo ? [mats.logo] : [])]);
  let out = template
    .replace(/\{\{\s*P(\d+)\s*\}\}/g, (_m, n: string) => mats.photos[Number(n) - 1] ?? SVG_PLACEHOLDER)
    .replace(/\{\{\s*G(\d+)\s*\}\}/g, (_m, n: string) => mats.generated[Number(n) - 1] ?? SVG_PLACEHOLDER)
    .replace(/\{\{\s*LOGO\s*\}\}/g, mats.logo ?? SVG_PLACEHOLDER);
  let removedImages = 0;
  // obrázky, ktoré model vymyslel z pamäte (nie sú medzi dodanými), sa nahradia neutrálnou plochou
  const isKnown = (u: string) => known.has(u) || /^data:/i.test(u) || /^#/.test(u);
  out = out.replace(/(<img\b[^>]*?\ssrc\s*=\s*)("([^"]*)"|'([^']*)')/gi, (m, pre: string, _q: string, d: string, s: string) => {
    const u = (d ?? s ?? "").trim();
    if (isKnown(u)) return m;
    removedImages++;
    return `${pre}"${SVG_PLACEHOLDER}"`;
  });
  out = out.replace(/url\(\s*(["']?)(https?:\/\/[^)"']+)\1\s*\)/gi, (m, _q: string, u: string) => {
    if (known.has(u) || /fonts\.(googleapis|gstatic)\.com/i.test(u)) return m;
    removedImages++;
    return `url("${SVG_PLACEHOLDER}")`;
  });
  void origin;
  const head = `<meta name="robots" content="noindex,nofollow"><style id="rt-css">${RT_CSS}</style>`;
  // trieda "js" sa nastaví hneď na začiatku, aby obsah pred animáciou nebliknul
  const early = `<script>if(!window.__RT_STATIC)document.documentElement.classList.add("js")</script>`;
  const vp = /<meta[^>]+name=["']viewport/i.test(out) ? "" : `<meta name="viewport" content="width=device-width,initial-scale=1">`;
  out = out.replace(/<head[^>]*>/i, (h) => `${h}${vp}${early}`);
  out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${head}</head>`) : out.replace(/<body/i, `${head}<body`);
  const rt = `<script id="rt-js">if(!window.__RT_STATIC){${RT_JS}}</script>`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${rt}</body>`) : `${out}${rt}`;
  return { html: out, removedImages };
}
