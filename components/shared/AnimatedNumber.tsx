"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Smoothly tweens to `value`. First mount counts up from 0; subsequent value
 * changes tween from the previous value (great for live sliders).
 */
export function AnimatedNumber({
  value,
  format,
  duration = 1.1,
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={className}>
      {format ? format(display) : Math.round(display).toLocaleString("sk-SK")}
    </span>
  );
}
