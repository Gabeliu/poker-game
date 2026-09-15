"use client";

interface EmptySeatProps {
  xPct: number;
  yPct: number;
  onInvite: () => void;
}

/** An unoccupied seat during the waiting room — click to copy the invite link. */
export function EmptySeat({ xPct, yPct, onInvite }: EmptySeatProps) {
  return (
    <button
      onClick={onInvite}
      className="group absolute flex flex-col items-center gap-1"
      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%, -50%)" }}
      title="Copy invite link"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/20 text-white/30 transition-colors group-hover:border-[var(--accent-lime)]/50 group-hover:text-[var(--accent-lime)]">
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[10px] font-medium text-white/25 transition-colors group-hover:text-[var(--accent-lime)]">
        Invite
      </span>
    </button>
  );
}
