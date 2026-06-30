import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/blog/slug";
import { getCompetitorsWithLatestScan } from "./queries";
import { BLOG_TOPIC_POOL } from "./constants";

export interface ContentGap {
  id: string;
  title: string;
  targetKeyword: string;
  reason: string;
  outline: string[];
}

const SYSTEM = `Si SEO content stratég pre SB Design (tvorba webových stránok a online marketing, slovenský trh).
Na základe tém, ktoré pokrýva KONKURENCIA, a článkov, ktoré UŽ MÁME, identifikuj 4–6 obsahových medzier (content gaps) — témy s dobrým SEO potenciálom, ktoré konkurencia pokrýva (alebo majú dobrý objem hľadania) a my k nim zatiaľ nemáme obsah.

Vráť VÝLUČNE platné JSON pole (žiadny text navyše, žiadne fences):
[{"title":"návrh názvu článku","targetKeyword":"hlavné kľúčové slovo","reason":"1–2 vety prečo je téma relevantná práve teraz","outline":["H2 nadpis 1","H2 nadpis 2","H2 nadpis 3","H2 nadpis 4"]}]

Pravidlá:
- Nenavrhuj témy, ktoré už máme.
- Názvy konkrétne a klikateľné; osnova (outline) sú 4–6 H2 nadpisov založených na tom, čo funguje konkurencii.
- Píš po slovensky.`;

interface RawGap {
  title?: string;
  targetKeyword?: string;
  reason?: string;
  outline?: unknown;
}

function parseJsonArray(text: string): RawGap[] {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("[");
  if (start === -1) return [];
  t = t.slice(start);
  try {
    const p = JSON.parse(t);
    if (Array.isArray(p)) return p;
  } catch {
    const last = t.lastIndexOf("}");
    if (last !== -1) {
      try {
        const p = JSON.parse(`${t.slice(0, last + 1)}]`);
        if (Array.isArray(p)) return p;
      } catch {
        /* ignore */
      }
    }
  }
  return [];
}

function fallbackGaps(ourTopics: string[]): ContentGap[] {
  const ours = ourTopics.map((t) => t.toLowerCase());
  return BLOG_TOPIC_POOL.filter(
    (t) => !ours.some((o) => o.includes(t.about.toLowerCase()) || t.title.toLowerCase().includes(o)),
  )
    .slice(0, 5)
    .map((t) => ({
      id: slugify(t.title),
      title: t.title,
      targetKeyword: t.about,
      reason: "Tému pokrýva konkurencia a zatiaľ k nej nemáš článok — príležitosť získať organický traffic.",
      outline: ["Úvod do témy", "Na čo si dať pozor", "Praktický postup", "Časté chyby", "Záver a ďalšie kroky"],
    }));
}

const memo = { ts: 0, value: null as ContentGap[] | null };
const TTL = 10 * 60_000;

export async function generateContentGaps(force = false): Promise<ContentGap[]> {
  if (!force && memo.value && Date.now() - memo.ts < TTL) return memo.value;

  // Our existing articles.
  const ours = await prisma.blogPost.findMany({ select: { title: true, targetKeyword: true } });
  const ourTopics = ours
    .flatMap((p) => [p.title, p.targetKeyword ?? ""])
    .map((s) => s.trim())
    .filter(Boolean);

  // Competitor coverage.
  const competitors = await getCompetitorsWithLatestScan();
  const competitorTopics = new Set<string>();
  for (const c of competitors) {
    const scan = c.latestScan;
    if (!scan) continue;
    for (const b of scan.blogPosts) if (b.title) competitorTopics.add(b.title.trim());
    for (const s of scan.services) competitorTopics.add(s.trim());
    if (scan.analysis?.blogSuggestion) competitorTopics.add(scan.analysis.blogSuggestion.trim());
  }

  let gaps: ContentGap[] = [];
  if (process.env.ANTHROPIC_API_KEY && competitorTopics.size > 0) {
    try {
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `KONKURENCIA POKRÝVA:\n${[...competitorTopics].slice(0, 40).map((t) => `- ${t}`).join("\n") || "(žiadne dáta)"}\n\nMY UŽ MÁME:\n${ourTopics.slice(0, 40).map((t) => `- ${t}`).join("\n") || "(zatiaľ nič)"}\n\nNavrhni obsahové medzery ako JSON.`,
          },
        ],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const ourLower = ourTopics.map((t) => t.toLowerCase());
      gaps = parseJsonArray(text)
        .filter((g) => g.title && typeof g.title === "string")
        .map((g) => ({
          id: slugify(g.title as string),
          title: (g.title as string).trim(),
          targetKeyword: (typeof g.targetKeyword === "string" ? g.targetKeyword : "").trim(),
          reason: (typeof g.reason === "string" ? g.reason : "").trim(),
          outline: Array.isArray(g.outline)
            ? g.outline.filter((h): h is string => typeof h === "string").slice(0, 6)
            : [],
        }))
        .filter((g) => !ourLower.some((o) => o && g.title.toLowerCase().includes(o)))
        .slice(0, 6);
    } catch {
      gaps = [];
    }
  }

  if (gaps.length === 0) gaps = fallbackGaps(ourTopics);

  memo.ts = Date.now();
  memo.value = gaps;
  return gaps;
}
