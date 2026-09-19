import { describe, expect, it } from "vitest";
import { boardResultKey } from "@/lib/resultKey";
import type { HandResult } from "@/lib/types";

const result = (amount: number): HandResult => ({
  winners: [{ playerId: "p1", potId: "main", amount, handDescription: "Pair" }],
  revealedHands: {},
});

describe("boardResultKey", () => {
  it("is empty when there is no result", () => {
    expect(boardResultKey(3, null)).toBe("");
    expect(boardResultKey(3, undefined)).toBe("");
  });

  it("is stable across deserialized copies of the same result (every broadcast is a fresh object)", () => {
    const a = result(100);
    const b = structuredClone(a);
    expect(a).not.toBe(b);
    expect(boardResultKey(3, a)).toBe(boardResultKey(3, b));
  });

  it("changes when the hand number or the payout changes", () => {
    expect(boardResultKey(3, result(100))).not.toBe(boardResultKey(4, result(100)));
    expect(boardResultKey(3, result(100))).not.toBe(boardResultKey(3, result(200)));
  });
});
