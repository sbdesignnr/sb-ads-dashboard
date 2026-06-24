"use client";

import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  "aria-label"?: string;
}

/** Lightweight themed range slider (native input, no extra deps). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  "aria-label": ariaLabel,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("range-slider", className)}
      style={{
        background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-secondary) ${pct}%, var(--color-surface-2) ${pct}%, var(--color-surface-2) 100%)`,
      }}
    />
  );
}
