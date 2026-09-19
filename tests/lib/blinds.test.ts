import { describe, expect, it } from "vitest";
import { hasBlindErrors, parseBlindText, validateBlindText, validateBlinds } from "@/lib/blinds";

describe("parseBlindText", () => {
  it("accepts plain positive whole numbers", () => {
    expect(parseBlindText("25")).toBe(25);
    expect(parseBlindText(" 100 ")).toBe(100);
  });

  it.each(["", " ", "-5", "-0", "+5", "2.5", "1e3", "abc", "5 0"])("rejects %j", (text) => {
    expect(parseBlindText(text)).toBeNaN();
  });
});

describe("validateBlinds", () => {
  it("accepts a sensible pair, including equal blinds", () => {
    expect(hasBlindErrors(validateBlinds(25, 50))).toBe(false);
    expect(hasBlindErrors(validateBlinds(10, 10))).toBe(false);
  });

  it("rejects negative, zero, fractional and non-numeric blinds", () => {
    expect(validateBlinds(-5, 50).smallBlind).toMatch(/greater than zero/);
    expect(validateBlinds(25, -50).bigBlind).toMatch(/greater than zero/);
    expect(validateBlinds(0, 50).smallBlind).toBeDefined();
    expect(validateBlinds(2.5, 50).smallBlind).toMatch(/whole number/);
    expect(validateBlinds(NaN, 50).smallBlind).toMatch(/whole number/);
    expect(validateBlinds(25, Infinity).bigBlind).toBeDefined();
  });

  it("rejects a big blind smaller than the small blind", () => {
    expect(validateBlinds(50, 25).bigBlind).toMatch(/at least the small blind/);
  });

  it("rejects absurdly large blinds", () => {
    expect(validateBlinds(1_000_001, 2_000_000).smallBlind).toMatch(/at most/);
    expect(validateBlinds(10, 2_000_001).bigBlind).toMatch(/at most/);
  });

  it("validates straight from typed text", () => {
    expect(hasBlindErrors(validateBlindText("25", "50"))).toBe(false);
    expect(hasBlindErrors(validateBlindText("", "50"))).toBe(true);
    expect(hasBlindErrors(validateBlindText("-25", "50"))).toBe(true);
  });
});
