"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, RefreshCw, Loader2, Radio, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import { readCache, writeCache } from "@/lib/client-cache";
import type { KeywordCompetition, KeywordIdea, KeywordIdeasResponse } from "@/lib/keywords/types";

const REFRESH_MS = 24 * 60 * 60 * 1000; // 24h auto-refresh
const CACHE_KEY = "keywords:ideas";
const VISIBLE = 15;

const COMP_META: Record<KeywordCompetition, { label: string; variant: "success" | "warning" | "danger" | "default" }> = {
  LOW: { label: "Nízka", variant: "success" },
  MEDIUM: { label: "Stredná", variant: "warning" },
  HIGH: { label: "Vysoká", variant: "danger" },
  UNKNOWN: { label: "—", variant: "default" },
};

export function RealKeywordData() {
  const [data, setData] = useState<KeywordIdeasResponse | null>(
    () => readCache<KeywordIdeasResponse>(CACHE_KEY) ?? null,
  );
  const [loading, setLoading] = useState(() => readCache(CACHE_KEY) === undefined);
  const [showAll, setShowAll] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (refresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/keywords/ideas${refresh ? "?refresh=true" : ""}`);
      if (res.ok) {
        const json = (await res.json()) as KeywordIdeasResponse;
        writeCache(CACHE_KEY, json);
        setData(json);
      }
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    // Only fetch on mount if we don't already have cached data from a prior visit.
    if (readCache(CACHE_KEY) === undefined) load(false);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const isReal = data?.source === "google-ads";
  const keywords: KeywordIdea[] = data?.keywords ?? [];
  const visible = showAll ? keywords : keywords.slice(0, VISIBLE);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-col gap-3 border-b border-border sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Google Keyword Planner</CardTitle>
            <p className="text-sm text-muted">Reálne objemy hľadaní, konkurencia a CPC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <Badge variant="default">
              <Loader2 className="h-3 w-3 animate-spin" />
              Načítavam…
            </Badge>
          ) : isReal ? (
            <Badge variant="success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              Reálne dáta{data?.stale ? " (staršie)" : ""}
            </Badge>
          ) : (
            <Badge variant="default">
              <Database className="h-3 w-3" />
              Demo dáta
            </Badge>
          )}
          <Button variant="secondary" size="sm" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Načítať reálne dáta
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Žiadne dáta. Skús načítať znova.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Kľúčové slovo</TableHead>
                  <TableHead className="text-right">Mes. hľadania</TableHead>
                  <TableHead className="text-center">Konkurencia</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((k) => {
                  const c = COMP_META[k.competition];
                  return (
                    <TableRow key={k.keyword} className="hover:bg-surface-2/40">
                      <TableCell className="font-medium text-foreground">{k.keyword}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-muted/60" />
                          {formatNumber(k.avgMonthlySearches)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={c.variant}>{c.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-foreground">
                        {formatCurrency(k.avgCpc)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {keywords.length} kľúčových slov ·{" "}
                {isReal
                  ? data?.cached
                    ? `z cache, aktualizované ${formatRelativeTime(data.updatedAt)}`
                    : "naživo z Google Ads API"
                  : data?.error === "not_connected"
                    ? "demo dáta — Google Ads účet nie je pripojený"
                    : "demo dáta — Keyword Planner momentálne nedostupný"}
              </p>
              {keywords.length > VISIBLE && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  {showAll ? "Zobraziť menej" : `Zobraziť všetkých ${keywords.length}`}
                </button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
