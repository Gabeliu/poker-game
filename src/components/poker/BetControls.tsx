"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BetControlsProps {
  minAmount: number;
  maxAmount: number;
  potTotal: number;
  actionLabel: string; // "Bet" or "Raise"
  /** The live bet the viewer is up against this street (0 when opening a fresh bet). */
  currentBetAmount: number;
  /** The viewer's total chips and what they've already put in this street —
   * used to show "you'll have $X behind" for the amount being considered. */
  playerChips: number;
  playerCurrentBet: number;
  /** How much the − / + buttons move the amount (the big blind). */
  step: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

/** The slide-out amount picker shown when Raise/Bet is selected. */
export function BetControls({
  minAmount,
  maxAmount,
  potTotal,
  actionLabel,
  currentBetAmount,
  playerChips,
  playerCurrentBet,
  step,
  onConfirm,
  onCancel,
}: BetControlsProps) {
  const [amount, setAmount] = useState(minAmount);
  // What's being typed in the amount field, kept separate from `amount` so a
  // player can freely type/clear digits without every keystroke being clamped
  // from under them — null while the field isn't focused, and clamping only
  // happens on blur or when a slider/preset/stepper sets the value directly.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(maxAmount, Math.max(minAmount, Math.round(v)));
  const setClamped = (v: number) => setAmount(clamp(v));

  // − / + move by one step; holding either keeps going, so a big change
  // doesn't take a dozen clicks.
  const nudge = (dir: 1 | -1) => setAmount((prev) => clamp(prev + dir * step));
  const hold = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});
  const stopHold = () => {
    clearTimeout(hold.current.delay);
    clearInterval(hold.current.repeat);
  };
  const startHold = (dir: 1 | -1) => {
    stopHold();
    nudge(dir);
    hold.current.delay = setTimeout(() => {
      hold.current.repeat = setInterval(() => nudge(dir), 80);
    }, 400);
  };
  useEffect(() => stopHold, []);

  const stepButton = (dir: 1 | -1, disabled: boolean) => {
    const Icon = dir === 1 ? Plus : Minus;
    return (
      <button
        type="button"
        data-testid={dir === 1 ? "betcontrols-plus" : "betcontrols-minus"}
        aria-label={`${dir === 1 ? "Increase" : "Decrease"} ${actionLabel.toLowerCase()} by ${formatChips(step)}`}
        title={`${dir === 1 ? "+" : "−"}${formatChips(step)}`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button === 0) startHold(dir);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        // Pointer presses already stepped on pointerdown; a click with no
        // pointer behind it (detail 0) is the keyboard.
        onClick={(e) => {
          if (e.detail === 0) nudge(dir);
        }}
        className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-lg border border-white/15 bg-white/5 text-[var(--text-primary)] transition-colors hover:border-white/25 hover:bg-white/10 active:scale-[0.95] disabled:pointer-events-none disabled:opacity-30 sm:h-10 sm:w-10"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };
  const behind = playerChips - (amount - playerCurrentBet);

  return (
    <div className="animate-in slide-in-from-bottom-2 fade-in flex w-full min-w-[17.5rem] max-w-md flex-col gap-2.5 rounded-2xl border border-white/10 bg-black/55 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl duration-200">
      <p className="text-xs text-[var(--text-secondary)]">
        {currentBetAmount > 0 && (
          <>
            Bet to call <span className="text-[var(--text-primary)]">{formatChips(currentBetAmount)}</span>
            {" · "}
          </>
        )}
        Min raise to <span className="text-[var(--text-primary)]">{formatChips(minAmount)}</span>
      </p>

      <div className="flex items-center gap-2">
        {stepButton(-1, amount <= minAmount)}
        <input
          type="text"
          inputMode="numeric"
          value={draft ?? String(amount)}
          onFocus={(e) => {
            setDraft(String(amount));
            e.target.select();
          }}
          onChange={(e) => {
            const digitsOnly = e.target.value.replace(/[^\d]/g, "");
            setDraft(digitsOnly);
            if (digitsOnly) setAmount(Number(digitsOnly));
          }}
          onBlur={() => {
            setClamped(Number(draft) || minAmount);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              setDraft(null);
              nudge(e.key === "ArrowUp" ? 1 : -1);
            }
          }}
          aria-label={`${actionLabel} amount`}
          className="w-0 min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-center text-xl font-bold tabular-nums text-[var(--accent-lime)] outline-none focus:border-[var(--accent-lime)]/50"
        />
        {stepButton(1, amount >= maxAmount)}
      </div>

      <input
        aria-label="Bet amount slider"
        type="range"
        min={minAmount}
        max={Math.max(minAmount, maxAmount)}
        value={amount}
        onChange={(e) => setClamped(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[var(--accent-lime)]"
      />

      <div className="flex gap-1.5">
        {[
          { label: "½ Pot", value: potTotal / 2 },
          { label: "⅔ Pot", value: potTotal * 2 / 3 },
          { label: "Pot", value: potTotal },
          { label: "2× Pot", value: potTotal * 2 },
          { label: "ALL-IN", value: maxAmount },
        ].map((opt) => (
          <button
            key={opt.label}
            data-testid={opt.label === "ALL-IN" ? "betcontrols-allin-preset" : undefined}
            onClick={() => setClamped(opt.value)}
            className="flex-1 whitespace-nowrap rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-[var(--text-primary)] active:scale-[0.97] sm:py-1.5"
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--text-secondary)]">
        You&apos;ll have <span className="font-semibold text-[var(--text-primary)]">{formatChips(Math.max(0, behind))}</span> behind
      </p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="min-h-[46px] rounded-lg border border-white/10 px-4 text-sm text-[var(--text-secondary)] transition-colors hover:bg-white/5 sm:min-h-0 sm:py-2"
        >
          Cancel
        </button>
        <button
          data-testid="betcontrols-confirm"
          onClick={() => onConfirm(amount)}
          className={cn(
            "min-h-[52px] flex-1 rounded-lg bg-[var(--accent-lime)] text-sm font-semibold text-black transition-transform active:scale-[0.98] sm:min-h-0 sm:py-2"
          )}
        >
          {actionLabel === "Raise" ? "Raise to" : actionLabel} {formatChips(amount)}
        </button>
      </div>
    </div>
  );
}
