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
  title: string; // názov vydania, ktoré má čítať (SK/CZ ak existuje preklad)
  titleOriginal: string; // pôvodný (anglický) názov — na dohľadanie obálky
  language: "SK" | "CZ" | "en";
  author: string;
  category: LearningCategory;
  why: string;
  howToApply: string;
  takeaways: string[];
  priority: number;
}

export interface RecommendInput {
  alreadyHave: {
    title: string;
    author: string;
    category: string;
    status: string;
  }[];
  focusAreas: string[]; // subset of CATEGORIES, or empty = balanced
  count: number;
}

const SYSTEM = `Si osobný mentor a kurátor kníh pre Samuela Bibeňa — zakladateľa SB Design (tvorba webov na mieru + výkonnostný online marketing: Meta & Google Ads) z Nitry. Podniká sám, chce rásť ako podnikateľ aj osobne, a vzdelávať sa systematicky.

Tvoja úloha: odporučiť KONKRÉTNE, REÁLNE existujúce knihy (svetovo známe alebo dostupné na SK/CZ trhu), ktoré mu reálne pomôžu. Zostav ich ako POSTUPNOSŤ — od základných k pokročilým, aby na seba nadväzovali.

PRAVIDLÁ PRE VÝBER:
- Len skutočné knihy so správnym názvom a autorom (musia sa dať dohľadať). Radšej známe tituly, nie okrajové.
- Samuel číta po SLOVENSKY alebo ČESKY. Preto SILNE preferuj svetovo NAJZNÁMEJŠIE bestsellery, ktoré majú overený slovenský alebo český preklad — klasiky ako Atomic Habits, Rich Dad Poor Dad, How to Win Friends and Influence People, Influence, The 7 Habits, The Psychology of Money, Start with Why, Deep Work, Thinking Fast and Slow, The 4-Hour Workweek, Zero to One, Good to Great, The Lean Startup a podobné. Vyhýbaj sa okrajovým anglickým titulom bez prekladu (Traction, The 12 Week Year, Spark…), pokiaľ nie sú vyslovene nenahraditeľné.
- Priorita: predaj, marketing, budovanie biznisu a osobná efektivita — to sú jeho páky. Doplň mindset/psychológiu, financie a zdravie (energia = výkon), aby bol rast vyvážený.
- Nikdy neodporúčaj knihu, ktorú už má (dostaneš zoznam).
- Ak dostaneš zvolené oblasti záujmu, drž sa ich; ak nie, urob vyvážený mix.

JAZYK VYDANIA (dôležité):
- "title" = názov PREKLADOVÉHO vydania. Ak existuje ČESKÝ preklad, uprednostni ČESKÝ názov (má oveľa lepšie pokrytie a obálky, a slovenský čitateľ číta české bez problémov). Slovenský názov daj len ak český preklad neexistuje a slovenský áno. Ak preklad neexistuje vôbec, daj pôvodný názov.
- "language" = "CZ" pri českom názve, "SK" pri slovenskom, "en" ak iba originál.
- "titleOriginal" = VŽDY pôvodný (najčastejšie anglický) názov knihy — slúži na dohľadanie obálky.
- Uvádzaj len preklady, o ktorých reálne vieš, že existujú. Nevymýšľaj názvy prekladov — ak si nie si istý, daj "en".

PRE KAŽDÚ KNIHU:
- "why": 2–3 vety PRIAMO pre Samuela — prečo práve on, práve teraz. Konkrétne, nie všeobecné frázy. Napoj na jeho situáciu (solo podnikateľ, získava klientov cez cold outreach, robí weby a reklamu).
- "howToApply": 2–4 vety s KONKRÉTNYM krokom, ako to zapojiť do SB Design alebo do života. Nie teória — čo reálne spraviť.
- "takeaways": 3–4 hlavné ponaučenia (krátke odrážky).
- "category": presne jedna z: biznis, predaj, marketing, zdravie, mindset, produktivita, financie.
- "priority": poradie v učebnom pláne (nižšie číslo = čítať skôr). Zohľadni logickú nadväznosť a jeho existujúce knihy.

Píš po slovensky (názvy a mená autorov nechaj v origináli). Vráť VÝHRADNE cez nástroj "odporuc_knihy".`;

export interface BookDescription {
  category: LearningCategory;
  why: string;
  howToApply: string;
  takeaways: string[];
}

const DESCRIBE_SYSTEM = `Si osobný mentor Samuela Bibeňa — zakladateľa SB Design (tvorba webov na mieru + výkonnostný online marketing, solo podnikateľ z Nitry, získava klientov cez cold outreach). Dostaneš konkrétnu knihu, ktorú si Samuel sám pridal. Napíš k nej:
- "category": presne jedna z: biznis, predaj, marketing, zdravie, mindset, produktivita, financie.
- "why": 2–3 vety PRIAMO pre Samuela, prečo mu táto kniha pomôže (konkrétne, napojené na jeho situáciu, nie fráza).
- "howToApply": 2–4 vety s KONKRÉTNYM krokom, ako to zapojiť do SB Design alebo do života.
- "takeaways": 3–4 hlavné ponaučenia (krátke odrážky).
Píš po slovensky. Ak knihu nepoznáš, odhadni podľa názvu a autora, ale ostaň konkrétny. Vráť VÝHRADNE cez nástroj "popis".`;

/** Tailored why/how/category for a specific book the user added manually. */
export async function describeBook(
  title: string,
  author: string,
): Promise<BookDescription> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: DESCRIBE_SYSTEM,
    tools: [
      {
        name: "popis",
        description: "Popis knihy pre Samuela.",
        input_schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...CATEGORIES] },
            why: { type: "string" },
            howToApply: { type: "string" },
            takeaways: { type: "array", items: { type: "string" } },
          },
          required: ["category", "why", "howToApply", "takeaways"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "popis" },
    messages: [{ role: "user", content: `Kniha: „${title}" — ${author}` }],
  });
  const block = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("AI nevrátila popis.");
  const out = block.input as BookDescription;
  return {
    category: (CATEGORIES as readonly string[]).includes(out.category)
      ? out.category
      : "biznis",
    why: out.why ?? "",
    howToApply: out.howToApply ?? "",
    takeaways: Array.isArray(out.takeaways) ? out.takeaways.slice(0, 5) : [],
  };
}

export async function recommendBooks(
  input: RecommendInput,
): Promise<BookRec[]> {
  const client = new Anthropic();
  const have = input.alreadyHave.length
    ? input.alreadyHave
        .map((b) => `- ${b.title} (${b.author}) [${b.category}, ${b.status}]`)
        .join("\n")
    : "(zatiaľ žiadne)";
  const focus = input.focusAreas.length
    ? input.focusAreas.join(", ")
    : "vyvážený mix všetkých oblastí";

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
                  title: {
                    type: "string",
                    description:
                      "Názov vydania na čítanie (SK/CZ ak existuje preklad).",
                  },
                  titleOriginal: {
                    type: "string",
                    description:
                      "Pôvodný (anglický) názov — na dohľadanie obálky.",
                  },
                  language: { type: "string", enum: ["SK", "CZ", "en"] },
                  author: { type: "string" },
                  category: { type: "string", enum: [...CATEGORIES] },
                  why: { type: "string" },
                  howToApply: { type: "string" },
                  takeaways: { type: "array", items: { type: "string" } },
                  priority: { type: "number" },
                },
                required: [
                  "title",
                  "titleOriginal",
                  "language",
                  "author",
                  "category",
                  "why",
                  "howToApply",
                  "takeaways",
                  "priority",
                ],
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

  const block = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("AI nevrátila odporúčania.");
  const out = block.input as { books?: BookRec[] };
  const list = Array.isArray(out.books) ? out.books : [];
  return list
    .filter((b) => b && b.title && b.author)
    .map((b) => ({
      ...b,
      titleOriginal: b.titleOriginal || b.title,
      language: (["SK", "CZ", "en"] as const).includes(b.language)
        ? b.language
        : "en",
      category: (CATEGORIES as readonly string[]).includes(b.category)
        ? b.category
        : "biznis",
      takeaways: Array.isArray(b.takeaways) ? b.takeaways.slice(0, 5) : [],
    }));
}

// ── Poznámky z fotiek strán knihy (Claude vision) ────────────────────────────

export interface PhotoNotes {
  title: string; // navrhnutý názov kapitoly/sekcie
  html: string; // bohaté HTML poznámky (h2/h3/p/ul/ol/li/strong/em/mark/blockquote)
}

export interface PhotoInput {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string; // base64 (bez data: prefixu)
}

const PHOTO_NOTES_SYSTEM = `Si špičkový mentor a "book coach" pre Samuela — podnikateľa, ktorý vedie SB Design (tvorba webov + výkonnostný marketing, solo podnikateľ v Nitre). Dostaneš fotografie strán z knihy, na ktorých má Samuel zvýraznené/podčiarknuté pasáže, ktoré ho zaujali.

Úloha: z fotiek (najmä zo ZVÝRAZNENÝCH častí) vytvor brutálne premakané, praktické poznámky po slovensky, ktoré:
1. jasne a jednoducho vysvetlia hlavné myšlienky (pochopí to aj laik),
2. povedia, PREČO na tom záleží,
3. a hlavne ukážu KONKRÉTNE, ako to Samuel aplikuje vo svojom podnikaní (SB Design) — reálne kroky, čísla, príklady z jeho brandže (weby, kampane, klienti, cenotvorba, akvizícia), nie frázy.

Pravidlá:
- Píš po slovensky, konkrétne, bez vaty. Žiadne "je dôležité byť produktívny".
- Sústreď sa na to, čo je zvýraznené/podčiarknuté; okolitý text použi len na pochopenie kontextu.
- Ak je časť textu na fotke nečitateľná, preskoč ju (nevymýšľaj si).
- Výstup je LEN HTML (žiadne \`\`\` ani markdown), použi VÝHRADNE tieto značky: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <mark>, <blockquote>.
- <mark> daj na tú NAJDÔLEŽITEJŠIU akčnú vetu v každej sekcii.
- Kľúčovú myšlienku knihy odcituj cez <blockquote>, ak sa dá.

Štruktúra HTML:
- <p> krátky úvod: o čom tieto strany sú (1-2 vety).
- Pre každú hlavnú myšlienku (podľa fotiek, zvyčajne 2-6):
    <h3>názov myšlienky</h3>
    <p><strong>Čo to znamená:</strong> …</p>
    <p><strong>Prečo na tom záleží:</strong> …</p>
    <p><strong>Ako to použiť v SB Design:</strong></p>
    <ol> konkrétne kroky </ol>
    (jednu najdôležitejšiu vetu obal do <mark>)
- Na záver: <h2>Akčný plán</h2> a <ol> 3-7 úplne konkrétnych krokov (čo, ako, dokedy), zoradených podľa priority.

Buď konkrétny až bolestivo. Radšej menej myšlienok, ale do hĺbky a s reálnou aplikáciou.`;

/**
 * Z fotiek strán knihy vytvorí premakané poznámky (HTML) cez Claude vision.
 * `chapterHint` je voliteľná téma/kapitola, ktorú zadal používateľ.
 */
export async function notesFromPhotos(
  photos: PhotoInput[],
  bookTitle: string,
  chapterHint: string,
): Promise<PhotoNotes> {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text:
        `Kniha: „${bookTitle}".` +
        (chapterHint ? ` Kapitola/téma: ${chapterHint}.` : "") +
        `\n\nNižšie je ${photos.length} fotografií strán z tejto knihy s mojimi zvýrazneniami. ` +
        `Vytvor z nich premakané poznámky podľa pravidiel.`,
    },
    ...photos.map((p): Anthropic.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: p.mediaType, data: p.data },
    })),
  ];

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: PHOTO_NOTES_SYSTEM,
    tools: [
      {
        name: "poznamky",
        description: "Premakané poznámky z fotiek strán knihy.",
        input_schema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Krátky výstižný názov kapitoly/sekcie (max 8 slov).",
            },
            html: {
              type: "string",
              description:
                "Poznámky ako HTML (h2/h3/p/ul/ol/li/strong/em/mark/blockquote).",
            },
          },
          required: ["title", "html"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "poznamky" },
    messages: [{ role: "user", content }],
  });

  const block = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!block) throw new Error("AI nevrátila poznámky.");
  const out = block.input as { title?: string; html?: string };
  const html = (out.html ?? "").trim();
  if (!html) throw new Error("AI vrátila prázdne poznámky.");
  return { title: (out.title ?? "").trim(), html };
}
