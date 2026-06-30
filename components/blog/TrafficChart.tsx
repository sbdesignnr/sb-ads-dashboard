"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateShort, formatDate } from "@/lib/utils/formatters";
import type { TrafficPoint } from "@/lib/blog/ga4";

export function TrafficChart({ data, height = 180 }: { data: TrafficPoint[]; height?: number }) {
  if (!data.length) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted">
        Žiadne dáta o návštevnosti.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="blogTraffic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDateShort(String(v))}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={34}
        />
        <Tooltip
          contentStyle={{
            background: "#0f1623",
            border: "1px solid #1e2d45",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(v) => formatDate(String(v))}
          formatter={(value: number) => [`${value} zobrazení`, "Organic"]}
        />
        <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#blogTraffic)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
