"use client";

import { Fragment, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ArrowRightLeft, Sparkles, AlertTriangle, Repeat } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  CompetitionBar,
  EfficiencyBadge,
  TrendIcon,
  AddToListButton,
  cpcColorClass,
} from "./keyword-bits";
import {
  getAlternativesFor,
  type ExpensiveKeyword,
  type LongTailKeyword,
} from "@/lib/mock-data/keywords";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

type Variant = "longtail" | "expensive";

interface KeywordTableProps {
  rows: (LongTailKeyword | ExpensiveKeyword)[];
  variant: Variant;
}

function isLongTail(row: LongTailKeyword | ExpensiveKeyword): row is LongTailKeyword {
  return "relatedTo" in row;
}

export function KeywordTable({ rows, variant }: KeywordTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const isLong = variant === "longtail";
  const colSpan = isLong ? 8 : 6;

  const toggle = (kw: string) => setExpanded((cur) => (cur === kw ? null : kw));

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Žiadne kľúčové slová nezodpovedajú filtru.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Kľúčové slovo</TableHead>
          <TableHead className="text-right">Mes. objem</TableHead>
          <TableHead>Konkurencia</TableHead>
          <TableHead className="text-right">Avg CPC</TableHead>
          <TableHead className="text-center">Efektivita</TableHead>
          {isLong && <TableHead className="text-right">Kliky / 200 €</TableHead>}
          {isLong && <TableHead>Nahrádza</TableHead>}
          <TableHead className="text-right">Akcia</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const open = expanded === row.keyword;
          return (
            <Fragment key={row.keyword}>
              <motion.tr
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                onClick={() => toggle(row.keyword)}
                className={cn(
                  "group cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-2/50",
                  open && "bg-surface-2/40",
                )}
              >
                <TableCell className="max-w-[280px]">
                  <div className="flex items-start gap-2">
                    <ChevronDown
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform",
                        open && "rotate-180",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-foreground group-hover:text-primary">
                          {row.keyword}
                        </span>
                        <TrendIcon trend={row.trend} />
                      </div>
                      {!isLong && (
                        <Badge variant="danger" className="mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Vyhnúť sa pri &lt; 500 €/mes
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted">
                  {formatNumber(row.searchVolume)}
                </TableCell>
                <TableCell>
                  <CompetitionBar value={row.competition} />
                </TableCell>
                <TableCell className={cn("text-right font-semibold tabular-nums", cpcColorClass(row.avgCPC))}>
                  {formatCurrency(row.avgCPC)}
                </TableCell>
                <TableCell className="text-center">
                  <EfficiencyBadge score={row.budgetEfficiencyScore} />
                </TableCell>
                {isLong && isLongTail(row) && (
                  <TableCell className="text-right font-medium tabular-nums text-success">
                    {formatNumber(row.estimatedMonthlyClicks)}
                  </TableCell>
                )}
                {isLong && isLongTail(row) && (
                  <TableCell>
                    <span className="inline-flex max-w-[160px] items-center gap-1 rounded-full border border-border bg-surface-2/60 px-2 py-0.5 text-xs text-muted">
                      <Repeat className="h-3 w-3 shrink-0" />
                      <span className="truncate">{row.relatedTo}</span>
                    </span>
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {isLongTail(row) ? (
                    <AddToListButton
                      payload={{
                        keyword: row.keyword,
                        avgCPC: row.avgCPC,
                        searchVolume: row.searchVolume,
                        efficiencyScore: row.budgetEfficiencyScore,
                        source: "longtail",
                      }}
                      size="sm"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(row.keyword);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary cursor-pointer"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Alternatívy
                    </button>
                  )}
                </TableCell>
              </motion.tr>

              {open && (
                <tr className="bg-surface-2/20">
                  <td colSpan={colSpan} className="p-0">
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 py-4">
                        {isLongTail(row) ? (
                          <LongTailDetail row={row} />
                        ) : (
                          <ExpensiveAlternatives keyword={row.keyword} />
                        )}
                      </div>
                    </motion.div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function LongTailDetail({ row }: { row: LongTailKeyword }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Prečo toto slovo odporúčame
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-muted">{row.reason}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>
          Odhad. konverzie:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(row.estimatedConversions)}/mes
          </span>
        </span>
        <span>
          Trh:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(row.searchVolume)} hľadaní/mes
          </span>
        </span>
        <span>
          Nahrádza drahé:{" "}
          <span className="font-medium text-foreground">{row.relatedTo}</span>
        </span>
      </div>
    </div>
  );
}

function ExpensiveAlternatives({ keyword }: { keyword: string }) {
  const alternatives = getAlternativesFor(keyword);
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-success">
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Lacnejšie long-tail alternatívy
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {alternatives.map((alt) => (
          <div
            key={alt.keyword}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-2/50 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{alt.keyword}</p>
              <p className="text-xs text-muted">
                <span className={cpcColorClass(alt.avgCPC)}>{formatCurrency(alt.avgCPC)}</span> ·
                efekt. {alt.budgetEfficiencyScore} · {formatNumber(alt.estimatedMonthlyClicks)} kl./200 €
              </p>
            </div>
            <AddToListButton
              payload={{
                keyword: alt.keyword,
                avgCPC: alt.avgCPC,
                searchVolume: alt.searchVolume,
                efficiencyScore: alt.budgetEfficiencyScore,
                source: "longtail",
              }}
              size="sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
