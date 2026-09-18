import { describe, expect, it } from "vitest";
import { summarizeHandResult } from "@/lib/handResultSummary";
import type { HandResult } from "@/lib/types";

function board(winners: HandResult["winners"], descriptions: Record<string, string>): HandResult {
  return {
    winners,
    revealedHands: Object.fromEntries(
      Object.entries(descriptions).map(([id, description]) => [id, { cards: [], description, rank: 0 }])
    ),
  };
}

describe("summarizeHandResult", () => {
  it("evaluates run 1 and run 2 independently — a player's description and winner status never bleed from one board to the other", () => {
    const run1 = board(
      [{ playerId: "p1", potId: "main", amount: 1000, handDescription: "Two Pair, Aces and 5s" }],
      { p1: "Two Pair, Aces and 5s", p2: "Two Pair, Aces and 5s" }
    );
    const run2 = board(
      [{ playerId: "p1", potId: "main", amount: 1000, handDescription: "Two Pair, Kings and 2s" }],
      { p1: "Two Pair, Kings and 2s", p2: "Pair of 2s" }
    );

    const [p1, p2] = summarizeHandResult(
      [{ id: "p1", totalCommittedThisHand: 1000 }, { id: "p2", totalCommittedThisHand: 1000 }],
      run1,
      run2
    );

    expect(p1.run1Description).toBe("Two Pair, Aces and 5s");
    expect(p1.run2Description).toBe("Two Pair, Kings and 2s");
    expect(p2.run1Description).toBe("Two Pair, Aces and 5s");
    expect(p2.run2Description).toBe("Pair of 2s");
    expect(p1.wonRun1).toBe(true);
    expect(p1.wonRun2).toBe(true);
    expect(p2.wonRun1).toBe(false);
    expect(p2.wonRun2).toBe(false);
    expect(p1.scooped).toBe(true);
    expect(p1.netChange).toBe(1000); // won 2000 total, contributed 1000
    expect(p2.netChange).toBe(-1000);
  });

  it("does not flag SCOOP for a player who only ever collects an uncontested side pot while losing the main pot on every run", () => {
    // p1 wins the main pot on both runs (better hand); p2 is the only
    // player eligible for the side pot (e.g. p1 was covered by a smaller
    // stack), so p2 collects it automatically on both runs regardless of
    // hand strength. p2 "won something" on both boards, but never scooped
    // either one — the whole board's money split between the two of them
    // every time.
    const run1 = board(
      [
        { playerId: "p1", potId: "main", amount: 500, handDescription: "Two Pair" },
        { playerId: "p2", potId: "side", amount: 200, handDescription: "High Card" },
      ],
      { p1: "Two Pair", p2: "High Card" }
    );
    const run2 = board(
      [
        { playerId: "p1", potId: "main", amount: 500, handDescription: "Flush" },
        { playerId: "p2", potId: "side", amount: 200, handDescription: "High Card" },
      ],
      { p1: "Flush", p2: "High Card" }
    );

    const [p1, p2] = summarizeHandResult(
      [{ id: "p1", totalCommittedThisHand: 700 }, { id: "p2", totalCommittedThisHand: 700 }],
      run1,
      run2
    );

    expect(p1.scooped).toBe(false); // p2 also took a (side-pot) share on both boards
    expect(p2.scooped).toBe(false); // p2 never took the *whole* board either
    expect(p1.wonRun1).toBe(true);
    expect(p1.wonRun2).toBe(true);
    expect(p2.wonRun1).toBe(true);
    expect(p2.wonRun2).toBe(true);
    expect(p1.netChange).toBe(300); // 1000 won - 700 committed
    expect(p2.netChange).toBe(-300); // 400 won - 700 committed
  });

  it("a single-run hand has no run2 fields and scoop is never true", () => {
    const run1 = board([{ playerId: "p1", potId: "main", amount: 100, handDescription: "Pair" }], { p1: "Pair", p2: "High Card" });

    const [p1, p2] = summarizeHandResult(
      [{ id: "p1", totalCommittedThisHand: 50 }, { id: "p2", totalCommittedThisHand: 50 }],
      run1,
      null
    );

    expect(p1.run2Description).toBeUndefined();
    expect(p1.scooped).toBe(false);
    expect(p2.scooped).toBe(false);
    expect(p1.netChange).toBe(50);
    expect(p2.netChange).toBe(-50);
  });
});
