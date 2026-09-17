"use client";

import { useEffect, useState } from "react";
import { PokerChip } from "./PokerChip";
import { formatChips } from "@/lib/format";

interface Point {
  xPct: number;
  yPct: number;
}

interface ChipFlightProps {
  from: Point;
  to: Point;
  amount: number;
  durationMs?: number;
  onDone: () => void;
}

/** A chip that visually travels from one point on the table to another —
 * used for player→pot bets and pot→winner payouts. Position is animated via
 * CSS transition on left/top percentages (which naturally scale with the
 * table's own responsive size) rather than pixel math. */
export function ChipFlight({ from, to, amount, durationMs = 280, onDone }: ChipFlightProps) {
  const [pos, setPos] = useState(from);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPos(to));
    const timer = setTimeout(onDone, durationMs + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per mount; flight is remounted via a fresh key for each new trip
  }, []);

  return (
    <div
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-[left,top] ease-out"
      style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, transitionDuration: `${durationMs}ms` }}
    >
      <PokerChip size={22} denomination={amount} />
      <span className="rounded-full bg-black/60 px-1.5 py-px text-[9px] font-semibold tabular-nums text-[var(--accent-lime)]">
        {formatChips(amount)}
      </span>
    </div>
  );
}
