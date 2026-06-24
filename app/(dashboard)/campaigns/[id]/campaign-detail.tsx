"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wallet,
  Coins,
  Gauge,
  ShoppingCart,
  Sparkles,
  Image as ImageIcon,
  Users,
  Power,
  Search,
  Target,
  Calendar,
  CircleDollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/charts/MetricCard";
import { PerformanceChart } from "@/components/charts/PerformanceChart";
import { ConversionFunnel } from "@/components/charts/ConversionFunnel";
import { InsightCard } from "@/components/ai/InsightCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { getInsightsForCampaign } from "@/lib/mock-data";
import { computeTotals } from "@/lib/utils/metrics";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatRoas,
  typeLabel,
} from "@/lib/utils/formatters";
import { useUIStore } from "@/lib/store";
import type { Campaign, ChangeEvent, MetricKey } from "@/lib/types";

const CHANGE_ICON: Record<ChangeEvent["type"], typeof Wallet> = {
  budget: CircleDollarSign,
  bid: Gauge,
  creative: ImageIcon,
  audience: Users,
  status: Power,
  keyword: Search,
};

function buildAnalysis(campaign: Campaign, totals: ReturnType<typeof computeTotals>): string {
  const trendWord =
    campaign.trend === "up" ? "rastúci" : campaign.trend === "down" ? "klesajúci" : "stabilný";

  const roasJudgement =
    totals.roas >= 4
      ? "výborná návratnosť investície"
      : totals.roas >= 2
        ? "primeraná návratnosť"
        : "podpriemerná návratnosť, ktorá si vyžaduje pozornosť";

  const statusNote =
    campaign.status === "limited"
      ? " Kampaň je aktuálne obmedzená rozpočtom, takže nevyužíva celý dopytový potenciál."
      : campaign.status === "learning"
        ? " Kampaň je vo fáze učenia — výsledky sa ešte stabilizujú."
        : campaign.status === "paused"
          ? " Kampaň je momentálne pozastavená."
          : "";

  return (
    `Kampaň „${campaign.name}“ má ${trendWord} výkonnostný trend a za sledované obdobie dosiahla ROAS ` +
    `${formatRoas(totals.roas)} — ${roasJudgement}. Pri CTR ${formatPercent(totals.ctr)} a CPC ` +
    `${formatCurrency(totals.cpc)} vygenerovala ${formatNumber(totals.conversions)} konverzií ` +
    `s tržbami ${formatCurrency(totals.revenue, true)}.` +
    statusNote +
    ` Konverzný pomer ${formatPercent(totals.conversionRate)} ${
      totals.conversionRate >= 4 ? "je nadpriemerný" : "má priestor na zlepšenie"
    }.`
  );
}

export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  const rangeDays = useUIStore((s) => s.rangeDays);

  const totals = useMemo(
    () => computeTotals(campaign.daily.slice(-rangeDays)),
    [campaign, rangeDays],
  );
  const insights = useMemo(() => getInsightsForCampaign(campaign), [campaign]);
  const analysis = useMemo(() => buildAnalysis(campaign, totals), [campaign, totals]);

  const sparkOf = (key: MetricKey) =>
    campaign.daily.slice(-14).map((d) => (key === "revenue" ? d.revenue : (d[key as keyof typeof d] as number)));

  const metricKeys: MetricKey[] =
    campaign.platform === "meta"
      ? ["spend", "revenue", "conversions", "clicks", "ctr", "cpm", "roas"]
      : ["spend", "revenue", "conversions", "clicks", "ctr", "cpc", "roas"];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div>
        <Link
          href={campaign.platform === "google" ? "/google-ads" : "/meta-ads"}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Späť na {campaign.platform === "google" ? "Google Ads" : "Meta Ads"}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PlatformBadge platform={campaign.platform} />
              <StatusBadge status={campaign.status} />
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
                {typeLabel(campaign.type)}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">{campaign.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-4 w-4" />
                {campaign.objective}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4" />
                Rozpočet {formatCurrency(campaign.dailyBudget)}/deň
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Od {formatDate(campaign.startDate)}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Výdavky"
          value={totals.spend}
          format={(n) => formatCurrency(n, true)}
          spark={sparkOf("spend")}
          sparkColor="#3B82F6"
          icon={Wallet}
          accentClass="text-primary bg-primary/10"
          index={0}
          compareLabel="za obdobie"
        />
        <MetricCard
          label="Tržby"
          value={totals.revenue}
          format={(n) => formatCurrency(n, true)}
          spark={sparkOf("revenue")}
          sparkColor="#10B981"
          icon={Coins}
          accentClass="text-success bg-success/10"
          index={1}
          compareLabel="za obdobie"
        />
        <MetricCard
          label="ROAS"
          value={totals.roas}
          format={formatRoas}
          icon={Gauge}
          accentClass="text-secondary bg-secondary/10"
          index={2}
          compareLabel="za obdobie"
        />
        <MetricCard
          label="Konverzie"
          value={totals.conversions}
          format={formatNumber}
          spark={sparkOf("conversions")}
          sparkColor="#34D399"
          icon={ShoppingCart}
          accentClass="text-warning bg-warning/10"
          index={3}
          compareLabel="za obdobie"
        />
      </div>

      {/* Performance + funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Výkonnosť kampane</CardTitle>
            <p className="text-sm text-muted">Prepínaj medzi metrikami</p>
          </CardHeader>
          <CardContent>
            <PerformanceChart
              data={campaign.daily.slice(-rangeDays)}
              metricKeys={metricKeys}
              height={300}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Konverzný lievik</CardTitle>
            <p className="text-sm text-muted">Cesta od zobrazenia ku konverzii</p>
          </CardHeader>
          <CardContent>
            <ConversionFunnel
              impressions={totals.impressions}
              clicks={totals.clicks}
              conversions={totals.conversions}
            />
          </CardContent>
        </Card>
      </div>

      {/* AI analysis */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI analýza kampane</p>
            <p className="text-xs text-muted">Detailné vyhodnotenie výkonu</p>
          </div>
        </div>
        <CardContent className="pt-5">
          <p className="text-sm leading-relaxed text-muted">{analysis}</p>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Odporúčania</h2>
          <span className="text-sm text-muted">{insights.length} odporúčaní</span>
        </div>
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              index={i}
              defaultExpanded={i === 0}
              showCampaignLink={false}
            />
          ))}
        </div>
      </div>

      {/* Change history */}
      <Card>
        <CardHeader>
          <CardTitle>História zmien</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-5 border-l border-border pl-6">
            {campaign.changeHistory.map((event, i) => {
              const Icon = CHANGE_ICON[event.type];
              return (
                <li key={`${event.date}-${i}`} className="relative">
                  <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm text-foreground">{event.description}</p>
                    <p className="text-xs text-muted">
                      {formatDate(event.date)} · {event.author}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
