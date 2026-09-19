"use client";

import { useEffect, useState } from "react";
import { PokerChip } from "./PokerChip";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Point {
  xPct: number;
  yPct: number;
}

interface ChipFlightProps {
  from: Point;
  to: Point;
  amount: number;
  /** A bet travels to the pot; a payout travels to a winner, then pops a
   * "+amount" over their seat. */
  kind?: "bet" | "win";
  durationMs?: number;
  onDone: () => void;
}

/** How long the "+amount" lingers above a winner after the chips land. */
const WIN_FLOAT_MS = 1300;

/** A chip that visually travels from one point on the table to another.
 * Position eases via a CSS transition on left/top percentages (which
 * naturally scale with the table's own responsive size), while an inner
 * element arcs up and settles so the chip reads as tossed, not slid. */
export function ChipFlight({ from, to, amount, kind = "bet", durationMs, onDone }: ChipFlightProps) {
  const duration = durationMs ?? (kind === "win" ? 620 : 460);
  const [pos, setPos] = useState(from);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPos(to));
    const timer = setTimeout(onDone, duration + (kind === "win" ? WIN_FLOAT_MS : 60));
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per mount; flight is remounted via a fresh key for each new trip
  }, []);

  const arrived = pos === to;

  return (
    <div
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-[left,top]"
      style={{
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.45, 0.05, 0.25, 1)",
      }}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-0.5",
          arrived && (kind === "win" ? "animate-chip-arc-out" : "animate-chip-arc")
        )}
        style={{ ["--arc-duration" as string]: `${duration}ms` }}
      >
        <PokerChip size={22} denomination={amount} />
        <span className="rounded-full bg-black/60 px-1.5 py-px text-[9px] font-semibold tabular-nums text-[var(--accent-lime)]">
          {formatChips(amount)}
        </span>
      </div>
      {kind === "win" && arrived && (
        <span
          className="animate-win-float absolute -top-6 whitespace-nowrap rounded-full border border-[var(--room-gold)]/50 bg-black/70 px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--room-gold)] shadow-[0_4px_14px_rgba(0,0,0,0.5)]"
          style={{ animationDelay: `${duration}ms` }}
          data-testid="win-float"
        >
          +{formatChips(amount)}
        </span>
      )}
    </div>
  );
}
