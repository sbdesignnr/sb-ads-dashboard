"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  CalendarRange,
  PenLine,
  Loader2,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCachedResource } from "@/lib/client-cache";
import { cn } from "@/lib/utils";
import type { WeeklyTopic } from "@/lib/blog/weekly-plan";

const POTENTIAL: Record<WeeklyTopic["potentialLabel"], string> = {
  Vysoký: "text-success",
  Stredný: "text-warning",
  Nízky: "text-muted",
};
const BAR: Record<WeeklyTopic["potentialLabel"], string> = {
  Vysoký: "bg-success",
  Stredný: "bg-warning",
  Nízky: "bg-muted",
};

function TrendIcon({ trend }: { trend: WeeklyTopic["trend"] }) {
  if (trend === "rising") return <TrendingUp className="h-3 w-3 text-success" />;
  if (trend === "declining") return <TrendingDown className="h-3 w-3 text-danger" />;
  return <Minus className="h-3 w-3 text-muted" />;
}

export function WeeklyPlan() {
  const router = useRouter();
  const { data: topics, loading } = useCachedResource<WeeklyTopic[]>(
    "blog-weekly-plan",
    () =>
      fetch("/api/blog/weekly-plan")
        .then((r) => r.json())
        .then((j) => j.topics ?? []),
    { ttl: 30 * 60 * 1000 },
  );
  const [creating, setCreating] = useState<string | null>(null);

  const write = async (t: WeeklyTopic) => {
    setCreating(t.targetKeyword);
    try {
      const res = await fetch("/api/blog/from-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t.title,
          targetKeyword: t.targetKeyword,
          reason: t.reason,
          outline: t.outline,
          category: "Plán obsahu",
        }),
      });
      const j = await res.json();
      if (j.post?.id) {
        router.push(`/blog/${j.post.id}`);
        return;
      }
      toast.error("Nepodarilo sa vytvoriť článok");
    } catch {
      toast.error("Nepodarilo sa vytvoriť článok");
    }
    setCreating(null);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
          <CalendarRange className="h-4 w-4" />
        </div>
        <div>
          <CardTitle>Čo písať tento týždeň</CardTitle>
          <p className="text-sm text-muted">AI návrhy podľa medzier, sezóny a rastúcich kľúčových slov</p>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !topics ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            AI pripravuje plán obsahu…
          </div>
        ) : !topics || topics.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Žiadne návrhy nie sú k dispozícii.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {topics.map((t) => (
              <div
                key={t.targetKeyword + t.title}
                className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-4"
              >
                <p className="text-sm font-semibold text-foreground">{t.title}</p>
                <span className="mt-1 inline-flex w-fit items-center gap-1 text-xs text-muted">
                  <Search className="h-3 w-3" />
                  {t.targetKeyword}
                </span>
                <p className="mt-2 flex-1 text-xs text-muted">{t.reason}</p>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">SEO potenciál</span>
                    <span className={cn("font-medium", POTENTIAL[t.potentialLabel])}>
                      {t.potentialLabel} · {t.seoPotential}/100
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={cn("h-full rounded-full", BAR[t.potentialLabel])} style={{ width: `${t.seoPotential}%` }} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted">
                    <span>~{t.volume.toLocaleString("sk-SK")}/mes</span>
                    <span>konk. {t.competition}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <TrendIcon trend={t.trend} />
                      {t.trend === "rising" ? "rastie" : t.trend === "declining" ? "klesá" : "stabilné"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => write(t)}
                  disabled={creating === t.targetKeyword}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
                >
                  {creating === t.targetKeyword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PenLine className="h-4 w-4" />
                  )}
                  Napísať
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
