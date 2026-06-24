"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Loader2,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  FileText,
  Layers,
  Wrench,
  CalendarClock,
  GitCompareArrows,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CompetitorAvatar,
  ThreatBadge,
  PositioningBadge,
  positioningLabel,
} from "@/components/competitors/shared";
import { formatDate, formatRelativeTime } from "@/lib/utils/formatters";
import type { CompetitorDetailData, ScanRecord } from "@/lib/competitors/queries";

function Tags({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted">Žiadne dáta.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span
          key={s}
          className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-xs text-foreground"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

export function CompetitorDetail({ data }: { data: CompetitorDetailData }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const latest: ScanRecord | null = data.scans[0] ?? null;
  const analysis = latest?.analysis ?? null;

  const rescan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorId: data.id }),
      });
      router.refresh();
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/competitors"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Späť na konkurenciu
      </Link>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex items-start gap-4">
          <CompetitorAvatar name={data.name} size={52} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{data.name}</h1>
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary"
            >
              {data.url.replace(/^https?:\/\//, "")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {analysis && <ThreatBadge level={analysis.threatLevel} />}
              {analysis && <PositioningBadge tier={analysis.pricingPositioning} />}
              {analysis && (
                <Badge variant={analysis.source === "claude" ? "purple" : "default"}>
                  {analysis.source === "claude" ? "AI analýza (Claude)" : "Heuristická analýza"}
                </Badge>
              )}
              <span className="text-xs text-muted">
                Posledný sken: {latest ? formatRelativeTime(latest.scannedAt) : "nikdy"}
              </span>
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={rescan} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {scanning ? "Skenujem…" : "Znova skenovať"}
        </Button>
      </motion.div>

      {!latest ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted">
            Tento konkurent zatiaľ nebol naskenovaný. Klikni na „Znova skenovať".
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <Layers className="h-4 w-4" />
              Prehľad
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Blog &amp; Obsah
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              AI Analýza
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <GitCompareArrows className="h-4 w-4" />
              História zmien
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted" />
                    Služby
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tags items={latest.services} />
                  {analysis && (
                    <div className="mt-4 rounded-lg border border-border bg-surface-2/30 p-3">
                      <p className="text-xs text-muted">Cenové pozicionovanie</p>
                      <p className="text-sm font-medium text-foreground">
                        {positioningLabel(analysis.pricingPositioning)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted" />
                    Tech stack
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tags items={latest.techStack} />
                  {analysis?.summary && (
                    <p className="text-sm leading-relaxed text-muted">{analysis.summary}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Blog & content */}
          <TabsContent value="content">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Posledné články</CardTitle>
                <Badge variant="default">
                  {latest.blogPosts.length} {latest.blogPosts.length === 1 ? "článok" : "článkov"}
                </Badge>
              </CardHeader>
              <CardContent>
                {latest.blogPosts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">
                    Nenašli sme viditeľný blog — slabšia obsahová stratégia (príležitosť pre SB Design).
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {latest.blogPosts.map((post, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          {post.url ? (
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-medium text-foreground hover:text-primary"
                            >
                              {post.title}
                            </a>
                          ) : (
                            <span className="text-sm font-medium text-foreground">{post.title}</span>
                          )}
                        </div>
                        {post.date && (
                          <span className="shrink-0 text-xs text-muted">{post.date}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI analysis */}
          <TabsContent value="analysis">
            {analysis ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <AnalysisList
                    icon={ThumbsUp}
                    title="Silné stránky"
                    accent="text-success"
                    items={analysis.strengths}
                  />
                  <AnalysisList
                    icon={ThumbsDown}
                    title="Slabé stránky / medzery"
                    accent="text-danger"
                    items={analysis.weaknesses}
                  />
                </div>

                <Card>
                  <CardHeader className="flex-row items-center gap-2 space-y-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <CardTitle>Čo môže SB Design urobiť lepšie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.actions.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {analysis.blogSuggestion && (
                  <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
                      <FileText className="h-4 w-4" />
                      Odporúčaný blog článok tento týždeň
                    </div>
                    <p className="mt-2 text-base font-medium text-foreground">
                      {analysis.blogSuggestion}
                    </p>
                  </div>
                )}

              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted">
                  Analýza nie je k dispozícii.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Change history */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>História skenov a zmien</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-5 border-l border-border pl-6">
                  {data.scans.map((scan, i) => (
                    <li key={scan.id} className="relative">
                      <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
                        <CalendarClock className="h-3 w-3" />
                      </span>
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(scan.scannedAt)}
                        <span className="ml-2 text-xs font-normal text-muted">
                          {i === data.scans.length - 1 ? "prvý sken" : `${scan.changes.length} zmien`}
                        </span>
                      </p>
                      {scan.changes.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                          {scan.changes.map((ch, j) => (
                            <li key={j}>{ch.label}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted">
                          {i === data.scans.length - 1
                            ? "Východiskový sken — bez porovnania."
                            : "Žiadne zmeny oproti predchádzajúcemu skenu."}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AnalysisList({
  icon: Icon,
  title,
  accent,
  items,
}: {
  icon: typeof ThumbsUp;
  title: string;
  accent: string;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className={`h-5 w-5 ${accent}`} />
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.replace("text-", "bg-")}`} />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Žiadne dáta.</p>
        )}
      </CardContent>
    </Card>
  );
}
