import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatDelta } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils";

interface TrendDeltaProps {
  value: number;
  /** When true, a negative delta is "good" (e.g. CPC, CPA). */
  invert?: boolean;
  className?: string;
  showIcon?: boolean;
}

export function TrendDelta({ value, invert = false, className, showIcon = true }: TrendDeltaProps) {
  const neutral = Math.abs(value) < 0.05;
  const isGood = invert ? value < 0 : value > 0;
  const color = neutral ? "text-muted" : isGood ? "text-success" : "text-danger";
  const Icon = neutral ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        color,
        className,
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      {formatDelta(value)}
    </span>
  );
}
