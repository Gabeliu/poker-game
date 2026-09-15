"use client";

import { cn } from "@/lib/utils";
import { formatChips } from "@/lib/format";

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
      <span
        className={cn(
          "rounded-full",
          size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5",
          variant === "stack" ? "bg-[var(--text-secondary)]" : "bg-[var(--accent-lime)]"
        )}
      />
      {formatChips(amount)}
    </span>
  );
}
