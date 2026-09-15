"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActionRequest, ClientRoomView, PokerAction } from "@/lib/types";
import { getLegalActions } from "@/server/engine/betting";
import { audioManager } from "@/audio/AudioManager";
import type { SoundEventName } from "@/audio/types";
import { BetControls } from "./BetControls";
import { TurnTimer } from "./TurnTimer";

const ACTION_SOUND: Record<PokerAction, SoundEventName> = {
  fold: "fold",
  check: "check",
  call: "call",
  bet: "bet",
  raise: "raise",
  "all-in": "all-in",
};

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
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRaising(false);
    // Fired here (the moment we know the server accepted it) rather than
    // inferred from the next room broadcast — an action that completes a
    // betting round advances the street in that same broadcast, so the
    // intermediate "just checked/called" state a diff would need is never
    // actually sent to the client. This is the one authoritative place that
    // always knows exactly what the viewer just did.
    audioManager.play(ACTION_SOUND[action.action]);
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
      <div className="flex items-center gap-2 sm:gap-2.5">
        <ActionButton
          testId="action-fold"
          label="Fold"
          shortcut="F"
          disabled={pending}
          onClick={() => run({ action: "fold" })}
          tone="danger"
        />

        {info.legalActions.includes("check") && (
          <ActionButton
            testId="action-check"
            label="Check"
            shortcut="C"
            disabled={pending}
            onClick={() => run({ action: "check" })}
            tone="neutral"
          />
        )}
        {info.legalActions.includes("call") && (
          <ActionButton
            testId="action-call"
            label={`Call ${formatChips(info.callAmount)}`}
            shortcut="C"
            disabled={pending}
            onClick={() => run({ action: "call" })}
            tone="neutral"
          />
        )}

        {canBetOrRaise ? (
          <ActionButton
            testId="action-raise"
            label={raiseVerb}
            shortcut="R"
            disabled={pending}
            onClick={() => setRaising(true)}
            tone="positive"
          />
        ) : (
          info.legalActions.includes("all-in") && (
            <ActionButton
              testId="action-allin"
              label={`All In ${formatChips(myPlayer.chips)}`}
              shortcut="R"
              disabled={pending}
              onClick={() => run({ action: "all-in" })}
              tone="positive"
            />
          )
        )}
      </div>
    </div>
  );
}

const TONE_CLASSES = {
  danger:
    "bg-gradient-to-b from-[oklch(0.5_0.19_25)] to-[oklch(0.4_0.18_25)] text-white shadow-[0_3px_0_oklch(0.32_0.16_25),0_8px_20px_rgba(0,0,0,0.4)] hover:brightness-110 active:shadow-[0_1px_0_oklch(0.32_0.16_25)] active:translate-y-[2px]",
  neutral:
    "bg-gradient-to-b from-[oklch(0.26_0.016_260)] to-[oklch(0.19_0.014_260)] text-[var(--text-primary)] border border-white/10 shadow-[0_3px_0_oklch(0.1_0.01_260),0_8px_20px_rgba(0,0,0,0.4)] hover:brightness-125 active:shadow-[0_1px_0_oklch(0.1_0.01_260)] active:translate-y-[2px]",
  positive:
    "bg-gradient-to-b from-[var(--positive)] to-[oklch(0.58_0.14_152)] text-black shadow-[0_3px_0_oklch(0.42_0.12_152),0_8px_20px_rgba(0,0,0,0.4)] hover:brightness-110 active:shadow-[0_1px_0_oklch(0.42_0.12_152)] active:translate-y-[2px]",
} as const;

function ActionButton({
  testId,
  label,
  shortcut,
  onClick,
  disabled,
  tone,
}: {
  testId: string;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-100 disabled:opacity-50",
        TONE_CLASSES[tone]
      )}
    >
      {label}
      <kbd className="hidden rounded border border-current/25 px-1 text-[9px] font-normal opacity-60 sm:inline">
        {shortcut}
      </kbd>
    </button>
  );
}
