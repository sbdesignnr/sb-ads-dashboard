import Anthropic from "@anthropic-ai/sdk";
import { getCampaignsWithFallback } from "@/lib/google-ads/campaigns";
import { buildLiveCampaignContext } from "./campaign-context";
import { computeAccountScore } from "@/lib/utils/metrics";
import type { AIInsight, AccountScore, Campaign, Priority } from "@/lib/types";

export interface AccountInsights {
  connected: boolean;
  source: "google-ads" | "mock";
  score?: AccountScore;
  insights?: AIInsight[];
  generatedAt?: string;
  error?: string;
}

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const CATEGORIES = ["Budget", "Bidding", "Creative", "Targeting", "Keywords", "Structure"] as const;

const SYSTEM = `Si senior Google Ads stratég. Na základe REÁLNYCH dát účtu vygeneruj 4 až 6 konkrétnych, akčných odporúčaní.

Vráť VÝLUČNE platné JSON pole — žiadny text navyše, žiadne markdown fences. Každý objekt:
{
  "priority": "high" | "medium" | "low",
  "campaignName": "<presný názov kampane z dát alebo null pre celý účet>",
  "category": "Budget" | "Bidding" | "Creative" | "Targeting" | "Keywords" | "Structure",
  "title": "<krátky výstižný názov>",
  "problem": "<konkrétny problém s číslami z reálnych dát>",
  "solution": "<konkrétne riešenie krok za krokom>",
  "expectedImpact": "<očakávaný dopad, napr. '+15 % CTR' alebo '-20 % CPA'>",
  "impactScore": <číslo 0-100>,
  "implementByDays": <počet dní na implementáciu, napr. 3>,
  "checkResultsByDays": <počet dní kedy skontrolovať výsledky, napr. 14>
}

Pravidlá:
- Odporúčania MUSIA vychádzať z reálnych čísel a názvov v dátach. Nevymýšľaj kampane ani metriky.
- Ak je dát málo (nový alebo prázdny účet), odporuč základné kroky: konverzné sledovanie, štruktúra kampaní, kľúčové slová, rozpočet, geo cielenie.
- Polia "problem" a "solution" napíš STRUČNE (1-2 vety), aby sa zmestilo celé JSON.
- Zoraď od najvyššieho impactu/priority.
- Píš po slovensky.`;

interface RawInsight {
  priority?: string;
  campaignName?: string | null;
  category?: string;
  title?: string;
  problem?: string;
  solution?: string;
  expectedImpact?: string;
  impactScore?: number;
  implementByDays?: number;
  checkResultsByDays?: number;
}

function parseJsonArray(text: string): RawInsight[] {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("[");
  if (start === -1) return [];
  t = t.slice(start);

  // Direct parse.
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through to salvage */
  }

  // Salvage a truncated array: close it after the last complete object.
  const lastBrace = t.lastIndexOf("}");
  if (lastBrace !== -1) {
    try {
      const parsed = JSON.parse(`${t.slice(0, lastBrace + 1)}]`);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return [];
}

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function toInsight(raw: RawInsight, index: number, campaigns: Campaign[]): AIInsight | null {
  if (!raw.title || !raw.solution) return null;
  const priority: Priority = PRIORITIES.includes(raw.priority as Priority)
    ? (raw.priority as Priority)
    : "medium";
  const category = (CATEGORIES as readonly string[]).includes(raw.category ?? "")
    ? (raw.category as AIInsight["category"])
    : "Structure";

  const name = raw.campaignName?.trim() || undefined;
  const match = name
    ? campaigns.find((c) => c.name.toLowerCase() === name.toLowerCase())
    : undefined;

  return {
    id: `ai-${index}-${(name ?? "account").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    priority,
    platform: "google",
    campaignId: match?.id,
    campaignName: match?.name ?? name,
    category,
    title: raw.title.trim(),
    problem: raw.problem?.trim() || "—",
    solution: raw.solution.trim(),
    expectedImpact: raw.expectedImpact?.trim() || "Zlepšenie výkonu kampane",
    impactScore: clampScore(raw.impactScore),
    implementByDays: Number.isFinite(raw.implementByDays) ? Math.max(1, Math.round(raw.implementByDays!)) : 3,
    checkResultsByDays: Number.isFinite(raw.checkResultsByDays)
      ? Math.max(1, Math.round(raw.checkResultsByDays!))
      : 14,
  };
}

async function generate(contextText: string, campaigns: Campaign[]): Promise<AIInsight[]> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${contextText}\n\nVygeneruj odporúčania ako JSON pole podľa inštrukcií.`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonArray(text)
    .map((raw, i) => toInsight(raw, i, campaigns))
    .filter((x): x is AIInsight => x !== null)
    .sort((a, b) => b.impactScore - a.impactScore);
}

const memo = { ts: 0, value: null as AccountInsights | null };
const TTL = 5 * 60_000;

/**
 * AI recommendations derived exclusively from real Google Ads data.
 * Returns `connected: false` when no live account data is available — callers
 * must render a loading/connect state instead of demo content. Memoized 5 min.
 */
export async function generateAccountInsights(force = false): Promise<AccountInsights> {
  if (!force && memo.value && Date.now() - memo.ts < TTL) return memo.value;

  const { campaigns, source } = await getCampaignsWithFallback();
  if (source !== "google-ads" || campaigns.length === 0) {
    const res: AccountInsights = { connected: false, source };
    memo.ts = Date.now();
    memo.value = res;
    return res;
  }

  const score = computeAccountScore(campaigns);
  let insights: AIInsight[] = [];
  let error: string | undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    error = "missing_anthropic_key";
  } else {
    try {
      const ctx = await buildLiveCampaignContext();
      insights = await generate(ctx.text, campaigns);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const res: AccountInsights = {
    connected: true,
    source,
    score,
    insights,
    generatedAt: new Date().toISOString(),
    error,
  };
  memo.ts = Date.now();
  memo.value = res;
  return res;
}
