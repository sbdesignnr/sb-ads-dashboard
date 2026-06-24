"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wand2, Loader2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  EfficiencyBadge,
  TrendIcon,
  AddToListButton,
  cpcColorClass,
} from "./keyword-bits";
import { generateKeywordSuggestions, type SuggestedKeyword } from "@/lib/mock-data/keywords";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";

const SEEDS = [
  "tvorba webu pre reštauráciu",
  "SEO pre malý eshop",
  "facebook reklama fitnes",
  "logo a branding kaviareň",
];

export function AIKeywordAdvisor() {
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SuggestedKeyword[]>([]);
  const [activeSeed, setActiveSeed] = useState("");

  const generate = (value: string) => {
    if (loading) return;
    setSeed(value);
    setLoading(true);
    setResults([]);
    setTimeout(() => {
      setResults(generateKeywordSuggestions(value));
      setActiveSeed(value.trim() || "tvorba webu");
      setLoading(false);
    }, 850);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
          <Wand2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">AI Keyword poradca</h2>
          <p className="text-sm text-muted">Popíš svoju službu a získaj long-tail návrhy</p>
        </div>
      </div>

      <CardContent className="space-y-4 pt-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate(seed);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="napr. tvorba webu pre kaviareň v Nitre"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="gradient" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generovať odporúčania
          </Button>
        </form>

        {results.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted">Vyskúšaj:</span>
            {SEEDS.map((s) => (
              <button
                key={s}
                onClick={() => generate(s)}
                className="rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs text-muted transition-colors hover:border-primary/40 hover:text-foreground cursor-pointer"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            AI analyzuje long-tail príležitosti…
          </div>
        )}

        <AnimatePresence>
          {results.length > 0 && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <p className="text-xs text-muted">
                10 long-tail návrhov pre „<span className="text-foreground">{activeSeed}</span>“
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {results.map((r, i) => (
                  <motion.div
                    key={r.keyword}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}
                    className="rounded-lg border border-border bg-surface-2/30 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{r.keyword}</span>
                        <TrendIcon trend={r.trend} />
                      </div>
                      <AddToListButton
                        payload={{
                          keyword: r.keyword,
                          avgCPC: r.avgCPC,
                          searchVolume: r.searchVolume,
                          efficiencyScore: r.budgetEfficiencyScore,
                          source: "ai",
                        }}
                        size="sm"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span className={cpcColorClass(r.avgCPC)}>{formatCurrency(r.avgCPC)} CPC</span>
                      <span className="flex items-center gap-1">
                        Efektivita <EfficiencyBadge score={r.budgetEfficiencyScore} />
                      </span>
                      <span className="tabular-nums">{formatNumber(r.estimatedMonthlyClicks)} klikov/200 €</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{r.reason}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
