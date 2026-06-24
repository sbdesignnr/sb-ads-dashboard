"use client";

import { useMemo, useState } from "react";
import { Wallet, MousePointerClick, ShoppingCart, Gauge, Users, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/charts/MetricCard";
import { CampaignTable } from "@/components/charts/CampaignTable";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { getCampaignsByPlatform } from "@/lib/mock-data";
import {
  aggregateDailySeries,
  computeTotals,
  dailyMetricValue,
  deltaWoW,
} from "@/lib/utils/metrics";
import {
  formatCurrency,
  formatNumber,
  formatRoas,
} from "@/lib/utils/formatters";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DataSourceBadge } from "@/components/google-ads/DataSourceBadge";
import type { Campaign, MetricKey, Platform } from "@/lib/types";
import type { DataSource } from "@/lib/google-ads/types";

const FILTERS: Record<Platform, { value: string; label: string }[]> = {
  google: [
    { value: "all", label: "Všetky" },
    { value: "search", label: "Search" },
    { value: "display", label: "Display" },
    { value: "shopping", label: "Shopping" },
  ],
  meta: [
    { value: "all", label: "Všetky" },
    { value: "awareness", label: "Awareness" },
    { value: "traffic", label: "Traffic" },
    { value: "conversion", label: "Conversion" },
  ],
};

interface PlatformDashboardProps {
  platform: Platform;
  campaigns?: Campaign[];
  source?: DataSource;
  loading?: boolean;
}

export function PlatformDashboard({
  platform,
  campaigns,
  source,
  loading,
}: PlatformDashboardProps) {
  const rangeDays = useUIStore((s) => s.rangeDays);
  const [filter, setFilter] = useState("all");

  const allForPlatform = useMemo(
    () => campaigns ?? getCampaignsByPlatform(platform),
    [campaigns, platform],
  );
  const filtered = useMemo(
    () => (filter === "all" ? allForPlatform : allForPlatform.filter((c) => c.type === filter)),
    [allForPlatform, filter],
  );

  const series = useMemo(() => aggregateDailySeries(filtered), [filtered]);
  const totals = useMemo(() => computeTotals(series.slice(-rangeDays)), [series, rangeDays]);
  const spark = (key: MetricKey) => series.slice(-14).map((d) => dailyMetricValue(d, key));

  const isMeta = platform === "meta";

  const cards = isMeta
    ? [
        {
          label: "Výdavky",
          value: totals.spend,
          format: (n: number) => formatCurrency(n, true),
          delta: deltaWoW(series, "spend"),
          key: "spend" as MetricKey,
          icon: Wallet,
          accent: "text-primary bg-primary/10",
          color: "#3B82F6",
        },
        {
          label: "Dosah",
          value: totals.reach ?? 0,
          format: formatNumber,
          delta: deltaWoW(series, "impressions"),
          key: "impressions" as MetricKey,
          icon: Users,
          accent: "text-secondary bg-secondary/10",
          color: "#8B5CF6",
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
          label: "ROAS",
          value: totals.roas,
          format: formatRoas,
          delta: deltaWoW(series, "roas"),
          key: "roas" as MetricKey,
          icon: Gauge,
          accent: "text-warning bg-warning/10",
          color: "#F59E0B",
        },
      ]
    : [
        {
          label: "Výdavky",
          value: totals.spend,
          format: (n: number) => formatCurrency(n, true),
          delta: deltaWoW(series, "spend"),
          key: "spend" as MetricKey,
          icon: Wallet,
          accent: "text-primary bg-primary/10",
          color: "#3B82F6",
        },
        {
          label: "Kliky",
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
          label: "ROAS",
          value: totals.roas,
          format: formatRoas,
          delta: deltaWoW(series, "roas"),
          key: "roas" as MetricKey,
          icon: Gauge,
          accent: "text-warning bg-warning/10",
          color: "#F59E0B",
        },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlatformBadge platform={platform} />
          <span className="text-sm text-muted">
            {filtered.length} {filtered.length === 1 ? "kampaň" : "kampaní"}
          </span>
          {source && <DataSourceBadge source={source} loading={loading} />}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {FILTERS[platform].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                filter === f.value ? "bg-primary text-white" : "text-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <MetricCard
            key={c.label}
            label={c.label}
            value={c.value}
            format={c.format}
            delta={c.delta}
            spark={spark(c.key)}
            sparkColor={c.color}
            icon={c.icon}
            accentClass={c.accent}
            index={i}
          />
        ))}
      </div>

      {/* Campaign table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted" />
            Kampane
          </CardTitle>
          <span className="text-xs text-muted">Klikni na riadok pre detail</span>
        </CardHeader>
        <CardContent>
          <CampaignTable
            campaigns={filtered}
            rangeDays={rangeDays}
            showType={!isMeta}
            showMetaColumns={isMeta}
          />
        </CardContent>
      </Card>
    </div>
  );
}
