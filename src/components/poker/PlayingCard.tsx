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

// "lg" and "xl" shrink on narrow viewports — the community/hole cards would
// otherwise keep a fixed pixel footprint while the table itself gets
// narrower on mobile (it uses a taller, narrower aspect ratio there), which
// was colliding with side-seated players' avatars at higher player counts.
//
// The `cqw` caps additionally shrink these two sizes with the table's own
// *actual* rendered width (PokerTable establishes a nested container-query
// context on its own box) rather than only the viewport's. A `sm:` (640px+)
// viewport doesn't mean the table itself is wide — expanded desktop
// sidebars can leave it well under 600px — and without this, community
// cards stayed pinned to their full "sm:" pixel size on a table that had
// already shrunk to fit, overlapping the side-seated players next to it.
const SIZE_CLASSES = {
  xs: "w-[1.5rem] h-[2.25rem] text-[9px] rounded-[5px]",
  sm: "w-[2.25rem] h-[3.25rem] text-[11px] rounded-[7px]",
  md: "w-[3rem] h-[4.25rem] text-sm rounded-[9px]",
  lg: "w-[min(2.75rem,15cqw)] h-[min(4rem,21.8cqw)] text-sm rounded-[8px] sm:w-[min(4rem,11cqw)] sm:h-[min(5.75rem,15.8cqw)] sm:text-lg sm:rounded-[11px]",
  xl: "w-[min(4.25rem,17cqw)] h-[min(6.25rem,25cqw)] text-lg rounded-[10px] sm:w-[min(6rem,15cqw)] sm:h-[min(8.5rem,21.3cqw)] sm:text-2xl sm:rounded-[14px]",
} as const;

interface PlayingCardProps {
  card?: Card | null;
  faceDown?: boolean;
  size?: keyof typeof SIZE_CLASSES;
  dealDelayMs?: number;
  /** Subtle natural tilt, in degrees — real cards are never perfectly aligned. */
  rotationDeg?: number;
  className?: string;
  /** Renders a dashed empty placeholder instead of a card. */
  empty?: boolean;
}

export function PlayingCard({
  card,
  faceDown,
  size = "md",
  dealDelayMs = 0,
  rotationDeg = 0,
  className,
  empty,
}: PlayingCardProps) {
  if (empty) {
    return (
      <div
        className={cn(SIZE_CLASSES[size], "rounded-[9px] border border-dashed border-white/12", className)}
      />
    );
  }

  const showBack = faceDown || !card;

  return (
    <div
      className={cn(
        SIZE_CLASSES[size],
        "animate-deal-in relative shrink-0 select-none shadow-[0_6px_16px_rgba(0,0,0,0.55)]",
        className
      )}
      style={{
        animationDelay: `${dealDelayMs}ms`,
        // Preserve any rotation set via the deal-in animation's end state.
        transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
      }}
    >
      {showBack ? (
        <div
          className="h-full w-full rounded-[inherit] border border-black/40"
          style={{
            background:
              "repeating-linear-gradient(135deg, oklch(0.24 0.05 280) 0px, oklch(0.24 0.05 280) 3px, oklch(0.19 0.04 280) 3px, oklch(0.19 0.04 280) 6px)",
          }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-[inherit] border-2 border-white/8">
            <div className="h-1/2 w-1/2 rounded-full border border-[var(--accent-purple)]/50" />
          </div>
        </div>
      ) : (
        <div className="relative h-full w-full rounded-[inherit] border border-black/10 bg-[var(--card-face)] p-[9%] leading-none">
          <span className={cn("absolute top-[8%] left-[10%] font-bold", SUIT_COLOR[card.suit])}>
            {card.rank}
          </span>
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center text-[2em] opacity-90",
              SUIT_COLOR[card.suit]
            )}
          >
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span
            className={cn("absolute bottom-[8%] right-[10%] rotate-180 font-bold", SUIT_COLOR[card.suit])}
          >
            {card.rank}
          </span>
        </div>
      )}
    </div>
  );
}
