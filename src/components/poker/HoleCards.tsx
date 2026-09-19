"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";

/** The deck sits upper right of the table; the viewer's cards are dealt
 * across the felt from there, in table-relative units. */
const DEAL_FROM = { x: "17cqw", y: "-46cqh" };

/** The viewer's own two hole cards — large, overlapping, tilted, closer to the viewer than the table. */
export function HoleCards({ cards, folded }: { cards: Card[]; folded?: boolean }) {
  // Cards already in hand when this first renders (a reconnect mid-hand)
  // just appear; only cards that actually arrive get dealt. Re-arms whenever
  // the hand empties so the next hand's deal animates.
  const [alreadyHeld, setAlreadyHeld] = useState(cards.length > 0);
  if (cards.length === 0 && alreadyHeld) setAlreadyHeld(false);

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
        instant={alreadyHeld}
        dealFrom={DEAL_FROM}
        dealDelayMs={0}
        className="drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
      />
      <PlayingCard
        card={cards[1]}
        size="xl"
        rotationDeg={9}
        instant={alreadyHeld}
        dealFrom={DEAL_FROM}
        dealDelayMs={160}
        className="drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
      />
    </div>
  );
}
