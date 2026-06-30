"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  RadarIcon,
  RefreshCw,
  Loader2,
  ShieldAlert,
  GitCompareArrows,
  Target,
  ArrowRight,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Lightbulb,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitorAvatar, ThreatBadge, PositioningBadge, THREAT_META } from "./shared";
import { formatDate, formatRelativeTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import { useCachedResource } from "@/lib/client-cache";
import { ContentGaps } from "./ContentGaps";
import type { CompetitorListItem } from "@/lib/competitors/queries";
import type { ThreatLevel, WeeklyReport } from "@/lib/competitors/types";

export function CompetitorsView() {
  const [scanning, setScanning] = useState(false);
  const autoScannedRef = useRef(false);
  const inFlightRef = useRef(false);

  const { data: listData, refresh: refreshList } = useCachedResource<CompetitorListItem[]>(
    "competitors:list",
    async () => {
      const res = await fetch("/api/competitors");
      if (!res.ok) throw new Error("list");
      return (await res.json()).competitors ?? [];
    },
  );
  const { data: report, refresh: refreshReport } = useCachedResource<WeeklyReport | null>(
    "competitors:report",
    async () => {
      const res = await fetch("/api/competitors/report");
      if (!res.ok) throw new Error("report");
      return (await res.json()).report ?? null;
    },
  );

  const competitors = listData ?? null;

  const scanAll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setScanning(true);
    try {
      await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await Promise.all([refreshList(), refreshReport()]);
    } finally {
      setScanning(false);
      inFlightRef.current = false;
    }
  }, [refreshList, refreshReport]);

  // First-run: if nothing has ever been scanned, trigger one scan automatically.
  useEffect(() => {
    if (!competitors || autoScannedRef.current) return;
    const noScans = competitors.length > 0 && competitors.every((c) => !c.latestScan);
    if (noScans) {
      autoScannedRef.current = true;
      void scanAll();
    }
  }, [competitors, scanAll]);

  const lastScan = competitors
    ?.map((c) => c.lastScanned)
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined;

  const totalChanges =
    report?.changesByCompetitor.reduce((a, c) => a + c.changes.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Konkurenčná analýza</h1>
            {competitors && <Badge variant="info">{competitors.length} konkurentov</Badge>}
          </div>
          <p className="text-sm text-muted">
            Posledný sken:{" "}
            <span className="text-foreground">
              {scanning ? "prebieha…" : formatRelativeTime(lastScan)}
            </span>
          </p>
        </div>
        <Button variant="gradient" onClick={() => scanAll()} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {scanning ? "Skenujem…" : "Skenovať všetkých"}
        </Button>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          icon={RadarIcon}
          accent="text-primary bg-primary/10"
          label="Sledovaní konkurenti"
          value={competitors ? String(competitors.length) : "—"}
        />
        <OverviewCard
          icon={ShieldAlert}
          accent="text-warning bg-warning/10"
          label="Priemerná hrozba"
          value={report ? THREAT_META[report.averageThreat].label : "—"}
          valueClass={report ? threatTextClass(report.averageThreat) : undefined}
        />
        <OverviewCard
          icon={GitCompareArrows}
          accent="text-secondary bg-secondary/10"
          label="Detekované zmeny"
          value={report ? String(totalChanges) : "—"}
          sub="od posledného skenu"
        />
        <OverviewCard
          icon={Target}
          accent="text-success bg-success/10"
          label="Odporúčané akcie"
          value={report ? String(report.opportunities.length) : "—"}
          sub="tento týždeň"
        />
      </div>

      {/* Content gaps → blog */}
      <ContentGaps />

      {/* Competitor cards */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Konkurenti</h2>
        {!competitors ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {competitors.map((c, i) => (
              <CompetitorCard key={c.id} competitor={c} index={i} scanning={scanning} />
            ))}
          </div>
        )}
      </div>

      {/* AI weekly report */}
      {report && <WeeklyReportSection report={report} />}
    </div>
  );
}

function threatTextClass(level: ThreatLevel): string {
  return level === "high" ? "text-danger" : level === "medium" ? "text-warning" : "text-success";
}

function OverviewCard({
  icon: Icon,
  accent,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: typeof Target;
  accent: string;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className={cn("mt-2 text-2xl font-semibold tabular-nums text-foreground", valueClass)}>
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
        </div>
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", accent)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function CompetitorCard({
  competitor,
  index,
  scanning,
}: {
  competitor: CompetitorListItem;
  index: number;
  scanning: boolean;
}) {
  const scan = competitor.latestScan;
  const analysis = scan?.analysis;
  const services = scan?.services ?? [];
  const limitedData = scan && services.length === 0 && (scan.techStack.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.3) }}
    >
      <Card className="flex h-full flex-col p-5 hover:border-primary/40">
        <div className="flex items-start gap-3">
          <CompetitorAvatar name={competitor.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{competitor.name}</p>
            <a
              href={competitor.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-primary"
            >
              {competitor.url.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {analysis && <ThreatBadge level={analysis.threatLevel} />}
        </div>

        {!scan ? (
          <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-sm text-muted">
            {scanning ? "Skenovanie prebieha…" : "Zatiaľ neskenované"}
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {analysis && <PositioningBadge tier={analysis.pricingPositioning} />}
              {limitedData && (
                <Badge variant="warning">
                  <AlertTriangle className="h-3 w-3" />
                  obmedzené dáta
                </Badge>
              )}
              {scan.changes.length > 0 && (
                <Badge variant="purple">
                  <GitCompareArrows className="h-3 w-3" />
                  {scan.changes.length} zmien
                </Badge>
              )}
            </div>

            {services.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {services.slice(0, 5).map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-xs text-muted"
                  >
                    {s}
                  </span>
                ))}
                {services.length > 5 && (
                  <span className="rounded-full px-2 py-0.5 text-xs text-muted">
                    +{services.length - 5}
                  </span>
                )}
              </div>
            )}

            <p className="mt-3 line-clamp-2 text-sm text-muted">{analysis?.summary}</p>

            <div className="mt-auto flex items-center justify-between gap-3 pt-4">
              <span className="text-xs text-muted">{formatRelativeTime(scan.scannedAt)}</span>
              <Link
                href={`/competitors/${competitor.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Detailná analýza
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}
      </Card>
    </motion.div>
  );
}

function WeeklyReportSection({ report }: { report: WeeklyReport }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AI Týždenný report</p>
          <p className="text-xs text-muted">Vygenerované {formatDate(report.generatedAt)}</p>
        </div>
      </div>
      <CardContent className="grid gap-5 pt-5 lg:grid-cols-2">
        <ReportBlock icon={GitCompareArrows} title="Čo sa zmenilo tento týždeň" accent="text-secondary">
          <p className="text-sm text-muted">{report.changesSummary}</p>
          {report.changesByCompetitor.length > 0 && (
            <ul className="mt-2 space-y-2">
              {report.changesByCompetitor.map((c) => (
                <li key={c.competitor} className="text-sm">
                  <span className="font-medium text-foreground">{c.competitor}</span>
                  <ul className="ml-3 mt-1 list-disc space-y-0.5 text-xs text-muted">
                    {c.changes.slice(0, 3).map((ch, i) => (
                      <li key={i}>{ch.label}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </ReportBlock>

        <ReportBlock icon={Lightbulb} title="Top 3 príležitosti pre SB Design" accent="text-success">
          <ul className="space-y-2">
            {report.opportunities.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success">
                  {i + 1}
                </span>
                {o}
              </li>
            ))}
          </ul>
        </ReportBlock>

        <ReportBlock icon={FileText} title="Odporúčaný blog článok" accent="text-primary">
          <p className="text-sm font-medium text-foreground">{report.recommendedBlog.title}</p>
          <p className="mt-1 text-xs text-muted">{report.recommendedBlog.reason}</p>
        </ReportBlock>

        <ReportBlock icon={AlertTriangle} title="Upozornenia" accent="text-warning">
          {report.warnings.length ? (
            <ul className="space-y-1.5">
              {report.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted">
                  <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Žiadne kritické upozornenia.</p>
          )}
        </ReportBlock>
      </CardContent>
    </Card>
  );
}

function ReportBlock({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Lightbulb;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 p-4">
      <div className={cn("mb-2 flex items-center gap-1.5 text-sm font-semibold", accent)}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {children}
    </div>
  );
}
