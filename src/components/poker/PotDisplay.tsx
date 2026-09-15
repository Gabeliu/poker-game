"use client";

import { formatChips } from "@/lib/format";
import type { SidePot } from "@/lib/types";

export function PotDisplay({ pots, liveTotal }: { pots: SidePot[]; liveTotal: number }) {
  const total = pots.length > 0 ? pots.reduce((s, p) => s + p.amount, 0) : liveTotal;
  if (total <= 0) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5 rounded-full bg-black/55 border border-[var(--gold)]/30 px-3.5 py-1 text-sm font-semibold text-[var(--gold)] shadow-inner tabular-nums">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
        Pot {formatChips(total)}
      </div>
      {pots.length > 1 && (
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          {pots.map((p, i) => (
            <span key={p.id}>
              {i === 0 ? "Main" : `Side ${i}`}: {formatChips(p.amount)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
