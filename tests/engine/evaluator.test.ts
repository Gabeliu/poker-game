import { describe, expect, it } from "vitest";
import type { Card } from "@/lib/types";
import { HAND_CATEGORY, compareHandScores, evaluateBestHand, evaluateFiveCardHand } from "@/server/engine/evaluator";

function c(spec: string): Card {
  // spec like "As", "10h", "Kd", "2c"
  const suitChar = spec.slice(-1);
  const rank = spec.slice(0, -1) as Card["rank"];
  const suitMap: Record<string, Card["suit"]> = {
    c: "clubs",
    d: "diamonds",
    h: "hearts",
    s: "spades",
  };
  return { rank, suit: suitMap[suitChar] };
}

function cards(...specs: string[]): Card[] {
  return specs.map(c);
}

describe("evaluateFiveCardHand", () => {
  it("detects a royal flush", () => {
    const score = evaluateFiveCardHand(cards("As", "Ks", "Qs", "Js", "10s"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(score.description).toBe("Royal Flush");
  });

  it("detects a straight flush", () => {
    const score = evaluateFiveCardHand(cards("9h", "8h", "7h", "6h", "5h"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(score.tiebreakers).toEqual([9]);
  });

  it("detects a wheel straight flush (A-2-3-4-5)", () => {
    const score = evaluateFiveCardHand(cards("As", "2s", "3s", "4s", "5s"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(score.tiebreakers).toEqual([5]);
  });

  it("detects four of a kind", () => {
    const score = evaluateFiveCardHand(cards("9h", "9s", "9d", "9c", "5h"));
    expect(score.category).toBe(HAND_CATEGORY.FOUR_OF_A_KIND);
    expect(score.tiebreakers).toEqual([9, 5]);
  });

  it("detects a full house", () => {
    const score = evaluateFiveCardHand(cards("Kh", "Ks", "Kd", "2c", "2h"));
    expect(score.category).toBe(HAND_CATEGORY.FULL_HOUSE);
    expect(score.tiebreakers).toEqual([13, 2]);
  });

  it("detects a flush", () => {
    const score = evaluateFiveCardHand(cards("2h", "5h", "9h", "Jh", "Kh"));
    expect(score.category).toBe(HAND_CATEGORY.FLUSH);
    expect(score.tiebreakers).toEqual([13, 11, 9, 5, 2]);
  });

  it("detects a straight", () => {
    const score = evaluateFiveCardHand(cards("6h", "7s", "8d", "9c", "10h"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT);
    expect(score.tiebreakers).toEqual([10]);
  });

  it("detects a wheel straight (A-2-3-4-5) as 5-high, not ace-high", () => {
    const score = evaluateFiveCardHand(cards("As", "2h", "3d", "4c", "5s"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT);
    expect(score.tiebreakers).toEqual([5]);
  });

  it("does not treat a non-consecutive run as a straight", () => {
    const score = evaluateFiveCardHand(cards("2h", "3s", "4d", "5c", "7s"));
    expect(score.category).not.toBe(HAND_CATEGORY.STRAIGHT);
  });

  it("detects three of a kind", () => {
    const score = evaluateFiveCardHand(cards("7h", "7s", "7d", "2c", "9h"));
    expect(score.category).toBe(HAND_CATEGORY.THREE_OF_A_KIND);
    expect(score.tiebreakers).toEqual([7, 9, 2]);
  });

  it("detects two pair with correct kicker", () => {
    const score = evaluateFiveCardHand(cards("Jh", "Js", "4d", "4c", "9h"));
    expect(score.category).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(score.tiebreakers).toEqual([11, 4, 9]);
  });

  it("detects one pair", () => {
    const score = evaluateFiveCardHand(cards("3h", "3s", "Kd", "9c", "6h"));
    expect(score.category).toBe(HAND_CATEGORY.PAIR);
    expect(score.tiebreakers).toEqual([3, 13, 9, 6]);
  });

  it("detects high card", () => {
    const score = evaluateFiveCardHand(cards("2h", "5s", "9d", "Jc", "Kh"));
    expect(score.category).toBe(HAND_CATEGORY.HIGH_CARD);
    expect(score.tiebreakers).toEqual([13, 11, 9, 5, 2]);
  });
});

describe("evaluateBestHand (7 cards)", () => {
  it("finds the best 5-card hand among 7 cards", () => {
    // Board: 9h 9s 2d 5c Kh, hole: 9d 9c -> quad nines
    const score = evaluateBestHand(cards("9h", "9s", "2d", "5c", "Kh", "9d", "9c"));
    expect(score.category).toBe(HAND_CATEGORY.FOUR_OF_A_KIND);
  });

  it("uses the best straight/flush combination available", () => {
    // Board: 2h 3h 4h 5h Kh, hole: 6h 7c -> straight flush 3-7 beats flush
    const score = evaluateBestHand(cards("2h", "3h", "4h", "5h", "Kh", "6h", "7c"));
    expect(score.category).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
    expect(score.tiebreakers).toEqual([6]);
  });

  it("picks the higher two pair over a lower one when multiple pairs exist across 7 cards", () => {
    // Cards: pairs of K, Q, and J present (from board+hole) -> best two pair uses K and Q
    const score = evaluateBestHand(cards("Kh", "Ks", "Qd", "Qc", "Jh", "Js", "2h"));
    expect(score.category).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(score.tiebreakers[0]).toBe(13);
    expect(score.tiebreakers[1]).toBe(12);
  });
});

describe("compareHandScores", () => {
  it("ranks a flush above a straight", () => {
    const flush = evaluateFiveCardHand(cards("2h", "5h", "9h", "Jh", "Kh"));
    const straight = evaluateFiveCardHand(cards("6h", "7s", "8d", "9c", "10h"));
    expect(compareHandScores(flush, straight)).toBeGreaterThan(0);
  });

  it("breaks ties correctly between two pairs of the same category", () => {
    const aces = evaluateFiveCardHand(cards("Ah", "As", "2d", "5c", "9h"));
    const kings = evaluateFiveCardHand(cards("Kh", "Ks", "2d", "5c", "9h"));
    expect(compareHandScores(aces, kings)).toBeGreaterThan(0);
  });

  it("returns 0 for genuinely identical hand strength (split pot case)", () => {
    const a = evaluateFiveCardHand(cards("Ah", "Kh", "Qh", "Jh", "9h"));
    const b = evaluateFiveCardHand(cards("As", "Ks", "Qs", "Js", "9s"));
    expect(compareHandScores(a, b)).toBe(0);
  });
});
