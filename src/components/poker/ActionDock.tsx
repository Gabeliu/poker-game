"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatChips, formatSignedChips } from "@/lib/format";
import type { ActionRequest, ClientRoomView, RunItChoice } from "@/lib/types";
import { PokerActions } from "./PokerActions";
import { PlayingCard } from "./PlayingCard";
import { BuyInDialog } from "./BuyInDialog";
import { RunItPrompt } from "./RunItPrompt";
import { getStartHandError } from "@/server/engine/seats";
import { cn } from "@/lib/utils";

interface ActionDockProps {
  room: ClientRoomView;
  isHost: boolean;
  onAction: (action: ActionRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
  onStartHand: () => void;
  onSitOut: (sittingOut: boolean) => void;
  onRequestBuyIn: (amount: number, type: "initial" | "topup") => Promise<{ ok: true } | { ok: false; error: string }>;
  onChooseRunIt: (choice: RunItChoice) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function ActionDock({ room, isHost, onAction, onStartHand, onSitOut, onRequestBuyIn, onChooseRunIt }: ActionDockProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const isMyTurn = Boolean(me) && room.hand.activePlayerId === me!.id;
  const handOver = room.hand.phase === "waiting" || room.hand.phase === "hand-complete";
  const startError = getStartHandError(room.players);
  const iAmSittingOut = Boolean(me?.sittingOut && me.hasBoughtIn);
  const pendingBuyIn = room.buyInRequests.find((r) => r.playerId === me?.id && r.status === "pending");
  const buyInInProgress = room.status === "in-hand";

  return (
    <div className="action-dock flex w-full items-end justify-between gap-2 px-1 sm:gap-3">
      <div className="hidden w-24 shrink-0 sm:block sm:w-32" aria-hidden />

      <div className="flex flex-1 flex-col items-center gap-2">
        {me && !me.hasBoughtIn && Boolean(me.pendingChipTopUp) ? (
          <p className="text-sm font-medium text-[var(--accent-lime)]" data-testid="buyin-approved-next-hand">
            Buy-in approved — {formatChips(me.pendingChipTopUp!)} chips available next hand.
          </p>
        ) : me && !me.hasBoughtIn ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-[var(--text-secondary)]">
              {pendingBuyIn ? "Your host still needs to approve it." : "Buy in to join the action."}
            </p>
            <BuyInDialog
              player={me}
              settings={room.settings}
              pendingRequest={pendingBuyIn}
              handInProgress={buyInInProgress}
              onRequest={onRequestBuyIn}
            >
              <Button
                size="lg"
                disabled={Boolean(pendingBuyIn)}
                data-testid="buyin-trigger"
                className="bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold px-8 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
              >
                {pendingBuyIn ? "Buy-In Requested" : "Buy In"}
              </Button>
            </BuyInDialog>
          </div>
        ) : room.hand.runItDecision ? (
          <RunItPrompt
            decision={room.hand.runItDecision}
            players={room.players}
            myPlayerId={room.you.playerId}
            onChoose={onChooseRunIt}
          />
        ) : room.hand.runout ? (
          <p className="text-sm text-[var(--text-secondary)]" data-testid="runout-indicator">
            Running it {room.hand.runout.runs === 2 ? "twice" : "out"}&hellip;
          </p>
        ) : isMyTurn ? (
          <PokerActions key={`${room.hand.activePlayerId}-${room.hand.phase}`} room={room} onAction={onAction} />
        ) : (
          <>
            {handOver && (
              <>
                {room.hand.result && <ResultSummary room={room} />}
                {isHost && room.hand.phase !== "waiting" ? (
                  <Button
                    size="lg"
                    disabled={Boolean(startError)}
                    aria-describedby={startError ? "next-hand-status" : undefined}
                    onClick={onStartHand}
                    data-testid="start-hand-button"
                    className="bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold px-8 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                  >
                    {room.hand.handNumber === 0 ? "Start Hand" : "Start Next Hand"}
                  </Button>
                ) : (
                  !isHost && !iAmSittingOut && (
                    <p className="text-sm text-[var(--text-secondary)]">Waiting for the host to start the next hand&hellip;</p>
                  )
                )}
                {startError && isHost && room.hand.phase !== "waiting" && (
                  <p id="next-hand-status" role="status" className="text-center text-xs text-[var(--text-secondary)]">{startError}</p>
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
        {me?.hasBoughtIn && (
          <>
            <div
              data-testid="your-stack"
              data-your-chips={me.chips}
              data-pending-topup={me.pendingChipTopUp ?? 0}
              className="flex flex-col items-end rounded-xl border border-white/10 bg-black/40 px-2 py-1 backdrop-blur sm:px-3 sm:py-1.5"
            >
              <span className="text-[8px] font-medium uppercase tracking-wider text-[var(--text-secondary)] sm:text-[9px]">
                Stack
              </span>
              <span className="text-sm font-bold tabular-nums text-[var(--text-primary)] sm:text-lg">
                {formatChips(me.chips)}
              </span>
              {Boolean(me.pendingChipTopUp) && (
                <span className="text-[9px] font-semibold text-[var(--accent-lime)] sm:text-[10px]">
                  +{formatChips(me.pendingChipTopUp!)} next hand
                </span>
              )}
            </div>
            <BuyInDialog
              player={me}
              settings={room.settings}
              pendingRequest={pendingBuyIn}
              handInProgress={buyInInProgress}
              onRequest={onRequestBuyIn}
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={Boolean(pendingBuyIn)}
                data-testid="buyin-trigger"
                className="h-auto gap-1 px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--accent-lime)] sm:text-xs"
              >
                <Plus className="h-3 w-3 shrink-0" />
                {pendingBuyIn ? (pendingBuyIn.deferredToNextHand ? "Sent — next hand" : "Request sent") : "Buy More Chips"}
              </Button>
            </BuyInDialog>
          </>
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
  const secondResult = room.hand.secondBoard?.result;

  // Net result (what a player actually walks away up or down), not gross pot
  // proceeds — a player who contributed 50 and got 50 back broke even, not
  // "won 50". Combine both boards' winnings when the hand ran it twice, so
  // a player who won one board and lost the other still nets correctly.
  const winningsByPlayer = new Map<string, number>();
  for (const w of result.winners) winningsByPlayer.set(w.playerId, (winningsByPlayer.get(w.playerId) ?? 0) + w.amount);
  if (secondResult) {
    for (const w of secondResult.winners) winningsByPlayer.set(w.playerId, (winningsByPlayer.get(w.playerId) ?? 0) + w.amount);
  }

  // Show everyone who put chips in this hand, winner or not, so a player
  // who lost can see their real loss instead of just disappearing.
  const contributors = room.players.filter((p) => p.totalCommittedThisHand > 0);

  const boardAWinnerIds = new Set(result.winners.map((w) => w.playerId));
  const boardBWinnerIds = secondResult ? new Set(secondResult.winners.map((w) => w.playerId)) : null;

  return (
    <div
      data-testid="hand-result-summary"
      className={cn(
        "winner-summary flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[var(--accent-lime)]/30 bg-black/55 px-5 py-3 text-center shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl",
        !boardBWinnerIds && winningsByPlayer.size === 1 && "animate-winner-pulse"
      )}
    >
      {contributors.map((player) => {
        const amountWon = winningsByPlayer.get(player.id) ?? 0;
        const net = amountWon - player.totalCommittedThisHand;
        const desc = result.revealedHands[player.id]?.description;
        const netColorClass =
          net > 0 ? "text-[var(--accent-lime)]" : net < 0 ? "text-[var(--danger)]" : "text-[var(--text-secondary)]";
        const scooped = boardBWinnerIds && boardAWinnerIds.has(player.id) && boardBWinnerIds.has(player.id);
        return (
          <div key={player.id} data-testid="result-row" data-player-name={player.displayName} className="flex items-center gap-3 text-sm">
            <div className="flex gap-1" aria-label="Revealed cards">
              {result.revealedHands[player.id]?.cards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}
            </div>
            <p>
            <span className="font-semibold text-[var(--text-primary)]">{player.displayName}</span>{" "}
            <span className={cn("font-semibold tabular-nums", netColorClass)} data-net-change={net}>
              {formatSignedChips(net)}
            </span>
            {scooped && <span className="ml-1 rounded bg-[var(--room-gold)]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--room-gold)]">Scoop</span>}
            {desc ? <span className="block text-xs text-[var(--text-secondary)]">{desc}</span> : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}
