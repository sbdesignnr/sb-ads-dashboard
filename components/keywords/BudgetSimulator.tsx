"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  MousePointerClick,
  Target,
  CircleDollarSign,
  CalendarX,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { useKeywordStore } from "@/lib/keyword-store";
import { simulateBudget, type BudgetSimResult } from "@/lib/mock-data/keywords";
import { formatCurrency, formatNumber } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

function dayLabel(n: number): string {
  if (n === 1) return "deň";
  if (n >= 2 && n <= 4) return "dni";
  return "dní";
}

export function BudgetSimulator() {
  const budget = useKeywordStore((s) => s.budget);
  const setBudget = useKeywordStore((s) => s.setBudget);
  const [strategy, setStrategy] = useState<"expensive" | "longtail">("longtail");

  const sim = useMemo(() => simulateBudget(budget), [budget]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Budget simulátor</h2>
            <p className="text-sm text-muted">Porovnaj stratégie pri svojom rozpočte</p>
          </div>
        </div>

        {/* Strategy toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          <button
            onClick={() => setStrategy("expensive")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              strategy === "expensive" ? "bg-danger text-white" : "text-muted hover:text-foreground",
            )}
          >
            Drahé slová
          </button>
          <button
            onClick={() => setStrategy("longtail")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              strategy === "longtail"
                ? "bg-gradient-to-r from-primary to-secondary text-white"
                : "text-muted hover:text-foreground",
            )}
          >
            Long-tail stratégia
          </button>
        </div>
      </div>

      <CardContent className="space-y-6 pt-6">
        {/* Budget slider */}
        <div>
          <div className="mb-3 flex items-end justify-between">
            <span className="text-sm font-medium text-foreground">Mesačný rozpočet</span>
            <span className="text-2xl font-bold tabular-nums text-gradient">
              <AnimatedNumber
                value={budget}
                duration={0.4}
                format={(n) => formatCurrency(n, true)}
              />
            </span>
          </div>
          <Slider
            value={budget}
            min={50}
            max={2000}
            step={10}
            onChange={setBudget}
            aria-label="Mesačný rozpočet"
          />
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>50 €</span>
            <span>2 000 €</span>
          </div>
        </div>

        {/* Multiplier banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm text-foreground">
            Pri rovnakom rozpočte získa long-tail stratégia až{" "}
            <span className="font-bold text-success tabular-nums">
              <AnimatedNumber value={sim.clicksMultiplier} duration={0.4} format={(n) => `${n.toFixed(1)}×`} />
            </span>{" "}
            viac klikov a vydrží celý mesiac.
          </p>
        </motion.div>

        {/* Side by side results */}
        <div className="grid gap-4 lg:grid-cols-2">
          <StrategyCard
            title="Drahé kľúčové slová"
            subtitle="Vysoká konkurencia, vysoký CPC"
            result={sim.expensive}
            variant="expensive"
            highlighted={strategy === "expensive"}
          />
          <StrategyCard
            title="Long-tail stratégia"
            subtitle="Nízka konkurencia, vysoká relevancia"
            result={sim.longTail}
            variant="longtail"
            highlighted={strategy === "longtail"}
            recommended
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StrategyCard({
  title,
  subtitle,
  result,
  variant,
  highlighted,
  recommended,
}: {
  title: string;
  subtitle: string;
  result: BudgetSimResult;
  variant: "expensive" | "longtail";
  highlighted: boolean;
  recommended?: boolean;
}) {
  const isLong = variant === "longtail";
  return (
    <motion.div
      animate={{ scale: highlighted ? 1 : 0.99, opacity: highlighted ? 1 : 0.8 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "relative rounded-xl border p-5 transition-colors",
        isLong
          ? "border-success/40 bg-success/5"
          : "border-danger/40 bg-danger/5",
        highlighted && (isLong ? "ring-1 ring-success/40" : "ring-1 ring-danger/40"),
      )}
    >
      {recommended && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-primary to-secondary px-2.5 py-0.5 text-xs font-semibold text-white">
          Odporúčané
        </span>
      )}
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat
          icon={MousePointerClick}
          label="Odhadované kliky"
          value={<AnimatedNumber value={result.clicks} duration={0.45} format={formatNumber} />}
          accent={isLong ? "text-success" : "text-danger"}
          big
        />
        <Stat
          icon={Target}
          label="Konverzie"
          value={<AnimatedNumber value={result.conversions} duration={0.45} format={formatNumber} />}
          accent={isLong ? "text-success" : "text-danger"}
          big
        />
        <Stat
          icon={CircleDollarSign}
          label="Priemerný CPC"
          value={formatCurrency(result.avgCPC)}
        />
        <Stat
          icon={Target}
          label="Cena / konverzia"
          value={result.costPerConversion ? formatCurrency(result.costPerConversion) : "—"}
        />
      </div>

      <div
        className={cn(
          "mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
          result.lastsMonth ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
        )}
      >
        {result.lastsMonth ? (
          <>
            <CalendarCheck className="h-4 w-4" />
            Rozpočet vydrží celý mesiac
          </>
        ) : (
          <>
            <CalendarX className="h-4 w-4" />
            Rozpočet vyčerpaný za {result.daysLasted} {dayLabel(result.daysLasted)}
          </>
        )}
      </div>
    </motion.div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
  big,
}: {
  icon: typeof MousePointerClick;
  label: string;
  value: React.ReactNode;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={cn("mt-1 font-semibold tabular-nums", big ? "text-xl" : "text-sm", accent)}>
        {value}
      </p>
    </div>
  );
}
