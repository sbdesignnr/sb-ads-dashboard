import Anthropic from "@anthropic-ai/sdk";
import type { SeoTask } from "@prisma/client";
import { getFile } from "./github";

/**
 * AI web fixes. Each supported check names the exact file to edit and the goal;
 * the model returns the FULL updated file, which we sanity-check before it ever
 * becomes a commit. The real safety net is downstream: a PR the user reviews and
 * a Vercel preview build that fails loudly on broken code.
 */

export interface WebFixSpec {
  file: string;
  goal: string;
}

// Only checks with a clearly-scoped, single-file, additive fix. Everything else
// stays guided/manual — we never let the autopilot touch what it can't do safely.
export const WEB_FIXES: Record<string, WebFixSpec> = {
  "technical:schema-service": {
    file: "app/sluzby/page.tsx",
    goal:
      "Pridaj do stránky Service (schema.org) JSON-LD cez <script type=\"application/ld+json\"> vložený priamo v JSX " +
      "(dangerouslySetInnerHTML). Pre KAŽDÚ z troch služieb (tvorba webov / e-shopy, Meta & Google Ads výkonnostný " +
      "marketing, a tretiu podľa obsahu stránky) vytvor samostatný Service objekt s poľami: name, description (výstižný, " +
      "1 veta), serviceType, areaServed 'SK', a provider ako ProfessionalService s name 'SB Design' a url 'https://www.sbdesign.sk'. " +
      "Zabaľ ich do jedného poľa @graph alebo vlož viac <script> blokov. Nič viditeľné na stránke nemeň — len pridaj schema.",
  },
  "technical:schema-faq": {
    file: "app/sluzby/page.tsx",
    goal:
      "Stránka už zobrazuje FAQ sekciu cez komponent <FAQ />. Pridaj k nej FAQPage (schema.org) JSON-LD cez " +
      "<script type=\"application/ld+json\"> v JSX. Vytvor 5–6 reálnych otázok a odpovedí relevantných pre tvorbu " +
      "webov a online marketing (napr. koľko stojí web, ako dlho trvá, čo potrebujem dodať, robíte aj e-shopy, " +
      "spravujete aj reklamu). Každá odpoveď 2–3 vety, konkrétna, po slovensky. Nič viditeľné nemeň.",
  },
};

export function webAutofixable(checkKey: string): boolean {
  return checkKey in WEB_FIXES;
}

export interface WebFixResult {
  file: string;
  newContent: string;
  summary: string;
}

const SYSTEM = `Si senior Next.js (App Router) + TypeScript inžinier pre web sbdesign.sk.
Dostaneš OBSAH JEDNÉHO SÚBORU a CIEĽ úpravy. Vráť CELÝ upravený súbor — kompletný, skompilovateľný, pripravený na commit.

PRAVIDLÁ:
- Zachovaj VŠETOK existujúci kód a správanie. Rob len to, čo hovorí cieľ. Žiadne nesúvisiace zmeny.
- Nikdy nemeň viditeľný obsah stránky, ak to cieľ nežiada.
- JSON-LD vkladaj cez <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }} />.
- Dodrž existujúci štýl, importy a formátovanie súboru.
- Žiadne TODO, placeholdery ani komentáre typu "sem doplň". Píš finálny kód.
- Vráť VÝHRADNE cez nástroj "uprav_subor" (celý súbor + 1-vetné zhrnutie zmeny po slovensky).`;

export async function generateWebFix(task: Pick<SeoTask, "checkKey">): Promise<WebFixResult> {
  const spec = WEB_FIXES[task.checkKey];
  if (!spec) throw new Error("not_autofixable");

  const current = await getFile(spec.file);
  if (!current) throw new Error(`Súbor ${spec.file} sa nepodarilo načítať z repa.`);

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM,
    tools: [
      {
        name: "uprav_subor",
        description: "Vráť celý upravený súbor a stručné zhrnutie.",
        input_schema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Kompletný upravený obsah súboru." },
            summary: { type: "string", description: "1 veta po slovensky, čo si zmenil." },
          },
          required: ["content", "summary"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "uprav_subor" },
    messages: [
      {
        role: "user",
        content: `SÚBOR: ${spec.file}\n\nCIEĽ: ${spec.goal}\n\n--- AKTUÁLNY OBSAH ---\n${current.content}`,
      },
    ],
  });

  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("AI nevrátila úpravu.");
  const out = block.input as { content?: string; summary?: string };
  const newContent = (out.content ?? "").trim();

  // Guardrails — the human still reviews the PR, but never commit obvious garbage.
  if (!newContent) throw new Error("AI vrátila prázdny súbor.");
  if (newContent === current.content.trim()) throw new Error("AI nevykonala žiadnu zmenu.");
  if (newContent.length < current.content.length * 0.6) {
    throw new Error("Výsledok je podozrivo kratší než originál — odmietam commitnúť.");
  }
  if (/export default/.test(current.content) && !/export default/.test(newContent)) {
    throw new Error("Vo výsledku chýba default export — odmietam commitnúť.");
  }

  return { file: spec.file, newContent, summary: (out.summary ?? "SEO úprava").trim() };
}
