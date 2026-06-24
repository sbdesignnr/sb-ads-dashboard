import type { MetricKey } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
} from "@/lib/utils/formatters";

export interface MetricConfig {
  key: MetricKey;
  label: string;
  short: string;
  color: string;
  format: (n: number) => string;
  /** Lower is better (CPC, CPM, spend in efficiency context). */
  invert?: boolean;
}

export const METRICS: Record<MetricKey, MetricConfig> = {
  spend: {
    key: "spend",
    label: "Výdavky",
    short: "Výdavky",
    color: "#3B82F6",
    format: (n) => formatCurrency(n),
    invert: true,
  },
  revenue: {
    key: "revenue",
    label: "Tržby",
    short: "Tržby",
    color: "#10B981",
    format: (n) => formatCurrency(n),
  },
  roas: {
    key: "roas",
    label: "ROAS",
    short: "ROAS",
    color: "#8B5CF6",
    format: formatRoas,
  },
  clicks: {
    key: "clicks",
    label: "Kliky",
    short: "Kliky",
    color: "#38BDF8",
    format: formatNumber,
  },
  impressions: {
    key: "impressions",
    label: "Zobrazenia",
    short: "Zobr.",
    color: "#60A5FA",
    format: formatNumber,
  },
  conversions: {
    key: "conversions",
    label: "Konverzie",
    short: "Konv.",
    color: "#34D399",
    format: formatNumber,
  },
  ctr: {
    key: "ctr",
    label: "CTR",
    short: "CTR",
    color: "#F59E0B",
    format: (n) => formatPercent(n),
  },
  cpc: {
    key: "cpc",
    label: "CPC",
    short: "CPC",
    color: "#FBBF24",
    format: (n) => formatCurrency(n),
    invert: true,
  },
  cpm: {
    key: "cpm",
    label: "CPM",
    short: "CPM",
    color: "#F472B6",
    format: (n) => formatCurrency(n),
    invert: true,
  },
  conversionRate: {
    key: "conversionRate",
    label: "Konverzný pomer",
    short: "CVR",
    color: "#2DD4BF",
    format: (n) => formatPercent(n),
  },
};

export const METRIC_LIST = Object.values(METRICS);
