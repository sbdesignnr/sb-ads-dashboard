"use client";

import Link from "next/link";
import { BarChart3, Eye, Clock, LogOut, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCachedResource } from "@/lib/client-cache";
import type { BlogPerformance } from "@/lib/blog/performance";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function PerformancePanel() {
  const { data, loading } = useCachedResource<BlogPerformance>(
    "blog-performance",
    () => fetch("/api/blog/performance").then((r) => r.json()),
    { ttl: 10 * 60 * 1000 },
  );

  // Hide entirely when there are no published articles to measure.
  if (!loading && (!data || data.articles.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Výkon článkov</CardTitle>
            <p className="text-sm text-muted">Ktoré články fungujú najlepšie a prečo</p>
          </div>
        </div>
        {data &&
          (data.source === "ga4" ? (
            <Badge variant="success">Naživo z GA4</Badge>
          ) : (
            <Badge variant="default">Simulované dáta</Badge>
          ))}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Načítavam výkon…
          </div>
        ) : data ? (
          <>
            {data.analysis && (
              <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-sm text-muted">
                <span className="mr-1 inline-flex items-center gap-1 font-medium text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  AI analýza:
                </span>
                {data.analysis}
              </div>
            )}
            <div className="space-y-2">
              {data.articles.slice(0, 5).map((a, i) => (
                <Link
                  key={a.id}
                  href={`/blog/${a.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 transition-colors hover:border-primary/40"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{a.title}</span>
                  <span className="hidden items-center gap-1 text-xs tabular-nums text-muted sm:flex">
                    <Eye className="h-3.5 w-3.5" />
                    {a.views.toLocaleString("sk-SK")}
                  </span>
                  <span className="hidden items-center gap-1 text-xs tabular-nums text-muted md:flex">
                    <Clock className="h-3.5 w-3.5" />
                    {fmtDuration(a.avgTimeSec)}
                  </span>
                  <span className="hidden items-center gap-1 text-xs tabular-nums text-muted md:flex">
                    <LogOut className="h-3.5 w-3.5" />
                    {a.bounceRate}%
                  </span>
                  <Badge variant={a.seoScore >= 80 ? "success" : a.seoScore >= 50 ? "warning" : "danger"}>
                    {a.seoScore}
                  </Badge>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
