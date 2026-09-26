// Pokladnica agentov: zápis každého plateného volania a strážca mesačného stropu.
// Zápis je "best effort" (nikdy nezhodí hlavnú prácu), ale AUTONÓMNE behy sa bez
// fungujúcej evidencie nespúšťajú (fail-closed) — pozri canRunAutonomously().
import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";

export type SpendAgent = "nora" | "skaut" | "atelier" | "leads";

interface SpendCtx {
  agent: SpendAgent;
  /** id leadu / behu, ku ktorému výdavok patrí */
  ref?: string;
}
const als = new AsyncLocalStorage<SpendCtx>();

/** Všetky platené volania vnútri `fn` sa zapíšu na daného agenta. */
export function withSpend<T>(ctx: SpendCtx, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

/** Mesačný strop v EUR (Anthropic + Google spolu). Dá sa zmeniť env premennou. */
export const MONTHLY_CAP_EUR = Number(process.env.AGENT_MONTHLY_BUDGET_EUR) || 50;
/** Autonómne (nočné) behy sa zastavia pri tomto podiele stropu; zvyšok je rezerva. */
export const SOFT_STOP = 0.9;
/**
 * Ostrý štart agentov (25. 9. 2026): výdavky, denné a týždenné limity sa počítajú od tohto
 * okamihu. Skoršie záznamy sú testy pri vývoji, v tabuľke ostávajú, ale do stropu sa nerátajú.
 */
export const AGENTS_START = new Date(process.env.AGENTS_START?.trim() || "2026-09-25T12:00:00Z");
/**
 * Rozdelenie stropu medzi agentov (súčet = 50 €). Nora píše ponuky (~0,30 € kus), Miro hľadá firmy
 * a plní zásobu. Tempo míňania sa drží rovnomerne cez mesiac (pozri canRunPaced), aby sa 50 € nevyčerpalo
 * za dva týždne.
 */
export const ALLOCATION: Record<SpendAgent, number> = { nora: 28, skaut: 17, atelier: 2, leads: 3 };
/** Rezerva nad rovnomerným tempom: toľko smie agent minúť "dopredu" (jeden beh navyše). */
export const PACE_BURST_EUR: Record<SpendAgent, number> = { nora: 0.7, skaut: 0.8, atelier: 0, leads: 0 };

// Cenník Anthropic v USD za 1 M tokenov (vstup, výstup). Neznáme modely sa účtujú ako
// Sonnet 4.x (3/15), teda skôr nad skutočnou cenou.
const PRICES: { re: RegExp; input: number; output: number }[] = [
  { re: /haiku/i, input: 1, output: 5 },
  // Cenník platformy (overené 24. 9. 2026): Opus 5.5 4/20 $, Sonnet 5 2/10 $, Haiku 4.5 1/5 $ za 1 M tokenov
  { re: /opus-5-5|opus-5\.5/i, input: 4, output: 20 },
  { re: /opus/i, input: 5, output: 25 },
  { re: /fable|mythos/i, input: 10, output: 50 },
  { re: /sonnet-5/i, input: 2, output: 10 },
  { re: /./, input: 3, output: 15 },
];
const EUR_PER_USD = 0.92;
/** Jedno volanie Google Places (Text Search s hodnoteniami) ≈ 0,035 $ */
export const PLACES_EUR_PER_CALL = 0.032;

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Cena, ktorú pokladnica používa pre model (USD za 1 M tokenov). */
export function listedPrice(model: string): { input: number; output: number } {
  const p = PRICES.find((x) => x.re.test(model)) ?? PRICES[PRICES.length - 1];
  return { input: p.input, output: p.output };
}

export function anthropicEur(model: string, u: UsageLike): number {
  const p = PRICES.find((x) => x.re.test(model)) ?? PRICES[PRICES.length - 1];
  const usd =
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_read_input_tokens ?? 0) * p.input * 0.1 +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25) /
    1_000_000;
  return usd * EUR_PER_USD;
}

let warned = false;
async function insert(data: {
  agent: string;
  kind: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  calls?: number;
  eur: number;
  ref?: string;
}) {
  try {
    await prisma.agentSpend.create({ data });
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn("[pokladnica] výdavok sa nepodarilo zapísať:", (e as Error).message.slice(0, 160));
    }
  }
}

/** Zapíše jedno volanie Claude. Volá sa po každej odpovedi API. */
export function recordAnthropic(model: string, usage: UsageLike | undefined): void {
  if (!usage) return;
  const ctx = als.getStore();
  void insert({
    agent: ctx?.agent ?? "leads",
    kind: "anthropic",
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    eur: anthropicEur(model, usage),
    ref: ctx?.ref,
  });
}

/** Zapíše iný platený výdavok (napr. generovanie obrázkov). */
export function recordOther(kind: string, eur: number, model?: string): void {
  const ctx = als.getStore();
  void insert({ agent: ctx?.agent ?? "leads", kind, model, calls: 1, eur, ref: ctx?.ref });
}

/** Zapíše volania Google Places. */
export function recordPlaces(calls = 1): void {
  const ctx = als.getStore();
  void insert({
    agent: ctx?.agent ?? "leads",
    kind: "places",
    calls,
    eur: calls * PLACES_EUR_PER_CALL,
    ref: ctx?.ref,
  });
}

export interface BudgetSnapshot {
  available: boolean;
  capEur: number;
  spentEur: number;
  todayEur: number;
  pctUsed: number;
  byAgent: Record<SpendAgent, number>;
  byKind: { anthropic: number; places: number; other: number };
  allocation: Record<SpendAgent, number>;
  /** odhad výdavkov do konca mesiaca podľa doterajšieho tempa */
  projectedEur: number;
  monthStart: string;
}

const monthStart = () => {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  // v prvom mesiaci sa počíta až od ostrého štartu (skoršie výdavky boli testy)
  return m < AGENTS_START ? AGENTS_START : m;
};

export async function getBudget(): Promise<BudgetSnapshot> {
  const empty: BudgetSnapshot = {
    available: false,
    capEur: MONTHLY_CAP_EUR,
    spentEur: 0,
    todayEur: 0,
    pctUsed: 0,
    byAgent: { nora: 0, skaut: 0, atelier: 0, leads: 0 },
    byKind: { anthropic: 0, places: 0, other: 0 },
    allocation: ALLOCATION,
    projectedEur: 0,
    monthStart: monthStart().toISOString(),
  };
  try {
    const from = monthStart();
    let dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    if (dayStart < AGENTS_START) dayStart = AGENTS_START;
    const [byAgentKind, today] = await Promise.all([
      prisma.agentSpend.groupBy({
        by: ["agent", "kind"],
        where: { createdAt: { gte: from } },
        _sum: { eur: true },
      }),
      prisma.agentSpend.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: { eur: true } }),
    ]);
    const out = { ...empty, available: true };
    for (const r of byAgentKind) {
      const v = r._sum.eur ?? 0;
      out.spentEur += v;
      if (r.agent in out.byAgent) out.byAgent[r.agent as SpendAgent] += v;
      if (r.kind === "anthropic") out.byKind.anthropic += v;
      if (r.kind === "places") out.byKind.places += v;
      if (r.kind !== "anthropic" && r.kind !== "places") out.byKind.other += v;
    }
    out.todayEur = today._sum.eur ?? 0;
    out.pctUsed = out.spentEur / out.capEur;
    // odhad do konca mesiaca podľa tempa od začiatku počítaného obdobia
    const now = new Date();
    const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    const daysElapsed = (now.getTime() - from.getTime()) / 86_400_000;
    const windowDays = (monthEnd - from.getTime()) / 86_400_000;
    out.projectedEur = daysElapsed >= 2 ? (out.spentEur / daysElapsed) * windowDays : out.spentEur;
    return out;
  } catch {
    return empty;
  }
}

/**
 * Smie Skaut / Nora pracovať sami (v noci)? Vyžaduje fungujúcu evidenciu výdavkov a to,
 * že po odhadovanej cene behu ostane výdavok pod mäkkým stropom a pod podielom agenta.
 */
/** Podiel kalendárneho mesiaca, ktorý už uplynul (0 až 1). */
export function monthFraction(now = new Date()): number {
  const s = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const e = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return (now.getTime() - s) / (e - s);
}

/** Mesačný podiel agenta z použiteľného stropu (strop × SOFT_STOP) a kumulatívne povolené míňanie k dnešku. */
export function paceAllowance(budget: BudgetSnapshot, agent: SpendAgent): { share: number; allowed: number } {
  const total = Object.values(budget.allocation).reduce((a, b) => a + b, 0) || 1;
  const share = (budget.allocation[agent] / total) * budget.capEur * SOFT_STOP;
  return { share, allowed: share * monthFraction() + PACE_BURST_EUR[agent] };
}

export async function canRunAutonomously(
  agent: SpendAgent,
  estimateEur: number,
): Promise<{ ok: boolean; reason?: string; budget: BudgetSnapshot }> {
  const budget = await getBudget();
  if (!budget.available)
    return { ok: false, reason: "Pokladnica nie je dostupná (chýba tabuľka agent_spend).", budget };
  if (budget.spentEur + estimateEur > budget.capEur * SOFT_STOP)
    return { ok: false, reason: `Mesačný rozpočet je vyčerpaný na ${Math.round(budget.pctUsed * 100)} %.`, budget };
  if (budget.byAgent[agent] + estimateEur > budget.allocation[agent] * 1.25)
    return { ok: false, reason: `Podiel agenta ${agent} na rozpočte je vyčerpaný.`, budget };
  return { ok: true, budget };
}

/**
 * Ako canRunAutonomously, plus rovnomerné tempo: agent smie k dnešnému dňu minúť najviac svoj mesačný
 * podiel krát uplynutá časť mesiaca (plus jeden beh navyše). Nevyčerpá tak celý rozpočet hneď na
 * začiatku mesiaca a nespotrebovaný podiel sa prenáša do ďalších dní.
 */
export async function canRunPaced(
  agent: SpendAgent,
  estimateEur: number,
): Promise<{ ok: boolean; reason?: string; budget: BudgetSnapshot }> {
  const gate = await canRunAutonomously(agent, estimateEur);
  if (!gate.ok) return gate;
  const { share, allowed } = paceAllowance(gate.budget, agent);
  const spent = gate.budget.byAgent[agent];
  if (spent + estimateEur > allowed)
    return { ok: false, reason: `Šetrím rozpočet: ${agent === "nora" ? "Nora" : agent === "skaut" ? "Miro" : agent} smie k dnešku minúť ${allowed.toFixed(2)} € z mesačných ${share.toFixed(0)} € (minuté ${spent.toFixed(2)} €), ďalší beh čaká.`, budget: gate.budget };
  return gate;
}
