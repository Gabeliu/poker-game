"use client";

import { useState } from "react";
import { formatChips } from "@/lib/format";
import type { SidePot } from "@/lib/types";
import { PokerChip } from "./PokerChip";

interface PotProps {
  pots: SidePot[];
  liveTotal: number;
  /** Chips returned because no one could match them — shown apart from the
   * pot, never as a side pot. */
  uncalled?: { playerName: string; amount: number } | null;
}

export function Pot({ pots, liveTotal, uncalled }: PotProps) {
  const total = pots.length > 0 ? pots.reduce((s, p) => s + p.amount, 0) : liveTotal;

  // "Adjust state during render" pattern (React's own recommended escape
  // hatch for deriving from a prop change) instead of an effect: bump a
  // counter to retrigger the animation whenever the pot total changes.
  const [prevTotal, setPrevTotal] = useState(total);
  const [bump, setBump] = useState(0);
  if (total !== prevTotal) {
    setPrevTotal(total);
    setBump((b) => b + 1);
  }

  if (total <= 0) return null;

  return (
    <div className="pot-display flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-secondary)]">Pot</span>
      <span
        key={bump}
        className="animate-pot-bump flex items-center gap-3 text-3xl font-bold tabular-nums text-[var(--text-primary)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-4xl"
      >
        <span className="pot-chips" aria-hidden><PokerChip size={25} denomination={25} /><PokerChip size={25} denomination={100} /><PokerChip size={25} denomination={1000} /></span>
        {formatChips(total)}
      </span>
      {uncalled && uncalled.amount > 0 && (
        <span className="mt-1 text-[10px] font-medium text-[var(--accent-lime)]" data-testid="uncalled-bet">
          Uncalled {formatChips(uncalled.amount)} returned to {uncalled.playerName}
        </span>
      )}
      {pots.length > 1 && (
        <div className="mt-1 flex gap-2 text-[10px] text-[var(--text-secondary)]">
          {pots.map((p, i) => (
            <span key={p.id}>
              {i === 0 ? "Main" : `Side ${i}`} {formatChips(p.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
