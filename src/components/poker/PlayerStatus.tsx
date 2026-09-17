"use client";

import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  Called: "text-[var(--warning)] bg-[var(--warning)]/12",
  Checked: "text-[var(--info)] bg-[var(--info)]/10",
  Raised: "text-[var(--positive)] bg-[var(--positive)]/12",
  Bet: "text-[var(--positive)] bg-[var(--positive)]/12",
  Folded: "text-[var(--danger)] bg-[var(--danger)]/10",
  "All In": "text-[var(--accent-purple)] bg-[var(--accent-purple)]/15",
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
        "player-status-pill animate-status-pill pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm",
        STATUS_STYLE[label] ?? "text-[var(--text-secondary)] bg-white/8"
      )}
    >
      {label}
    </div>
  );
}
