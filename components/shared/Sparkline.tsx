import { useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  strokeWidth?: number;
  fill?: boolean;
}

/** Lightweight inline SVG sparkline (no chart lib needed). */
export function Sparkline({
  data,
  color = "#3B82F6",
  width = 96,
  height = 32,
  className,
  strokeWidth = 1.75,
  fill = true,
}: SparklineProps) {
  const gradientId = useId();
  if (!data || data.length === 0) {
    return <div style={{ width, height }} className={className} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pad = strokeWidth;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = pad + (height - pad * 2) - ((d - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradientId})`} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
