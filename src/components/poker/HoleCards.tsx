"use client";

import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";

/** The viewer's own two hole cards — large, overlapping, tilted, closer to the viewer than the table. */
export function HoleCards({ cards, folded }: { cards: Card[]; folded?: boolean }) {
  if (cards.length === 0) return null;

  return (
    <div
      className="flex items-end justify-center transition-opacity duration-300"
      style={{ opacity: folded ? 0.35 : 1 }}
    >
      <PlayingCard
        card={cards[0]}
        size="xl"
        rotationDeg={-9}
        dealDelayMs={0}
        className="-mr-4 drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
      />
      <PlayingCard
        card={cards[1]}
        size="xl"
        rotationDeg={9}
        dealDelayMs={110}
        className="-ml-4 drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
      />
    </div>
  );
}
