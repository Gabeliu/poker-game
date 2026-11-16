"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

interface TurnTimerProps {
  durationSeconds: number;
  /** When time runs out, on this browser's clock (epoch ms) — the server's
   * deadline with the clock difference taken off (see `clockOffset` in
   * useRoomStore). Without it the countdown just shows the full duration. */
  endsAt?: number | null;
  variant?: "ring" | "pill" | "bar";
  className?: string;
}

function subscribeToTick(onTick: () => void): () => void {
  const interval = setInterval(onTick, 250);
  return () => clearInterval(interval);
}

/**
 * A countdown to `endsAt`. It reads the clock rather than counting its own
 * ticks, so it is right however it got on screen: a page reloaded halfway
 * through a turn shows what's actually left (it used to start again from the
 * full time), and a phone that was locked for twenty seconds comes back
 * twenty seconds further on (timers don't tick in the background, so it used
 * to pick up where it left off — and the player was folded "early").
 *
 * Still only a display: the server alone decides when time is up.
 */
export function TurnTimer({ durationSeconds, endsAt, variant = "ring", className }: TurnTimerProps) {
  const remaining = useSyncExternalStore(
    subscribeToTick,
    () => (endsAt == null ? durationSeconds : Math.max(0, Math.min(durationSeconds, Math.ceil((endsAt - Date.now()) / 1000)))),
    () => durationSeconds
  );

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

  if (variant === "bar") {
    return (
      <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
        <div
          className={cn(
            "h-full origin-left rounded-full transition-transform duration-1000 ease-linear",
            urgent ? "bg-[var(--danger)]" : "bg-[var(--accent-lime)]"
          )}
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div
      data-testid="turn-timer"
      data-seconds-left={remaining}
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
