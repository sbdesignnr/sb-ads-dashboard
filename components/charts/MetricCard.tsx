"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
import { Sparkline } from "@/components/shared/Sparkline";
import { TrendDelta } from "@/components/shared/TrendDelta";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  delta?: number;
  invertDelta?: boolean;
  spark?: number[];
  sparkColor?: string;
  icon?: LucideIcon;
  accentClass?: string; // e.g. "text-primary bg-primary/10"
  index?: number;
  compareLabel?: string;
}

export function MetricCard({
  label,
  value,
  format,
  delta,
  invertDelta = false,
  spark,
  sparkColor = "#3B82F6",
  icon: Icon,
  accentClass = "text-primary bg-primary/10",
  index = 0,
  compareLabel = "vs. minulý týždeň",
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="group relative overflow-hidden p-5 hover:border-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              <AnimatedNumber value={value} format={format} />
            </p>
          </div>
          {Icon && (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accentClass)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {delta !== undefined && <TrendDelta value={delta} invert={invertDelta} />}
            <span className="text-xs text-muted">{compareLabel}</span>
          </div>
          {spark && spark.length > 0 && (
            <Sparkline data={spark} color={sparkColor} width={88} height={30} />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
