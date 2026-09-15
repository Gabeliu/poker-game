import type { ActionRequest, Card, HandResult, LedgerEntry, Player, PotWinner, RoomState } from "@/lib/types";
import { Deck } from "./deck";
import { applyAction, getLegalActions } from "./betting";
import { calculateSidePots, splitPotAmount, type PotContribution } from "./pots";
import { compareHandScores, evaluateBestHand } from "./evaluator";
import { getEligiblePlayers, getPlayersStillInHand, getPlayersWhoCanAct, nextPlayerAfterSeat } from "./seats";

export class HandEngineError extends Error {}

let ledgerCounter = 0;
function nextLedgerId(): string {
  ledgerCounter += 1;
  return `ledger-${Date.now()}-${ledgerCounter}`;
}

function addLedgerEntry(room: RoomState, entry: Omit<LedgerEntry, "id" | "createdAt">) {
  room.ledger.push({ ...entry, id: nextLedgerId(), createdAt: Date.now() });
}

/** Starts a new hand: rotates dealer/blinds, deals hole cards, sets first actor. */
export function startHand(room: RoomState, deck: Deck): void {
  const eligible = getEligiblePlayers(room.players);
  if (eligible.length < 2) {
    throw new HandEngineError("At least 2 players with approved chips are required to start a hand.");
  }

  // Reset every player's hand-scoped state first.
  for (const player of room.players) {
    player.currentBet = 0;
    player.totalCommittedThisHand = 0;
    player.hasActedThisStreet = false;
    player.holeCards = [];
    player.holeCardsRevealed = false;
    if (eligible.some((p) => p.id === player.id)) {
      player.handStatus = "active";
    } else if (player.chips <= 0 && player.hasBoughtIn) {
      player.handStatus = "sitting-out";
    } else {
      player.handStatus = "waiting";
    }
  }

  // Dealer rotation: previous hand's dealer seat carries over in room.hand.
  const previousDealerSeat = room.hand.dealerSeat;
  const dealerSeat =
    room.hand.handNumber === 0
      ? eligible[0].seat
      : nextPlayerAfterSeat(eligible, previousDealerSeat)?.seat ?? eligible[0].seat;

  let smallBlindSeat: number;
  let bigBlindSeat: number;
  if (eligible.length === 2) {
    // Heads-up: dealer posts small blind.
    smallBlindSeat = dealerSeat;
    bigBlindSeat = nextPlayerAfterSeat(eligible, dealerSeat)!.seat;
  } else {
    smallBlindSeat = nextPlayerAfterSeat(eligible, dealerSeat)!.seat;
    bigBlindSeat = nextPlayerAfterSeat(eligible, smallBlindSeat)!.seat;
  }

  room.hand = {
    phase: "preflop",
    handNumber: room.hand.handNumber + 1,
    dealerSeat,
    smallBlindSeat,
    bigBlindSeat,
    communityCards: [],
    pots: [],
    currentBetAmount: room.settings.bigBlind,
    minRaiseAmount: room.settings.bigBlind,
    activePlayerId: null,
    turnDeadline: null,
    lastAggressorId: null,
    result: null,
  };

  const sbPlayer = room.players.find((p) => p.seat === smallBlindSeat)!;
  const bbPlayer = room.players.find((p) => p.seat === bigBlindSeat)!;
  postBlind(sbPlayer, room.settings.smallBlind);
  postBlind(bbPlayer, room.settings.bigBlind);

  for (const player of eligible) {
    player.holeCards = deck.drawMany(2);
  }

  room.status = "in-hand";
  advanceGameFlow(room, deck, bigBlindSeat);
}

function postBlind(player: Player, amount: number): void {
  const posted = Math.min(amount, player.chips);
  player.chips -= posted;
  player.currentBet += posted;
  player.totalCommittedThisHand += posted;
  if (player.chips === 0) player.handStatus = "all-in";
}

export interface SubmitActionResult {
  ok: boolean;
  error?: string;
}

export function submitAction(
  room: RoomState,
  deck: Deck,
  playerId: string,
  action: ActionRequest
): SubmitActionResult {
  if (room.hand.activePlayerId !== playerId) {
    return { ok: false, error: "It's not your turn." };
  }
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: "Player not found." };

  const result = applyAction(player, room.hand, action, room.settings.bigBlind);
  if (!result.ok) return { ok: false, error: result.error };

  if (result.wasAggressive) {
    for (const other of room.players) {
      if (other.id !== player.id && other.handStatus === "active") {
        other.hasActedThisStreet = false;
      }
    }
  }

  // Only a seated player can ever be the active player, so this is always non-null.
  advanceGameFlow(room, deck, player.seat!);
  return { ok: true };
}

/** Called by the room's turn timer when a player fails to act in time. */
export function forceTimeoutAction(room: RoomState, deck: Deck): void {
  const playerId = room.hand.activePlayerId;
  if (!playerId) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  const info = getLegalActions(player, room.hand, room.settings.bigBlind);
  const action: ActionRequest = info.legalActions.includes("check") ? { action: "check" } : { action: "fold" };
  submitAction(room, deck, playerId, action);
}

/**
 * Core turn/phase progression, called after every action and after dealing
 * a new street. `fromSeat` is the seat to search forward from when picking
 * the next player to act.
 */
export function advanceGameFlow(room: RoomState, deck: Deck, fromSeat: number): void {
  if (checkForImmediateHandEnd(room)) return;

  const canAct = getPlayersWhoCanAct(room.players);
  // Betting only stays "open" while at least 2 players can still act against
  // each other. If only one (or zero) can act — everyone else is all-in or
  // folded — there is no one left to contest further bets against, so the
  // hand runs out automatically once that lone player (if any) has settled
  // whatever call they currently owe.
  let roundComplete: boolean;
  if (canAct.length >= 2) {
    roundComplete = canAct.every((p) => p.hasActedThisStreet && p.currentBet === room.hand.currentBetAmount);
  } else if (canAct.length === 1) {
    const lone = canAct[0];
    const owesCall = lone.currentBet < room.hand.currentBetAmount;
    roundComplete = !owesCall;
  } else {
    roundComplete = true;
  }

  if (!roundComplete) {
    const next = nextPlayerAfterSeat(canAct, fromSeat);
    room.hand.activePlayerId = next!.id;
    room.hand.turnDeadline = Date.now() + room.settings.turnTimeLimitSeconds * 1000;
    return;
  }

  if (room.hand.phase === "river") {
    runShowdown(room);
    finalizeHand(room);
    return;
  }

  dealNextStreetCards(room, deck);
  advanceGameFlow(room, deck, room.hand.dealerSeat);
}

/**
 * Ends the hand immediately (awarding the pot uncontested) if only one
 * player is left contesting it. Returns true if it did so. Exposed so
 * callers that mutate a player's status outside the normal action flow
 * (e.g. the host removing a player mid-hand) can settle the hand safely
 * without duplicating this rule.
 */
export function checkForImmediateHandEnd(room: RoomState): boolean {
  const stillIn = getPlayersStillInHand(room.players);
  if (stillIn.length <= 1) {
    awardUncontestedPot(room, stillIn[0] ?? null);
    finalizeHand(room);
    return true;
  }
  return false;
}

function dealNextStreetCards(room: RoomState, deck: Deck): void {
  if (room.hand.phase === "preflop") {
    deck.draw(); // burn
    room.hand.communityCards.push(...deck.drawMany(3));
    room.hand.phase = "flop";
  } else if (room.hand.phase === "flop") {
    deck.draw(); // burn
    room.hand.communityCards.push(...deck.drawMany(1));
    room.hand.phase = "turn";
  } else if (room.hand.phase === "turn") {
    deck.draw(); // burn
    room.hand.communityCards.push(...deck.drawMany(1));
    room.hand.phase = "river";
  }

  room.hand.currentBetAmount = 0;
  room.hand.minRaiseAmount = room.settings.bigBlind;
  room.hand.lastAggressorId = null;
  room.hand.activePlayerId = null;
  for (const player of room.players) {
    if (player.handStatus === "active") {
      player.currentBet = 0;
      player.hasActedThisStreet = false;
    } else if (player.handStatus === "all-in") {
      player.currentBet = 0;
    }
  }
}

function buildContributions(room: RoomState): PotContribution[] {
  return room.players
    .filter((p) => p.totalCommittedThisHand > 0)
    .map((p) => ({
      playerId: p.id,
      amount: p.totalCommittedThisHand,
      folded: p.handStatus === "folded",
    }));
}

function awardUncontestedPot(room: RoomState, winner: Player | null): void {
  const totalPot = room.players.reduce((sum, p) => sum + p.totalCommittedThisHand, 0);
  room.hand.pots = [];

  if (!winner || totalPot === 0) {
    room.hand.result = { winners: [], revealedHands: {} };
    return;
  }

  winner.chips += totalPot;
  room.hand.result = {
    winners: [
      {
        playerId: winner.id,
        potId: "main",
        amount: totalPot,
        handDescription: "Won uncontested — all other players folded",
      },
    ],
    revealedHands: {},
  };

  applyLedgerForHand(room, new Map([[winner.id, totalPot]]));
}

function runShowdown(room: RoomState): void {
  const stillIn = getPlayersStillInHand(room.players);
  const contributions = buildContributions(room);
  const pots = calculateSidePots(contributions);
  room.hand.pots = pots;

  const scores = new Map<string, ReturnType<typeof evaluateBestHand>>();
  for (const player of stillIn) {
    const allCards: Card[] = [...player.holeCards, ...room.hand.communityCards];
    scores.set(player.id, evaluateBestHand(allCards));
    player.holeCardsRevealed = true;
  }

  const winners: PotWinner[] = [];
  const winningsByPlayer = new Map<string, number>();

  for (const pot of pots) {
    const contenders = pot.eligiblePlayerIds.filter((id) => scores.has(id));
    if (contenders.length === 0) continue;

    let bestScore = scores.get(contenders[0])!;
    for (const id of contenders) {
      const score = scores.get(id)!;
      if (compareHandScores(score, bestScore) > 0) bestScore = score;
    }
    const potWinnerIds = contenders.filter((id) => compareHandScores(scores.get(id)!, bestScore) === 0);
    const split = splitPotAmount(pot.amount, potWinnerIds);

    for (const [playerId, amount] of Object.entries(split)) {
      const player = room.players.find((p) => p.id === playerId)!;
      player.chips += amount;
      winningsByPlayer.set(playerId, (winningsByPlayer.get(playerId) ?? 0) + amount);
      winners.push({
        playerId,
        potId: pot.id,
        amount,
        handDescription: scores.get(playerId)!.description,
      });
    }
  }

  const revealedHands: HandResult["revealedHands"] = {};
  for (const player of stillIn) {
    const score = scores.get(player.id)!;
    revealedHands[player.id] = {
      cards: player.holeCards,
      description: score.description,
      rank: score.category,
    };
  }

  room.hand.result = { winners, revealedHands };
  applyLedgerForHand(room, winningsByPlayer);
}

const MAX_HAND_HISTORY_PER_PLAYER = 25;

function applyLedgerForHand(room: RoomState, winningsByPlayer: Map<string, number>): void {
  for (const player of room.players) {
    if (player.totalCommittedThisHand <= 0) continue;
    const winnings = winningsByPlayer.get(player.id) ?? 0;
    const net = winnings - player.totalCommittedThisHand;

    // Every player who put chips in this hand gets a personal history entry
    // (their own cards only — never shown to anyone else), regardless of
    // whether it nets to exactly zero.
    player.handHistory.push({
      handNumber: room.hand.handNumber,
      holeCards: player.holeCards,
      netChange: net,
      wasInHand: player.handStatus !== "folded",
      createdAt: Date.now(),
    });
    if (player.handHistory.length > MAX_HAND_HISTORY_PER_PLAYER) {
      player.handHistory.splice(0, player.handHistory.length - MAX_HAND_HISTORY_PER_PLAYER);
    }

    if (net === 0) continue;
    addLedgerEntry(room, {
      playerId: player.id,
      type: net > 0 ? "hand-win" : "hand-loss",
      amount: net,
      balanceAfter: player.chips,
    });
  }
}

function finalizeHand(room: RoomState): void {
  room.hand.phase = "hand-complete";
  room.hand.activePlayerId = null;
  room.hand.turnDeadline = null;
  room.status = "lobby";

  for (const player of room.players) {
    player.currentBet = 0;
    if (player.hasBoughtIn) {
      player.handStatus = player.chips > 0 ? "waiting" : "sitting-out";
    }
  }
}
