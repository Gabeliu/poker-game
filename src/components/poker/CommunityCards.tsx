"use client";

import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";

// Fixed, subtle per-slot tilt so dealt cards don't look mechanically perfect,
// while staying deterministic (no layout shift on re-render).
const NATURAL_TILT = [-3, 2, -1, 3, -2];

export function CommunityCards({ cards }: { cards: Card[] }) {
  return (
    <div className="community-board flex gap-2" aria-label="Community cards">
      {Array.from({ length: 5 }).map((_, i) => {
        const card = cards[i];
        return card ? (
          <PlayingCard key={i} card={card} size="lg" rotationDeg={NATURAL_TILT[i]} dealDelayMs={i * 100} />
        ) : (
          <PlayingCard key={i} empty size="lg" />
        );
      })}
    </div>
  );
}
