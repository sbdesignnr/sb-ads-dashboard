"use client";

import { useMemo, useRef } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreGauge } from "@/components/ai/ScoreGauge";
import { InsightCard } from "@/components/ai/InsightCard";
import { AIChat, type AIChatHandle } from "@/components/ai/AIChat";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { allCampaigns, getQuickWins, getSortedInsights } from "@/lib/mock-data";
import { computeAccountScore } from "@/lib/utils/metrics";
import { cn } from "@/lib/utils";

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

export default function AIInsightsPage() {
  const chatRef = useRef<AIChatHandle>(null);
  const score = useMemo(() => computeAccountScore(allCampaigns), []);
  const quickWins = useMemo(() => getQuickWins(), []);
  const insights = useMemo(() => getSortedInsights(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">AI Insights</h1>
        <p className="text-sm text-muted">
          Analyzuj kampane s AI a získaj konkrétne, dátami podložené odporúčania.
        </p>
      </div>

      {/* Chat (hero) + score */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hodnotenie účtu</CardTitle>
              <p className="text-sm text-muted">Celkové AI skóre výkonu</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6">
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
              {quickWins.map((win, i) => {
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
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All insights */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-semibold text-foreground">Všetky odporúčania</h2>
          <span className="text-sm text-muted">({insights.length})</span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.map((insight, i) => (
            <InsightCard key={insight.id} insight={insight} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
