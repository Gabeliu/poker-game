import type { HandResult } from "./types";

/**
 * A stable identity for a board's result. Every socket broadcast delivers a
 * freshly deserialized view, so comparing `room.hand.result` by object
 * identity reads as "changed" on every later broadcast (a chat message, a
 * join…) and would replay payout animations/sounds long after the hand.
 * Keying on the hand number + who won what changes only when a result
 * genuinely appears.
 */
export function boardResultKey(handNumber: number, result: HandResult | null | undefined): string {
  if (!result) return "";
  return `${handNumber}:${result.winners.map((w) => `${w.playerId}.${w.potId}.${w.amount}`).join(",")}`;
}
