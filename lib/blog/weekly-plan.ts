import Anthropic from "@anthropic-ai/sdk";
import { longTailKeywords, expensiveKeywords, type KeywordTrend } from "@/lib/mock-data/keywords";
import { generateContentGaps } from "@/lib/competitors/content-gaps";

export interface WeeklyTopic {
  title: string;
  targetKeyword: string;
  reason: string;
  volume: number;
  competition: "LOW" | "MEDIUM" | "HIGH";
  trend: KeywordTrend;
  seoPotential: number;
  potentialLabel: "Vysoký" | "Stredný" | "Nízky";
  outline: string[];
}

const SEASON: string[] = [
  "január — novoročné predsavzatia a plánovanie, firmy riešia nové projekty a rozpočty",
  "február — príprava na jar, dokončovanie rozbehnutých projektov",
  "marec — jarné upratovanie webov, redizajny, nové kampane",
  "apríl — rozbeh sezóny pre služby a e-shopy",
  "máj — predletná príprava, dopyt po rýchlych weboch",
  "jún — koniec polroka, hodnotenie výsledkov",
  "júl — letný útlm, dobrý čas na obsah a SEO do zásoby",
  "august — príprava na silnú jesennú sezónu",
  "september — návrat do biznisu, nové rozpočty, špička dopytu",
  "október — príprava na Q4 a vianočnú sezónu",
  "november — Black Friday a vianočná príprava, vrchol e-commerce",
  "december — Vianoce a koncoročné hodnotenie, plánovanie ďalšieho roka",
];

const compLabel = (c: number): "LOW" | "MEDIUM" | "HIGH" =>
  c < 0.34 ? "LOW" : c < 0.67 ? "MEDIUM" : "HIGH";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** 0-100 SEO potential from volume (log) + competition + rising trend. */
export function seoPotential(volume: number, competition: number, rising: boolean): number {
  const volScore = Math.min(55, Math.round((Math.log10(Math.max(1, volume)) / 3.3) * 55));
  const compScore = Math.round((1 - clamp(competition, 0, 1)) * 35);
  const trendBonus = rising ? 10 : 0;
  return Math.min(100, volScore + compScore + trendBonus);
}

const potentialLabel = (s: number): WeeklyTopic["potentialLabel"] =>
  s >= 70 ? "Vysoký" : s >= 45 ? "Stredný" : "Nízky";

interface Candidate {
  keyword: string;
  searchVolume: number;
  competition: number;
  trend: KeywordTrend;
  reason?: string;
}

function candidates(): Candidate[] {
  const pool: Candidate[] = [
    ...longTailKeywords.map((k) => ({
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      competition: k.competition,
      trend: k.trend,
      reason: k.reason,
    })),
    ...expensiveKeywords
      .filter((k) => k.trend === "rising")
      .map((k) => ({
        keyword: k.keyword,
        searchVolume: k.searchVolume,
        competition: k.competition,
        trend: k.trend,
      })),
  ];
  // Rising first, then by SEO potential.
  return pool
    .map((c) => ({ c, p: seoPotential(c.searchVolume, c.competition, c.trend === "rising") }))
    .sort((a, b) => (a.c.trend === "rising" ? -1 : 0) - (b.c.trend === "rising" ? -1 : 0) || b.p - a.p)
    .map((x) => x.c)
    .slice(0, 16);
}

function enrich(title: string, keyword: string, reason: string, outline: string[]): WeeklyTopic {
  const kw = keyword.toLowerCase().trim();
  const match = candidates().find((c) => c.keyword.toLowerCase() === kw);
  const volume = match?.searchVolume ?? 0;
  const competition = match?.competition ?? 0.5;
  const trend: KeywordTrend = match?.trend ?? "stable";
  const score = seoPotential(volume, competition, trend === "rising");
  return {
    title,
    targetKeyword: keyword,
    reason,
    volume,
    competition: compLabel(competition),
    trend,
    seoPotential: score,
    potentialLabel: potentialLabel(score),
    outline,
  };
}

interface RawTopic {
  title?: string;
  targetKeyword?: string;
  reason?: string;
  outline?: unknown;
}

function parseJsonArray(text: string): RawTopic[] {
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

function fallbackPlan(cands: Candidate[]): WeeklyTopic[] {
  return cands
    .map((c) => ({ c, p: seoPotential(c.searchVolume, c.competition, c.trend === "rising") }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map(({ c }) => {
      const t = c.keyword.charAt(0).toUpperCase() + c.keyword.slice(1);
      return enrich(
        `${t}: praktický sprievodca pre firmy`,
        c.keyword,
        c.reason ?? (c.trend === "rising" ? "Kľúčové slovo s rastúcim objemom hľadania." : "Dobrý pomer objemu a konkurencie."),
        [],
      );
    });
}

const SYSTEM = `Si SEO content stratég pre SB Design (tvorba webov a online marketing, SK trh). Navrhni 2–3 KONKRÉTNE témy na článok na tento týždeň.

Vráť VÝLUČNE JSON pole (žiadny text navyše):
[{"title":"názov článku","targetKeyword":"<presne jedno kľúčové slovo zo zoznamu nižšie>","reason":"1–2 vety prečo práve teraz (sezónnosť alebo rastúci trend)","outline":["H2","H2","H2","H2"]}]

Pravidlá:
- targetKeyword MUSÍ byť presne jedno z poskytnutých kľúčových slov (rovnaký text).
- Uprednostni kľúčové slová s rastúcim trendom a dobrým pomerom objem/konkurencia.
- Zohľadni aktuálnu sezónu aj obsahové medzery oproti konkurencii.
- Po slovensky.`;

const memo = { ts: 0, value: null as WeeklyTopic[] | null };
const TTL = 6 * 60 * 60 * 1000; // 6h

export async function generateWeeklyPlan(force = false): Promise<WeeklyTopic[]> {
  if (!force && memo.value && Date.now() - memo.ts < TTL) return memo.value;

  const cands = candidates();
  const month = new Date().getMonth();
  const season = SEASON[month] ?? "";

  let topics: WeeklyTopic[] = [];
  if (process.env.ANTHROPIC_API_KEY && cands.length > 0) {
    try {
      const gaps = await generateContentGaps();
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1600,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Aktuálna sezóna: ${season}.

KĽÚČOVÉ SLOVÁ (objem/konkurencia/trend) — vyber targetKeyword z tohto zoznamu:
${cands.map((c) => `- "${c.keyword}" — objem ${c.searchVolume}/mes, konkurencia ${compLabel(c.competition)}, trend ${c.trend}`).join("\n")}

OBSAHOVÉ MEDZERY oproti konkurencii (témy ktoré nemáme):
${gaps.slice(0, 6).map((g) => `- ${g.title}`).join("\n") || "(žiadne)"}

Navrhni 2–3 témy ako JSON.`,
          },
        ],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      topics = parseJsonArray(text)
        .filter((t) => t.title && t.targetKeyword)
        .slice(0, 3)
        .map((t) =>
          enrich(
            (t.title as string).trim(),
            (t.targetKeyword as string).trim(),
            (typeof t.reason === "string" ? t.reason : "").trim(),
            Array.isArray(t.outline) ? t.outline.filter((h): h is string => typeof h === "string").slice(0, 6) : [],
          ),
        );
    } catch {
      topics = [];
    }
  }

  if (topics.length === 0) topics = fallbackPlan(cands);

  memo.ts = Date.now();
  memo.value = topics;
  return topics;
}
