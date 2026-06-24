"use client";

import { motion } from "framer-motion";
import { formatCompact, formatNumber, formatPercent } from "@/lib/utils/formatters";
import { safeDiv } from "@/lib/utils/metrics";

interface ConversionFunnelProps {
  impressions: number;
  clicks: number;
  conversions: number;
  addToCart?: number;
  height?: number;
}

interface Stage {
  label: string;
  value: number;
  color: string;
}

export function ConversionFunnel({
  impressions,
  clicks,
  conversions,
  addToCart,
}: ConversionFunnelProps) {
  const cart = addToCart ?? Math.round(conversions * 2.6);

  const stages: Stage[] = [
    { label: "Zobrazenia", value: impressions, color: "#3B82F6" },
    { label: "Kliky", value: clicks, color: "#6366F1" },
    { label: "Pridané do košíka", value: cart, color: "#8B5CF6" },
    { label: "Konverzie", value: conversions, color: "#10B981" },
  ];

  const max = stages[0].value || 1;

  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const widthPct = Math.max(safeDiv(stage.value, max) * 100, 4);
        const prev = i > 0 ? stages[i - 1].value : stage.value;
        const stepRate = i > 0 ? safeDiv(stage.value, prev) * 100 : 100;
        const overallRate = safeDiv(stage.value, max) * 100;

        return (
          <div key={stage.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{stage.label}</span>
              <span className="tabular-nums text-muted">
                {formatNumber(stage.value)}
                {i > 0 && (
                  <span className="ml-2 text-muted/70">{formatPercent(stepRate, 1)} prechod</span>
                )}
              </span>
            </div>
            <div className="relative h-9 overflow-hidden rounded-lg bg-surface-2">
              <motion.div
                className="flex h-full items-center rounded-lg px-3"
                style={{
                  background: `linear-gradient(90deg, ${stage.color}, ${stage.color}cc)`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="whitespace-nowrap text-xs font-semibold text-white tabular-nums">
                  {formatCompact(stage.value)}
                </span>
              </motion.div>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-muted">
                {formatPercent(overallRate, 1)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
