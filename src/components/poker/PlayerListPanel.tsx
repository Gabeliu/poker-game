"use client";

import { PlayerAvatar } from "./PlayerAvatar";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicPlayer } from "@/lib/types";

/** One line on where a player stands. During a hand that includes whether
 * they're still in it — the list used to say "Ready" next to someone who had
 * folded, or who was all-in with nothing left. */
function statusFor(p: PublicPlayer, handInProgress: boolean): string {
  if (p.connectionStatus === "disconnected") return "Offline";
  if (handInProgress && p.handStatus === "all-in") return "All-in";
  if (handInProgress && p.handStatus === "folded") return "Folded";
  if (p.sittingOut) return "Sitting out";
  if (!p.hasBoughtIn) return "Awaiting buy-in";
  if (p.chips <= 0 && p.handStatus !== "all-in" && p.handStatus !== "active") return "Out of chips";
  if (handInProgress) return p.handStatus === "active" ? "In the hand" : "Waiting for next hand";
  return "Ready";
}

export function PlayerListPanel({
  players,
  meId,
  handInProgress = false,
}: {
  players: PublicPlayer[];
  meId: string | null;
  handInProgress?: boolean;
}) {
  const sorted = [...players].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));

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
              // Inset: the sidebar scrolls, and a scroll area clips anything drawn
              // outside its children — an outer ring lost its left and right edges.
              p.id === meId && "bg-[var(--accent-lime)]/8 ring-1 ring-inset ring-[var(--accent-lime)]/25"
            )}
          >
            <PlayerAvatar name={p.displayName} size="xs" dimmed={!p.hasBoughtIn} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                {p.displayName}
                {p.id === meId ? " (you)" : ""}
              </p>
              <p className="text-[10px] tabular-nums text-[var(--text-secondary)]">
                {p.isHost ? "Host · " : ""}{statusFor(p, handInProgress)}
              </p>
            </div>
            <span className="text-xs tabular-nums text-[var(--text-primary)]">{formatChips(p.chips)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
