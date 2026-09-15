"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionRequest, ClientRoomView } from "@/lib/types";
import { getLegalActions } from "@/server/engine/betting";
import { BetControls } from "./BetControls";
import { TurnTimer } from "./TurnTimer";

interface PokerActionsProps {
  room: ClientRoomView;
  onAction: (action: ActionRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** The minimal Fold / Check|Call / Raise row shown when it's the viewer's turn. */
export function PokerActions({ room, onAction }: PokerActionsProps) {
  const [raising, setRaising] = useState(false);
  const [pending, setPending] = useState(false);

  const myPlayer = room.players.find((p) => p.id === room.you.playerId);
  const isMyTurn = Boolean(myPlayer) && room.hand.activePlayerId === myPlayer!.id;
  const info = myPlayer ? getLegalActions(myPlayer, room.hand, room.settings.bigBlind) : null;
  const canBetOrRaise = Boolean(info) && (info!.legalActions.includes("bet") || info!.legalActions.includes("raise"));
  const raiseVerb = info?.legalActions.includes("bet") ? "Bet" : "Raise";
  const potTotal = room.players.reduce((s, p) => s + p.totalCommittedThisHand, 0);

  const run = async (action: ActionRequest) => {
    setPending(true);
    const res = await onAction(action);
    setPending(false);
    if (!res.ok) toast.error(res.error);
    else setRaising(false);
  };

  // Keyboard shortcuts: F(old), C(heck/all), R(aise) — only live on your turn,
  // and only when focus isn't in a text field (so typing a raise amount
  // doesn't also fire a shortcut).
  useEffect(() => {
    if (!isMyTurn || !info || pending) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const key = e.key.toLowerCase();
      if (key === "f") run({ action: "fold" });
      else if (key === "c") {
        if (info.legalActions.includes("check")) run({ action: "check" });
        else if (info.legalActions.includes("call")) run({ action: "call" });
      } else if (key === "r") {
        if (canBetOrRaise) setRaising(true);
        else if (info.legalActions.includes("all-in")) run({ action: "all-in" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, info, pending, canBetOrRaise]);

  if (!isMyTurn || !myPlayer || !info) return null;

  // Own countdown, visible right above your controls on every screen size —
  // not just the small ring on other players' avatars or the desktop-only
  // "Your Turn!" pill.
  const timerBar = (
    <TurnTimer
      key={room.hand.turnDeadline ?? 0}
      durationSeconds={room.settings.turnTimeLimitSeconds}
      variant="bar"
      className="w-full max-w-xs"
    />
  );

  if (raising && canBetOrRaise) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-1.5">
        {timerBar}
        <BetControls
          minAmount={info.minRaiseToAmount ?? room.settings.bigBlind}
          maxAmount={info.maxRaiseToAmount ?? myPlayer.chips}
          potTotal={potTotal}
          actionLabel={raiseVerb}
          onCancel={() => setRaising(false)}
          onConfirm={(amount) => run({ action: raiseVerb === "Bet" ? "bet" : "raise", amount })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {timerBar}
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-2 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:gap-3 sm:px-3">
        <ActionButton
          testId="action-fold"
          label="Fold"
          shortcut="F"
          disabled={pending}
          onClick={() => run({ action: "fold" })}
          className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
        />

        {info.legalActions.includes("check") && (
          <ActionButton
            testId="action-check"
            label="Check"
            shortcut="C"
            disabled={pending}
            onClick={() => run({ action: "check" })}
            className="text-[var(--text-primary)] hover:bg-white/10"
          />
        )}
        {info.legalActions.includes("call") && (
          <ActionButton
            testId="action-call"
            label={`Call ${formatChips(info.callAmount)}`}
            shortcut="C"
            disabled={pending}
            onClick={() => run({ action: "call" })}
            className="text-[var(--text-primary)] hover:bg-white/10"
          />
        )}

        {canBetOrRaise ? (
          <ActionButton
            testId="action-raise"
            label={raiseVerb}
            shortcut="R"
            disabled={pending}
            onClick={() => setRaising(true)}
            className="bg-[var(--positive)] text-black hover:bg-[var(--positive)]/90"
            solid
          />
        ) : (
          info.legalActions.includes("all-in") && (
            <ActionButton
              testId="action-allin"
              label={`All In ${formatChips(myPlayer.chips)}`}
              shortcut="R"
              disabled={pending}
              onClick={() => run({ action: "all-in" })}
              className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
              solid
            />
          )
        )}
      </div>
    </div>
  );
}

function ActionButton({
  testId,
  label,
  shortcut,
  onClick,
  disabled,
  className,
  solid,
}: {
  testId: string;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  solid?: boolean;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50",
        !solid && "bg-transparent",
        className
      )}
    >
      {label}
      <kbd className="hidden rounded border border-current/25 px-1 text-[9px] font-normal opacity-50 sm:inline">
        {shortcut}
      </kbd>
    </button>
  );
}
