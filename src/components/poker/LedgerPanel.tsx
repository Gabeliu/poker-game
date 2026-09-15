"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { formatChips, formatSignedChips } from "@/lib/format";
import type { LedgerEntry } from "@/lib/types";

const LABELS: Record<LedgerEntry["type"], string> = {
  "initial-buy-in": "Initial buy-in",
  "additional-buy-in": "Additional buy-in",
  "hand-win": "Won hand",
  "hand-loss": "Lost hand",
  "host-adjustment": "Host adjustment",
};

export function LedgerPanel({ entries, currentChips }: { entries: LedgerEntry[]; currentChips: number }) {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="border-white/15 bg-card/80">
          <Receipt className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your chip history</p>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
            {sorted.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{LABELS[e.type]}</span>
                <span className={e.amount >= 0 ? "text-[var(--success)] font-medium tabular-nums" : "text-destructive font-medium tabular-nums"}>
                  {formatSignedChips(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm font-semibold">
          <span>Current stack</span>
          <span className="text-[var(--gold)] tabular-nums">{formatChips(currentChips)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
