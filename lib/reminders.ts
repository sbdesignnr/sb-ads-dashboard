import Anthropic from "@anthropic-ai/sdk";
import { getCampaignsWithFallback } from "@/lib/google-ads/campaigns";
import { computeTotals } from "@/lib/utils/metrics";

export interface MetricSnapshot {
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
  conversions: number;
  revenue: number;
  roas: number;
}

export type Verdict = "improved" | "declined" | "unchanged";

export interface MetricDelta {
  key: keyof MetricSnapshot;
  label: string;
  baseline: number;
  current: number;
  diffPct: number; // signed % change (0 if baseline is 0)
  betterWhenLower?: boolean;
}

const EPS = 1e-6;

function snapshot(totals: ReturnType<typeof computeTotals>): MetricSnapshot {
  return {
    spend: totals.spend,
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.ctr,
    cpc: totals.cpc,
    conversions: totals.conversions,
    revenue: totals.revenue,
    roas: totals.roas,
  };
}

/** Snapshot of the last-30-day metrics for a campaign (or whole account). */
export async function captureMetrics(
  campaignId?: string | null,
): Promise<{ snapshot: MetricSnapshot; source: "google-ads" | "mock" }> {
  const { campaigns, source } = await getCampaignsWithFallback();
  const target = campaignId ? campaigns.find((c) => c.id === campaignId) : null;
  const daily = target
    ? target.daily.slice(-30)
    : campaigns.flatMap((c) => c.daily.slice(-30));
  return { snapshot: snapshot(computeTotals(daily)), source };
}

const DELTA_FIELDS: { key: keyof MetricSnapshot; label: string; betterWhenLower?: boolean }[] = [
  { key: "conversions", label: "Konverzie" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC", betterWhenLower: true },
  { key: "roas", label: "ROAS" },
];

export function computeDeltas(
  baseline: MetricSnapshot | null,
  current: MetricSnapshot,
): { deltas: MetricDelta[]; verdict: Verdict } {
  if (!baseline) {
    return {
      deltas: DELTA_FIELDS.map((f) => ({
        ...f,
        baseline: 0,
        current: current[f.key],
        diffPct: 0,
      })),
      verdict: "unchanged",
    };
  }

  let up = 0;
  let down = 0;
  const deltas = DELTA_FIELDS.map((f) => {
    const b = baseline[f.key];
    const c = current[f.key];
    const diff = c - b;
    const diffPct = Math.abs(b) > EPS ? (diff / Math.abs(b)) * 100 : c > EPS ? 100 : 0;
    if (Math.abs(diff) > EPS) {
      const better = f.betterWhenLower ? diff < 0 : diff > 0;
      if (better) up++;
      else down++;
    }
    return { ...f, baseline: b, current: c, diffPct };
  });

  const verdict: Verdict = up === 0 && down === 0 ? "unchanged" : up >= down ? "improved" : "declined";
  return { deltas, verdict };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function generateNextStep(
  recommendationText: string,
  campaignName: string | null,
  baseline: MetricSnapshot | null,
  current: MetricSnapshot,
  verdict: Verdict,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "AI vyhodnotenie nie je dostupné (chýba API kľúč). Skontroluj metriky vyššie a podľa toho uprav stratégiu.";
  }
  const target = campaignName ? `kampaň „${campaignName}"` : "účet";
  const verdictLabel =
    verdict === "improved" ? "zlepšili sa" : verdict === "declined" ? "zhoršili sa" : "bez zmeny";

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system:
      "Si Google Ads expert. Stručne (max 120 slov) vyhodnoť, či odporúčanie zabralo, a navrhni 2-3 konkrétne ďalšie kroky. Píš po slovensky, používaj Markdown odrážky. Buď konkrétny a dátami podložený.",
    messages: [
      {
        role: "user",
        content: `Sledované odporúčanie pre ${target}:
"${recommendationText}"

Metriky (30 dní) – PRED → TERAZ (${verdictLabel}):
- Konverzie: ${r2(baseline?.conversions ?? 0)} → ${r2(current.conversions)}
- CTR: ${r2(baseline?.ctr ?? 0)} % → ${r2(current.ctr)} %
- CPC: ${r2(baseline?.cpc ?? 0)} € → ${r2(current.cpc)} €
- ROAS: ${r2(baseline?.roas ?? 0)}× → ${r2(current.roas)}×
- Výdavky: ${r2(baseline?.spend ?? 0)} € → ${r2(current.spend)} €
- Zobrazenia: ${Math.round(baseline?.impressions ?? 0)} → ${Math.round(current.impressions)}

Vyhodnoť výsledok a daj konkrétne ďalšie kroky.`,
      },
    ],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
