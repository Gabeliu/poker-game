"use client";

import { formatChips } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BuyInRequestProps {
  playerName: string;
  amount: number;
  type: "initial" | "topup";
  /** A hand is currently in progress — approving this won't touch the
   * player's active stack, it'll queue the chips for the next hand instead. */
  deferred?: boolean;
  onApprove: () => void;
  onReject: () => void;
  className?: string;
}

/** A single buy-in/top-up request, styled as a compact floating notification. */
export function BuyInRequest({ playerName, amount, type, deferred, onApprove, onReject, className }: BuyInRequestProps) {
  return (
    <div
      data-buyin-request
      className={cn(
        "animate-in slide-in-from-top-2 fade-in w-72 rounded-2xl border border-white/10 bg-black/70 p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl duration-200",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-purple)]">
          Buy-in request
        </p>
        {deferred && (
          <span
            data-testid="buyin-deferred-badge"
            className="rounded-full bg-[var(--accent-lime)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-lime)]"
          >
            Next hand
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{playerName}</p>
      <p className="text-xl font-bold tabular-nums text-[var(--accent-lime)]">
        {formatChips(amount)} <span className="text-xs font-normal text-[var(--text-secondary)]">chips</span>
      </p>
      {type === "topup" && <p className="text-[11px] text-[var(--text-secondary)]">Additional chip request</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={onReject}
          className="flex-1 rounded-lg border border-[var(--danger)]/30 py-1.5 text-xs font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/10"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          className="flex-1 rounded-lg bg-[var(--accent-lime)] py-1.5 text-xs font-semibold text-[var(--accent-lime-foreground)] transition-transform active:scale-[0.98]"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
