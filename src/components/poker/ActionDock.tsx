"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatChips, formatSignedChips } from "@/lib/format";
import { summarizeHandResult } from "@/lib/handResultSummary";
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
  // Chips the host approved while a hand was running: they can't touch a
  // live stack, so they wait here until the next hand starts.
  const queuedChips = me?.pendingChipTopUp ?? 0;
  // Bought in, nothing left, and not simply all-in in the hand being played
  // (where a stack of 0 is normal and may well come back).
  const isBusted =
    Boolean(me?.hasBoughtIn) && me!.chips <= 0 && me!.handStatus !== "active" && me!.handStatus !== "all-in";
  // Out of chips with nothing on the way: this player can't be dealt in
  // again until they buy more, so that has to be the loudest thing on screen.
  const needsChips = isBusted && queuedChips <= 0;

  return (
    <div className="action-dock flex w-full items-end justify-between gap-2 px-1 sm:gap-3">
      <div className="hidden w-24 shrink-0 sm:block sm:w-32" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        {me && needsChips && (
          <div className="bust-callout" data-testid="out-of-chips" role="status">
            <div className="min-w-0">
              <p className="bust-callout-title">You&apos;re out of chips</p>
              <p className="bust-callout-body">
                {pendingBuyIn
                  ? `${formatChips(pendingBuyIn.amount)} requested — your host needs to approve it.`
                  : "Buy more to keep playing."}
              </p>
            </div>
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
                className="bust-callout-button bg-[var(--accent-lime)] font-semibold text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90"
              >
                {pendingBuyIn ? "Requested" : "Buy More Chips"}
              </Button>
            </BuyInDialog>
          </div>
        )}
        {me?.hasBoughtIn && queuedChips > 0 && (
          <p className="chips-notice" data-testid="chips-next-hand" role="status">
            <strong>+{formatChips(queuedChips)} chips approved.</strong> They&apos;re added to your stack at the start of
            the next hand.
          </p>
        )}
        {me?.hasBoughtIn && queuedChips <= 0 && pendingBuyIn && buyInInProgress && (
          <p className="chips-notice chips-notice-pending" data-testid="chips-request-next-hand" role="status">
            <strong>{formatChips(pendingBuyIn.amount)} chips requested.</strong> If your host approves, they&apos;re added
            at the start of the next hand.
          </p>
        )}
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
          room.hand.result && room.hand.secondBoard && !room.hand.secondBoard.result ? (
            <RunOneResultBanner room={room} />
          ) : (
            <p className="text-sm text-[var(--text-secondary)]" data-testid="runout-indicator">
              {room.hand.runout.runs === 2
                ? `Running it twice — Run ${room.hand.runout.activeRun ?? 1}…`
                : "Running it out…"}
            </p>
          )
        ) : isMyTurn ? (
          <PokerActions key={`${room.hand.activePlayerId}-${room.hand.phase}`} room={room} onAction={onAction} />
        ) : (
          <>
            {handOver && (
              <>
                {room.hand.result && <ResultSummary room={room} />}
                {isHost && room.hand.phase !== "waiting" && needsChips && startError ? null : isHost && room.hand.phase !== "waiting" ? (
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
                  !isHost && !iAmSittingOut && !needsChips && (
                    <p className="text-center text-sm text-[var(--text-secondary)]">Waiting for the host to start the next hand&hellip;</p>
                  )
                )}
                {startError && isHost && room.hand.phase !== "waiting" && !needsChips && (
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
                <span className="text-[10px] font-semibold text-[var(--accent-lime)] sm:text-[11px]">
                  +{formatChips(me.pendingChipTopUp!)} next hand
                </span>
              )}
            </div>
            {/* The everyday "top up" button. When the player is out of chips
                the big call-out in the middle of the dock takes over instead,
                so there's only ever one buy button on screen. */}
            {!needsChips && (
              <BuyInDialog
                player={me}
                settings={room.settings}
                pendingRequest={pendingBuyIn}
                handInProgress={buyInInProgress}
                onRequest={onRequestBuyIn}
              >
                <Button
                  variant="outline"
                  disabled={Boolean(pendingBuyIn)}
                  data-testid="buyin-trigger"
                  aria-label={pendingBuyIn ? "Chip request sent" : "Buy more chips"}
                  className="buy-chips-button"
                >
                  {!pendingBuyIn && <Plus className="h-3.5 w-3.5 shrink-0" />}
                  {pendingBuyIn ? (pendingBuyIn.deferredToNextHand ? "Sent · next hand" : "Request sent") : "Buy Chips"}
                </Button>
              </BuyInDialog>
            )}
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

/** Shown during the pause after Run 1 resolves but before Run 2 has dealt
 * or evaluated anything — a brief "Run 1 — X wins $Y" beat, distinct from
 * the final combined summary, so the drama of each run lands on its own. */
function RunOneResultBanner({ room }: { room: ClientRoomView }) {
  const result = room.hand.result!;
  const wonBy = new Map<string, number>();
  for (const w of result.winners) wonBy.set(w.playerId, (wonBy.get(w.playerId) ?? 0) + w.amount);
  const lines = [...wonBy.entries()].map(([playerId, amount]) => {
    const name = room.players.find((p) => p.id === playerId)?.displayName ?? "Someone";
    return `${name} wins ${formatChips(amount)}`;
  });

  return (
    <div className="flex flex-col items-center gap-1 text-center" data-testid="run1-result-banner">
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">Run 1</span>
      <span className="text-sm font-semibold text-[var(--accent-lime)]">{lines.join(" · ")}</span>
    </div>
  );
}

function ResultSummary({ room }: { room: ClientRoomView }) {
  const result = room.hand.result!;
  const secondResult = room.hand.secondBoard?.result ?? null;

  // Show everyone who put chips in this hand, winner or not, so a player
  // who lost can see their real loss instead of just disappearing.
  const contributors = room.players.filter((p) => p.totalCommittedThisHand > 0);
  const summaries = summarizeHandResult(contributors, result, secondResult);
  const isRunItTwice = Boolean(secondResult);

  return (
    <div
      data-testid="hand-result-summary"
      className={cn(
        "winner-summary flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[var(--accent-lime)]/30 bg-black/55 px-5 py-3 text-center shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl",
        !isRunItTwice && summaries.filter((s) => s.netChange > 0).length === 1 && "animate-winner-pulse"
      )}
    >
      {summaries.map((summary) => {
        const player = room.players.find((p) => p.id === summary.playerId)!;
        const netColorClass =
          summary.netChange > 0
            ? "text-[var(--accent-lime)]"
            : summary.netChange < 0
              ? "text-[var(--danger)]"
              : "text-[var(--text-secondary)]";
        return (
          <div key={player.id} data-testid="result-row" data-player-name={player.displayName} className="flex items-center gap-3 text-left text-sm">
            <div className="flex gap-1" aria-label="Revealed cards">
              {result.revealedHands[player.id]?.cards.map((card, i) => <PlayingCard key={i} card={card} size="sm" />)}
            </div>
            <div className="flex flex-col gap-0.5">
              {/* Name + net change + scoop badge: the headline for this player. */}
              <p className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-semibold text-[var(--text-primary)]">{player.displayName}</span>
                <span className={cn("font-semibold tabular-nums", netColorClass)} data-net-change={summary.netChange}>
                  {formatSignedChips(summary.netChange)}
                </span>
                {summary.scooped && <span className="rounded bg-[var(--room-gold)]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--room-gold)]">Scoop</span>}
              </p>
              {/* The hand(s) that got them there — one line for a normal hand,
                  one line per run (each independently highlighted only if
                  they actually won that specific run) for run-it-twice. */}
              {!isRunItTwice && summary.run1Description ? (
                <p className="text-xs text-[var(--text-secondary)]">{summary.run1Description}</p>
              ) : null}
              {isRunItTwice && (
                <div className="flex flex-col text-xs text-[var(--text-secondary)]" data-testid="per-run-result">
                  {summary.run1Description && (
                    <p className={summary.wonRun1 ? "text-[var(--accent-lime)]" : undefined}>
                      Run 1: {summary.run1Description}{summary.wonRun1 && !summary.scooped ? " (won)" : ""}
                    </p>
                  )}
                  {/* Invisible, but keeps the two runs' text unambiguously
                      separated for anything reading this node's raw text. */}
                  <span className="sr-only">·</span>
                  {summary.run2Description && (
                    <p className={summary.wonRun2 ? "text-[var(--accent-lime)]" : undefined}>
                      Run 2: {summary.run2Description}{summary.wonRun2 && !summary.scooped ? " (won)" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
