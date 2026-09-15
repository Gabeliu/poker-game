"use client";

import { useState } from "react";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BetControlsProps {
  minAmount: number;
  maxAmount: number;
  potTotal: number;
  actionLabel: string; // "Bet" or "Raise"
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

/** The slide-out amount picker shown when Raise/Bet is selected. */
export function BetControls({ minAmount, maxAmount, potTotal, actionLabel, onConfirm, onCancel }: BetControlsProps) {
  const [amount, setAmount] = useState(minAmount);
  const clamp = (v: number) => Math.min(maxAmount, Math.max(minAmount, Math.round(v)));

  return (
    <div className="animate-in slide-in-from-bottom-2 fade-in flex w-full max-w-md flex-col gap-2.5 rounded-2xl border border-white/10 bg-black/55 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl duration-200">
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <span>
          Current bet <span className="text-[var(--text-primary)]">{formatChips(minAmount)}</span>
        </span>
        <span className="text-lg font-bold tabular-nums text-[var(--accent-lime)]">{formatChips(amount)}</span>
      </div>

      <input
        type="range"
        min={minAmount}
        max={Math.max(minAmount, maxAmount)}
        value={amount}
        onChange={(e) => setAmount(clamp(Number(e.target.value)))}
        className="h-1.5 w-full cursor-pointer accent-[var(--accent-lime)]"
      />

      <div className="flex gap-1.5">
        {[
          { label: "½ Pot", value: potTotal / 2 },
          { label: "¾ Pot", value: (potTotal * 3) / 4 },
          { label: "Pot", value: potTotal },
          { label: "All In", value: maxAmount },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setAmount(clamp(opt.value))}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(amount)}
          className={cn(
            "flex-1 rounded-lg bg-[var(--positive)] py-2 text-sm font-semibold text-black transition-transform active:scale-[0.98]"
          )}
        >
          {actionLabel} {formatChips(amount)}
        </button>
      </div>
    </div>
  );
}
