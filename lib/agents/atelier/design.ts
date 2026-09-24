// Ateliér: návrh domovskej stránky na mieru — (1) art direction, (2) stavba, (3) kritika zo
// screenshotu a (4) oprava. Všetko z REÁLNYCH podkladov firmy; nič sa nevymýšľa.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../../leads/ai";
import { anthropicEur } from "../budget";
import type { SiteAssets } from "./harvest";

export const DIRECTOR_MODEL = process.env.ATELIER_DIRECTOR_MODEL?.trim() || "claude-opus-5-5";
export const BUILDER_MODEL = process.env.ATELIER_BUILDER_MODEL?.trim() || "claude-sonnet-5";
export const CRITIC_MODEL = process.env.ATELIER_CRITIC_MODEL?.trim() || "claude-sonnet-5";

export interface DesignBrief {
  company: string;
  city: string | null;
  niche: string;
  language: string;
  /** overené fakty, ktoré smú byť na stránke (napr. "Google: 4,6 z 5, 1 222 recenzií") */
  facts: string[];
  /** čo o firme vieme z výskumu (zistenia, ponuka) — pre koncept */
  research: string;
  assets: SiteAssets;
}

export interface Concept {
  big_idea: string;
  positioning: string;
  tone: string[];
  archetype: string;
  palette: { bg: string; surface: string; ink: string; muted: string; accent: string; accent_ink: string };
  typography: { display: string; body: string; display_style: string; google_fonts_href: string };
  hero: { headline: string; subline: string; cta_primary: string; cta_secondary: string; composition: string };
  sections: { id: string; title: string; purpose: string; layout: string }[];
  imagery: string;
  signature: string[];
}

export interface StageCost {
  stage: string;
  model: string;
  eur: number;
  input: number;
  output: number;
}

const GENERIC_TELLS = `ZAKÁZANÉ "AI šablónové" prvky (ak ich použiješ, návrh je zlý):
- fialovo-modré/indigo prechody, glassmorphism, rozmazané farebné škvrny v pozadí, neónové žiary
- tri rovnaké karty s ikonkami v rade ("Naše služby"), emoji ako ikony, ikonky v kruhu
- všetko vycentrované, hero s malým nadpisom a dvoma tlačidlami uprostred, generické "Vitajte na našej stránke"
- fonty Inter/Roboto/Poppins/Montserrat ako jediná typografia, nadpisy do 48 px
- vymyslené štatistiky, vymyslené referencie, lorem ipsum, stock frázy ("inovatívne riešenia", "na mieru vašim potrebám")
- zaoblené karty s tieňom všade, rovnaké odsadenia všade, žiadny rytmus`;

const DIRECTOR_SYSTEM = `Si art director špičkového dizajnérskeho štúdia (úroveň Locomotive, Studio Freight, Pentagram). Dostaneš reálne podklady o firme a jej súčasný web. Vymysli KONCEPT nového webu, ktorý vyzerá ako ručná práca dizajnéra na mieru pre PRÁVE TÚTO firmu a jej odbor, nie ako šablóna.

Ako uvažuješ:
1. Nájdi, čím sa táto firma odlišuje (z jej vlastných textov a overených faktov) a postav na tom jednu výraznú myšlienku (big_idea). Nie "moderný a profesionálny", ale konkrétna vizuálna a slovná stávka.
2. Vyber kompozičný archetyp, ktorý sedí obsahu (nie vždy ten istý): editorial-split, full-bleed-statement, typographic-poster, gallery-first, magazine-grid, timeline-story, bento.
3. Farby: vychádzaj z farieb ich značky (logo/CSS). Ak sú slabé, dolaď ich do prepracovanej palety (bg, surface, ink, muted, accent, accent_ink), vždy s kontrastom min. 4.5:1 pre text.
4. Typografia: dva konkrétne fonty z Google Fonts s charakterom (display + body), s presným popisom štýlu (napr. "úzka serifová kurzíva 120 px, tesné riadkovanie 0.95"). Vráť aj hotový odkaz google_fonts_href (https://fonts.googleapis.com/css2?family=...&display=swap).
5. Hero: konkrétny nadpis (max 9 slov, v jazyku firmy, konkrétny a ľudský, nie fráza), podnadpis, dve CTA a presný popis kompozície.
6. Sekcie (5 až 7): poradie a obsah podľa toho, čo firma reálne má (služby, ponuky, referencie, tím, recenzie, kontakt). Ku každej layout (nie "karty").
7. Fotky: použiješ IBA tie dodané (URL). Povedz kde a ako (orez, prekrytie, maska). Ak fotiek je málo, nahraď ich typografiou, farebnými plochami, SVG vzormi a čislovaním, nie vymyslenými fotkami.
8. Signature: 3 rozpoznateľné detaily (napr. číslovanie 01/, tenké linky, ticker, obrovské číslice, vodorovný posun).

${GENERIC_TELLS}

Vo vnútri textových hodnôt NEPOUŽÍVAJ rovné úvodzovky ("), používaj slovenské „ “. BUĎ STRUČNÝ: každé textové pole max 2 vety, sekcií max 5 (layout max 40 slov), imagery max 3 vety. Odpovedz VÝHRADNE jedným JSON objektom bez markdownu s poľami: big_idea, positioning, tone (3 slová), archetype, palette{bg,surface,ink,muted,accent,accent_ink}, typography{display,body,display_style,google_fonts_href}, hero{headline,subline,cta_primary,cta_secondary,composition}, sections[{id,title,purpose,layout}], imagery, signature[].`;

const BUILDER_SYSTEM = `Si senior front-end dizajnér. Podľa hotového konceptu postavíš KOMPLETNÚ domovskú stránku ako jeden HTML súbor. Výsledok musí vyzerať ako drahý, ručne navrhnutý web, nie šablóna.

ROZSAH (dôležité, cena rastie s dĺžkou): stavaš UKÁŽKU domovskej stránky = hlavička + hero + 3 najdôležitejšie sekcie z konceptu + pätička. Celý súbor MAX ~22 000 znakov: CSS stručné a bez opakovania, žiadne zbytočné komentáre, texty krátke. Radšej menej sekcií dotiahnutých do detailu než veľa hrubých.

Technické pravidlá:
- Jeden súbor: <!doctype html>, všetko CSS v <style>, fonty cez <link> z Google Fonts (odkaz dáva koncept), vanilla JS iba drobný (sticky hlavička, hover, ticker); obsah musí byť viditeľný aj bez JS.
- Desktop-first 1440 px, plne responzívne (breakpointy 1024, 720; na 390 px čitateľné a bez horizontálneho posunu). Fluid typografia cez clamp(), CSS grid s 12 stĺpcami, max-width kontajnera ~1320 px, rytmus po 8 px.
- Hero nadpis veľký (clamp(56px, 8.4vw, 136px)), tesné riadkovanie 0.92 až 1.0, výrazný kontrast veľkostí (ďalšia úroveň max ~1/4 hero). Popisky v malých veľkých písmenách s rozstupom.
- Asymetria, prekrývanie, jemné tenké linky, číslovanie sekcií, aspoň jedna sekcia s neobvyklým rozložením. Vlastné hover/focus stavy, plynulé prechody.
- Fotky: iba dodané URL cez <img> s object-fit, alt texty, rozumné orezy (aspect-ratio). Ak fotiek nie je dosť, vytvor vizuálnu silu typografiou, farebnými plochami a SVG vzormi. Žiadne cudzie ani vymyslené fotky.
- Obsah: nadpisy a texty v jazyku firmy, konkrétne a stručné. Použi ich reálne služby, ponuky, kontakty (telefón, e-mail, adresa) ZO ZADANIA. Čísla a tvrdenia iba z FAKTOV. Bez lorem ipsum, bez vymyslených referencií a štatistík.
- Navigácia z ich reálneho menu (max 6 položiek), pätička s reálnym kontaktom a jemným riadkom "Návrh pripravil SB Design".

${GENERIC_TELLS}

Odpovedz VÝHRADNE kompletným HTML dokumentom (od <!doctype html> po </html>), bez vysvetlenia a bez markdownu.`;

const CRITIC_SYSTEM = `Si prísny kreatívny riaditeľ, ktorý hodnotí návrh domovskej stránky podľa screenshotov (desktop po častiach, potom mobil). Hľadaš to, čo by odhalilo, že ide o AI šablónu, a technické chyby.

Posudzuj: hierarchiu a rytmus, typografiu (mierka, kontrast, čitateľnosť), farby a kontrast textu, prácu s obrázkami (rozmazané, natiahnuté, chýbajúce), medzery a zarovnanie, polish detailov, originalitu, chyby (prekrývanie textu, orezaný text, horizontálny posun, prázdne miesta, rozbité obrázky), mobilnú verziu.

Odpovedz VÝHRADNE JSON: {"score": číslo 1-10, "generic_tells": ["…"], "issues": [{"area":"…","problem":"…","fix":"konkrétna zmena v CSS/HTML"}], "verdict": "jedna veta"}. Max 8 problémov, zoradených podľa dopadu. Buď konkrétny a stručný.`;

const REFINER_SYSTEM = `Si senior front-end dizajnér. Dostaneš HTML návrh a zoznam problémov od kreatívneho riaditeľa. Oprav ich cielenými zmenami: vráť VÝHRADNE JSON pole {"find": "presný úsek z HTML", "replace": "nový úsek"} (žiadny markdown). "find" musí byť doslovný a unikátny úsek z dodaného HTML (5 až 400 znakov), "replace" jeho nová verzia. Max 12 zmien, zoradené podľa dopadu. Zachovaj koncept, farby, fonty a texty, nič vymyslené nepridávaj. Prístup: radšej niekoľko silných zmien v CSS (veľkosti, medzery, kontrast, zarovnanie) než kozmetika. Do "find"/"replace" nepoužívaj rovné úvodzovky bez escapovania.`;

const firstJson = (s: string) => {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Odpoveď neobsahuje JSON.");
  try {
    return JSON.parse(m[0]);
  } catch {
    // časté chyby: koncové čiarky a rovné úvodzovky vo vnútri textu
    return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1"));
  }
};

/**
 * JSON od modelu. Ak je odpoveď neplatná (najčastejšie zrezaná na max_tokens, lebo skryté
 * "premýšľanie" novších modelov sa počíta do limitu), zopakuje sa s dvojnásobným limitom.
 */
async function jsonCall<T>(
  client: Anthropic,
  stage: string,
  model: string,
  system: string,
  content: Anthropic.MessageParam["content"],
  maxTokens: number,
  costs: StageCost[],
): Promise<T> {
  let raw = await call(client, stage, model, system, content, maxTokens, costs);
  try {
    return firstJson(raw) as T;
  } catch {
    raw = await call(client, `${stage} (opakovanie)`, model, system, content, maxTokens * 2, costs);
    return firstJson(raw) as T;
  }
}

const stripHtml = (s: string) => {
  const m = s.match(/<!doctype html[\s\S]*<\/html>/i);
  if (!m) throw new Error("Odpoveď neobsahuje kompletný HTML dokument.");
  return m[0];
};

export function assetsText(b: DesignBrief): string {
  const a = b.assets;
  return [
    `FIRMA: ${b.company}${b.city ? `, ${b.city}` : ""} | odbor: ${b.niche} | jazyk webu: ${b.language}`,
    `SÚČASNÝ WEB: ${a.url} | title: ${a.title}`,
    a.description && `Popis: ${a.description}`,
    `Menu: ${a.nav.join(" | ")}`,
    `Nadpisy na webe: ${a.headings.slice(0, 16).join(" | ")}`,
    `Texty (výber): ${a.paragraphs.slice(0, 6).join(" ¶ ")}`,
    `Kontakt: tel ${a.contact.phones.join(", ") || "—"}; e-mail ${a.contact.emails.join(", ") || "—"}; adresa ${a.contact.address ?? "—"}; sociálne siete: ${a.social.join(", ") || "—"}`,
    `Farby značky (z loga a CSS): ${a.colors.join(", ") || "nezistené"}${a.themeColor ? ` | theme-color ${a.themeColor}` : ""}`,
    `Logo (URL): ${a.logo ?? "nezistené"}`,
    `Dostupné FOTKY (číslo, rozmer, alt; číslo sa používa ako "img"):\n${a.images.map((i, n) => `  ${n + 1}. ${i.w}x${i.h} ${i.w >= i.h ? "na šírku" : "na výšku"}${i.alt ? ` | ${i.alt}` : ""}`).join("\n") || "  ŽIADNE použiteľné fotky (použi grafiku, nie fotky)"}${a.logos.length ? `\n(Loga/odznaky na webe sú len ${a.logos.length}, NIE sú fotky a nepoužívajú sa ako "img".)` : ""}`,
    `OVERENÉ FAKTY (smú byť na stránke):\n${b.facts.map((f) => `  - ${f}`).join("\n") || "  (žiadne)"}`,
    b.research && `VÝSKUM O FIRME:\n${b.research}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function call(
  client: Anthropic,
  stage: string,
  model: string,
  system: string,
  content: Anthropic.MessageParam["content"],
  maxTokens: number,
  costs: StageCost[],
): Promise<string> {
  const msg = await createMessage(client, { model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] });
  costs.push({
    stage,
    model,
    eur: anthropicEur(model, msg.usage),
    input: msg.usage.input_tokens,
    output: msg.usage.output_tokens,
  });
  const text = textFrom(msg);
  if (process.env.ATELIER_DEBUG_DIR) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${process.env.ATELIER_DEBUG_DIR}/raw-${stage.replace(/\W+/g, "_")}-${costs.length}.txt`, text);
  }
  return text;
}

export async function directDesign(
  client: Anthropic,
  brief: DesignBrief,
  currentSiteShot: string | null,
  costs: StageCost[],
): Promise<Concept> {
  const content: Anthropic.MessageParam["content"] = [];
  if (currentSiteShot)
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: currentSiteShot } });
  content.push({ type: "text", text: `${currentSiteShot ? "Obrázok je súčasný web firmy.\n\n" : ""}${assetsText(brief)}` });
  return jsonCall<Concept>(client, "koncept", DIRECTOR_MODEL, DIRECTOR_SYSTEM, content, 5000, costs);
}

export async function buildPage(client: Anthropic, brief: DesignBrief, concept: Concept, costs: StageCost[]): Promise<string> {
  const text = `KONCEPT:\n${JSON.stringify(concept, null, 1)}\n\nPODKLADY:\n${assetsText(brief)}`;
  const out = await call(client, "stavba", BUILDER_MODEL, BUILDER_SYSTEM, text, 14000, costs);
  return stripHtml(out);
}

export interface Critique {
  score: number;
  generic_tells: string[];
  issues: { area: string; problem: string; fix: string }[];
  verdict: string;
}

export async function critiquePage(
  client: Anthropic,
  desktop: { base64: string; label: string }[],
  mobile: { base64: string; label: string }[],
  costs: StageCost[],
): Promise<Critique> {
  const content: Anthropic.MessageParam["content"] = [];
  for (const s of [...desktop, ...mobile]) {
    content.push({ type: "text", text: `Screenshot: ${s.label}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.base64 } });
  }
  content.push({ type: "text", text: "Vyhodnoť návrh." });
  return jsonCall<Critique>(client, "kritika", CRITIC_MODEL, CRITIC_SYSTEM, content, 1800, costs);
}

export async function refinePage(client: Anthropic, html: string, critique: Critique, costs: StageCost[]): Promise<{ html: string; applied: number; skipped: number }> {
  const text = `PROBLÉMY OD KREATÍVNEHO RIADITEĽA:\n${critique.issues.map((i, n) => `${n + 1}. [${i.area}] ${i.problem} → ${i.fix}`).join("\n")}\n\nAJ TIETO "AI" ZNAKY ODSTRÁŇ: ${critique.generic_tells.join("; ") || "—"}\n\nHTML:\n${html}`;
  const out = await call(client, "oprava", BUILDER_MODEL, REFINER_SYSTEM, text, 5000, costs);
  const m = out.match(/\[[\s\S]*\]/);
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
