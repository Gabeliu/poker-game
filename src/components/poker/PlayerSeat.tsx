"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isTopCenterPosition, type ArcPosition } from "@/lib/seatLayout";
import type { PublicPlayer } from "@/lib/types";
import type { PlayerRunResult } from "@/lib/handResultSummary";
import { PlayingCard } from "./PlayingCard";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChipStack } from "./ChipStack";
import { PlayerStatus } from "./PlayerStatus";
import { TurnTimer } from "./TurnTimer";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";
import { useRoomStore } from "@/hooks/useRoomStore";
import { RunResultTags } from "./RunResultTags";
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
  /** This player's net result and per-run outcome, once a hand this player
   * contributed to has finished — the full hand names live only in the
   * bottom result summary; the seat only shows a compact won/lost tag per
   * run (see `RunResultTags`), so the two never have to be kept in sync by
   * hand and the seat box never has to grow to fit a sentence. */
  runResult?: PlayerRunResult | null;
  /** Whether this hand ran it twice at all — controls whether the compact
   * per-run tags render, independent of whether Run 2 has resolved yet. */
  isRunItTwice?: boolean;
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
  runResult,
  isRunItTwice,
}: PlayerSeatProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const clockOffset = useRoomStore((s) => s.clockOffset);
  // Cards already in this player's hand when the seat first renders (a
  // reload mid-hand) appear in place; only cards dealt while watching
  // animate. Re-arms once the hand empties.
  const [heldAtMount, setHeldAtMount] = useState(player.hasHoleCards);
  if (!player.hasHoleCards && heldAtMount) setHeldAtMount(false);
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
      data-bet-edge={position.yPct > 65 ? "bottom" : isTopCenterPosition(position) ? "top-center" : position.yPct < 35 ? "top" : position.xPct < 50 ? "left" : "right"}
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
            avatar. Face-down they overlap like a held hand; turned over at
            showdown they spread side by side, so the left card's rank and
            suit are never hidden under the right one. The compact per-run tags
            (run-it-twice only) sit right under the cards, inside this same
            absolutely-positioned block, so they never add height to the seat
            panel itself — only the seat's avatar/name/stack/badges live in
            that normal flow; full hand names belong to the bottom summary. */}
        {(showCardBacks || showRevealedCards) && (
          <div className={cn("opponent-cards", showRevealedCards && "opponent-cards-revealed")} data-testid="opponent-cards">
            <div className="flex gap-0.5">
              <PlayingCard
                card={showRevealedCards ? player.holeCards[0] : undefined}
                faceDown={!showRevealedCards}
                size="sm"
                instant={heldAtMount}
                rotationDeg={showRevealedCards ? -4 : -8}
                className={showRevealedCards ? undefined : "-mr-2"}
              />
              <PlayingCard
                card={showRevealedCards ? player.holeCards[1] : undefined}
                faceDown={!showRevealedCards}
                size="sm"
                instant={heldAtMount}
                rotationDeg={showRevealedCards ? 4 : 8}
                className={showRevealedCards ? undefined : "-ml-2"}
              />
            </div>
            {showRevealedCards && <RunResultTags result={runResult ?? null} isRunItTwice={Boolean(isRunItTwice)} />}
          </div>
        )}

        <div className="relative">
          {isActiveTurn && !folded && (
            <div className="absolute -inset-1.5 rounded-full">
              <TurnTimer
                key={turnDeadline ?? 0}
                durationSeconds={turnTimeLimitSeconds}
                endsAt={turnDeadline == null ? null : turnDeadline - clockOffset}
                variant="ring"
              />
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
            {!player.hasBoughtIn || player.chips <= 0 ? "No chips" : "Sitting out"}
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
