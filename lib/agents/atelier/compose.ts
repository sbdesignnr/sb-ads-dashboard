// Ateliér: skladanie stránky z knižnice modulov. Model vráti len JSON (téma + sekcie s
// obsahom), HTML aj CSS vzniká v kóde (kit) — preto je to lacné (~0,05 €) a bez rozbitého rozloženia.
import Anthropic from "@anthropic-ai/sdk";
import { createMessage, textFrom } from "../../leads/ai";
import { anthropicEur } from "../budget";
import { assetsText, BUILDER_MODEL, type Concept, type DesignBrief, type StageCost } from "./design";
import { FONT_PAIRS, fontPair } from "./kit/fonts";
import type { PageSpec } from "./kit/modules";
import type { Theme } from "./kit/theme";

const COMPOSER_SYSTEM = `Si art director a copywriter špičkového dizajnérskeho štúdia. Z reálnych podkladov o firme navrhneš NOVÚ DOMOVSKÚ STRÁNKU tak, že vyberieš a vyplníš moduly z hotovej knižnice. HTML ani CSS nepíšeš, to rieši knižnica (je odladená, bez chýb v rozložení). Tvoja práca je KONCEPT, VÝBER MODULOV, TÉMA a TEXTY, ktoré z toho urobia jedinečný web pre presne túto firmu a jej odbor, nie šablónu.

MODULY (JSON presne podľa tvarov; "img" = číslo fotky zo zoznamu alebo null):
- hero {"module":"hero","variant":"poster|split|fullbleed|statement","eyebrow","title","titleAccent","sub","primary":{"label","href"},"secondary":{"label","href"},"img","facts":[{"value","label"}]  (0-3, hodnota max 10 znakov: číslo alebo rok, napr. „2004“, „120“; nie vety ani otváracie hodiny),"meta":{"label","lines":[]},"stripLabels":["popis na fotke","pravý popis"],"stamp":{"ring":"text po kruhu, max 28 znakov, napr. Od roku 2004 · Prešov","center":"max 4 znaky, napr. 2004 alebo 4,9"}}  (razítko je voliteľné a vždy len z overených faktov; hodnotenie Google uvádzaj LEN ak je 4,3 a viac, inak ho nespomínaj vôbec)
- ticker {"module":"ticker","items":["3-8 krátkych slov/fráz"]}
- index {"module":"index","eyebrow","title","intro","items":[{"title","text","tag"}]}  (zoznam služieb, 3-6 položiek)
- register {"module":"register","eyebrow","title","rows":[{"title","place","value","unit","go","img"}],"footLabel"}  (riadky ponúk/projektov s veľkým číslom, LEN reálne položky z podkladov)
- gallery {"module":"gallery","eyebrow","title","items":[{"title","caption","img"}]}  (projekty/priestory; bez fotky sa vykreslí grafika)
- steps {"module":"steps","eyebrow","title","steps":[{"title","text"}]}  (postup, 3-4 kroky)
- quote {"module":"quote","eyebrow","quote","author","rating":{"value","label"}}  (DOSLOVNÝ citát z recenzie z podkladov; rating len ak je 4,3 a viac)
- stats {"module":"stats","items":[{"value","label"}]}  (2-4 čísla LEN z overených faktov)
- about {"module":"about","eyebrow","title","pull","paragraphs":[],"img"}
- team {"module":"team","eyebrow","title","people":[{"name","role","phone","email"}]}  (len ak sú mená v podkladoch)
- faq {"module":"faq","eyebrow","title","items":[{"q","a"}]}
- cta {"module":"cta","title","sub","button":{"label","href"}}
- contact {"module":"contact","eyebrow","title","details":[{"label","value","href"}],"form":{"title","fields":[],"submit"}}

VÝSTUP (jediný JSON objekt, bez markdownu):
{"big_idea":"…","theme":{"font_pair":"id z ponuky","display_case":"none|upper","palette":{"bg","surface","ink","muted","accent","accentInk"},"radius":"sharp|soft|pill","texture":"none|grain|paper|lines|dots","image_treatment":"natural|duotone|mono-hover|warm","density":"airy|tight"},"title":"<title stránky>","description":"…","header":{"logoText","nav":[{"label","href"}],"cta":{"label","href"}},"sections":[…],"footer":{"mark","lines":[],"links":[{"label","href"}]}}

PÍSMA (vyber id podľa povahy firmy):
${FONT_PAIRS.map((f) => `- ${f.id}: ${f.feel}`).join("\n")}

PRAVIDLÁ
1. Poradie: hero, (ticker), hlavný obsah (register | gallery | index), steps, quote/stats, about/team, cta, contact (vždy posledný). 6 až 9 sekcií. Nepoužívaj všetky moduly, vyber to, čo firma reálne má a čo je preň silné. Každá stránka má vyzerať inak.
2. Hero variant podľa fotiek: fotka na šírku a veľká → "poster" alebo "fullbleed"; fotka na výšku → "split"; žiadna použiteľná fotka → "statement" (grafika). Nadpis max 9 slov, konkrétny a ľudský (nie fráza), "titleAccent" je presný úsek z title, ktorý sa zvýrazní.
3. Fotky: používaj IBA čísla zo zoznamu FOTKY; nikdy nepoužívaj číslo, ktoré tam nie je. Jednu fotku daj najviac na 2 miesta. Ak fotiek niet, všade img=null.
4. PRAVDIVOSŤ: texty, mená, adresy, telefóny, ponuky, čísla a citáty iba z podkladov. Nevymýšľaj referencie, roky, ocenenia, štatistiky, ceny ani ľudí. Ak niečo chýba, modul vynechaj.
5. Farby vychádzajú z farieb značky (dolaď ich do prepracovanej palety, kontrast textu min. 4,5:1); pozadie môže byť svetlé aj tmavé. Zvoľ odvážnu, ale vkusnú kombináciu.
6. Texty v jazyku webu (sk alebo cs), krátke a konkrétne. Zakázané frázy: "profesionálny prístup", "komplexné riešenia", "na mieru vašim potrebám", "vitajte". Vykanie.
7. V textoch nepoužívaj rovné úvodzovky ("), používaj „ “.
8. Href: "#kontakt", "#sekcia" alebo reálny tel:/mailto: z podkladov. Nič iné.`;

export interface ComposeOutput {
  spec: PageSpec;
  bigIdea: string;
  fontPairId: string;
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

export async function composePage(
  client: Anthropic,
  brief: DesignBrief,
  opts: { model?: string; concept?: Concept | null; feedback?: string } = {},
  costs: StageCost[],
): Promise<ComposeOutput> {
  const model = opts.model ?? BUILDER_MODEL;
  const text = [
    opts.concept ? `KONCEPT OD ART DIRECTORA (drž sa ho, ale voľ moduly a texty podľa podkladov):\n${JSON.stringify({ big_idea: opts.concept.big_idea, positioning: opts.concept.positioning, tone: opts.concept.tone, palette: opts.concept.palette, hero: opts.concept.hero, signature: opts.concept.signature }, null, 1)}\n` : "",
    `PODKLADY:\n${assetsText(brief)}`,
    opts.feedback ? `\nOPRAVY Z PREDCHÁDZAJÚCEJ VERZIE (zapracuj):\n${opts.feedback}` : "",
  ].join("\n");
  const call = async (maxTokens: number) => {
    const msg = await createMessage(client, { model, max_tokens: maxTokens, system: COMPOSER_SYSTEM, messages: [{ role: "user", content: text }] });
    costs.push({ stage: opts.feedback ? "skladanie 2" : "skladanie", model, eur: anthropicEur(model, msg.usage), input: msg.usage.input_tokens, output: msg.usage.output_tokens });
    return textFrom(msg);
  };
  let raw = await call(7000);
  let j: Record<string, unknown>;
  try {
    j = firstJson(raw);
  } catch {
    raw = await call(14000);
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
  const spec: PageSpec = {
    theme,
    lang: brief.language.startsWith("cs") ? "cs" : "sk",
    title: String(j.title ?? brief.company),
    description: String(j.description ?? ""),
    header: j.header as PageSpec["header"],
    sections: Array.isArray(j.sections) ? (j.sections as PageSpec["sections"]) : [],
    footer: j.footer as PageSpec["footer"],
  };
  return { spec, bigIdea: String(j.big_idea ?? ""), fontPairId: fp.id };
}
