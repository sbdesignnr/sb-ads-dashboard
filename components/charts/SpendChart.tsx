"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatDateShort, formatDate } from "@/lib/utils/formatters";

export interface SpendSeries {
  key: string;
  label: string;
  color: string;
}

interface SpendChartProps {
  data: Array<{ date: string } & Record<string, number | string>>;
  series: SpendSeries[];
  height?: number;
  stacked?: boolean;
  formatValue?: (n: number) => string;
}

export function SpendChart({
  data,
  series,
  height = 280,
  stacked = true,
  formatValue = (n) => formatCurrency(n, true),
}: SpendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fill: "#94A3B8", fontSize: 11 }}
          axisLine={{ stroke: "#1E2D45" }}
          tickLine={false}
          minTickGap={24}
          dy={6}
        />
        <YAxis
          tick={{ fill: "#94A3B8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => formatValue(v)}
        />
        <Tooltip
          cursor={{ fill: "rgba(59,130,246,0.06)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
            return (
              <div className="rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
                <p className="text-xs text-muted">{formatDate(String(label))}</p>
                {payload.map((p) => (
                  <p key={String(p.dataKey)} className="mt-1 flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
                    <span className="text-muted">{series.find((s) => s.key === p.dataKey)?.label}</span>
                    <span className="ml-auto font-medium tabular-nums text-foreground">
                      {formatCurrency(Number(p.value))}
                    </span>
                  </p>
                ))}
                {series.length > 1 && (
                  <p className="mt-1.5 flex items-center justify-between gap-4 border-t border-border pt-1.5 text-sm">
                    <span className="text-muted">Spolu</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatCurrency(total)}
                    </span>
                  </p>
                )}
              </div>
            );
          }}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? "spend" : undefined}
            fill={s.color}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
            animationDuration={800}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
