import Anthropic from "@anthropic-ai/sdk";

/**
 * The recommender. It knows who Samuel is (SB Design — web design + performance
 * marketing, solo entrepreneur in Nitra) and builds a *sequenced* path: real,
 * well-known books (so covers resolve), each with a why that speaks to his
 * situation and a concrete "apply this to your business/life". Never repeats what
 * he's already read.
 */

export const CATEGORIES = [
  "biznis",
  "predaj",
  "marketing",
  "zdravie",
  "mindset",
  "produktivita",
  "financie",
] as const;
export type LearningCategory = (typeof CATEGORIES)[number];

export interface BookRec {
  title: string;
  author: string;
  category: LearningCategory;
  why: string;
  howToApply: string;
  takeaways: string[];
  priority: number;
}

export interface RecommendInput {
  alreadyHave: { title: string; author: string; category: string; status: string }[];
  focusAreas: string[]; // subset of CATEGORIES, or empty = balanced
  count: number;
}

const SYSTEM = `Si osobný mentor a kurátor kníh pre Samuela Bibeňa — zakladateľa SB Design (tvorba webov na mieru + výkonnostný online marketing: Meta & Google Ads) z Nitry. Podniká sám, chce rásť ako podnikateľ aj osobne, a vzdelávať sa systematicky.

Tvoja úloha: odporučiť KONKRÉTNE, REÁLNE existujúce knihy (svetovo známe alebo dostupné na SK/CZ trhu), ktoré mu reálne pomôžu. Zostav ich ako POSTUPNOSŤ — od základných k pokročilým, aby na seba nadväzovali.

PRAVIDLÁ PRE VÝBER:
- Len skutočné knihy so správnym názvom a autorom (musia sa dať dohľadať). Radšej známe tituly, nie okrajové.
- Priorita: predaj, marketing, budovanie biznisu a osobná efektivita — to sú jeho páky. Doplň mindset/psychológiu, financie a zdravie (energia = výkon), aby bol rast vyvážený.
- Nikdy neodporúčaj knihu, ktorú už má (dostaneš zoznam).
- Ak dostaneš zvolené oblasti záujmu, drž sa ich; ak nie, urob vyvážený mix.

PRE KAŽDÚ KNIHU:
- "why": 2–3 vety PRIAMO pre Samuela — prečo práve on, práve teraz. Konkrétne, nie všeobecné frázy. Napoj na jeho situáciu (solo podnikateľ, získava klientov cez cold outreach, robí weby a reklamu).
- "howToApply": 2–4 vety s KONKRÉTNYM krokom, ako to zapojiť do SB Design alebo do života. Nie teória — čo reálne spraviť.
- "takeaways": 3–4 hlavné ponaučenia (krátke odrážky).
- "category": presne jedna z: biznis, predaj, marketing, zdravie, mindset, produktivita, financie.
- "priority": poradie v učebnom pláne (nižšie číslo = čítať skôr). Zohľadni logickú nadväznosť a jeho existujúce knihy.

Píš po slovensky (názvy a mená autorov nechaj v origináli). Vráť VÝHRADNE cez nástroj "odporuc_knihy".`;

export async function recommendBooks(input: RecommendInput): Promise<BookRec[]> {
  const client = new Anthropic();
  const have = input.alreadyHave.length
    ? input.alreadyHave.map((b) => `- ${b.title} (${b.author}) [${b.category}, ${b.status}]`).join("\n")
    : "(zatiaľ žiadne)";
  const focus = input.focusAreas.length ? input.focusAreas.join(", ") : "vyvážený mix všetkých oblastí";

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM,
    tools: [
      {
        name: "odporuc_knihy",
        description: "Vráť odporúčané knihy ako pole.",
        input_schema: {
          type: "object",
          properties: {
            books: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  author: { type: "string" },
                  category: { type: "string", enum: [...CATEGORIES] },
                  why: { type: "string" },
                  howToApply: { type: "string" },
                  takeaways: { type: "array", items: { type: "string" } },
                  priority: { type: "number" },
                },
                required: ["title", "author", "category", "why", "howToApply", "takeaways", "priority"],
              },
            },
          },
          required: ["books"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "odporuc_knihy" },
    messages: [
      {
        role: "user",
        content: `Už mám tieto knihy:\n${have}\n\nOblasti záujmu: ${focus}.\n\nOdporuč mi ${input.count} ĎALŠÍCH kníh (žiadne z tých, čo už mám), zoradených ako postupnosť.`,
      },
    ],
  });

  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("AI nevrátila odporúčania.");
  const out = block.input as { books?: BookRec[] };
  return (out.books ?? [])
    .filter((b) => b.title && b.author)
    .map((b) => ({
      ...b,
      category: (CATEGORIES as readonly string[]).includes(b.category) ? b.category : "biznis",
      takeaways: Array.isArray(b.takeaways) ? b.takeaways.slice(0, 5) : [],
    }));
}
