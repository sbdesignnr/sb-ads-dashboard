"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyMetric, MetricKey } from "@/lib/types";
import { METRICS } from "@/lib/metric-config";
import { dailyMetricValue } from "@/lib/utils/metrics";
import { formatDateShort, formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface PerformanceChartProps {
  data: DailyMetric[];
  metricKeys?: MetricKey[];
  defaultMetric?: MetricKey;
  height?: number;
  headerRight?: React.ReactNode;
  title?: string;
  description?: string;
  onPointClick?: (point: { date: string; value: number }) => void;
}

export function PerformanceChart({
  data,
  metricKeys = ["spend", "revenue", "conversions", "clicks", "roas"],
  defaultMetric,
  height = 320,
  headerRight,
  title,
  description,
  onPointClick,
}: PerformanceChartProps) {
  const [active, setActive] = useState<MetricKey>(defaultMetric ?? metricKeys[0]);
  const metric = METRICS[active];

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        value: dailyMetricValue(d, active),
      })),
    [data, active],
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {metricKeys.map((key) => {
            const m = METRICS[key];
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all cursor-pointer",
                  isActive
                    ? "border-transparent text-white"
                    : "border-border bg-surface text-muted hover:text-foreground hover:border-primary/40",
                )}
                style={isActive ? { backgroundColor: m.color } : undefined}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: isActive ? "#fff" : m.color }}
                />
                {m.label}
              </button>
            );
          })}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      {(title || description) && (
        <div className="mb-2">
          {title && <p className="text-sm font-medium text-foreground">{title}</p>}
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(state: { activePayload?: Array<{ payload: { date: string; value: number } }> }) => {
            const payload = state?.activePayload?.[0]?.payload;
            if (payload && onPointClick) onPointClick(payload);
          }}
        >
          <defs>
            <linearGradient id={`grad-${active}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            axisLine={{ stroke: "#1E2D45" }}
            tickLine={false}
            minTickGap={28}
            dy={6}
          />
          <YAxis
            tick={{ fill: "#94A3B8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) => metric.format(v)}
          />
          <Tooltip
            cursor={{ stroke: metric.color, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={({ active: act, payload, label }) => {
              if (!act || !payload || payload.length === 0) return null;
              const value = payload[0].value as number;
              return (
                <div className="rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
                  <p className="text-xs text-muted">{formatDate(String(label))}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: metric.color }}>
                    {metric.format(value)}
                  </p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={metric.color}
            strokeWidth={2.25}
            fill={`url(#grad-${active})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#0F1623", fill: metric.color }}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
