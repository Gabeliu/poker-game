"use client";

import { Button } from "@/components/ui/button";
import { formatChips } from "@/lib/format";
import type { ActionRequest, ClientRoomView } from "@/lib/types";
import { PokerActions } from "./PokerActions";
import { TurnTimer } from "./TurnTimer";
import { getEligiblePlayers } from "@/server/engine/seats";
import { cn } from "@/lib/utils";

interface ActionDockProps {
  room: ClientRoomView;
  isHost: boolean;
  onAction: (action: ActionRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
  onStartHand: () => void;
  onSitOut: (sittingOut: boolean) => void;
}

export function ActionDock({ room, isHost, onAction, onStartHand, onSitOut }: ActionDockProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const isMyTurn = Boolean(me) && room.hand.activePlayerId === me!.id;
  const handOver = room.hand.phase === "waiting" || room.hand.phase === "hand-complete";
  const eligibleCount = getEligiblePlayers(room.players).length;
  const iAmSittingOut = Boolean(me?.sittingOut && me.hasBoughtIn);

  return (
    <div className="flex w-full items-end justify-between gap-2 px-1 sm:gap-3">
      <div className="hidden w-24 shrink-0 sm:block sm:w-32" aria-hidden />

      <div className="flex flex-1 flex-col items-center gap-2">
        {isMyTurn ? (
          <PokerActions key={`${room.hand.activePlayerId}-${room.hand.phase}`} room={room} onAction={onAction} />
        ) : (
          <>
            {handOver && (
              <>
                {room.hand.result && room.hand.result.winners.length > 0 && <ResultSummary room={room} />}
                {isHost ? (
                  <Button
                    size="lg"
                    disabled={eligibleCount < 2}
                    onClick={onStartHand}
                    data-testid="start-hand-button"
                    className="bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold px-8 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                  >
                    {room.hand.handNumber === 0 ? "Start Hand" : "Start Next Hand"}
                  </Button>
                ) : (
                  !iAmSittingOut && (
                    <p className="text-sm text-[var(--text-secondary)]">Waiting for the host to start the next hand&hellip;</p>
                  )
                )}
                {eligibleCount < 2 && isHost && (
                  <p className="text-xs text-[var(--text-secondary)]">Need at least 2 players with approved chips.</p>
                )}
              </>
            )}
            {/* Shown whenever the viewer is sitting out — not just between
                hands — so a player who sat out (maybe by mistake) always has
                a way back in. Without this, two players where one sits out
                permanently stalls the table: the host's "Start Hand" stays
                disabled (fewer than 2 eligible) with no way to undo it. */}
            {iAmSittingOut ? (
              <div className="flex items-center gap-2">
                <p className="text-sm text-[var(--text-secondary)]">You&apos;re sitting out.</p>
                <Button size="sm" variant="outline" onClick={() => onSitOut(false)}>
                  Sit back in
                </Button>
              </div>
            ) : (
              !handOver && <WaitingIndicator room={room} onSitOut={onSitOut} isSittable={me?.handStatus === "active"} />
            )}
          </>
        )}
      </div>

      <div className="flex w-20 shrink-0 flex-col items-end gap-1.5 sm:w-32">
        {isMyTurn && me?.handStatus === "active" && (
          <TurnTimer
            key={room.hand.turnDeadline ?? 0}
            durationSeconds={room.settings.turnTimeLimitSeconds}
            variant="pill"
            className="hidden sm:flex"
          />
        )}
        {me?.hasBoughtIn && (
          <div
            data-testid="your-stack"
            data-your-chips={me.chips}
            className="flex flex-col items-end rounded-xl border border-white/10 bg-black/40 px-2 py-1 backdrop-blur sm:px-3 sm:py-1.5"
          >
            <span className="text-[8px] font-medium uppercase tracking-wider text-[var(--text-secondary)] sm:text-[9px]">
              Stack
            </span>
            <span className="text-sm font-bold tabular-nums text-[var(--text-primary)] sm:text-lg">
              {formatChips(me.chips)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingIndicator({
  room,
  onSitOut,
  isSittable,
}: {
  room: ClientRoomView;
  onSitOut: (sittingOut: boolean) => void;
  isSittable: boolean;
}) {
  const activePlayer = room.players.find((p) => p.id === room.hand.activePlayerId);
  return (
    <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
      <p className="text-center text-xs text-[var(--text-secondary)] sm:text-sm">
        {activePlayer ? `Waiting for ${activePlayer.displayName}…` : "Hand in progress…"}
      </p>
      {isSittable && (
        <Button size="sm" variant="ghost" className="text-xs text-[var(--text-secondary)]" onClick={() => onSitOut(true)}>
          Sit out next hand
        </Button>
      )}
    </div>
  );
}

function ResultSummary({ room }: { room: ClientRoomView }) {
  const result = room.hand.result!;
  const winnersByPlayer = new Map<string, number>();
  for (const w of result.winners) winnersByPlayer.set(w.playerId, (winnersByPlayer.get(w.playerId) ?? 0) + w.amount);

  // At a real showdown, everyone who didn't fold shows their hand — not
  // just whoever won. revealedHands covers exactly that group; an
  // uncontested win (everyone else folded) has no revealedHands at all,
  // so fall back to just the winner line in that case.
  const revealed = Object.entries(result.revealedHands);
  const playerIds = revealed.length > 0 ? revealed.map(([id]) => id) : [...winnersByPlayer.keys()];

  return (
    <div
      data-testid="hand-result-summary"
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--accent-lime)]/30 bg-black/55 px-5 py-3 text-center shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl",
        winnersByPlayer.size === 1 && "animate-winner-pulse"
      )}
    >
      {playerIds.map((playerId) => {
        const player = room.players.find((p) => p.id === playerId);
        const amountWon = winnersByPlayer.get(playerId);
        const desc = amountWon
          ? result.winners.find((w) => w.playerId === playerId)?.handDescription
          : result.revealedHands[playerId]?.description;
        const isWinner = Boolean(amountWon);
        return (
          <p key={playerId} className="text-sm">
            <span className={cn("font-semibold", isWinner ? "text-[var(--accent-lime)]" : "text-[var(--text-primary)]")}>
              {player?.displayName ?? "Player"}
            </span>{" "}
            {isWinner && amountWon !== undefined ? (
              <>
                wins <span className="font-semibold text-[var(--text-primary)]">{formatChips(amountWon)}</span>
              </>
            ) : (
              <span className="text-[var(--text-secondary)]">didn&apos;t win this one</span>
            )}
            {desc ? <span className="block text-xs text-[var(--text-secondary)]">{desc}</span> : null}
          </p>
        );
      })}
    </div>
  );
}
