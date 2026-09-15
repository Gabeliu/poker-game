"use client";

import { cn } from "@/lib/utils";
import { formatChips } from "@/lib/format";
import type { SeatPosition } from "@/lib/seatLayout";
import { PlayingCard } from "./PlayingCard";
import { Crown, WifiOff, X } from "lucide-react";

interface PlayerSeatProps {
  seat: SeatPosition;
  isDealer: boolean;
  isActiveTurn: boolean;
  canHostRemove: boolean;
  onRemove?: () => void;
  turnDeadline?: number | null;
  turnTimeLimitSeconds: number;
}

export function PlayerSeat({
  seat,
  isDealer,
  isActiveTurn,
  canHostRemove,
  onRemove,
  turnDeadline,
  turnTimeLimitSeconds,
}: PlayerSeatProps) {
  const { player, isSelf } = seat;
  const folded = player.handStatus === "folded";
  const allIn = player.handStatus === "all-in";
  const sittingOut = player.sittingOut || player.handStatus === "sitting-out" || !player.hasBoughtIn;

  return (
    <div
      className="absolute flex flex-col items-center"
      data-testid="player-seat"
      data-player-name={player.displayName}
      data-player-chips={player.chips}
      data-player-status={player.handStatus}
      style={{
        left: `${seat.xPct}%`,
        top: `${seat.yPct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Hole cards */}
      <div className="mb-1 flex gap-0.5">
        {player.hasHoleCards ? (
          Array.from({ length: 2 }).map((_, i) => (
            <PlayingCard
              key={i}
              card={player.holeCards[i]}
              faceDown={player.holeCards.length === 0}
              size="sm"
              dealDelayMs={i * 90}
            />
          ))
        ) : (
          <div className="h-10" />
        )}
      </div>

      {/* Seat card */}
      <div
        className={cn(
          "relative flex flex-col items-center gap-0.5 rounded-xl border px-3 py-1.5 min-w-[104px] backdrop-blur-sm transition-all",
          "border-white/10 bg-card/90",
          folded && "opacity-40 grayscale",
          isActiveTurn && !folded && "animate-active-glow border-transparent"
        )}
      >
        {isDealer && (
          <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-[var(--gold)] text-[10px] font-bold text-black flex items-center justify-center shadow">
            D
          </div>
        )}
        {player.isHost && (
          <Crown className="absolute -top-2 -left-2 h-4 w-4 text-[var(--gold)] drop-shadow" fill="currentColor" />
        )}
        {player.connectionStatus === "disconnected" && (
          <WifiOff className="absolute top-1 right-1 h-3 w-3 text-destructive" />
        )}
        {canHostRemove && !isSelf && (
          <button
            onClick={onRemove}
            className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
            title="Remove player"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <span className="text-xs font-medium truncate max-w-[110px]">
          {player.displayName}
          {isSelf ? " (you)" : ""}
        </span>
        <span className="text-[13px] font-semibold text-[var(--gold)] tabular-nums">
          {formatChips(player.chips)}
        </span>

        {folded && (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tracking-wider text-white/70">
            FOLDED
          </span>
        )}
        {allIn && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-destructive">All-in</span>
        )}
        {sittingOut && !folded && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {!player.hasBoughtIn ? "No chips yet" : "Sitting out"}
          </span>
        )}

        {isActiveTurn && player.handStatus === "active" && (
          <TurnTimerBar key={turnDeadline ?? 0} durationSeconds={turnTimeLimitSeconds} />
        )}
      </div>

      {/* Current bet chip */}
      {player.currentBet > 0 && (
        <div className="animate-chip-pop mt-1.5 flex items-center gap-1 rounded-full bg-black/60 border border-[var(--gold)]/40 px-2 py-0.5 text-[11px] font-semibold text-[var(--gold)] tabular-nums">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
          {formatChips(player.currentBet)}
        </div>
      )}
    </div>
  );
}

function TurnTimerBar({ durationSeconds }: { durationSeconds: number }) {
  // Purely visual pacing cue — the server is the sole authority on timeouts
  // and will auto-fold/check regardless of what this bar shows. The parent
  // remounts this component (via a `key` on the turn's deadline) at the
  // start of each turn, so it always animates one full duration from mount
  // with no need to read the clock during render.
  return (
    <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full origin-left bg-[var(--gold)] animate-[turn-timer_linear_forwards]"
        style={{ animationDuration: `${durationSeconds}s` }}
      />
    </div>
  );
}
