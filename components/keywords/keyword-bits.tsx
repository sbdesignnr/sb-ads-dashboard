"use client";

import { TrendingUp, TrendingDown, Minus, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useKeywordStore, type SavedKeyword } from "@/lib/keyword-store";
import { cn } from "@/lib/utils";
import type { KeywordTrend } from "@/lib/mock-data/keywords";

export function cpcColorClass(value: number): string {
  if (value < 0.5) return "text-success";
  if (value <= 1) return "text-warning";
  return "text-danger";
}

export function CompetitionBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value < 0.4 ? "bg-success" : value < 0.7 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{pct} %</span>
    </div>
  );
}

export function EfficiencyBadge({ score }: { score: number }) {
  const variant =
    score >= 80 ? "success" : score >= 60 ? "info" : score >= 35 ? "warning" : "danger";
  return (
    <Badge variant={variant}>
      <span className="tabular-nums">{score}</span>
    </Badge>
  );
}

export function TrendIcon({ trend }: { trend: KeywordTrend }) {
  if (trend === "rising")
    return <TrendingUp className="h-3.5 w-3.5 text-success" aria-label="rastúci" />;
  if (trend === "declining")
    return <TrendingDown className="h-3.5 w-3.5 text-danger" aria-label="klesajúci" />;
  return <Minus className="h-3.5 w-3.5 text-muted" aria-label="stabilný" />;
}

export function AddToListButton({
  payload,
  size = "default",
}: {
  payload: SavedKeyword;
  size?: "default" | "sm";
}) {
  const list = useKeywordStore((s) => s.list);
  const add = useKeywordStore((s) => s.add);
  const inList = list.some((k) => k.keyword === payload.keyword);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!inList) add(payload);
      }}
      disabled={inList}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors cursor-pointer",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
        inList
          ? "cursor-default border-success/40 bg-success/10 text-success"
          : "border-border bg-surface-2/60 text-foreground hover:border-primary/50 hover:text-primary",
      )}
    >
      {inList ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {inList ? "Pridané" : "Pridať"}
    </button>
  );
}
