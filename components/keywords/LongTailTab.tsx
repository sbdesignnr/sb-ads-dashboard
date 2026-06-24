"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { KeywordTable } from "./KeywordTable";
import { longTailKeywords } from "@/lib/mock-data/keywords";
import { formatCurrency } from "@/lib/utils/formatters";

export function LongTailTab() {
  const [search, setSearch] = useState("");
  const [maxCPC, setMaxCPC] = useState(1.2);
  const [minEfficiency, setMinEfficiency] = useState(65);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return longTailKeywords.filter(
      (k) =>
        (q === "" || k.keyword.toLowerCase().includes(q) || k.relatedTo.toLowerCase().includes(q)) &&
        k.avgCPC <= maxCPC &&
        k.budgetEfficiencyScore >= minEfficiency,
    );
  }, [search, maxCPC, minEfficiency]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Search className="h-3.5 w-3.5" />
            Vyhľadávanie
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="napr. nitra, eshop, lacný…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-xs font-medium text-muted">
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Max CPC
            </span>
            <span className="tabular-nums text-foreground">{formatCurrency(maxCPC)}</span>
          </label>
          <Slider value={maxCPC} min={0.15} max={1.2} step={0.05} onChange={setMaxCPC} aria-label="Max CPC" />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-xs font-medium text-muted">
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Min. efektivita
            </span>
            <span className="tabular-nums text-foreground">{minEfficiency}</span>
          </label>
          <Slider
            value={minEfficiency}
            min={60}
            max={100}
            step={1}
            onChange={setMinEfficiency}
            aria-label="Minimálna efektivita"
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        Zobrazených <span className="font-medium text-foreground">{filtered.length}</span> z{" "}
        {longTailKeywords.length} kľúčových slov
      </p>

      <KeywordTable rows={filtered} variant="longtail" />
    </div>
  );
}
