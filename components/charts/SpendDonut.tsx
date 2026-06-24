"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils/formatters";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface SpendDonutProps {
  data: DonutSlice[];
  height?: number;
  centerLabel?: string;
}

export function SpendDonut({ data, height = 240, centerLabel = "Celkové výdavky" }: SpendDonutProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="64%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="none"
              animationDuration={800}
            >
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const slice = payload[0];
                const val = Number(slice.value);
                const pct = total ? (val / total) * 100 : 0;
                return (
                  <div className="rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
                    <p className="text-sm font-medium text-foreground">{slice.name}</p>
                    <p className="text-sm tabular-nums text-muted">
                      {formatCurrency(val)} · {pct.toFixed(1)} %
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">{centerLabel}</span>
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {formatCurrency(total, true)}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-auto">
        {data.map((d) => {
          const pct = total ? (d.value / total) * 100 : 0;
          return (
            <div key={d.label} className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{d.label}</p>
                <p className="text-xs tabular-nums text-muted">
                  {formatCurrency(d.value, true)} · {pct.toFixed(1)} %
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
