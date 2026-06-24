"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet,
  Coins,
  Gauge,
  MousePointerClick,
  ShoppingCart,
  Percent,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/charts/MetricCard";
import { PerformanceChart } from "@/components/charts/PerformanceChart";
import { SpendDonut } from "@/components/charts/SpendDonut";
import { CampaignTable } from "@/components/charts/CampaignTable";
import { DataSourceBadge } from "@/components/google-ads/DataSourceBadge";
import { metaCampaigns, getAccountSummary, getQuickWins } from "@/lib/mock-data";
import { useGoogleAdsCampaigns } from "@/lib/hooks/useGoogleAdsCampaigns";
import {
  aggregateDailySeries,
  aggregateTotals,
  computeTotals,
  dailyMetricValue,
  deltaWoW,
} from "@/lib/utils/metrics";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
} from "@/lib/utils/formatters";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MetricKey } from "@/lib/types";

const CHART_RANGES = [30, 60, 90] as const;

export default function OverviewPage() {
  const rangeDays = useUIStore((s) => s.rangeDays);
  const [chartRange, setChartRange] = useState<number>(30);

  // Google Ads from the live API (falls back to mock); Meta stays mock for now.
  const { campaigns: googleCampaignsData, source, loading } = useGoogleAdsCampaigns();
  const allCampaigns = useMemo(
    () => [...googleCampaignsData, ...metaCampaigns],
    [googleCampaignsData],
  );

  const series = useMemo(() => aggregateDailySeries(allCampaigns), [allCampaigns]);
  const totals = useMemo(
    () => computeTotals(series.slice(-rangeDays)),
    [series, rangeDays],
  );

  const summary = useMemo(() => getAccountSummary(), []);
  const quickWin = useMemo(() => getQuickWins()[0], []);

  const spark = (key: MetricKey) => series.slice(-14).map((d) => dailyMetricValue(d, key));

  const kpis = [
    {
      label: "Celkové výdavky",
      value: totals.spend,
      format: (n: number) => formatCurrency(n, true),
      delta: deltaWoW(series, "spend"),
      key: "spend" as MetricKey,
      icon: Wallet,
      accent: "text-primary bg-primary/10",
      color: "#3B82F6",
    },
    {
      label: "Celkové tržby",
      value: totals.revenue,
      format: (n: number) => formatCurrency(n, true),
      delta: deltaWoW(series, "revenue"),
      key: "revenue" as MetricKey,
      icon: Coins,
      accent: "text-success bg-success/10",
      color: "#10B981",
    },
    {
      label: "Priemerná ROAS",
      value: totals.roas,
      format: formatRoas,
      delta: deltaWoW(series, "roas"),
      key: "roas" as MetricKey,
      icon: Gauge,
      accent: "text-secondary bg-secondary/10",
      color: "#8B5CF6",
    },
    {
      label: "Celkové kliky",
      value: totals.clicks,
      format: formatNumber,
      delta: deltaWoW(series, "clicks"),
      key: "clicks" as MetricKey,
      icon: MousePointerClick,
      accent: "text-primary bg-primary/10",
      color: "#38BDF8",
    },
    {
      label: "Konverzie",
      value: totals.conversions,
      format: formatNumber,
      delta: deltaWoW(series, "conversions"),
      key: "conversions" as MetricKey,
      icon: ShoppingCart,
      accent: "text-success bg-success/10",
      color: "#34D399",
    },
    {
      label: "CTR",
      value: totals.ctr,
      format: (n: number) => formatPercent(n),
      delta: deltaWoW(series, "ctr"),
      key: "ctr" as MetricKey,
      icon: Percent,
      accent: "text-warning bg-warning/10",
      color: "#F59E0B",
    },
  ];

  const spendBreakdown = useMemo(() => {
    const google = aggregateTotals(
      allCampaigns.filter((c) => c.platform === "google"),
      rangeDays,
    );
    const meta = aggregateTotals(
      allCampaigns.filter((c) => c.platform === "meta"),
      rangeDays,
    );
    return [
      { label: "Google Ads", value: google.spend, color: "#3B82F6" },
      { label: "Meta Ads", value: meta.spend, color: "#8B5CF6" },
    ];
  }, [allCampaigns, rangeDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Prehľad výkonu naprieč Google Ads a Meta Ads
        </p>
        <DataSourceBadge source={source} loading={loading} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi, i) => (
          <MetricCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            format={kpi.format}
            delta={kpi.delta}
            spark={spark(kpi.key)}
            sparkColor={kpi.color}
            icon={kpi.icon}
            accentClass={kpi.accent}
            index={i}
          />
        ))}
      </div>

      {/* Performance + spend breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Výkonnosť účtu</CardTitle>
              <p className="text-sm text-muted">Vývoj kľúčových metrík v čase</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
              {CHART_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                    chartRange === r
                      ? "bg-primary text-white"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {r}d
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <PerformanceChart
              data={series.slice(-chartRange)}
              metricKeys={["spend", "revenue", "conversions", "clicks", "roas"]}
              height={300}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rozdelenie výdavkov</CardTitle>
            <p className="text-sm text-muted">Google Ads vs Meta Ads</p>
          </CardHeader>
          <CardContent>
            <SpendDonut data={spendBreakdown} />
          </CardContent>
        </Card>
      </div>

      {/* Top campaigns + AI summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Top 5 kampaní</CardTitle>
            <Link
              href="/google-ads"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Všetky kampane
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            <CampaignTable
              campaigns={allCampaigns}
              showPlatform
              limit={5}
              rangeDays={rangeDays}
            />
          </CardContent>
        </Card>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Súhrn účtu</p>
                <p className="text-xs text-muted">Automatická analýza</p>
              </div>
            </div>
            <CardContent className="flex flex-1 flex-col gap-4 pt-5">
              <p className="text-sm leading-relaxed text-muted">{summary}</p>
              {quickWin && (
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">
                    Rýchly zisk
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">{quickWin.title}</p>
                  <p className="mt-1 text-xs text-muted">{quickWin.expectedImpact}</p>
                </div>
              )}
              <Link
                href="/ai-insights"
                className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2/70"
              >
                Zobraziť všetky odporúčania
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
