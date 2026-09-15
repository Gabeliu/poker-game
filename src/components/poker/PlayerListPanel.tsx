"use client";

import { PlayerAvatar } from "./PlayerAvatar";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicPlayer } from "@/lib/types";

export function PlayerListPanel({ players, meId }: { players: PublicPlayer[]; meId: string | null }) {
  const sorted = [...players].sort((a, b) => a.seat - b.seat);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Players <span className="text-[var(--text-secondary)]/60">{players.length}</span>
      </h3>
      <div className="flex flex-col gap-1">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex items-center gap-2 rounded-lg px-1.5 py-1.5",
              p.id === meId && "bg-[var(--accent-lime)]/8 ring-1 ring-[var(--accent-lime)]/25"
            )}
          >
            <PlayerAvatar name={p.displayName} size="xs" dimmed={!p.hasBoughtIn} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                {p.displayName}
                {p.id === meId ? " (you)" : ""}
              </p>
              <p className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                {p.hasBoughtIn ? formatChips(p.chips) : "No chips"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
