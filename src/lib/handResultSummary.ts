import type { HandResult } from "./types";

export interface PlayerRunResult {
  playerId: string;
  /** What they actually walk away up or down for the whole hand, combining
   * both runs when the hand ran it twice — never gross pot proceeds. */
  netChange: number;
  run1Description: string | undefined;
  run2Description: string | undefined;
  /** Won any share of Run 1's pot(s). Only meaningful when the hand ran it
   * twice — for a single-run hand, use `netChange > 0` instead. */
  wonRun1: boolean;
  wonRun2: boolean;
  /** True only when this player took the *entire* pot on every run they
   * were eligible for — not merely "won something on both runs", which
   * would also be true for a player who only ever collected an uncontested
   * side pot while losing the main pot on every run. */
  scooped: boolean;
}

/** True when `playerId` is the only winner across every pot tier of this
 * board — i.e. they took the whole board's money, not just their share of
 * a split side pot. */
function scoopedBoard(board: HandResult, playerId: string): boolean {
  return board.winners.length > 0 && board.winners.every((w) => w.playerId === playerId);
}

function wonBoard(board: HandResult, playerId: string): boolean {
  return board.winners.some((w) => w.playerId === playerId);
}

/**
 * Builds a per-player summary of a completed hand's result, evaluating Run
 * 1 and Run 2 (when the hand ran it twice) completely independently —
 * never falling back to Run 1's description, winners, or scoop status for
 * Run 2. This is the single source of truth the post-hand summary UI and
 * per-seat hand descriptions both read from, so the two runs can't drift
 * apart or bleed into each other again.
 */
export function summarizeHandResult(
  contributors: { id: string; totalCommittedThisHand: number }[],
  result: HandResult,
  secondResult: HandResult | null
): PlayerRunResult[] {
  return contributors.map(({ id, totalCommittedThisHand }) => {
    const run1Winnings = result.winners.filter((w) => w.playerId === id).reduce((s, w) => s + w.amount, 0);
    const run2Winnings = secondResult
      ? secondResult.winners.filter((w) => w.playerId === id).reduce((s, w) => s + w.amount, 0)
      : 0;
    const netChange = run1Winnings + run2Winnings - totalCommittedThisHand;

    return {
      playerId: id,
      netChange,
      run1Description: result.revealedHands[id]?.description,
      run2Description: secondResult?.revealedHands[id]?.description,
      wonRun1: wonBoard(result, id),
      wonRun2: secondResult ? wonBoard(secondResult, id) : false,
      scooped: Boolean(secondResult) && scoopedBoard(result, id) && scoopedBoard(secondResult!, id),
    };
  });
}
