"use client";

import { PlayingCard } from "./PlayingCard";
import { formatSignedChips } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HandHistoryEntry } from "@/lib/types";

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function HandHistoryPanel({ entries }: { entries: HandHistoryEntry[] }) {
  const recent = [...entries].reverse().slice(0, 12);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Hand History
      </h3>
      {recent.length === 0 ? (
        <p className="px-1 text-xs text-[var(--text-secondary)]">No hands played yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {recent.map((entry, i) => (
            <div
              key={`${entry.handNumber}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-1">
                {entry.holeCards.length > 0 ? (
                  entry.holeCards.map((card, ci) => <PlayingCard key={ci} card={card} size="xs" />)
                ) : (
                  <span className="text-[10px] text-[var(--text-secondary)]">Sat out</span>
                )}
              </div>
              <div className="flex flex-col items-end">
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    entry.netChange > 0
                      ? "text-[var(--positive)]"
                      : entry.netChange < 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--text-secondary)]"
                  )}
                >
                  {formatSignedChips(entry.netChange)}
                </span>
                <span className="text-[9px] text-[var(--text-secondary)]">{timeAgo(entry.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
