"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatChips } from "@/lib/format";
import type { ActionRequest, ClientRoomView } from "@/lib/types";
import { getLegalActions } from "@/server/engine/betting";
import { cn } from "@/lib/utils";

interface BettingControlsProps {
  room: ClientRoomView;
  onAction: (action: ActionRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function BettingControls({ room, onAction }: BettingControlsProps) {
  const myPlayer = room.players.find((p) => p.id === room.you.playerId);
  const isMyTurn = Boolean(myPlayer) && room.hand.activePlayerId === myPlayer!.id;

  const info = useMemo(() => {
    if (!myPlayer) return null;
    return getLegalActions(myPlayer, room.hand, room.settings.bigBlind);
  }, [myPlayer, room.hand, room.settings.bigBlind]);

  const potTotal = room.players.reduce((s, p) => s + p.totalCommittedThisHand, 0);
  const minAmount = info?.minRaiseToAmount ?? room.settings.bigBlind;
  const maxAmount = info?.maxRaiseToAmount ?? myPlayer?.chips ?? 0;

  // Keyed by the caller on (activePlayerId, phase) so this component remounts
  // — and `amount` re-initializes to the new minAmount — at the start of
  // each new turn, instead of syncing local state to props via an effect.
  const [amount, setAmount] = useState(minAmount);
  const [pending, setPending] = useState(false);

  if (!isMyTurn || !myPlayer || !info) return null;

  const canBetOrRaise = info.legalActions.includes("bet") || info.legalActions.includes("raise");
  const raiseVerb = info.legalActions.includes("bet") ? "Bet" : "Raise";

  const run = async (action: ActionRequest) => {
    setPending(true);
    const res = await onAction(action);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
    }
  };

  const clampedSet = (v: number) => setAmount(Math.min(maxAmount, Math.max(minAmount, Math.round(v))));

  return (
    <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-white/10 bg-card/95 p-3 shadow-2xl backdrop-blur">
      {canBetOrRaise && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={minAmount}
            max={Math.max(minAmount, maxAmount)}
            value={amount}
            onChange={(e) => clampedSet(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[var(--gold)]"
          />
          <div className="w-24 shrink-0 rounded-md border border-white/15 bg-black/30 px-2 py-1 text-right text-sm font-semibold tabular-nums">
            {formatChips(amount)}
          </div>
        </div>
      )}

      {canBetOrRaise && (
        <div className="flex gap-1.5">
          {[
            { label: "1/2 Pot", value: potTotal / 2 },
            { label: "Pot", value: potTotal },
            { label: "Max", value: maxAmount },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => clampedSet(opt.value)}
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          data-testid="action-fold"
          className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={pending}
          onClick={() => run({ action: "fold" })}
        >
          Fold
        </Button>

        {info.legalActions.includes("check") && (
          <Button
            variant="secondary"
            data-testid="action-check"
            className="flex-1"
            disabled={pending}
            onClick={() => run({ action: "check" })}
          >
            Check
          </Button>
        )}
        {info.legalActions.includes("call") && (
          <Button
            variant="secondary"
            data-testid="action-call"
            className="flex-1"
            disabled={pending}
            onClick={() => run({ action: "call" })}
          >
            Call {formatChips(info.callAmount)}
          </Button>
        )}

        {canBetOrRaise && (
          <Button
            data-testid="action-raise"
            className={cn("flex-1 bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90 font-semibold")}
            disabled={pending}
            onClick={() => run({ action: raiseVerb === "Bet" ? "bet" : "raise", amount })}
          >
            {raiseVerb} {formatChips(amount)}
          </Button>
        )}

        {!canBetOrRaise && info.legalActions.includes("all-in") && (
          <Button
            data-testid="action-allin"
            className="flex-1 bg-destructive text-white hover:bg-destructive/90 font-semibold"
            disabled={pending}
            onClick={() => run({ action: "all-in" })}
          >
            All-in {formatChips(myPlayer.chips)}
          </Button>
        )}
      </div>
    </div>
  );
}
