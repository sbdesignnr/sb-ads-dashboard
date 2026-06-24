"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Ban, Copy, ShieldX, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { negativeKeywords } from "@/lib/mock-data/keywords";
import { copyToClipboard } from "@/lib/export";
import { formatCurrency } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

export function NegativeKeywords() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(negativeKeywords.map((n) => n.keyword)),
  );
  const [copied, setCopied] = useState(false);

  const allSelected = selected.size === negativeKeywords.length;

  const selectedSavings = useMemo(
    () =>
      negativeKeywords
        .filter((n) => selected.has(n.keyword))
        .reduce((acc, n) => acc + n.estimatedWastedBudget, 0),
    [selected],
  );

  const toggle = (kw: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(negativeKeywords.map((n) => n.keyword)));

  const exportSelected = async () => {
    const text = negativeKeywords
      .filter((n) => selected.has(n.keyword))
      .map((n) => n.keyword)
      .join("\n");
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Savings summary */}
      <Card className="border-success/30 bg-success/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/15 text-success">
              <PiggyBank className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted">Ak pridáš označené negatívne kľúčové slová, ušetríš</p>
              <p className="text-2xl font-bold tabular-nums text-success">
                <AnimatedNumber
                  value={selectedSavings}
                  duration={0.5}
                  format={(n) => `~${formatCurrency(n, true)}/mes`}
                />
              </p>
            </div>
          </div>
          <Button onClick={exportSelected} variant={copied ? "secondary" : "gradient"} disabled={selected.size === 0}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Skopírované" : `Exportovať označené (${selected.size})`}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          <span className="font-medium text-foreground">{selected.size}</span> z{" "}
          {negativeKeywords.length} označených · formát pre Google Ads (jeden výraz na riadok)
        </p>
        <button
          onClick={toggleAll}
          className="text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          {allSelected ? "Zrušiť výber" : "Označiť všetky"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {negativeKeywords.map((n, i) => {
          const isSelected = selected.has(n.keyword);
          return (
            <motion.button
              key={n.keyword}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.3) }}
              onClick={() => toggle(n.keyword)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer",
                isSelected
                  ? "border-danger/30 bg-danger/5"
                  : "border-border bg-surface-2/30 hover:border-border",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  isSelected ? "border-danger bg-danger text-white" : "border-border",
                )}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Ban className="h-3.5 w-3.5 text-danger" />
                    {n.keyword}
                  </span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-danger">
                    −{formatCurrency(n.estimatedWastedBudget, true)}/mes
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{n.reason}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/30 p-3 text-xs text-muted">
        <ShieldX className="h-4 w-4 shrink-0 text-warning" />
        Negatívne kľúčové slová zabraňujú zobrazovaniu reklám pri nerelevantných vyhľadávaniach a
        chránia tak tvoj rozpočet.
      </div>
    </div>
  );
}
