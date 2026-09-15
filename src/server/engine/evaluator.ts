import type { Card, Rank } from "@/lib/types";

/**
 * Texas Hold'em hand evaluator.
 *
 * Evaluates the best 5-card hand out of up to 7 cards (2 hole + 5 board).
 * Implemented from scratch (no external hand-evaluation library) so the
 * scoring logic is fully owned, typed, and unit-tested.
 *
 * A HandScore is compared by `category` first, then lexicographically by
 * `tiebreakers` (both descending-is-better, like comparing two numbers).
 */

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export type HandCategory = (typeof HAND_CATEGORY)[keyof typeof HAND_CATEGORY];

export interface HandScore {
  category: HandCategory;
  /** Descending-priority tiebreak values; compare element-by-element. */
  tiebreakers: number[];
  description: string;
  cards: Card[]; // the best 5-card hand
}

const RANK_VALUE: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  J: 11, Q: 12, K: 13, A: 14,
};

const VALUE_TO_LABEL: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
  11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};

function plural(label: string): string {
  return label.endsWith("s") ? `${label}es` : `${label}s`;
}

function combinations<T>(items: T[], k: number): T[][] {
  const results: T[][] = [];
  const combo: T[] = [];
  function backtrack(start: number) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return results;
}

/** Evaluate exactly 5 cards into a HandScore. */
export function evaluateFiveCardHand(cards: Card[]): HandScore {
  if (cards.length !== 5) {
    throw new Error(`evaluateFiveCardHand requires exactly 5 cards, got ${cards.length}`);
  }

  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const straightHigh = getStraightHigh(values);

  const countByValue = new Map<number, number>();
  for (const v of values) countByValue.set(v, (countByValue.get(v) ?? 0) + 1);

  // Group values by count, each group sorted descending by value.
  const groups = [...countByValue.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // higher count first
    return b[0] - a[0]; // then higher rank first
  });

  const quads = groups.filter(([, c]) => c === 4);
  const trips = groups.filter(([, c]) => c === 3);
  const pairs = groups.filter(([, c]) => c === 2);

  if (straightHigh && isFlush) {
    return {
      category: HAND_CATEGORY.STRAIGHT_FLUSH,
      tiebreakers: [straightHigh],
      description:
        straightHigh === 14 ? "Royal Flush" : `Straight Flush, ${VALUE_TO_LABEL[straightHigh]} high`,
      cards,
    };
  }

  if (quads.length === 1) {
    const kicker = groups.find(([, c]) => c === 1)![0];
    return {
      category: HAND_CATEGORY.FOUR_OF_A_KIND,
      tiebreakers: [quads[0][0], kicker],
      description: `Four of a Kind, ${plural(VALUE_TO_LABEL[quads[0][0]])}`,
      cards,
    };
  }

  if (trips.length === 1 && pairs.length >= 1) {
    return {
      category: HAND_CATEGORY.FULL_HOUSE,
      tiebreakers: [trips[0][0], pairs[0][0]],
      description: `Full House, ${plural(VALUE_TO_LABEL[trips[0][0]])} full of ${plural(VALUE_TO_LABEL[pairs[0][0]])}`,
      cards,
    };
  }

  if (isFlush) {
    return {
      category: HAND_CATEGORY.FLUSH,
      tiebreakers: values,
      description: `Flush, ${VALUE_TO_LABEL[values[0]]} high`,
      cards,
    };
  }

  if (straightHigh) {
    return {
      category: HAND_CATEGORY.STRAIGHT,
      tiebreakers: [straightHigh],
      description: `Straight, ${VALUE_TO_LABEL[straightHigh]} high`,
      cards,
    };
  }

  if (trips.length === 1) {
    const kickers = groups.filter(([, c]) => c === 1).map(([v]) => v);
    return {
      category: HAND_CATEGORY.THREE_OF_A_KIND,
      tiebreakers: [trips[0][0], ...kickers],
      description: `Three of a Kind, ${plural(VALUE_TO_LABEL[trips[0][0]])}`,
      cards,
    };
  }

  if (pairs.length >= 2) {
    const [highPair, lowPair] = pairs;
    const kicker = groups.find(([, c]) => c === 1)![0];
    return {
      category: HAND_CATEGORY.TWO_PAIR,
      tiebreakers: [highPair[0], lowPair[0], kicker],
      description: `Two Pair, ${plural(VALUE_TO_LABEL[highPair[0]])} and ${plural(VALUE_TO_LABEL[lowPair[0]])}`,
      cards,
    };
  }

  if (pairs.length === 1) {
    const kickers = groups.filter(([, c]) => c === 1).map(([v]) => v);
    return {
      category: HAND_CATEGORY.PAIR,
      tiebreakers: [pairs[0][0], ...kickers],
      description: `Pair of ${plural(VALUE_TO_LABEL[pairs[0][0]])}`,
      cards,
    };
  }

  return {
    category: HAND_CATEGORY.HIGH_CARD,
    tiebreakers: values,
    description: `High Card, ${VALUE_TO_LABEL[values[0]]}`,
    cards,
  };
}

/** Returns the high card of the best straight in the given descending unique-sorted values, or null. */
function getStraightHigh(sortedDescValues: number[]): number | null {
  const unique = [...new Set(sortedDescValues)];
  // Wheel: A-2-3-4-5 (Ace plays low)
  const hasWheel = [14, 5, 4, 3, 2].every((v) => unique.includes(v));

  let best: number | null = null;
  for (let i = 0; i <= unique.length - 5; i++) {
    const slice = unique.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) {
      best = slice[0];
      break;
    }
  }
  if (best) return best;
  if (hasWheel) return 5;
  return null;
}

/** Evaluate the best 5-card hand out of 5, 6, or 7 cards. */
export function evaluateBestHand(cards: Card[]): HandScore {
  if (cards.length < 5) {
    throw new Error(`evaluateBestHand requires at least 5 cards, got ${cards.length}`);
  }
  if (cards.length === 5) return evaluateFiveCardHand(cards);

  let best: HandScore | null = null;
  for (const combo of combinations(cards, 5)) {
    const score = evaluateFiveCardHand(combo);
    if (!best || compareHandScores(score, best) > 0) best = score;
  }
  return best!;
}

/** Returns >0 if a beats b, <0 if b beats a, 0 if exactly tied. */
export function compareHandScores(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
