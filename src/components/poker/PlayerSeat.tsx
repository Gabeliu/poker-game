"use client";

import { cn } from "@/lib/utils";
import type { SeatPosition } from "@/lib/seatLayout";
import { PlayingCard } from "./PlayingCard";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChipStack } from "./ChipStack";
import { PlayerStatus } from "./PlayerStatus";
import { TurnTimer } from "./TurnTimer";
import { Crown, WifiOff, X } from "lucide-react";

type BadgeKind = "D" | "SB" | "BB" | null;

interface PlayerSeatProps {
  seat: SeatPosition;
  badge: BadgeKind;
  isActiveTurn: boolean;
  canHostRemove: boolean;
  onRemove?: () => void;
  turnDeadline?: number | null;
  turnTimeLimitSeconds: number;
  statusLabel: string | null;
  statusKey: string | number;
  /** Shrinks avatar/text as more players join, per the density scale from PokerTable. */
  density: "roomy" | "cozy" | "tight";
}

const AVATAR_SIZE: Record<PlayerSeatProps["density"], "lg" | "md" | "sm" | "xs"> = {
  roomy: "lg",
  cozy: "sm",
  tight: "xs",
};

export function PlayerSeat({
  seat,
  badge,
  isActiveTurn,
  canHostRemove,
  onRemove,
  turnDeadline,
  turnTimeLimitSeconds,
  statusLabel,
  statusKey,
  density,
}: PlayerSeatProps) {
  const { player } = seat;
  const folded = player.handStatus === "folded";
  const allIn = player.handStatus === "all-in";
  const sittingOut = player.sittingOut || player.handStatus === "sitting-out" || !player.hasBoughtIn;
  const showCardBacks = player.hasHoleCards && !player.holeCardsRevealed && !folded;
  const showRevealedCards = player.hasHoleCards && player.holeCardsRevealed;

  return (
    <div
      className="group absolute flex flex-col items-center"
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
      <div className={cn("relative flex flex-col items-center", folded && "animate-fold-away")}>
        <PlayerStatus label={statusLabel} statusKey={statusKey} />

        {/* Small card backs (or revealed showdown cards) peeking behind the avatar — only at
            the roomiest density; they're the first thing to go as the table fills up. */}
        {(showCardBacks || showRevealedCards) && density === "roomy" && (
          <div className="mb-1 flex gap-0.5">
            <PlayingCard
              card={showRevealedCards ? player.holeCards[0] : undefined}
              faceDown={!showRevealedCards}
              size="xs"
              rotationDeg={-8}
              className="-mr-2"
            />
            <PlayingCard
              card={showRevealedCards ? player.holeCards[1] : undefined}
              faceDown={!showRevealedCards}
              size="xs"
              rotationDeg={8}
              className="-ml-2"
            />
          </div>
        )}

        <div className="relative">
          {isActiveTurn && !folded && (
            <div className="absolute -inset-1.5 rounded-full">
              <TurnTimer key={turnDeadline ?? 0} durationSeconds={turnTimeLimitSeconds} variant="ring" />
            </div>
          )}
          <PlayerAvatar name={player.displayName} size={AVATAR_SIZE[density]} dimmed={folded || sittingOut} />

          {badge && (
            <span
              className={cn(
                "absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold shadow",
                badge === "D" ? "bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)]" : "bg-white/20 text-white"
              )}
            >
              {badge}
            </span>
          )}
          {player.isHost && (
            <Crown className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 text-[var(--accent-lime)] drop-shadow" fill="currentColor" />
          )}
          {player.connectionStatus === "disconnected" && (
            <WifiOff className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-black/70 p-0.5 text-[var(--danger)]" />
          )}
          {canHostRemove && (
            <button
              onClick={onRemove}
              className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Remove player"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <span
          className={cn(
            "max-w-[88px] truncate text-center font-medium text-[var(--text-primary)]",
            density === "roomy" ? "mt-1 text-xs" : "text-[11px]"
          )}
        >
          {player.displayName}
        </span>

        {allIn ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--danger)]">All-in</span>
        ) : sittingOut ? (
          <span className="text-[10px] text-[var(--text-secondary)]">
            {!player.hasBoughtIn ? "No chips" : "Sitting out"}
          </span>
        ) : (
          <ChipStack amount={player.chips} variant="stack" />
        )}

        {player.currentBet > 0 && (
          <ChipStack
            amount={player.currentBet}
            variant="bet"
            className={cn("animate-chip-pop", density === "roomy" ? "mt-1" : "mt-0.5")}
          />
        )}
      </div>
    </div>
  );
}
