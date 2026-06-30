import Anthropic from "@anthropic-ai/sdk";

export interface MetaSuggestions {
  titles: string[];
  descriptions: string[];
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
