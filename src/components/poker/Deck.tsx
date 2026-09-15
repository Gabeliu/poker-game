"use client";

import { cn } from "@/lib/utils";
import { PlayingCard } from "./PlayingCard";

interface DeckProps {
  /** Remounting on a new hand number retriggers the small deal pulse. */
  handNumber: number;
  className?: string;
}

/** A physical-feeling face-down deck resting at the table's edge — a few
 * stacked cards with a slight fan, giving a subtle "deal" pulse whenever a
 * new hand begins. Purely decorative; it doesn't track individual cards. */
export function Deck({ handNumber, className }: DeckProps) {
  return (
    <div key={handNumber} className={cn("pointer-events-none relative h-[2.25rem] w-[1.5rem]", className)} aria-hidden>
      <div className="absolute inset-0 rotate-3 translate-x-0.5 opacity-50">
        <PlayingCard faceDown size="xs" />
      </div>
      <div className="absolute inset-0 rotate-1 translate-x-px opacity-75">
        <PlayingCard faceDown size="xs" />
      </div>
      <div className="animate-deck-deal absolute inset-0">
        <PlayingCard faceDown size="xs" />
      </div>
    </div>
  );
}
