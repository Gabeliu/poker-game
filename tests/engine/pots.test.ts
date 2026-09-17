import { describe, expect, it } from "vitest";
import { calculateSidePots, splitPotAcrossRuns, splitPotAmount, type PotContribution } from "@/server/engine/pots";

describe("calculateSidePots", () => {
  it("creates a single main pot when everyone contributes equally", () => {
    const contributions: PotContribution[] = [
      { playerId: "a", amount: 100, folded: false },
      { playerId: "b", amount: 100, folded: false },
      { playerId: "c", amount: 100, folded: false },
    ];
    const pots = calculateSidePots(contributions);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("creates a side pot when one player goes all-in for less than others", () => {
    // a all-in for 50, b and c bet 150 each.
    const contributions: PotContribution[] = [
      { playerId: "a", amount: 50, folded: false },
      { playerId: "b", amount: 150, folded: false },
      { playerId: "c", amount: 150, folded: false },
    ];
    const pots = calculateSidePots(contributions);
    // Main pot: 50*3 = 150, eligible a,b,c
    // Side pot: 100*2 = 200, eligible b,c
    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["a", "b", "c"]);
    expect(pots[1].amount).toBe(200);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(["b", "c"]);
  });

  it("handles multiple distinct all-in levels (double side pot)", () => {
    // a all-in 30, b all-in 80, c bets 200
    const contributions: PotContribution[] = [
      { playerId: "a", amount: 30, folded: false },
      { playerId: "b", amount: 80, folded: false },
      { playerId: "c", amount: 200, folded: false },
    ];
    const pots = calculateSidePots(contributions);
    // Layer 0-30: 30*3=90, eligible a,b,c
    // Layer 30-80: 50*2=100, eligible b,c
    // Layer 80-200: 120*1=120, eligible c only -> folds into previous pot since c is sole eligible payer but not folded so still separate
    expect(pots).toHaveLength(3);
    expect(pots[0].amount).toBe(90);
    expect(pots[1].amount).toBe(100);
    expect(pots[2].amount).toBe(120);
    expect(pots[2].eligiblePlayerIds).toEqual(["c"]);
  });

  it("excludes folded players from eligibility but keeps their chips in the pot", () => {
    const contributions: PotContribution[] = [
      { playerId: "a", amount: 100, folded: true },
      { playerId: "b", amount: 100, folded: false },
      { playerId: "c", amount: 100, folded: false },
    ];
    const pots = calculateSidePots(contributions);
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["b", "c"]);
  });

  it("folds orphaned layer chips into the previous pot when all payers of that layer folded", () => {
    // a folds after putting in 100, b all-in for 50, c calls 50 then folds is impossible mid-way
    // simulate: a contributed 100 then folded, b contributed 50 (all-in, active), c contributed 50 then folded
    const contributions: PotContribution[] = [
      { playerId: "a", amount: 100, folded: true },
      { playerId: "b", amount: 50, folded: false },
      { playerId: "c", amount: 50, folded: true },
    ];
    const pots = calculateSidePots(contributions);
    // Layer 0-50: 50*3=150 eligible b only (a,c folded)
    // Layer 50-100: 50*1=50, payer is only 'a' who folded -> orphaned, merges into pot 0
    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(200);
    expect(pots[0].eligiblePlayerIds).toEqual(["b"]);
  });

  it("returns no pots when nobody contributed", () => {
    expect(calculateSidePots([])).toEqual([]);
  });
});

describe("splitPotAmount", () => {
  it("splits evenly with no remainder", () => {
    expect(splitPotAmount(300, ["a", "b", "c"])).toEqual({ a: 100, b: 100, c: 100 });
  });

  it("gives the remainder to the earliest winner(s) in order", () => {
    const result = splitPotAmount(301, ["a", "b", "c"]);
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(301);
    expect(result.a).toBe(101);
    expect(result.b).toBe(100);
    expect(result.c).toBe(100);
  });

  it("gives the full amount to a single winner", () => {
    expect(splitPotAmount(500, ["a"])).toEqual({ a: 500 });
  });

  it("returns empty object for no winners", () => {
    expect(splitPotAmount(500, [])).toEqual({});
  });
});

describe("splitPotAcrossRuns", () => {
  it("splits evenly with no remainder", () => {
    expect(splitPotAcrossRuns(100, 2)).toEqual([50, 50]);
  });

  it("gives the odd chip to the first run", () => {
    expect(splitPotAcrossRuns(101, 2)).toEqual([51, 50]);
  });

  it("passes the amount through unchanged for a single run", () => {
    expect(splitPotAcrossRuns(101, 1)).toEqual([101]);
  });

  it("always sums back to the original amount", () => {
    for (const amount of [0, 1, 2, 99, 100, 101, 999]) {
      const [a, b] = splitPotAcrossRuns(amount, 2);
      expect(a + b).toBe(amount);
    }
  });
});
