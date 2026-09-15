import type { Player } from "@/lib/types";

/** Players eligible to be dealt into a new hand: bought in, not sitting out, has chips. */
export function getEligiblePlayers(players: Player[]): Player[] {
  return players
    .filter((p) => p.hasBoughtIn && !p.sittingOut && p.chips > 0)
    .sort((a, b) => a.seat - b.seat);
}

/** Returns the next player, in ascending seat order (wrapping), from a candidate pool. */
export function nextPlayerAfterSeat(pool: Player[], fromSeat: number): Player | null {
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.seat - b.seat);
  const next = sorted.find((p) => p.seat > fromSeat);
  return next ?? sorted[0];
}

/** Players still contesting the pot (not folded), regardless of all-in status. */
export function getPlayersStillInHand(players: Player[]): Player[] {
  return players.filter((p) => p.handStatus === "active" || p.handStatus === "all-in");
}

/** Players who can still take a betting action (not folded, not all-in). */
export function getPlayersWhoCanAct(players: Player[]): Player[] {
  return players.filter((p) => p.handStatus === "active");
}
