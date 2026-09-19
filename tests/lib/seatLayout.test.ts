import { describe, expect, it } from "vitest";
import { isTopCenterPosition, ringPositionForSeat, ringSeatPositions } from "@/lib/seatLayout";
import type { SeatNumber } from "@/lib/types";

describe("isTopCenterPosition", () => {
  it("is true for exactly one seat: the one straight across from the viewer", () => {
    for (const mySeat of [0, 1, 2, 3, 4, 5, 6, 7] as SeatNumber[]) {
      const across = ringSeatPositions(mySeat).filter(({ position }) => isTopCenterPosition(position));
      expect(across).toHaveLength(1);
      // Four seats round the table from the viewer.
      expect(across[0].seat).toBe(((mySeat + 4) % 8) as SeatNumber);
    }
  });

  it("is false for the upper-left and upper-right seats, and everything lower", () => {
    const positions = ringSeatPositions(0 as SeatNumber).map(({ position }) => position);
    expect(positions.filter(isTopCenterPosition)).toHaveLength(1);
    // The neighbours of the top seat sit far off-centre.
    expect(isTopCenterPosition(ringPositionForSeat(3 as SeatNumber, 0 as SeatNumber))).toBe(false);
    expect(isTopCenterPosition(ringPositionForSeat(5 as SeatNumber, 0 as SeatNumber))).toBe(false);
  });

  it("checks both the horizontal centre and the top of the table", () => {
    expect(isTopCenterPosition({ xPct: 50, yPct: 13 })).toBe(true);
    expect(isTopCenterPosition({ xPct: 50, yPct: 60 })).toBe(false); // centred but low: that's the viewer's own spot
    expect(isTopCenterPosition({ xPct: 19, yPct: 24 })).toBe(false); // high but off to the side
  });
});
