"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ArcPosition } from "@/lib/seatLayout";
import type { PublicPlayer } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChipStack } from "./ChipStack";
import { PlayerStatus } from "./PlayerStatus";
import { TurnTimer } from "./TurnTimer";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";
import { Crown, WifiOff, X } from "lucide-react";

type BadgeKind = "D" | "SB" | "BB" | null;

interface PlayerSeatProps {
  player: PublicPlayer;
  position: ArcPosition;
  badge: BadgeKind;
  isActiveTurn: boolean;
  isWinner?: boolean;
  /** Reached showdown but won nothing on any board — dimmed once the hand
   * is fully resolved, distinct from folding (which dims immediately). */
  isLoser?: boolean;
  canHostRemove: boolean;
  onRemove?: () => void;
  turnDeadline?: number | null;
  turnTimeLimitSeconds: number;
  statusLabel: string | null;
  statusKey: string | number;
  /** Shown under their revealed cards at showdown, e.g. "Two Pair, Kings and Fives".
   * This is Run 1's description when the hand ran it twice — see
   * `secondHandDescription` for Run 2, which is evaluated independently
   * and can be an entirely different hand. */
  handDescription?: string | null;
  /** Run 2's own independently-evaluated hand description, when the hand
   * ran it twice — never the same value as `handDescription` reused. */
  secondHandDescription?: string | null;
}

export function PlayerSeat({
  player,
  position,
  badge,
  isActiveTurn,
  isWinner,
  isLoser,
  canHostRemove,
  onRemove,
  turnDeadline,
  turnTimeLimitSeconds,
  statusLabel,
  statusKey,
  handDescription,
  secondHandDescription,
}: PlayerSeatProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const folded = player.handStatus === "folded";
  const allIn = player.handStatus === "all-in";
  const sittingOut = player.sittingOut || player.handStatus === "sitting-out" || !player.hasBoughtIn;
  const showCardBacks = player.hasHoleCards && !player.holeCardsRevealed && !folded;
  const showRevealedCards = player.hasHoleCards && player.holeCardsRevealed;

  return (
    <div
      className={cn("player-seat group absolute flex flex-col items-center", isActiveTurn && "seat-active", isWinner && "seat-winner", isLoser && "seat-loser", folded && "seat-folded")}
      data-testid="player-seat"
      data-player-name={player.displayName}
      data-player-chips={player.chips}
      data-player-status={player.handStatus}
      data-bet-edge={position.yPct > 65 ? "bottom" : position.yPct < 35 ? "top" : position.xPct < 50 ? "left" : "right"}
      data-bet-side={position.xPct < 50 ? "left" : "right"}
      style={{
        left: `${position.xPct}%`,
        top: `${position.yPct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="seat-panel relative flex flex-col items-center">
        <PlayerStatus label={statusLabel} statusKey={statusKey} />

        {/* Small card backs (or revealed showdown cards) peeking behind the
            avatar — hidden at the narrowest widths, where mobile prioritises
            the viewer's own cards over opponents'. */}
        {(showCardBacks || showRevealedCards) && (
          <div className="opponent-cards flex gap-0.5">
            <PlayingCard
              card={showRevealedCards ? player.holeCards[0] : undefined}
              faceDown={!showRevealedCards}
              size="sm"
              rotationDeg={-8}
              className="-mr-2"
            />
            <PlayingCard
              card={showRevealedCards ? player.holeCards[1] : undefined}
              faceDown={!showRevealedCards}
              size="sm"
              rotationDeg={8}
              className="-ml-2"
            />
          </div>
        )}
        {showRevealedCards && handDescription && (
          <span className="mb-1 hidden max-w-[110px] flex-col text-center text-[10px] font-medium text-[var(--accent-lime)] sm:flex">
            <span className="truncate">{secondHandDescription ? `Run 1: ${handDescription}` : handDescription}</span>
            {secondHandDescription && <span className="truncate">Run 2: {secondHandDescription}</span>}
          </span>
        )}

        <div className="relative">
          {isActiveTurn && !folded && (
            <div className="absolute -inset-1.5 rounded-full">
              <TurnTimer key={turnDeadline ?? 0} durationSeconds={turnTimeLimitSeconds} variant="ring" />
            </div>
          )}
          <PlayerAvatar name={player.displayName} size="table" dimmed={folded || sittingOut} />

          {badge && (
            <span
              className={cn(
                "dealer-puck absolute -bottom-1 -right-3",
                badge !== "D" && "blind-puck"
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
              onClick={() => setConfirmingRemove(true)}
              className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Remove player"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <span className="mt-1 max-w-[72px] truncate text-center text-[11px] font-medium text-[var(--text-primary)] sm:max-w-[88px] sm:text-xs">
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
          <ChipStack amount={player.currentBet} variant="bet" className="seat-bet animate-chip-pop" />
        )}
      </div>
      {canHostRemove && (
        <ConfirmRemoveDialog
          playerName={player.displayName}
          open={confirmingRemove}
          onOpenChange={setConfirmingRemove}
          onConfirm={() => onRemove?.()}
        />
      )}
    </div>
  );
}
