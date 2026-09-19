"use client";

import { useState } from "react";
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
  /** Already on the table (a reconnect, a board layout swap) — appears in
   * place with no travel or flip, so nothing replays that already happened. */
  instant?: boolean;
  /** Where the card is dealt from, relative to its resting spot (any CSS
   * length, e.g. container-query units so it scales with the table). */
  dealFrom?: { x: string; y: string };
}

function CardBack() {
  return (
    <div className="card-back h-full w-full rounded-[inherit]">
      <div className="flex h-full w-full items-center justify-center rounded-[inherit] border-2 border-white/8">
        <div className="card-back-brand"><span>♠</span><small>FELT</small></div>
      </div>
    </div>
  );
}

export function PlayingCard({
  card,
  faceDown,
  size = "md",
  dealDelayMs = 0,
  rotationDeg = 0,
  className,
  empty,
  instant,
  dealFrom,
}: PlayingCardProps) {
  // Whether this card was dealt already face-up (it travels in, then flips
  // over) or was already on the table face-down and is only now being
  // turned over (a showdown reveal — flip straight away, no travel delay).
  const showBack = Boolean(faceDown) || !card;
  const [dealtFaceUp] = useState(!showBack);
  // Animation settings are read once, at mount. A parent re-rendering with
  // different values later (e.g. the next street arriving) must never
  // retarget a card that's already mid-flight or mid-flip.
  const [mounted] = useState({ instant: Boolean(instant), delayMs: dealDelayMs, dealFrom });

  if (empty) {
    return (
      <div
        className={cn(SIZE_CLASSES[size], "card-placeholder rounded-[9px] border border-white/5", className)}
      />
    );
  }

  const flipDelayMs = dealtFaceUp ? mounted.delayMs + 260 : 0;

  return (
    <div
      role="img"
      aria-label={showBack ? "Face-down card" : `${card.rank} of ${card.suit}`}
      className={cn(
        SIZE_CLASSES[size],
        "card-3d relative shrink-0 select-none shadow-[0_6px_16px_rgba(0,0,0,0.55)]",
        !mounted.instant && "animate-deal-in",
        className
      )}
      style={
        {
          animationDelay: `${mounted.delayMs}ms`,
          // The tilt lives in a variable the deal animation also lands on —
          // a plain inline `transform` would be overridden while animating
          // and then visibly snap into place when the animation ended.
          "--card-rot": `${rotationDeg}deg`,
          "--deal-from-x": mounted.dealFrom?.x,
          "--deal-from-y": mounted.dealFrom?.y,
          transform: "rotate(var(--card-rot))",
        } as React.CSSProperties
      }
    >
      {showBack ? (
        <CardBack />
      ) : (
        <div
          key={`${card.rank}-${card.suit}`}
          // Static only if it was already face-up when it mounted; a card that
          // was on the table face-down still flips when it's turned over.
          className={cn("card-flipper", mounted.instant && dealtFaceUp && "card-flipper-static")}
          style={{ animationDelay: `${flipDelayMs}ms` }}
        >
          <div className="card-face-front card-face-reveal relative h-full w-full rounded-[inherit] border border-black/10 bg-[var(--card-face)] p-[9%] leading-none">
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
          <div className="card-face-back-side rounded-[inherit]">
            <CardBack />
          </div>
        </div>
      )}
    </div>
  );
}
