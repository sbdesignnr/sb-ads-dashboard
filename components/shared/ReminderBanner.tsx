"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BellRing, X, Loader2, TrendingUp, TrendingDown, Minus, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ai/Markdown";
import { formatCurrency, formatPercent, formatRoas, formatNumber, formatRelativeTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  insightTitle: string | null;
  recommendationText: string;
  campaignName: string | null;
  checkResultsBy: string;
}
interface Delta {
  key: string;
  label: string;
  baseline: number;
  current: number;
  diffPct: number;
  betterWhenLower?: boolean;
}
interface Review {
  verdict: "improved" | "declined" | "unchanged";
  deltas: Delta[];
  aiNext: string;
}

const VERDICT = {
  improved: { label: "Zlepšilo sa", variant: "success" as const },
  declined: { label: "Zhoršilo sa", variant: "danger" as const },
  unchanged: { label: "Bez výraznej zmeny", variant: "default" as const },
};

function fmtMetric(key: string, v: number): string {
  switch (key) {
    case "ctr":
      return formatPercent(v);
    case "cpc":
      return formatCurrency(v);
    case "roas":
      return formatRoas(v);
    default:
      return formatNumber(v);
  }
}

function DeltaCell({ d }: { d: Delta }) {
  const changed = Math.abs(d.current - d.baseline) > 1e-6;
  const better = d.betterWhenLower ? d.current < d.baseline : d.current > d.baseline;
  const Icon = !changed ? Minus : d.current > d.baseline ? TrendingUp : TrendingDown;
  const color = !changed ? "text-muted" : better ? "text-success" : "text-danger";
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-2">
      <p className="text-[11px] text-muted">{d.label}</p>
      <p className="text-sm font-medium tabular-nums text-foreground">{fmtMetric(d.key, d.current)}</p>
      <p className={cn("flex items-center gap-0.5 text-[11px] tabular-nums", color)}>
        <Icon className="h-3 w-3" />
        {fmtMetric(d.key, d.baseline)}
        {changed ? ` (${d.diffPct > 0 ? "+" : ""}${Math.round(d.diffPct)} %)` : ""}
      </p>
    </div>
  );
}

export function ReminderBanner() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders?due=1");
      if (res.ok) setReminders((await res.json()).reminders ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (id: string) =>
    setReminders((rs) => rs.filter((r) => r.id !== id));

  const doReview = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/reminders/${id}/review`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Review;
      setReviews((m) => ({ ...m, [id]: data }));
    } catch {
      toast.error("Vyhodnotenie zlyhalo");
    } finally {
      setLoadingId(null);
    }
  };

  const dismiss = async (id: string) => {
    remove(id);
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }).catch(() => {});
  };

  if (reminders.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-warning/40 bg-warning/[0.07] p-4">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-warning" />
        <h3 className="text-sm font-semibold text-foreground">Čas skontrolovať výsledky odporúčaní</h3>
        <Badge variant="warning">{reminders.length}</Badge>
      </div>

      <div className="mt-3 space-y-3">
        {reminders.map((r) => {
          const review = reviews[r.id];
          return (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{r.insightTitle ?? r.recommendationText}</p>
                  <p className="text-xs text-muted">
                    {r.campaignName ? `${r.campaignName} · ` : ""}termín kontroly {formatRelativeTime(r.checkResultsBy)}
                  </p>
                </div>
                {!review && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => doReview(r.id)}
                      disabled={loadingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
                    >
                      {loadingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Vyhodnotiť
                    </button>
                    <button
                      onClick={() => dismiss(r.id)}
                      className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground cursor-pointer"
                      aria-label="Zrušiť"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {review && (
                <div className="mt-3 border-t border-border pt-3">
                  <Badge variant={VERDICT[review.verdict].variant}>{VERDICT[review.verdict].label}</Badge>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {review.deltas.map((d) => (
                      <DeltaCell key={d.key} d={d} />
                    ))}
                  </div>
                  <div className="mt-3 rounded-lg bg-surface-2/50 p-3">
                    <p className="mb-1 text-xs font-medium text-muted">Čo ďalej (AI)</p>
                    <Markdown>{review.aiNext}</Markdown>
                  </div>
                  <button
                    onClick={() => remove(r.id)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Hotovo
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
