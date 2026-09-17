"use client";

import { cn } from "@/lib/utils";
import { formatChips } from "@/lib/format";
import { PokerChip } from "./PokerChip";

interface ChipStackProps {
  amount: number;
  variant?: "stack" | "bet";
  size?: "sm" | "md";
  className?: string;
}

/** Small coin-icon + number pill, used for a player's stack or their current bet. */
export function ChipStack({ amount, variant = "stack", size = "sm", className }: ChipStackProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-sm",
        variant === "stack"
          ? "text-[var(--text-secondary)]"
          : "bg-black/50 text-[var(--accent-lime)] border border-[var(--accent-lime)]/25 font-semibold shadow-[0_1px_6px_rgba(0,0,0,0.4)]",
        className
      )}
    >
      <span className={cn("chip-mini-stack", variant === "bet" && "chip-mini-stack-bet")}>
        {variant === "bet" && <PokerChip size={18} denomination={amount} className="absolute top-1" />}
        <PokerChip size={variant === "bet" ? 18 : 13} denomination={amount} />
      </span>
      {formatChips(amount)}
    </span>
  );
}
