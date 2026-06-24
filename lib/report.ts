import type { Campaign, DailyMetric, MetricKey, MetricTotals } from "@/lib/types";
import { allCampaigns, getCampaignById, ANCHOR_DATE } from "@/lib/mock-data";
import { aggregateDailySeries, computeTotals } from "@/lib/utils/metrics";
import { formatDate } from "@/lib/utils/formatters";

export type ReportTemplate = "weekly" | "monthly" | "deepdive";

export interface ReportTemplateDef {
  id: ReportTemplate;
  name: string;
  description: string;
  rangeDays: number;
  metrics: MetricKey[];
}

export const REPORT_TEMPLATES: ReportTemplateDef[] = [
  {
    id: "weekly",
    name: "Týždenný súhrn",
    description: "Rýchly prehľad kľúčových metrík za posledných 7 dní.",
    rangeDays: 7,
    metrics: ["spend", "revenue", "roas", "conversions", "ctr"],
  },
  {
    id: "monthly",
    name: "Mesačný výkon",
    description: "Kompletný mesačný report so všetkými dôležitými metrikami.",
    rangeDays: 30,
    metrics: ["spend", "revenue", "roas", "conversions", "clicks", "ctr", "cpc"],
  },
  {
    id: "deepdive",
    name: "Hĺbková analýza kampaní",
    description: "Detailný rozbor vybraných kampaní za 90 dní.",
    rangeDays: 90,
    metrics: [
      "spend",
      "revenue",
      "roas",
      "conversions",
      "clicks",
      "impressions",
      "ctr",
      "cpc",
      "cpm",
      "conversionRate",
    ],
  },
];

export interface ReportConfig {
  template: ReportTemplate;
  title: string;
  campaignIds: string[];
  metrics: MetricKey[];
  rangeDays: number;
}

export interface ReportRow {
  campaign: Campaign;
  totals: MetricTotals;
}

export interface ReportData {
  config: ReportConfig;
  rangeLabel: string;
  generatedAt: string;
  account: MetricTotals;
  rows: ReportRow[];
  series: DailyMetric[];
}

export function getTemplate(id: ReportTemplate): ReportTemplateDef {
  return REPORT_TEMPLATES.find((t) => t.id === id) ?? REPORT_TEMPLATES[1];
}

export function defaultReportConfig(): ReportConfig {
  const t = getTemplate("monthly");
  return {
    template: t.id,
    title: "Mesačný výkonnostný report",
    campaignIds: allCampaigns.map((c) => c.id),
    metrics: t.metrics,
    rangeDays: t.rangeDays,
  };
}

export function buildReport(config: ReportConfig): ReportData {
  const campaigns = config.campaignIds
    .map((id) => getCampaignById(id))
    .filter((c): c is Campaign => Boolean(c));

  const rows: ReportRow[] = campaigns.map((campaign) => ({
    campaign,
    totals: computeTotals(campaign.daily.slice(-config.rangeDays)),
  }));

  const account = computeTotals(
    campaigns.flatMap((c) => c.daily.slice(-config.rangeDays)),
  );

  const series = aggregateDailySeries(campaigns, config.rangeDays);
  const startDate = series[0]?.date ?? ANCHOR_DATE;

  return {
    config,
    account,
    rows,
    series,
    rangeLabel: `${formatDate(startDate)} – ${formatDate(ANCHOR_DATE)}`,
    generatedAt: formatDate(ANCHOR_DATE),
  };
}
