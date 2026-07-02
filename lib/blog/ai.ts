import Anthropic from "@anthropic-ai/sdk";

export interface MetaSuggestions {
  titles: string[];
  descriptions: string[];
}

export interface FullArticle {
  title: string; // refined H1 / page title
  metaTitle: string; // 50-60 chars
  metaDescription: string; // 150-160 chars
  slug: string; // kebab-case, ASCII
  imageAlt: string;
  excerpt: string; // 1-2 sentence intro/summary
  content: string; // Markdown body starting at H2 (no H1)
  targetKeyword: string; // the keyword the article is optimized for
}

const ARTICLE_SYSTEM = `Si špičkový slovenský copywriter a SEO stratég pre SB Design (tvorba webov a online marketing). Píšeš články, ktoré čitateľovi REÁLNE pomôžu a zároveň rankujú v Google vyššie než konkurencia. Cieľ: dobyť konkurenciu kvalitou a užitočnosťou.

ĽUDSKÝ ŠTÝL (kriticky dôležité — nesmie to znieť ako AI):
- Píš priamo, konkrétne a s reálnymi príkladmi zo slovenského trhu. Konverzačný, ale odborný tón.
- ZAKÁZANÉ klišé a výplň: "v dnešnej digitálnej dobe", "nie je žiadnym tajomstvom", "v dnešnej uponáhľanej dobe", "predstavte si", prázdne úvody. Žiadne generické frázy, žiadne opakovanie.
- Striedaj dĺžku viet, používaj konkrétne čísla, príklady, mini-návody. Krátke odseky (2–4 vety). Skenovateľné.
- Expertíza a dôveryhodnosť (E-E-A-T): reálne rady, ktoré vie autor obhájiť. Žiadne vágne všeobecnosti.

SEO ŠTRUKTÚRA (dodrž PRESNE — inak článok neprejde SEO kontrolou):
- Cieľové kľúčové slovo použi DOSLOVNE (rovnaké slová) na týchto miestach: v titulku (title), v PRVOM odseku tela, aspoň v jednom H2 nadpise, v metaTitle aj v metaDescription. V tele ho zopakuj celkovo 3–5× prirodzene (hustota ~1 %). Žiadny keyword stuffing.
- metaTitle musí mať 50–60 znakov a začínať kľúčovým slovom. metaDescription 150–160 znakov a obsahovať kľúčové slovo + jemné CTA.
- H2 (##) sekcie logicky podľa vyhľadávacieho zámeru; kde dáva zmysel, pridaj H3 (###) pododdiely.
- Na začiatku krátky odsek, ktorý priamo odpovie na hlavnú otázku (vhodné na featured snippet).
- Používaj odrážky a číslované zoznamy tam, kde pomáhajú. Kde vhodné, pridaj krátku porovnávaciu alebo "checklist" časť.
- POVINNE pred záverom pridaj sekciu presne s nadpisom "## Často kladené otázky" a 3–4 reálnymi otázkami (každá ako "### Otázka?" + stručná odpoveď) — pomáha to v Google (People Also Ask).
- Zakonči prirodzeným, nenásilným CTA na SB Design (bez tvrdého predaja).
- Dĺžka tela cca 1200–1700 slov (radšej dôkladnejšie). NEPÍŠ H1 (titulok je samostatný). Vráť Markdown.

Výsledok vlož VÝHRADNE cez nástroj "uloz_clanok".`;

const ARTICLE_TOOL: Anthropic.Tool = {
  name: "uloz_clanok",
  description: "Uloží hotový SEO článok a jeho meta údaje.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Vylepšený titulok/H1 (50–65 znakov, s kľúčovým slovom)" },
      metaTitle: { type: "string", description: "Meta title 50–60 znakov, kľúčové slovo na začiatku" },
      metaDescription: { type: "string", description: "Meta description 150–160 znakov, kľúčové slovo + CTA" },
      slug: { type: "string", description: "URL slug: kebab-case, bez diakritiky, krátky, s kľúčovým slovom" },
      imageAlt: { type: "string", description: "Popisný alt text k titulnému obrázku (s kľúčovým slovom)" },
      excerpt: { type: "string", description: "1–2 vety zhrnutie/úvod pre výpis a OG popis" },
      content: { type: "string", description: "Telo článku v Markdowne, začína H2 (bez H1), s H3, zoznamami a FAQ sekciou" },
      targetKeyword: { type: "string", description: "Presné cieľové kľúčové slovo, na ktoré je článok optimalizovaný" },
    },
    required: ["title", "metaTitle", "metaDescription", "slug", "imageAlt", "excerpt", "content", "targetKeyword"],
  } as Anthropic.Tool.InputSchema,
};

/** Trim to a word boundary within `max` chars; optionally pad a short title with a brand suffix. */
function clampMeta(s: string, max: number): string {
  s = s.trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:–-]+$/, "").trim();
}

function metaTitleFit(s: string): string {
  const t = clampMeta(s, 60);
  // Nudge a too-short title into the ideal 50–60 range with a clean brand suffix.
  if (t.length < 50 && `${t} – SB Design`.length <= 60) return `${t} – SB Design`;
  return t;
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** Generate a complete, SEO-optimized, human-sounding article from a topic. */
export async function generateFullArticle(input: {
  title: string;
  targetKeyword?: string;
  reason?: string;
  outline?: string[];
  category?: string;
}): Promise<FullArticle> {
  const client = new Anthropic();
  const outline = (input.outline ?? []).filter(Boolean);
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4500,
    system: ARTICLE_SYSTEM,
    tools: [ARTICLE_TOOL],
    tool_choice: { type: "tool", name: "uloz_clanok" },
    messages: [
      {
        role: "user",
        content: `Téma článku: ${input.title}
Cieľové kľúčové slovo: ${input.targetKeyword || "(neuvedené — vyber vhodné z témy)"}
${input.category ? `Kategória: ${input.category}\n` : ""}${input.reason ? `Prečo je téma relevantná teraz: ${input.reason}\n` : ""}${
          outline.length ? `Navrhovaná osnova (H2):\n${outline.map((h) => `- ${h}`).join("\n")}\n` : ""
        }
Napíš kompletný, hotový článok pripravený na publikáciu.`,
      },
    ],
  });
  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const a = (block?.input ?? {}) as Partial<FullArticle>;
  const title = (a.title || input.title).trim();
  return {
    title,
    metaTitle: metaTitleFit(a.metaTitle || title),
    metaDescription: clampMeta(a.metaDescription || a.excerpt || "", 160),
    slug: asciiSlug(a.slug || title),
    imageAlt: (a.imageAlt || title).trim(),
    excerpt: (a.excerpt || "").trim(),
    content: (a.content || "").trim(),
    targetKeyword: (input.targetKeyword || a.targetKeyword || "").trim(),
  };
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

const META_SYSTEM = `Si SEO copywriter pre slovenský trh. Vytváraš meta tagy optimalizované zároveň pre preklik (CTR) aj pre vyhľadávače.

Vráť VÝLUČNE platný JSON (žiadny text navyše, žiadne markdown fences):
{"titles":["...","...","..."],"descriptions":["...","...","..."]}

Pravidlá:
- 3 varianty meta title: každý 50–60 znakov, obsahuje cieľové kľúčové slovo (ideálne na začiatku), je konkrétny a lákavý na klik.
- 3 varianty meta description: každý 150–160 znakov, obsahuje kľúčové slovo a jasnú výzvu k akcii (CTA).
- Píš po slovensky, prirodzene, bez klišé a bez prehnaných superlatívov.`;

export async function generateMeta(input: {
  title?: string;
  content: string;
  targetKeyword?: string;
}): Promise<MetaSuggestions> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: META_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Cieľové kľúčové slovo: ${input.targetKeyword || "(neuvedené)"}
Názov článku: ${input.title || "(neuvedený)"}

Obsah článku:
${input.content.slice(0, 4000)}`,
      },
    ],
  });
  const parsed = parseJsonObject(textOf(msg));
  return {
    titles: asStrings(parsed?.titles).slice(0, 3),
    descriptions: asStrings(parsed?.descriptions).slice(0, 3),
  };
}

const REWRITE_SYSTEM = `Si skúsený SEO editor. Prepíš a vylepši dodaný text. Zachovaj jazyk (slovenčina), pôvodný význam a Markdown formátovanie. Zlepši čitateľnosť, štylistiku a (ak je to prirodzené) SEO. Vráť IBA prepísaný text — bez úvodzoviek, bez vysvetlení.`;

export async function rewriteText(input: {
  text: string;
  instruction?: string;
  targetKeyword?: string;
  title?: string;
}): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: REWRITE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${input.title ? `Článok: ${input.title}\n` : ""}${
          input.targetKeyword ? `Cieľové kľúčové slovo: ${input.targetKeyword}\n` : ""
        }Inštrukcia: ${input.instruction?.trim() || "Vylepši čitateľnosť, štylistiku a SEO. Kľúčové slovo zapracuj len prirodzene."}

Text na vylepšenie:
"""
${input.text.slice(0, 6000)}
"""`,
      },
    ],
  });
  return textOf(msg)
    .trim()
    .replace(/^"""\s*/, "")
    .replace(/\s*"""$/, "")
    .trim();
}

const DRAFT_SYSTEM = `Si SEO copywriter pre SB Design (tvorba webových stránok a online marketing, slovenský trh). Napíš ZAČIATOČNÝ koncept článku v Markdowne, ŠPECIFICKÝ pre zadanú tému (nie generický).

Pravidlá:
- Začni krátkym úvodom (2–3 vety), ktorý prirodzene obsahuje kľúčové slovo.
- Použi H2 (##) podnadpisy podľa zadanej osnovy; pod každý napíš 1–2 úvodné odseky, ktoré autor rozšíri.
- Nepíš H1 (názov článku je samostatný), nepíš meta tagy.
- Prirodzene zapracuj kľúčové slovo, žiadny keyword stuffing.
- Vráť IBA Markdown obsah.`;

export async function generateDraftFromGap(input: {
  title: string;
  targetKeyword?: string;
  reason?: string;
  outline?: string[];
}): Promise<string> {
  const client = new Anthropic();
  const outline = (input.outline ?? []).filter(Boolean);
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Téma článku: ${input.title}
Cieľové kľúčové slovo: ${input.targetKeyword || "(neuvedené)"}
${input.reason ? `Prečo je téma relevantná: ${input.reason}\n` : ""}${
          outline.length ? `Navrhovaná osnova (H2):\n${outline.map((h) => `- ${h}`).join("\n")}\n` : ""
        }
Napíš koncept článku.`,
      },
    ],
  });
  return textOf(msg).trim();
}
