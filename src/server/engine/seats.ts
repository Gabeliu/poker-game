import type { Player, SeatNumber } from "@/lib/types";

// Generic over T so these work with both the server's full Player and the
// client-facing PublicPlayer (which omits private fields like holeCards/
// handHistory) — every field these helpers actually read exists on both.

/** Players eligible to be dealt into a new hand: bought in, not sitting out, has chips, seated. */
export function getEligiblePlayers<T extends Pick<Player, "hasBoughtIn" | "sittingOut" | "chips" | "seat">>(
  players: T[]
): (T & { seat: SeatNumber })[] {
  return players
    .filter((p): p is T & { seat: SeatNumber } => p.hasBoughtIn && !p.sittingOut && p.chips > 0 && p.seat !== null)
    .sort((a, b) => a.seat - b.seat);
}

/** Shared pre-deal validation; never drops reserved seats or changes eligibility. */
export function getStartHandError<T extends Pick<Player, "hasBoughtIn" | "sittingOut" | "chips" | "seat" | "connectionStatus">>(players: T[]): string | null {
  // Keep disconnected seats reserved. Spectators do not block the table.
  if (players.some((player) => player.seat !== null && player.connectionStatus !== "connected")) {
    return "Waiting for all seated players to reconnect.";
  }
  if (getEligiblePlayers(players).length < 2) {
    return "At least 2 players with approved chips are required to start a hand.";
  }
  return null;
}

/** Returns the next player, in ascending seat order (wrapping), from a candidate pool. */
export function nextPlayerAfterSeat<T extends Pick<Player, "seat">>(pool: T[], fromSeat: number): T | null {
  const seated = pool.filter((p) => p.seat !== null);
  if (seated.length === 0) return null;
  const sorted = [...seated].sort((a, b) => a.seat! - b.seat!);
  const next = sorted.find((p) => p.seat! > fromSeat);
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
