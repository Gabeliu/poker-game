import type { SidePot } from "@/lib/types";

export interface PotContribution {
  playerId: string;
  /** Total chips this player put into the pot across the whole hand. */
  amount: number;
  folded: boolean;
}

/**
 * Splits total contributions into a main pot plus side pots, based on
 * distinct all-in contribution levels. Standard algorithm:
 *
 * 1. Take all distinct contribution amounts (from players who put in > 0),
 *    sorted ascending. Each distinct level forms a "layer".
 * 2. For each layer, every player who contributed at least that much pays
 *    into that layer's pot, up to the difference from the previous layer.
 * 3. A pot's eligible winners are players who (a) contributed to that
 *    layer and (b) have not folded.
 *
 * Folded players' chips still count toward pot amounts (the money stays in
 * the pot) but folded players are never eligible to win any pot.
 */
export function calculateSidePots(contributions: PotContribution[]): SidePot[] {
  const withChips = contributions.filter((c) => c.amount > 0);
  if (withChips.length === 0) return [];

  const levels = [...new Set(withChips.map((c) => c.amount))].sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let previousLevel = 0;
  let potIndex = 0;

  for (const level of levels) {
    const layerSize = level - previousLevel;
    if (layerSize <= 0) {
      previousLevel = level;
      continue;
    }

    // Everyone who contributed at least `level` pays into this layer.
    const payers = withChips.filter((c) => c.amount >= level);
    const amount = layerSize * payers.length;

    const eligiblePlayerIds = payers.filter((c) => !c.folded).map((c) => c.playerId);

    if (amount > 0 && eligiblePlayerIds.length > 0) {
      pots.push({
        id: `pot-${potIndex}`,
        amount,
        eligiblePlayerIds,
      });
      potIndex++;
    } else if (amount > 0) {
      // Every contributor to this layer folded (can happen at the edges);
      // fold the orphaned chips into the previous pot so nothing vanishes.
      if (pots.length > 0) {
        pots[pots.length - 1].amount += amount;
      }
    }

    previousLevel = level;
  }

  // Merge consecutive pots that ended up with identical eligible-player sets
  // (common case: no all-ins, everyone matched the same bet -> single pot).
  const merged: SidePot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligiblePlayerIds, pot.eligiblePlayerIds)) {
      last.amount += pot.amount;
    } else {
      merged.push(pot);
    }
  }

  return merged;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/**
 * Distributes a pot's chips among its winners as evenly as possible.
 * Any remainder (integer division) goes to the winner(s) closest to the
 * dealer's left in `winnerOrder` order, matching standard casino rules of
 * giving odd chips to earliest position after the button.
 */
export function splitPotAmount(amount: number, winnerIds: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  if (winnerIds.length === 0) return result;

  const share = Math.floor(amount / winnerIds.length);
  const remainder = amount - share * winnerIds.length;

  for (const id of winnerIds) {
    result[id] = share;
  }
  for (let i = 0; i < remainder; i++) {
    result[winnerIds[i % winnerIds.length]] += 1;
  }
  return result;
}
