"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Lightbulb,
  TrendingUp,
  TriangleAlert,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { cn } from "@/lib/utils";
import type { AIInsight, Priority } from "@/lib/types";

const PRIORITY: Record<
  Priority,
  { label: string; icon: typeof AlertTriangle; chip: string; accent: string; badge: "danger" | "warning" | "info" }
> = {
  high: {
    label: "Vysoká priorita",
    icon: TriangleAlert,
    chip: "bg-danger/10 text-danger",
    accent: "before:bg-danger",
    badge: "danger",
  },
  medium: {
    label: "Stredná priorita",
    icon: AlertTriangle,
    chip: "bg-warning/10 text-warning",
    accent: "before:bg-warning",
    badge: "warning",
  },
  low: {
    label: "Nízka priorita",
    icon: Lightbulb,
    chip: "bg-primary/10 text-primary",
    accent: "before:bg-primary",
    badge: "info",
  },
};

interface InsightCardProps {
  insight: AIInsight;
  index?: number;
  defaultExpanded?: boolean;
  showCampaignLink?: boolean;
}

export function InsightCard({
  insight,
  index = 0,
  defaultExpanded = false,
  showCampaignLink = true,
}: InsightCardProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const p = PRIORITY[insight.priority];
  const Icon = p.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:content-['']",
        p.accent,
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-4 p-5 text-left cursor-pointer"
      >
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", p.chip)}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={p.badge}>{p.label}</Badge>
            <PlatformBadge platform={insight.platform} />
            <Badge variant="default">{insight.category}</Badge>
          </div>
          <h3 className="mt-2 text-base font-semibold text-foreground">{insight.title}</h3>
          {insight.campaignName && (
            <p className="mt-0.5 text-xs text-muted">{insight.campaignName}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="text-xs font-medium tabular-nums text-foreground">{insight.impactScore}</span>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-4 px-5 pb-5 pl-[4.5rem]"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-danger/80">Problém</p>
            <p className="mt-1 text-sm text-muted">{insight.problem}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-success/80">Riešenie</p>
            <p className="mt-1 text-sm text-foreground">{insight.solution}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
            <div>
              <p className="text-xs text-muted">Očakávaný dopad</p>
              <p className="text-sm font-medium text-foreground">{insight.expectedImpact}</p>
            </div>
            {showCampaignLink && insight.campaignId && (
              <Link
                href={`/campaigns/${insight.campaignId}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Otvoriť kampaň
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
