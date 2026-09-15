"use client";

import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";

export function CommunityCards({ cards }: { cards: Card[] }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const card = cards[i];
        return card ? (
          <PlayingCard key={i} card={card} size="lg" dealDelayMs={i * 90} />
        ) : (
          <PlayingCard key={i} empty size="lg" />
        );
      })}
    </div>
  );
}
