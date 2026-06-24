"use client";

import { motion } from "framer-motion";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";

interface ScoreGaugeProps {
  score: number; // 0-100
  grade?: string;
  size?: number;
  label?: string;
}

function colorFor(score: number): string {
  if (score >= 75) return "#10B981";
  if (score >= 60) return "#3B82F6";
  if (score >= 45) return "#F59E0B";
  return "#EF4444";
}

export function ScoreGauge({ score, grade, size = 180, label = "Skóre účtu" }: ScoreGaugeProps) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 270° arc (gauge style)
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const color = colorFor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-[135deg]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1E2D45"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset: arcLength * (1 - progress) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-foreground">
          <AnimatedNumber value={score} format={(n) => Math.round(n).toString()} />
        </span>
        {grade && (
          <span className="mt-0.5 text-sm font-medium" style={{ color }}>
            Hodnotenie {grade}
          </span>
        )}
        <span className="text-xs text-muted">{label}</span>
      </div>
    </div>
  );
}
