// Ateliér: skladanie stránky z knižnice modulov. Model vráti JSON (téma, pohyb, obrázky, sekcie s
// obsahom, prípadne vlastný "signature" blok); HTML/CSS/JS vzniká v kóde (kit), takže rozloženie
// nie je rozbité. Prémiový režim používa najlepší model a bohatšiu paletu (obrázky, signature).
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../../leads/ai";
import { anthropicEur } from "../budget";
import { assetsText, BUILDER_MODEL, type Concept, type DesignBrief, type StageCost } from "./design";
import { FONT_PAIRS, fontPair } from "./kit/fonts";
import type { ImagePrompt } from "./kit/imagery";
import type { FxFlags, PageSpec } from "./kit/types";
import type { Theme } from "./kit/theme";

export type ComposeMode = "standard" | "premium";
export const PREMIUM_MODEL = process.env.ATELIER_PREMIUM_MODEL?.trim() || "claude-opus-5-5";

const MODULES = `MODULY (JSON presne podľa tvarov; "img" = číslo fotky zo zoznamu FOTKY alebo null):
ÚVOD
- hero {"module":"hero","variant":"poster|split|fullbleed|statement|giant|mosaic|blueprint","eyebrow","title","titleAccent","sub","primary":{"label","href"},"secondary":{"label","href"},"img","imgs":[1,2,3],"facts":[{"value","label"}],"meta":{"label","lines":[]},"stripLabels":["popis","pravý popis"],"stamp":{"ring","center"}}
   · poster: obrovský nadpis + pás fotky · split: text + vysoká fotka · fullbleed: fotka na celú obrazovku · statement: bez fotky, grafika
   · giant: OBRIE písmo cez celú šírku, zvýraznené slovo je vyplnené fotkou (vyžaduje img; veľmi výrazné, krátky nadpis) · mosaic: 3 fotky v prekrývajúcej sa mozaike (imgs) · blueprint: animovaný technický výkres (stavebníctvo, architekti; stripLabels = 3 popisky kót)
OBSAH
- ticker {"module":"ticker","items":["3-8 krátkych slov"]}
- index {"module":"index","eyebrow","title","intro","items":[{"title","text","tag"}]}   (zoznam služieb 3-6)
- register {"module":"register","eyebrow","title","rows":[{"title","place","value","unit","go","tag","img"}],"footLabel","filters":["Predaj","Prenájom"]}   (riadky ponúk/projektov; LEN reálne položky; "tag" sa páruje s filters)
- gallery {"module":"gallery","variant":"grid|hscroll","eyebrow","title","items":[{"title","caption","img"}]}   (hscroll = horizontálny posun pripnutý pri scrolle)
- bento {"module":"bento","eyebrow","title","tiles":[{"kind":"stat|text|img|quote","size":"s|m|l|w|t","title","text","value","label","img"}]}   (mozaika dlaždíc 4-7 ks; stat = číslo z faktov)
- steps {"module":"steps","variant":"line|stack","eyebrow","title","steps":[{"title","text"}]}   (stack = karty sa kladú na seba)
- quote {"module":"quote","eyebrow","quote","author","rating":{"value","label"}}   (DOSLOVNÝ citát z Google recenzie z podkladov; rating len ak >= 4,3)
- stats {"module":"stats","items":[{"value","label"}]}   (2-4 čísla LEN z overených faktov)
- about {"module":"about","eyebrow","title","pull","paragraphs":[],"img"}
- team {"module":"team","eyebrow","title","people":[{"name","role","phone","email"}]}   (len ak sú mená v podkladoch)
- faq {"module":"faq","eyebrow","title","items":[{"q","a"}]}
FUNKCIE NA MIERU (interaktívne, fungujú v náhľade)
- calc {"module":"calc","eyebrow","title","intro","priceMin","priceMax","priceDefault","years","rate","note","cta":{"label","href"}}   (kalkulačka splátky: realitné, financie; ceny min/max zvoľ podľa reálnych ponúk z podkladov)
- bodymap {"module":"bodymap","eyebrow","title","intro","areas":[{"id":"neck|shoulder|back|elbow|hip|knee|ankle|head","title","text"}],"cta"}   (klikacia mapa tela: fyzioterapia, masáže, ortopédia; text = ich reálne služby)
- configurator {"module":"configurator","eyebrow","title","intro","groups":[{"label","options":[]}],"submit","href"}   (výber typu práce, rozsahu, termínu; súhrn požiadavky: stavebníctvo, služby)
- booking {"module":"booking","eyebrow","title","intro","days":["Po","Ut"],"slots":["8:30","10:00"],"note","cta"}   (ukážka rezervácie; sloty podľa ich reálnych otváracích hodín)
ZÁVER
- cta {"module":"cta","title","sub","button":{"label","href"}}
- contact {"module":"contact","eyebrow","title","details":[{"label","value","href"}],"form":{"title","fields":[],"submit"}}
- signature {"module":"signature","title","html","css","js"}   (vlastný blok len v prémiovom režime: pozri pravidlá)`;

const NICHES = `ODBORY (čo sa v ich svete oplatí ukázať; vyber, nekopíruj)
- realitné kancelárie: register ponúk s filtrom (Predaj/Prenájom), kalkulačka splátky, hscroll galéria projektov, bento (čísla + recenzia), postup predaja (stack), hero giant/poster/fullbleed
- stavebné firmy a rekonštrukcie: hero blueprint alebo giant, konfigurátor požiadavky, hscroll galéria typov prác/projektov, postup (stack), čísla len z faktov, ticker služieb
- fyzioterapia, zdravie, wellness: hero split/mosaic (ľudské, teplé), mapa tela, rezervácia z otváracích hodín, recenzia, FAQ, o terapeutke
- iné: kombinuj podľa toho, čo firma reálne predáva; ak má malý sortiment, radšej menej sekcií dotiahnutých do detailu`;

function system(mode: ComposeMode): string {
  const premium = mode === "premium";
  return `Si art director a copywriter špičkového dizajnérskeho štúdia (úroveň Locomotive, Studio Freight, Active Theory). Z reálnych podkladov o firme navrhneš NOVÚ DOMOVSKÚ STRÁNKU tak, že vyberieš a vyplníš moduly z hotovej knižnice. HTML ani CSS nepíšeš, to rieši knižnica (odladená, bez chýb v rozložení, s animáciami). Tvoja práca je KONCEPT, DRAMATURGIA, VÝBER MODULOV, POHYB, TÉMA a TEXTY.

CIEĽ: po otvorení návrhu majiteľ povie „toto je presne pre nás, také niečo sme nikde nevideli“. Ak by sa dal návrh použiť pre inú firmu len výmenou loga, je zlý, prerob ho.

POSTUP
1. Nájdi, čím sa táto firma odlišuje (z jej vlastných textov, recenzií a faktov) a postav na tom JEDNU veľkú myšlienku (big_idea) a JEDEN nezabudnuteľný moment (wow_moment: čo návštevník uvidí/zažije/vyskúša, čo si zapamätá).
2. Dramaturgia: poradie sekcií ako príbeh (nie zoznam), každá sekcia iným rozložením. Vyber moduly, ktoré firma reálne potrebuje a ktoré v jej odbore udivia.
3. Pohyb (fx): "calm" = split, counters, progress; "rich" = + parallax, magnetic, spotlight, tilt; "bold" = + cursor, loader. Vyber podľa povahy firmy (právnik: calm, kreatívna/realitná/stavebná: rich alebo bold).
4. Funkcia na mieru: ak sa hodí, zaraď interaktívny modul (kalkulačka, mapa tela, konfigurátor, rezervácia, register s filtrom). Návštevník si ho vyskúša priamo na stránke, to je to, čo predá.
5. Napíš texty: krátke, konkrétne, ľudské, v jazyku firmy.

${MODULES}

${NICHES}

VÝSTUP (jediný JSON objekt, bez markdownu):
{"big_idea":"…","wow_moment":"…","theme":{"font_pair":"id z ponuky","display_case":"none|upper","palette":{"bg","surface","ink","muted","accent","accentInk"},"radius":"sharp|soft|pill","texture":"none|grain|paper|lines|dots","image_treatment":"natural|duotone|mono-hover|warm","density":"airy|tight"},"fx":{"level":"calm|rich|bold"},"generated_images":[{"prompt":"English scene description","aspect":"landscape|portrait|square","quality":"low|medium"}],"title","description","header":{"logoText","nav":[{"label","href"}],"cta":{"label","href"}},"sections":[…],"footer":{"mark","lines":[],"links":[{"label","href"}]}}

PÍSMA (vyber id podľa povahy firmy):
${FONT_PAIRS.map((f) => `- ${f.id}: ${f.feel}`).join("\n")}

PRAVIDLÁ
1. Poradie: hero, (ticker), potom dramaturgia podľa príbehu; contact vždy posledný. ${premium ? "8 až 11" : "6 až 9"} sekcií. Nepoužívaj všetky moduly. Nepoužívaj 2× ten istý typ rozloženia za sebou.
2. Hero variant podľa fotiek a povahy: veľká fotka na šírku → poster/fullbleed/giant; fotka na výšku → split; viac fotiek (aj generovaných) → mosaic; stavebníctvo bez fotiek → blueprint; nič → statement. Nadpis max 9 slov (pri giant max 5), konkrétny a ľudský, "titleAccent" je presný úsek z title.
3. Fotky: používaj IBA čísla zo zoznamu FOTKY (vlastné fotky firmy) a čísla generovaných obrázkov (pozri nižšie). Jednu fotku daj najviac na 2 miesta.
4. GENEROVANÉ OBRÁZKY (${premium ? "0 až 4" : "0 až 1"}): len atmosférické fotografie bez ľudí, textov a značiek (interiér, architektúra, detail materiálu, štúdio, textúra). NIKDY nie "ich" budova ani ľudia. Prompt po anglicky, konkrétny (svetlo, materiál, uhol). Ich čísla nasledujú ZA vlastnými fotkami: ak je vlastných fotiek N, prvý generovaný má číslo N+1, druhý N+2… Použi ich cez "img"/"imgs". Ak vlastných fotiek je dosť, negeneruj nič.
5. PRAVDIVOSŤ: texty, mená, adresy, telefóny, ponuky, čísla, ceny a citáty iba z podkladov. Nevymýšľaj referencie, roky, ocenenia, štatistiky ani ľudí. V kalkulačke sú ceny len rozsah posuvníka, nie ponuka. Ak niečo chýba, modul vynechaj. Hodnotenie Google spomínaj LEN ak je 4,3 a viac.
6. Farby vychádzajú z farieb značky (dolaď ich do prepracovanej, odvážnej palety, kontrast textu min. 4,5:1). Vyhni sa bežnej „modrej korporátnej“ a fialovým prechodom.
7. Texty v jazyku webu (sk alebo cs), krátke a konkrétne, vykanie. Zakázané frázy: „profesionálny prístup“, „komplexné riešenia“, „na mieru vašim potrebám“, „vitajte“, „kvalita a spoľahlivosť“. V textoch nepoužívaj rovné úvodzovky ("), používaj „ “.
8. Href: "#kontakt", "#sekcia" alebo reálny tel:/mailto: z podkladov.
${premium ? `9. SIGNATURE (voliteľné, ale odporúčané v prémiovom režime): jeden vlastný blok, ktorý nemá žiadna šablóna a súvisí s ich odborom (napr. animovaná mapa s kótami, interaktívne meradlo, časová os, vizualizácia). Pravidlá: "html" max 2500 znakov (bez script/iframe/form, bez on*= atribútov, bez externých odkazov), "css" max 2500 znakov (používaj premenné var(--ink), var(--accent), var(--bg), var(--font-d); selektory píš bežne, obalia sa automaticky), "js" max 1800 znakov (vanilla, premenná root = koreň bloku; zakázané fetch, eval, localStorage, innerHTML=, location). Blok musí fungovať aj bez js (základný obsah v html). Nesmie obsahovať vymyslené fakty.` : ""}`;
}

export interface ComposeOutput {
  spec: PageSpec;
  bigIdea: string;
  wow: string;
  fontPairId: string;
  generated: ImagePrompt[];
}

const firstJson = (s: string) => {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Odpoveď neobsahuje JSON.");
  try {
    return JSON.parse(m[0]);
  } catch {
    return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1"));
  }
};

const FX_LEVELS: Record<string, FxFlags> = {
  calm: { split: true, counters: true, progress: true },
  rich: { split: true, counters: true, progress: true, parallax: true, magnetic: true, spotlight: true, tilt: true },
  bold: { split: true, counters: true, progress: true, parallax: true, magnetic: true, spotlight: true, tilt: true, cursor: true, loader: true },
};

export async function composePage(
  client: Anthropic,
  brief: DesignBrief,
  opts: { mode?: ComposeMode; model?: string; concept?: Concept | null; feedback?: string; direction?: string } = {},
  costs: StageCost[],
): Promise<ComposeOutput> {
  const mode = opts.mode ?? "standard";
  const model = opts.model ?? (mode === "premium" ? PREMIUM_MODEL : BUILDER_MODEL);
  const text = [
    opts.concept ? `KONCEPT OD ART DIRECTORA (drž sa ho):\n${JSON.stringify({ big_idea: opts.concept.big_idea, positioning: opts.concept.positioning, tone: opts.concept.tone, palette: opts.concept.palette, hero: opts.concept.hero, signature: opts.concept.signature }, null, 1)}\n` : "",
    opts.direction ? `SMER Z PORADY AGENTOV (zapracuj do témy, výberu modulov a textov):\n${opts.direction}\n` : "",
    `PODKLADY:\n${assetsText(brief)}`,
    opts.feedback ? `\nOPRAVY Z PREDCHÁDZAJÚCEJ VERZIE (zapracuj a zachovaj to, čo bolo dobré):\n${opts.feedback}` : "",
  ].join("\n");
  const call = async (maxTokens: number) => {
    const msg = await createMessage(client, { model, max_tokens: maxTokens, system: system(mode), messages: [{ role: "user", content: text }] });
    costs.push({ stage: opts.feedback ? "skladanie 2" : "skladanie", model, eur: anthropicEur(model, msg.usage), input: msg.usage.input_tokens, output: msg.usage.output_tokens });
    return textFrom(msg);
  };
  const first = mode === "premium" ? 12000 : 8000;
  let raw = await call(first);
  let j: Record<string, unknown>;
  try {
    j = firstJson(raw);
  } catch {
    raw = await call(first * 2);
    j = firstJson(raw);
  }
  const th = (j.theme ?? {}) as Record<string, unknown>;
  const fp = fontPair(String(th.font_pair ?? ""));
  const theme: Partial<Theme> = {
    palette: th.palette as Theme["palette"],
    fonts: {
      display: fp.display,
      body: fp.body,
      href: fp.href,
      displayWeight: fp.displayWeight,
      displayCase: th.display_case === "upper" ? "upper" : "none",
      displayTracking: fp.id === "poster" || fp.id === "bold-round" ? -0.005 : -0.02,
    },
    radius: (["sharp", "soft", "pill"].includes(String(th.radius)) ? th.radius : "sharp") as Theme["radius"],
    texture: (["none", "grain", "paper", "lines", "dots"].includes(String(th.texture)) ? th.texture : "none") as Theme["texture"],
    imageTreatment: (["natural", "duotone", "mono-hover", "warm"].includes(String(th.image_treatment)) ? th.image_treatment : "natural") as Theme["imageTreatment"],
    density: th.density === "tight" ? "tight" : "airy",
  };
  const level = String((j.fx as { level?: string } | undefined)?.level ?? (mode === "premium" ? "rich" : "calm"));
  const generated: ImagePrompt[] = (Array.isArray(j.generated_images) ? (j.generated_images as ImagePrompt[]) : [])
    .filter((g) => g && typeof g.prompt === "string" && g.prompt.length > 10)
    .slice(0, mode === "premium" ? 4 : 1);
  const spec: PageSpec = {
    theme,
    fx: FX_LEVELS[level] ?? FX_LEVELS.calm,
    lang: brief.language.startsWith("cs") ? "cs" : "sk",
    title: String(j.title ?? brief.company),
    description: String(j.description ?? ""),
    header: j.header as PageSpec["header"],
    sections: Array.isArray(j.sections) ? (j.sections as PageSpec["sections"]) : [],
    footer: j.footer as PageSpec["footer"],
  };
  return { spec, bigIdea: String(j.big_idea ?? ""), wow: String(j.wow_moment ?? ""), fontPairId: fp.id, generated };
}
