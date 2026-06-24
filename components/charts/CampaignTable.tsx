"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { Sparkline } from "@/components/shared/Sparkline";
import { computeTotals } from "@/lib/utils/metrics";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
  typeLabel,
} from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";
import type { Campaign, MetricTotals } from "@/lib/types";

type SortKey =
  | "name"
  | "spend"
  | "clicks"
  | "ctr"
  | "cpc"
  | "conversions"
  | "roas"
  | "reach"
  | "frequency"
  | "cpm";

interface CampaignTableProps {
  campaigns: Campaign[];
  rangeDays?: number;
  showPlatform?: boolean;
  showMetaColumns?: boolean;
  showType?: boolean;
  limit?: number;
  defaultSort?: SortKey;
}

interface Row {
  campaign: Campaign;
  totals: MetricTotals;
  spark: number[];
}

function roasColor(roas: number): string {
  if (roas >= 4) return "text-success";
  if (roas >= 2) return "text-warning";
  return "text-danger";
}

const trendColor: Record<Campaign["trend"], string> = {
  up: "#10B981",
  down: "#EF4444",
  flat: "#3B82F6",
};

export function CampaignTable({
  campaigns,
  rangeDays = 30,
  showPlatform = false,
  showMetaColumns = false,
  showType = false,
  limit,
  defaultSort = "spend",
}: CampaignTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<Row[]>(() => {
    return campaigns.map((campaign) => ({
      campaign,
      totals: computeTotals(campaign.daily.slice(-rangeDays)),
      spark: campaign.daily.slice(-14).map((d) => d.revenue),
    }));
  }, [campaigns, rangeDays]);

  const sorted = useMemo(() => {
    const getValue = (row: Row): number | string => {
      switch (sortKey) {
        case "name":
          return row.campaign.name.toLowerCase();
        case "reach":
          return row.totals.reach ?? 0;
        case "frequency":
          return row.totals.frequency ?? 0;
        default:
          return row.totals[sortKey];
      }
    };
    const out = [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return limit ? out.slice(0, limit) : out;
  }, [rows, sortKey, sortDir, limit]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortHeader = ({
    label,
    sortKeyName,
    align = "right",
  }: {
    label: string;
    sortKeyName: SortKey;
    align?: "left" | "right";
  }) => {
    const activeSort = sortKey === sortKeyName;
    const Icon = !activeSort ? ChevronsUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={align === "right" ? "text-right" : "text-left"}>
        <button
          onClick={() => toggleSort(sortKeyName)}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground cursor-pointer",
            align === "right" && "flex-row-reverse",
            activeSort && "text-foreground",
          )}
        >
          {label}
          <Icon className="h-3 w-3" />
        </button>
      </TableHead>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortHeader label="Kampaň" sortKeyName="name" align="left" />
          {showPlatform && <TableHead>Platforma</TableHead>}
          <TableHead>Status</TableHead>
          <SortHeader label="Výdavky" sortKeyName="spend" />
          <SortHeader label="Kliky" sortKeyName="clicks" />
          <SortHeader label="CTR" sortKeyName="ctr" />
          <SortHeader label="CPC" sortKeyName="cpc" />
          {showMetaColumns && <SortHeader label="CPM" sortKeyName="cpm" />}
          {showMetaColumns && <SortHeader label="Dosah" sortKeyName="reach" />}
          {showMetaColumns && <SortHeader label="Frekv." sortKeyName="frequency" />}
          <SortHeader label="Konverzie" sortKeyName="conversions" />
          <SortHeader label="ROAS" sortKeyName="roas" />
          <TableHead className="text-right">Trend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(({ campaign, totals, spark }, i) => (
          <motion.tr
            key={campaign.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.35) }}
            onClick={() => router.push(`/campaigns/${campaign.id}`)}
            className="group cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-2/60"
          >
            <TableCell className="max-w-[260px]">
              <div className="flex flex-col">
                <span className="truncate font-medium text-foreground group-hover:text-primary">
                  {campaign.name}
                </span>
                {showType && (
                  <span className="text-xs text-muted">
                    {typeLabel(campaign.type)} · {campaign.objective}
                  </span>
                )}
              </div>
            </TableCell>
            {showPlatform && (
              <TableCell>
                <PlatformBadge platform={campaign.platform} />
              </TableCell>
            )}
            <TableCell>
              <StatusBadge status={campaign.status} />
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatCurrency(totals.spend, true)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted">
              {formatNumber(totals.clicks)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted">
              {formatPercent(totals.ctr)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted">
              {formatCurrency(totals.cpc)}
            </TableCell>
            {showMetaColumns && (
              <TableCell className="text-right tabular-nums text-muted">
                {formatCurrency(totals.cpm)}
              </TableCell>
            )}
            {showMetaColumns && (
              <TableCell className="text-right tabular-nums text-muted">
                {totals.reach ? formatNumber(totals.reach) : "—"}
              </TableCell>
            )}
            {showMetaColumns && (
              <TableCell className="text-right tabular-nums text-muted">
                {totals.frequency ? totals.frequency.toFixed(2) : "—"}
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums text-foreground">
              {formatNumber(totals.conversions)}
            </TableCell>
            <TableCell className={cn("text-right font-semibold tabular-nums", roasColor(totals.roas))}>
              {formatRoas(totals.roas)}
            </TableCell>
            <TableCell>
              <div className="flex justify-end">
                <Sparkline
                  data={spark}
                  color={trendColor[campaign.trend]}
                  width={84}
                  height={28}
                />
              </div>
            </TableCell>
          </motion.tr>
        ))}
      </TableBody>
    </Table>
  );
}
