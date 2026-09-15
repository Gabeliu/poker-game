"use client";

import { cn } from "@/lib/utils";
import type { Card } from "@/lib/types";

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const SUIT_COLOR: Record<Card["suit"], string> = {
  clubs: "text-suit-black",
  spades: "text-suit-black",
  diamonds: "text-suit-red",
  hearts: "text-suit-red",
};

const SIZE_CLASSES = {
  sm: "w-7 h-10 text-[10px] rounded-[5px]",
  md: "w-10 h-14 text-sm rounded-[7px]",
  lg: "w-14 h-20 text-lg rounded-[9px]",
  xl: "w-16 h-24 text-xl rounded-[10px]",
} as const;

interface PlayingCardProps {
  card?: Card | null;
  faceDown?: boolean;
  size?: keyof typeof SIZE_CLASSES;
  dealDelayMs?: number;
  className?: string;
  /** Renders a dashed empty placeholder instead of a card. */
  empty?: boolean;
}

export function PlayingCard({
  card,
  faceDown,
  size = "md",
  dealDelayMs = 0,
  className,
  empty,
}: PlayingCardProps) {
  if (empty) {
    return (
      <div
        className={cn(
          SIZE_CLASSES[size],
          "rounded-[7px] border border-dashed border-white/15",
          className
        )}
      />
    );
  }

  const showBack = faceDown || !card;

  return (
    <div
      className={cn(
        SIZE_CLASSES[size],
        "animate-deal-in relative shrink-0 select-none shadow-[0_2px_6px_rgba(0,0,0,0.45)]",
        className
      )}
      style={{ animationDelay: `${dealDelayMs}ms` }}
    >
      {showBack ? (
        <div
          className="h-full w-full rounded-[inherit] border border-black/30"
          style={{
            background:
              "repeating-linear-gradient(135deg, oklch(0.32 0.1 250) 0px, oklch(0.32 0.1 250) 3px, oklch(0.26 0.09 250) 3px, oklch(0.26 0.09 250) 6px)",
          }}
        >
          <div className="h-full w-full rounded-[inherit] border-2 border-white/10 flex items-center justify-center">
            <div className="h-1/2 w-1/2 rounded-full border border-[var(--gold)]/50" />
          </div>
        </div>
      ) : (
        <div className="h-full w-full rounded-[inherit] bg-[var(--card-face)] border border-black/10 flex flex-col justify-between p-[6%] leading-none">
          <span className={cn("font-bold", SUIT_COLOR[card.suit])}>{card.rank}</span>
          <span className={cn("self-center text-[1.4em]", SUIT_COLOR[card.suit])}>
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span className={cn("self-end font-bold rotate-180", SUIT_COLOR[card.suit])}>
            {card.rank}
          </span>
        </div>
      )}
    </div>
  );
}
