"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

// Fixed, subtle per-slot tilt so dealt cards don't look mechanically perfect,
// while staying deterministic (no layout shift on re-render).
const NATURAL_TILT = [-3, 2, -1, 3, -2];

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

interface CommunityCardsProps {
  cards: Card[];
  /** Shown as a small run label above the board (e.g. "Run 1") — only used
   * when a hand has two boards (run it twice). */
  label?: string;
  /** Dims this board while a run-it decision is pending and it isn't the
   * one being decided on — both boards read as equally "live" once the
   * reveal actually starts. */
  dimmed?: boolean;
  /** Board cards that are part of the winning hand at showdown — outlined
   * once the result is in. */
  highlightCards?: Card[];
}

/**
 * Renders up to 5 community-card slots, staggering the reveal of only the
 * cards that arrived since the last render (this street's flop/turn/river),
 * not every slot's absolute array index — a turn card shouldn't repeat the
 * flop's stagger, and an already-shown card shouldn't re-animate just
 * because a sibling street got added a moment later. Combined with the
 * server actually pacing those streets across separate broadcasts (see
 * beginRunout/continueRunout in handEngine.ts), this is what produces the
 * flop-together / pause / turn / pause / river feel — no client-side fake
 * timeline needed, this component only ever reacts to real state changes.
 *
 * Uses the same "adjust state during render" pattern as
 * usePlayerStatusLabels for the same reason: it needs last render's card
 * count without an effect (which would run one render late, missing the
 * very first paint of a new street) and without a mutated ref (which a
 * double-render, e.g. React Strict Mode, would read back already-updated).
 */
export function CommunityCards({ cards, label, dimmed, highlightCards }: CommunityCardsProps) {
  const [prevLength, setPrevLength] = useState(0);
  const alreadyShown = prevLength;
  if (cards.length !== prevLength) {
    setPrevLength(cards.length);
  }

  const highlightKeys = highlightCards ? new Set(highlightCards.map(cardKey)) : null;

  return (
    <div
      className={cn("community-board relative flex gap-2", dimmed && "community-board-dimmed")}
      aria-label={label ? `${label} community cards` : "Community cards"}
    >
      {label && (
        <span className="board-run-label" aria-hidden="true">
          {label}
        </span>
      )}
      {Array.from({ length: 5 }).map((_, i) => {
        const card = cards[i];
        if (!card) return <PlayingCard key={i} empty size="lg" />;
        const isHighlighted = highlightKeys?.has(cardKey(card)) ?? false;
        return (
          <PlayingCard
            key={i}
            card={card}
            size="lg"
            rotationDeg={NATURAL_TILT[i]}
            dealDelayMs={i < alreadyShown ? 0 : (i - alreadyShown) * 110}
            className={cn(isHighlighted && "card-winning")}
          />
        );
      })}
    </div>
  );
}
