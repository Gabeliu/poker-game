import type { Player } from "@/lib/types";

// Generic over T so these work with both the server's full Player and the
// client-facing PublicPlayer (which omits private fields like holeCards/
// handHistory) — every field these helpers actually read exists on both.

/** Players eligible to be dealt into a new hand: bought in, not sitting out, has chips. */
export function getEligiblePlayers<T extends Pick<Player, "hasBoughtIn" | "sittingOut" | "chips" | "seat">>(
  players: T[]
): T[] {
  return players
    .filter((p) => p.hasBoughtIn && !p.sittingOut && p.chips > 0)
    .sort((a, b) => a.seat - b.seat);
}

/** Returns the next player, in ascending seat order (wrapping), from a candidate pool. */
export function nextPlayerAfterSeat<T extends Pick<Player, "seat">>(pool: T[], fromSeat: number): T | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.seat - b.seat);
  const next = sorted.find((p) => p.seat > fromSeat);
  return next ?? sorted[0];
}

/** Players still contesting the pot (not folded), regardless of all-in status. */
export function getPlayersStillInHand<T extends Pick<Player, "handStatus">>(players: T[]): T[] {
  return players.filter((p) => p.handStatus === "active" || p.handStatus === "all-in");
}

/** Players who can still take a betting action (not folded, not all-in). */
export function getPlayersWhoCanAct<T extends Pick<Player, "handStatus">>(players: T[]): T[] {
  return players.filter((p) => p.handStatus === "active");
}
