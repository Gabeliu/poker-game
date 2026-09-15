"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TurnTimerProps {
  durationSeconds: number;
  variant?: "ring" | "pill";
  className?: string;
}

/**
 * A countdown that always starts at `durationSeconds` on mount. The parent
 * remounts this component (via a `key` tied to the turn's deadline) at the
 * start of every turn — this is a purely visual pacing cue, the server is
 * the sole authority on timeouts, so a few hundred ms of network-latency
 * imprecision from not reading the exact deadline is an acceptable trade
 * for never needing to read the clock during render.
 */
export function TurnTimer({ durationSeconds, variant = "ring", className }: TurnTimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const pct = Math.max(0, Math.min(1, remaining / durationSeconds));
  const urgent = pct < 0.25;

  if (variant === "ring") {
    return (
      <div
        className={cn("h-full w-full rounded-full transition-[background] duration-1000 ease-linear", className)}
        style={{
          background: `conic-gradient(${urgent ? "var(--danger)" : "var(--accent-lime)"} ${pct * 360}deg, transparent 0deg)`,
        }}
      />
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur",
        urgent ? "border-[var(--danger)]/50 text-[var(--danger)]" : "border-[var(--accent-lime)]/40 text-[var(--accent-lime)]",
        className
      )}
    >
      <span className="relative h-4 w-4 shrink-0 rounded-full bg-white/10">
        <span
          className="absolute inset-0 rounded-full transition-[background] duration-1000 ease-linear"
          style={{
            background: `conic-gradient(currentColor ${pct * 360}deg, transparent 0deg)`,
          }}
        />
      </span>
      Your Turn! {minutes}:{String(seconds).padStart(2, "0")}
    </div>
  );
}
