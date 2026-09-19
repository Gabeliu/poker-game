"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

// Fixed, subtle per-slot tilt so dealt cards don't look mechanically perfect,
// while staying deterministic (no layout shift on re-render).
const NATURAL_TILT = [-3, 2, -1, 3, -2];

/** Each board slot's offset from where the deck sits (upper right of the
 * table), in container-query units so the flight scales with the table. The
 * slots are ~12cqw apart, centred on the board; the deck is ~17cqw right of
 * and ~18cqh above the board's centre. */
function dealFromDeck(slot: number): { x: string; y: string } {
  return { x: `${(17 - (slot - 2) * 12).toFixed(1)}cqw`, y: "-18cqh" };
}

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
  // `prev` is how many cards were on the board before the current street
  // arrived, and it's seeded from what's already there at mount — so cards
  // dealt before this board rendered (a reconnect, or the board swapping
  // into the two-run layout) appear in place instead of re-dealing, and only
  // the street that just arrived gets the staggered deal. (Updating state
  // during render re-renders immediately, so it has to carry the *previous*
  // length forward explicitly; reading it back afterwards would only ever
  // see the new one.)
  const [lengths, setLengths] = useState({ prev: cards.length, cur: cards.length });
  if (cards.length !== lengths.cur) {
    setLengths({ prev: lengths.cur, cur: cards.length });
  }
  const alreadyShown = lengths.prev;

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
        // Distinct keys: the card that fills a slot must mount fresh (with its own
        // deal settings), not reuse the empty placeholder's instance.
        if (!card) return <PlayingCard key={`empty-${i}`} empty size="lg" />;
        const isHighlighted = highlightKeys?.has(cardKey(card)) ?? false;
        return (
          <PlayingCard
            key={`card-${i}`}
            card={card}
            size="lg"
            rotationDeg={NATURAL_TILT[i]}
            instant={i < alreadyShown}
            dealDelayMs={i < alreadyShown ? 0 : (i - alreadyShown) * 140}
            dealFrom={dealFromDeck(i)}
            className={cn(isHighlighted && "card-winning")}
          />
        );
      })}
    </div>
  );
}
