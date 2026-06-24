"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ListChecks,
  X,
  Download,
  Copy,
  Check,
  Trash2,
  MousePointerClick,
  Target,
  CircleDollarSign,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { EfficiencyBadge, cpcColorClass } from "./keyword-bits";
import { useKeywordStore } from "@/lib/keyword-store";
import { estimateListPerformance } from "@/lib/mock-data/keywords";
import { downloadCsv, copyToClipboard } from "@/lib/export";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";

export function MyKeywordList() {
  const list = useKeywordStore((s) => s.list);
  const remove = useKeywordStore((s) => s.remove);
  const clear = useKeywordStore((s) => s.clear);
  const budget = useKeywordStore((s) => s.budget);
  const [copied, setCopied] = useState(false);

  const perf = useMemo(
    () =>
      estimateListPerformance(
        list.map((k) => ({ avgCPC: k.avgCPC, efficiencyScore: k.efficiencyScore })),
        budget,
      ),
    [list, budget],
  );

  const exportCsv = () => {
    if (!list.length) return;
    const rows = [
      ["Keyword", "Match Type", "Max CPC (EUR)"],
      ...list.map((k) => [k.keyword, "Broad", k.avgCPC.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c}"` : c)).join(",")).join("\n");
    downloadCsv("moj-zoznam-klucovych-slov.csv", csv);
  };

  const copyText = async () => {
    if (!list.length) return;
    const ok = await copyToClipboard(list.map((k) => k.keyword).join("\n"));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted" />
          Môj zoznam kľúčových slov
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
            {list.length}
          </span>
        </CardTitle>
        {list.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-danger cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vyprázdniť
          </button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="max-w-xs text-sm text-muted">
              Zatiaľ žiadne slová. Pridaj kľúčové slová cez tlačidlo „Pridať“ v tabuľkách alebo z AI
              poradcu.
            </p>
          </div>
        ) : (
          <>
            {/* Performance estimate */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-2/30 p-4 sm:grid-cols-4">
              <PerfStat
                icon={MousePointerClick}
                label={`Kliky / ${formatCurrency(budget, true)}`}
                value={<AnimatedNumber value={perf.clicks} duration={0.45} format={formatNumber} />}
                accent="text-primary"
              />
              <PerfStat
                icon={Target}
                label="Konverzie"
                value={<AnimatedNumber value={perf.conversions} duration={0.45} format={formatNumber} />}
                accent="text-success"
              />
              <PerfStat
                icon={CircleDollarSign}
                label="Priemerný CPC"
                value={formatCurrency(perf.avgCPC)}
              />
              <PerfStat
                icon={Target}
                label="Cena / konverzia"
                value={perf.costPerConversion ? formatCurrency(perf.costPerConversion) : "—"}
              />
            </div>

            {/* Keyword chips */}
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {list.map((k) => (
                  <motion.div
                    key={k.keyword}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 py-1.5 pl-3 pr-1.5"
                  >
                    <span className="text-sm text-foreground">{k.keyword}</span>
                    <span className={cpcColorClass(k.avgCPC)}>{formatCurrency(k.avgCPC)}</span>
                    <EfficiencyBadge score={k.efficiencyScore} />
                    <button
                      onClick={() => remove(k.keyword)}
                      className="rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
                      aria-label={`Odstrániť ${k.keyword}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Export */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="secondary" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                Google Ads CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={copyText}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Skopírované" : "Kopírovať ako text"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PerfStat({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
}: {
  icon: typeof MousePointerClick;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}
