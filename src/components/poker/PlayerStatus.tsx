"use client";

import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  Called: "text-[var(--text-primary)] bg-white/10",
  Checked: "text-[var(--text-secondary)] bg-white/8",
  Raised: "text-[var(--accent-lime)] bg-[var(--accent-lime)]/10",
  Bet: "text-[var(--accent-lime)] bg-[var(--accent-lime)]/10",
  Folded: "text-[var(--danger)] bg-[var(--danger)]/10",
  "All In": "text-[var(--danger)] bg-[var(--danger)]/15",
  Waiting: "text-[var(--text-secondary)] bg-white/8",
  Disconnected: "text-[var(--text-secondary)] bg-white/8",
};

/** A small floating label that appears above a player and fades out on its own. */
export function PlayerStatus({ label, statusKey }: { label: string | null; statusKey: string | number }) {
  if (!label) return null;
  return (
    <div
      key={statusKey}
      className={cn(
        "animate-status-pill pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm",
        STATUS_STYLE[label] ?? "text-[var(--text-secondary)] bg-white/8"
      )}
    >
      {label}
    </div>
  );
}
