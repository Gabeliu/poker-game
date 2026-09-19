"use client";

import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tweens a displayed number toward `value` instead of jumping — a pot that
 * grows chip by chip reads as money moving, not a number being replaced.
 * The first render (and anyone with reduced-motion set) shows the value
 * as-is, so a reconnect or a screen-reader user never waits on a count.
 */
export function useAnimatedNumber(value: number, durationMs = 450): number {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = displayRef.current;
    if (reduce || from === value) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = t >= 1 ? value : Math.round(from + (value - from) * easeOutCubic(t));
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}
