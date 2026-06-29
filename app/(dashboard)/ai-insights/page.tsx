"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Zap,
  ArrowRight,
  ListChecks,
  BarChart3,
  Lightbulb,
  TrendingDown,
  CalendarRange,
  Sparkles,
  Wand2,
  Loader2,
  PlugZap,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/ai/ScoreGauge";
import { InsightCard } from "@/components/ai/InsightCard";
import { AIChat, type AIChatHandle } from "@/components/ai/AIChat";
import { CampaignBuilder } from "@/components/ai/CampaignBuilder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { useCachedResource } from "@/lib/client-cache";
import { cn } from "@/lib/utils";
import type { AccountInsights } from "@/lib/ai/insights";

const PRIORITY_BADGE = {
  high: { label: "Vysoká", variant: "danger" as const },
  medium: { label: "Stredná", variant: "warning" as const },
  low: { label: "Nízka", variant: "info" as const },
};

const QUICK_ANALYSES = [
  { label: "Analyzuj celkový výkon účtu", icon: BarChart3, accent: "text-primary bg-primary/10" },
  {
    label: "Nájdi najväčšie príležitosti na zlepšenie",
    icon: Lightbulb,
    accent: "text-success bg-success/10",
  },
  { label: "Kde strácam peniaze?", icon: TrendingDown, accent: "text-danger bg-danger/10" },
  {
    label: "Daj mi plán na budúci mesiac",
    icon: CalendarRange,
    accent: "text-secondary bg-secondary/10",
  },
];

function LoadingState({ label = "Načítavam dáta…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {label}
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <PlugZap className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted">
        Google Ads účet nie je pripojený. Po pripojení AI vygeneruje odporúčania
        <br className="hidden sm:block" /> výlučne z reálnych dát tvojich kampaní.
      </p>
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        Pripojiť Google Ads
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function AIInsightsPage() {
  const chatRef = useRef<AIChatHandle>(null);
  const { data, loading, refresh } = useCachedResource<AccountInsights>(
    "ai-account-insights",
    () => fetch("/api/ai/insights").then((r) => r.json()),
    { ttl: 5 * 60 * 1000 },
  );

  const isLoading = loading || !data;
  const connected = data?.connected ?? false;
  const score = data?.score;
  const insights = data?.insights ?? [];
  const quickWins = insights.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">AI Insights</h1>
        <p className="text-sm text-muted">
          Odporúčania generované výlučne z reálnych dát tvojich Google Ads kampaní.
        </p>
      </div>

      {/* Chat (hero) + score */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="chat">
            <TabsList className="mb-4">
              <TabsTrigger value="chat" className="gap-1.5">
                <Sparkles className="h-4 w-4" />
                AI Asistent
              </TabsTrigger>
              <TabsTrigger value="builder" className="gap-1.5">
                <Wand2 className="h-4 w-4" />
                Campaign Builder
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" forceMount className="mt-0 space-y-4 data-[state=inactive]:hidden">
              <AIChat ref={chatRef} className="h-[620px]" />

              {/* Quick analyses */}
              <Card>
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle>Rýchle analýzy</CardTitle>
                    <p className="text-sm text-muted">Klikni a AI okamžite vygeneruje analýzu</p>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {QUICK_ANALYSES.map((q) => {
                    const Icon = q.icon;
                    return (
                      <button
                        key={q.label}
                        onClick={() => chatRef.current?.ask(q.label)}
                        className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-surface-2/70 cursor-pointer"
                      >
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", q.accent)}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-medium text-foreground">{q.label}</span>
                        <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted" />
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="builder" forceMount className="mt-0 data-[state=inactive]:hidden">
              <CampaignBuilder />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hodnotenie účtu</CardTitle>
              <p className="text-sm text-muted">AI skóre z reálnych dát</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
              {isLoading ? (
                <LoadingState />
              ) : !connected ? (
                <ConnectPrompt />
              ) : score ? (
                <>
                  <ScoreGauge score={score.score} grade={score.grade} />
                  <div className="w-full space-y-3">
                    {score.breakdown.map((b) => (
                      <div key={b.label}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-muted">{b.label}</span>
                          <span className="tabular-nums text-foreground">{Math.round(b.value)}/100</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                            initial={{ width: 0 }}
                            animate={{ width: `${b.value}%` }}
                            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-8 text-sm text-muted">Skóre nie je k dispozícii.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Quick Wins</CardTitle>
                <p className="text-sm text-muted">Urob hneď</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <LoadingState />
              ) : !connected ? (
                <p className="py-4 text-center text-sm text-muted">Pripoj účet pre odporúčania.</p>
              ) : quickWins.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">Žiadne odporúčania.</p>
              ) : (
                quickWins.map((win, i) => {
                  const badge = PRIORITY_BADGE[win.priority];
                  return (
                    <div key={win.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <PlatformBadge platform={win.platform} showLabel={false} />
                      </div>
                      <p className="mt-2 text-sm font-medium text-foreground">{win.title}</p>
                      <p className="mt-1 text-xs text-success">{win.expectedImpact}</p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All insights */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-semibold text-foreground">Všetky odporúčania</h2>
          {connected && <span className="text-sm text-muted">({insights.length})</span>}
          {connected && (
            <button
              onClick={() => fetch("/api/ai/insights?force=1").then(() => refresh())}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-foreground cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Obnoviť
            </button>
          )}
        </div>

        {isLoading ? (
          <Card>
            <CardContent>
              <LoadingState label="Načítavam reálne dáta a generujem odporúčania…" />
            </CardContent>
          </Card>
        ) : !connected ? (
          <Card>
            <CardContent>
              <ConnectPrompt />
            </CardContent>
          </Card>
        ) : insights.length === 0 ? (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted">
                <Lightbulb className="h-5 w-5 text-muted" />
                {data?.error
                  ? "AI momentálne nedokázala vygenerovať odporúčania. Skús obnoviť."
                  : "Zatiaľ žiadne odporúčania pre tento účet."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {insights.map((insight, i) => (
              <InsightCard key={insight.id} insight={insight} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
