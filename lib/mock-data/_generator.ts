import type {
  Campaign,
  CampaignStatus,
  CampaignType,
  ChangeEvent,
  DailyMetric,
  Platform,
  TrendDirection,
} from "@/lib/types";

/**
 * Deterministic mock-data generator.
 *
 * Everything is seeded from a fixed anchor date + per-campaign integer seed so
 * the exact same numbers are produced on the server and the client (no
 * hydration mismatches) and across reloads.
 */

export const ANCHOR_DATE = "2026-06-23";
export const HISTORY_DAYS = 90;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isoMinusDays(anchor: string, daysAgo: number): string {
  const base = new Date(anchor + "T12:00:00Z");
  base.setUTCDate(base.getUTCDate() - daysAgo);
  return base.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CampaignSeed {
  id: string;
  name: string;
  platform: Platform;
  type: CampaignType;
  objective: string;
  status: CampaignStatus;
  trend: TrendDirection;
  dailyBudget: number;
  seed: number;
  // Baseline daily metrics
  impressions: number;
  ctr: number; // %
  cpc: number; // €
  cvr: number; // % of clicks
  aov: number; // € revenue per conversion
  hasReach?: boolean;
  frequency?: number; // Meta base frequency
  // Lifecycle (indices 0..89, 0 = oldest day)
  activeFromDay?: number; // learning campaigns start late
  pausedAfterDay?: number; // paused campaigns stop early
}

// Sun..Sat seasonality (Intl getUTCDay order).
const WEEKDAY_FACTOR = [0.86, 1.05, 1.08, 1.07, 1.05, 1.0, 0.83];

function trendMultiplier(trend: TrendDirection, progress: number): number {
  switch (trend) {
    case "up":
      return 0.78 + progress * 0.5; // 0.78 -> 1.28
    case "down":
      return 1.24 - progress * 0.5; // 1.24 -> 0.74
    default:
      return 0.96 + Math.sin(progress * Math.PI * 2) * 0.05;
  }
}

function qualityMultiplier(trend: TrendDirection, progress: number): number {
  switch (trend) {
    case "up":
      return 0.9 + progress * 0.25;
    case "down":
      return 1.1 - progress * 0.22;
    default:
      return 1;
  }
}

function generateDaily(cfg: CampaignSeed): DailyMetric[] {
  const rng = mulberry32(cfg.seed);
  const rows: DailyMetric[] = [];
  const activeFrom = cfg.activeFromDay ?? 0;
  const pausedAfter = cfg.pausedAfterDay ?? HISTORY_DAYS - 1;

  for (let i = 0; i < HISTORY_DAYS; i++) {
    const date = isoMinusDays(ANCHOR_DATE, HISTORY_DAYS - 1 - i);

    if (i < activeFrom || i > pausedAfter) {
      rows.push({
        date,
        impressions: 0,
        clicks: 0,
        spend: 0,
        conversions: 0,
        revenue: 0,
        ...(cfg.hasReach ? { reach: 0 } : {}),
      });
      continue;
    }

    const progress = i / (HISTORY_DAYS - 1);
    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const seasonal = WEEKDAY_FACTOR[weekday];
    const tMul = trendMultiplier(cfg.trend, progress);
    const qMul = qualityMultiplier(cfg.trend, progress);
    const noise = 0.9 + rng() * 0.2;

    let impressions = cfg.impressions * tMul * seasonal * noise;
    const ctr = cfg.ctr * qMul * (0.95 + rng() * 0.1);
    let clicks = (impressions * ctr) / 100;
    const cpc =
      cfg.cpc * (0.95 + rng() * 0.12) * (cfg.trend === "down" ? 1 + progress * 0.12 : 1);
    let spend = clicks * cpc;
    const cvr = cfg.cvr * qMul * (0.92 + rng() * 0.16);
    let conversions = (clicks * cvr) / 100;
    const aov = cfg.aov * (0.88 + rng() * 0.24);
    let revenue = conversions * aov;

    // Budget-constrained ("limited") campaigns hit their ceiling most days.
    if (cfg.status === "limited" && spend > cfg.dailyBudget) {
      const f = cfg.dailyBudget / spend;
      impressions *= f;
      clicks *= f;
      spend *= f;
      conversions *= f;
      revenue *= f;
    }

    const row: DailyMetric = {
      date,
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      spend: round2(spend),
      conversions: Math.round(conversions),
      revenue: round2(revenue),
    };

    if (cfg.hasReach) {
      const freq = (cfg.frequency ?? 1.8) * (0.92 + rng() * 0.16) * (1 + progress * 0.15);
      row.reach = Math.round(row.impressions / Math.max(freq, 1));
    }

    rows.push(row);
  }

  return rows;
}

function generateChanges(cfg: CampaignSeed, startDate: string): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const author = "SB Design";
  const push = (daysAgo: number, type: ChangeEvent["type"], description: string) =>
    events.push({ date: isoMinusDays(ANCHOR_DATE, daysAgo), type, description, author });

  events.push({ date: startDate, type: "status", description: "Kampaň spustená", author });
  push(58, "budget", `Denný rozpočet nastavený na ${cfg.dailyBudget} €`);

  if (cfg.trend === "up") {
    push(34, "bid", "Prechod na stratégiu Cieľová ROAS");
    push(12, "creative", "Pridané nové reklamné kreatívy (A/B test)");
  }
  if (cfg.trend === "down") {
    push(27, "audience", "Zúžené publikum — vylúčené nevýkonné segmenty");
    push(9, "bid", "Znížené ponuky na drahé kľúčové slová");
  }
  if (cfg.trend === "flat") {
    push(21, "creative", "Rotácia kreatív — obnovené vizuály");
  }
  if (cfg.status === "limited") {
    push(6, "budget", "Rozpočet vyčerpaný — kampaň obmedzená rozpočtom");
  }
  if (cfg.status === "paused") {
    push(13, "status", "Kampaň pozastavená");
  }
  if (cfg.status === "learning") {
    push(15, "status", "Kampaň vstúpila do fázy učenia");
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export function generateCampaign(cfg: CampaignSeed): Campaign {
  const startDate =
    cfg.status === "learning"
      ? isoMinusDays(ANCHOR_DATE, HISTORY_DAYS - 1 - (cfg.activeFromDay ?? 72))
      : isoMinusDays(ANCHOR_DATE, 220 + (cfg.seed % 120));

  return {
    id: cfg.id,
    name: cfg.name,
    platform: cfg.platform,
    type: cfg.type,
    objective: cfg.objective,
    status: cfg.status,
    dailyBudget: cfg.dailyBudget,
    startDate,
    trend: cfg.trend,
    daily: generateDaily(cfg),
    changeHistory: generateChanges(cfg, startDate),
  };
}
