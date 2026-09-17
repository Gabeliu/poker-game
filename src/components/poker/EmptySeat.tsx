"use client";

import { cn } from "@/lib/utils";
import type { ArcPosition } from "@/lib/seatLayout";
import { Plus } from "lucide-react";

interface EmptySeatProps {
  position: ArcPosition;
  /** The viewer hasn't sat down yet — this seat is a real, clickable invitation to sit. */
  canSit: boolean;
  onSit: () => void;
  /** The host, already seated elsewhere — a quieter "invite someone here" affordance. */
  canInvite: boolean;
  onInvite: () => void;
}

/** An unoccupied seat — subtle and recessive compared to an occupied one,
 * but never fully invisible, so the table always reads as a real room with
 * open chairs rather than an empty oval. */
export function EmptySeat({ position, canSit, onSit, canInvite, onInvite }: EmptySeatProps) {
  const interactive = canSit || canInvite;
  const label = canSit ? "Sit Here" : canInvite ? "Invite Player" : "Open seat";

  const content = (
    <>
      <span
        className={cn(
          "empty-avatar flex items-center justify-center rounded-full transition-colors",
          interactive && "group-hover:border-[var(--accent-lime)]/50 group-hover:text-[var(--accent-lime)]"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </span>
      {label && (
        <span className="empty-label text-[10px] font-medium transition-colors group-hover:text-[var(--accent-lime)]">
          {label}
        </span>
      )}
    </>
  );

  const style = { left: `${position.xPct}%`, top: `${position.yPct}%`, transform: "translate(-50%, -50%)" } as const;

  if (!interactive) {
    return (
      <div className="empty-seat pointer-events-none absolute flex flex-col items-center gap-1 opacity-70" style={style} data-testid="empty-seat">
        {content}
      </div>
    );
  }

  return (
    <button
      onClick={canSit ? onSit : onInvite}
      className="empty-seat group absolute flex flex-col items-center gap-1"
      style={style}
      title={canSit ? "Take this seat" : "Invite a player to this seat"}
      data-testid="empty-seat"
      data-seat-action={canSit ? "sit" : "invite"}
    >
      {content}
    </button>
  );
}
