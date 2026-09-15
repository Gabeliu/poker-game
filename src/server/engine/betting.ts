import type { ActionRequest, HandState, PokerAction, Player } from "@/lib/types";

export interface LegalActionInfo {
  legalActions: PokerAction[];
  callAmount: number; // chips needed to call (0 if already matched / can check)
  minRaiseToAmount: number | null; // minimum total bet a raise/bet must reach
  maxRaiseToAmount: number | null; // player's chips + currentBet (all-in ceiling)
}

/** Computes what actions a player may legally take right now. */
export function getLegalActions(
  player: Pick<Player, "chips" | "currentBet">,
  hand: HandState,
  bigBlind: number
): LegalActionInfo {
  const toCall = Math.max(0, hand.currentBetAmount - player.currentBet);
  const callAmount = Math.min(toCall, player.chips);
  const canCheck = toCall === 0;
  const allInCeiling = player.currentBet + player.chips;

  const legalActions: PokerAction[] = ["fold"];

  if (player.chips === 0) {
    // Already all-in from a blind post; no further action possible.
    return { legalActions: [], callAmount: 0, minRaiseToAmount: null, maxRaiseToAmount: null };
  }

  if (canCheck) {
    legalActions.push("check");
  } else {
    legalActions.push("call");
  }

  const minRaiseIncrement = Math.max(hand.minRaiseAmount, bigBlind);
  const minRaiseToAmount = hand.currentBetAmount === 0
    ? bigBlind
    : hand.currentBetAmount + minRaiseIncrement;

  // Player can bet/raise only if they have more chips than what's needed to call
  // (otherwise their only option beyond calling is going all-in).
  if (allInCeiling > hand.currentBetAmount) {
    legalActions.push(hand.currentBetAmount === 0 ? "bet" : "raise");
  }

  legalActions.push("all-in");

  return {
    legalActions,
    callAmount,
    minRaiseToAmount: allInCeiling > hand.currentBetAmount ? Math.min(minRaiseToAmount, allInCeiling) : null,
    maxRaiseToAmount: allInCeiling,
  };
}

export interface ApplyActionResult {
  ok: boolean;
  error?: string;
  /** True if this action re-opened the betting round (a bet/raise). */
  wasAggressive?: boolean;
}

/**
 * Validates and applies a single player action in place, mutating `player`
 * and `hand`. Pure enough to unit test: no I/O, no randomness.
 */
export function applyAction(
  player: Player,
  hand: HandState,
  action: ActionRequest,
  bigBlind: number
): ApplyActionResult {
  const info = getLegalActions(player, hand, bigBlind);

  if (!info.legalActions.includes(action.action)) {
    return { ok: false, error: `Action "${action.action}" is not legal right now.` };
  }

  switch (action.action) {
    case "fold": {
      player.handStatus = "folded";
      player.hasActedThisStreet = true;
      return { ok: true };
    }

    case "check": {
      player.hasActedThisStreet = true;
      return { ok: true };
    }

    case "call": {
      const callAmount = info.callAmount;
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalCommittedThisHand += callAmount;
      player.hasActedThisStreet = true;
      if (player.chips === 0) player.handStatus = "all-in";
      return { ok: true };
    }

    case "bet":
    case "raise": {
      const target = action.amount;
      if (typeof target !== "number" || !Number.isFinite(target)) {
        return { ok: false, error: "A bet/raise requires a numeric amount." };
      }
      if (info.minRaiseToAmount === null || info.maxRaiseToAmount === null) {
        return { ok: false, error: "No bet/raise is available." };
      }
      if (target < info.minRaiseToAmount && target < info.maxRaiseToAmount) {
        return { ok: false, error: `Minimum raise is to ${info.minRaiseToAmount}.` };
      }
      if (target > info.maxRaiseToAmount) {
        return { ok: false, error: `Cannot bet more than your stack (${info.maxRaiseToAmount}).` };
      }

      const additional = target - player.currentBet;
      if (additional <= 0 || additional > player.chips) {
        return { ok: false, error: "Invalid bet/raise amount." };
      }

      const isFullRaise = target - hand.currentBetAmount >= Math.max(hand.minRaiseAmount, bigBlind);
      if (isFullRaise) {
        hand.minRaiseAmount = target - hand.currentBetAmount;
        hand.lastAggressorId = player.id;
        // A full raise re-opens the action for everyone else. `wasAggressive`
        // (returned below) tells the caller to clear other players' acted
        // flags — this module only touches the single `player` it's given.
      }

      player.chips -= additional;
      player.currentBet += additional;
      player.totalCommittedThisHand += additional;
      player.hasActedThisStreet = true;
      hand.currentBetAmount = Math.max(hand.currentBetAmount, target);
      if (player.chips === 0) player.handStatus = "all-in";

      return { ok: true, wasAggressive: isFullRaise };
    }

    case "all-in": {
      const additional = player.chips;
      const target = player.currentBet + additional;
      const isFullRaise = target - hand.currentBetAmount >= Math.max(hand.minRaiseAmount, bigBlind);

      player.chips = 0;
      player.currentBet = target;
      player.totalCommittedThisHand += additional;
      player.hasActedThisStreet = true;
      player.handStatus = "all-in";

      if (target > hand.currentBetAmount) {
        if (isFullRaise) {
          hand.minRaiseAmount = target - hand.currentBetAmount;
          hand.lastAggressorId = player.id;
        }
        hand.currentBetAmount = target;
      }

      return { ok: true, wasAggressive: target > hand.currentBetAmount };
    }

    default:
      return { ok: false, error: "Unknown action." };
  }
}
