"use client";

import { METRICS } from "@/lib/metric-config";
import { PlatformBadge } from "@/components/shared/PlatformBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ReportData } from "@/lib/report";
import { cn } from "@/lib/utils";

export function ReportPreview({ data }: { data: ReportData }) {
  const { config, account, rows, rangeLabel, generatedAt } = data;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#06090F]">
      {/* Branded header */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-[#0F1623] to-[#080C14] p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white">
              SB
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-foreground">SB DESIGN</p>
              <p className="text-xs text-muted">Ads Analytics Report</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Vygenerované</p>
            <p className="text-sm font-medium text-foreground">{generatedAt}</p>
          </div>
        </div>
        <div className="relative mt-6">
          <h2 className="text-xl font-semibold text-foreground">{config.title}</h2>
          <p className="text-sm text-muted">
            {rangeLabel} · {rows.length} {rows.length === 1 ? "kampaň" : "kampaní"}
          </p>
        </div>
      </div>

      {/* Account summary */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
        {config.metrics.slice(0, 5).map((key) => {
          const m = METRICS[key];
          return (
            <div key={key} className="bg-[#06090F] p-4">
              <p className="text-xs text-muted">{m.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {m.format(account[key])}
              </p>
            </div>
          );
        })}
      </div>

      {/* Campaign table */}
      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
                Kampaň
              </th>
              {config.metrics.map((key) => (
                <th
                  key={key}
                  className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted"
                >
                  {METRICS[key].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.campaign.id}
                className={cn("border-b border-border/50", i % 2 === 1 && "bg-white/[0.015]")}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={row.campaign.platform} showLabel={false} />
                    <span className="truncate font-medium text-foreground">{row.campaign.name}</span>
                    <StatusBadge status={row.campaign.status} />
                  </div>
                </td>
                {config.metrics.map((key) => (
                  <td key={key} className="px-3 py-2 text-right tabular-nums text-muted">
                    {METRICS[key].format(row.totals[key])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-3 py-2 text-foreground">Spolu</td>
                {config.metrics.map((key) => (
                  <td key={key} className="px-3 py-2 text-right tabular-nums text-foreground">
                    {METRICS[key].format(account[key])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-6 py-3">
        <p className="text-xs text-muted">
          Vygenerované nástrojom SB Design — Ads Analytics Dashboard · dôverné
        </p>
      </div>
    </div>
  );
}
