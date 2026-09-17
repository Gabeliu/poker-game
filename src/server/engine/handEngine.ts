import type { ActionRequest, Card, HandResult, LedgerEntry, Player, PotWinner, RoomState, RunItChoice, SidePot } from "@/lib/types";
import { Deck } from "./deck";
import { applyAction, getLegalActions } from "./betting";
import { calculateSidePots, splitPotAcrossRuns, splitPotAmount, type PotContribution } from "./pots";
import { compareHandScores, evaluateBestHand } from "./evaluator";
import { getEligiblePlayers, getStartHandError, getPlayersStillInHand, getPlayersWhoCanAct, nextPlayerAfterSeat } from "./seats";

/** Optional behavior flags threaded through the flow-advancing entry points.
 * Absent (the default) preserves today's exact synchronous behavior — an
 * all-in runout resolves the whole hand to completion in one call, which is
 * what every existing caller and test relies on. Only the socket handlers
 * pass `{ paced: true }`, which instead suspends at an all-in for a
 * server-driven, one-street-at-a-time reveal (see beginRunout/continueRunout). */
export interface HandFlowOptions {
  paced?: boolean;
}

export class HandEngineError extends Error {}

let ledgerCounter = 0;
function nextLedgerId(): string {
  ledgerCounter += 1;
  return `ledger-${Date.now()}-${ledgerCounter}`;
}

function addLedgerEntry(room: RoomState, entry: Omit<LedgerEntry, "id" | "createdAt">) {
  room.ledger.push({ ...entry, id: nextLedgerId(), createdAt: Date.now() });
}

/** Credits chips a host approved while this player was mid-hand (see
 * buyInService's deferred-topup path) — never applied to an active stack,
 * only ever here, between hands. */
function applyPendingChipTopUps(room: RoomState): void {
  for (const player of room.players) {
    if (player.pendingChipTopUp && player.pendingChipTopUp > 0) {
      player.chips += player.pendingChipTopUp;
      player.pendingChipTopUp = 0;
      player.hasBoughtIn = true;
    }
  }
}

/** Starts a new hand: rotates dealer/blinds, deals hole cards, sets first actor. */
export function startHand(room: RoomState, deck: Deck): void {
  // A staged all-in reveal takes real time to play out server-side (see
  // beginRunout/continueRunout) — unlike the old instant-runout behavior,
  // it's now reachable for the host to try to start a new hand while one is
  // still resolving, which would replace the deck out from under it.
  if (room.status === "in-hand") {
    throw new HandEngineError("A hand is already in progress.");
  }

  // Safety net: chips approved mid-hand (see buyInService's deferred
  // top-up path) are normally applied by finalizeHand before status ever
  // gets here, but apply them here too in case a hand reaches "lobby"
  // through any other path.
  applyPendingChipTopUps(room);

  const startError = getStartHandError(room.players);
  if (startError) throw new HandEngineError(startError);
  const eligible = getEligiblePlayers(room.players);

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
    runItDecision: null,
    runout: null,
    secondBoard: null,
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
  action: ActionRequest,
  opts?: HandFlowOptions
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
  advanceGameFlow(room, deck, player.seat!, opts);
  return { ok: true };
}

/** Called by the room's turn timer when a player fails to act in time. */
export function forceTimeoutAction(room: RoomState, deck: Deck, opts?: HandFlowOptions): void {
  const playerId = room.hand.activePlayerId;
  if (!playerId) return;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return;

  const info = getLegalActions(player, room.hand, room.settings.bigBlind);
  const action: ActionRequest = info.legalActions.includes("check") ? { action: "check" } : { action: "fold" };
  submitAction(room, deck, playerId, action, opts);
}

/**
 * Core turn/phase progression, called after every action and after dealing
 * a new street. `fromSeat` is the seat to search forward from when picking
 * the next player to act.
 */
export function advanceGameFlow(room: RoomState, deck: Deck, fromSeat: number, opts?: HandFlowOptions): void {
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

  // Betting is over with streets still left to deal. Unpaced (the default —
  // every existing caller/test), this resolves the whole hand synchronously
  // in one call, exactly as before. Paced (socket handlers only), it
  // suspends here for a server-driven, one-street-at-a-time reveal instead.
  if (opts?.paced && canAct.length <= 1) {
    beginRunout(room);
    return;
  }

  dealNextStreetCards(room, deck);
  advanceGameFlow(room, deck, room.hand.dealerSeat, opts);
}

const RUN_IT_DECISION_SECONDS = 10;
export const REVEAL_STREET_DELAY_MS = 900;
export const REVEAL_RESOLVE_DELAY_MS = 1300;

function streetsRemainingFor(communityCardCount: number): number {
  if (communityCardCount === 0) return 3; // flop + turn + river
  if (communityCardCount === 3) return 2; // turn + river
  if (communityCardCount === 4) return 1; // river
  return 0;
}

/**
 * Entry point once betting is over and streets remain: reveals hole cards
 * (only for players still in the hand — a folded player's cards stay
 * hidden), then either offers the two remaining players a run-it-once/twice
 * decision, or goes straight into a paced single-run reveal.
 */
export function beginRunout(room: RoomState): void {
  const stillIn = getPlayersStillInHand(room.players);
  for (const player of stillIn) player.holeCardsRevealed = true;

  room.hand.activePlayerId = null;
  room.hand.turnDeadline = null;

  const streetsRemaining = streetsRemainingFor(room.hand.communityCards.length);

  if (room.settings.runItTwiceEnabled && stillIn.length === 2 && streetsRemaining > 0) {
    room.hand.phase = "showdown";
    room.hand.runItDecision = {
      eligiblePlayerIds: stillIn.map((p) => p.id),
      choices: {},
      deadline: Date.now() + RUN_IT_DECISION_SECONDS * 1000,
    };
    return;
  }

  startRunout(room, 1);
}

function startRunout(room: RoomState, runs: 1 | 2): void {
  room.hand.runItDecision = null;

  if (runs === 2) {
    // Share whatever's already on the table — run-it-twice only re-runs the
    // remaining streets, it doesn't re-deal a flop that already happened.
    room.hand.secondBoard = { communityCards: [...room.hand.communityCards], result: null };
  }

  const count = room.hand.communityCards.length;
  room.hand.phase = count === 0 ? "preflop" : count === 3 ? "flop" : count === 4 ? "turn" : "river";

  room.hand.runout = {
    runs,
    streetsRemaining: streetsRemainingFor(count),
    nextRevealAt: Date.now() + REVEAL_STREET_DELAY_MS,
  };
}

/** Deals the next street of a paced runout (both boards, if running twice),
 * or — once every street is dealt — runs showdown and finalizes the hand.
 * Called on a timer (see broadcast.ts's scheduleHandFlowTimer), one street
 * per call, so every client sees the reveal at the same real pace. */
export function continueRunout(room: RoomState, deck: Deck): { done: boolean } {
  const runout = room.hand.runout;
  if (!runout) return { done: true };

  if (runout.streetsRemaining === 0) {
    runShowdown(room);
    room.hand.runout = null;
    finalizeHand(room);
    return { done: true };
  }

  const countBefore = room.hand.communityCards.length;
  const dealCount = countBefore === 0 ? 3 : 1;
  dealNextStreetCards(room, deck); // board 1: burns, appends, advances phase

  if (runout.runs === 2 && room.hand.secondBoard) {
    dealStreetInto(deck, room.hand.secondBoard.communityCards, dealCount);
  }

  runout.streetsRemaining -= 1;
  runout.nextRevealAt = Date.now() + (runout.streetsRemaining === 0 ? REVEAL_RESOLVE_DELAY_MS : REVEAL_STREET_DELAY_MS);
  return { done: false };
}

/** Records one of the two all-in players' run-it-once/twice choice. Any
 * "once" resolves immediately to a single run without waiting on the other
 * player; only when both choose "twice" does it resolve to two runs. */
export function chooseRunIt(
  room: RoomState,
  playerId: string,
  choice: RunItChoice
): { ok: boolean; error?: string; resolved: boolean } {
  const decision = room.hand.runItDecision;
  if (!decision) return { ok: false, error: "There's no run-it decision to make right now.", resolved: false };
  if (!decision.eligiblePlayerIds.includes(playerId)) {
    return { ok: false, error: "You're not one of the players deciding this.", resolved: false };
  }

  decision.choices[playerId] = choice;
  return { ok: true, resolved: tryResolveRunItDecision(room) };
}

/** Called by the room's reveal timer when the run-it decision's deadline
 * passes — whoever hasn't answered defaults to "once", which (per the
 * any-once-wins rule) always resolves to a single run on timeout. */
export function resolveRunItByTimeout(room: RoomState): void {
  const decision = room.hand.runItDecision;
  if (!decision) return;
  for (const id of decision.eligiblePlayerIds) {
    if (!decision.choices[id]) decision.choices[id] = "once";
  }
  tryResolveRunItDecision(room);
}

function tryResolveRunItDecision(room: RoomState): boolean {
  const decision = room.hand.runItDecision;
  if (!decision) return false;

  const choices = decision.eligiblePlayerIds.map((id) => decision.choices[id]);
  if (choices.some((c) => c === "once")) {
    startRunout(room, 1);
    return true;
  }
  if (choices.every((c) => c === "twice")) {
    startRunout(room, 2);
    return true;
  }
  return false;
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

/** Burns one card and deals `count` into `target` — the primitive both the
 * primary board and (during a run-it-twice reveal) the second board use. */
function dealStreetInto(deck: Deck, target: Card[], count: number): void {
  deck.draw(); // burn
  target.push(...deck.drawMany(count));
}

function dealNextStreetCards(room: RoomState, deck: Deck): void {
  if (room.hand.phase === "preflop") {
    dealStreetInto(deck, room.hand.communityCards, 3);
    room.hand.phase = "flop";
  } else if (room.hand.phase === "flop") {
    dealStreetInto(deck, room.hand.communityCards, 1);
    room.hand.phase = "turn";
  } else if (room.hand.phase === "turn") {
    dealStreetInto(deck, room.hand.communityCards, 1);
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
  // A fold-out can happen mid-reveal (e.g. the host removes a disconnected
  // player between hands, or a future path force-folds someone) — clear any
  // in-flight reveal state so nothing stale survives into hand-complete.
  room.hand.runout = null;
  room.hand.runItDecision = null;
  room.hand.secondBoard = null;

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

interface BoardOutcome {
  result: HandResult;
  winningsByPlayer: Map<string, number>;
}

/** Evaluates one board (the primary board, or the second run in a run-it-
 * twice reveal) against the hand's pots, crediting chips as it goes.
 * `runIndex`/`runs` divide each pot's amount across runs first (odd chip to
 * run 0) — with `runs === 1` this is a no-op and behavior is identical to
 * evaluating a single board, so every existing single-board hand is
 * unaffected. */
function evaluateBoard(
  room: RoomState,
  communityCards: Card[],
  pots: SidePot[],
  stillIn: Player[],
  runIndex: number,
  runs: number
): BoardOutcome {
  const scores = new Map<string, ReturnType<typeof evaluateBestHand>>();
  for (const player of stillIn) {
    const allCards: Card[] = [...player.holeCards, ...communityCards];
    scores.set(player.id, evaluateBestHand(allCards));
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
    const potShareForThisRun = splitPotAcrossRuns(pot.amount, runs)[runIndex];
    const split = splitPotAmount(potShareForThisRun, potWinnerIds);

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
      bestFive: score.cards,
    };
  }

  return { result: { winners, revealedHands }, winningsByPlayer };
}

function sumWinnings(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const combined = new Map(a);
  for (const [id, amount] of b) {
    combined.set(id, (combined.get(id) ?? 0) + amount);
  }
  return combined;
}

function runShowdown(room: RoomState): void {
  const stillIn = getPlayersStillInHand(room.players);
  const contributions = buildContributions(room);
  const pots = calculateSidePots(contributions);
  room.hand.pots = pots;

  // Set here too (not just beginRunout) so the still-instant/unpaced path —
  // every existing caller and test — keeps revealing cards exactly as before.
  for (const player of stillIn) player.holeCardsRevealed = true;

  const runs = room.hand.secondBoard ? 2 : 1;
  const boardA = evaluateBoard(room, room.hand.communityCards, pots, stillIn, 0, runs);
  room.hand.result = boardA.result;

  let combinedWinnings = boardA.winningsByPlayer;
  if (room.hand.secondBoard) {
    const boardB = evaluateBoard(room, room.hand.secondBoard.communityCards, pots, stillIn, 1, runs);
    room.hand.secondBoard.result = boardB.result;
    combinedWinnings = sumWinnings(boardA.winningsByPlayer, boardB.winningsByPlayer);
  }

  // Applied once with the combined total across both boards, so history and
  // the room ledger reflect one net number for the hand, not two.
  applyLedgerForHand(room, combinedWinnings);
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
  room.hand.runout = null;
  room.hand.runItDecision = null;
  // secondBoard is deliberately left populated — the client still needs
  // both boards visible through hand-complete; startHand replaces the whole
  // hand object anyway when the next hand begins.
  room.status = "lobby";

  // Apply chips a host approved while this hand was still running before
  // deciding who's sitting out — otherwise a player who busted this hand
  // but has an approved top-up waiting would get stamped "sitting-out"
  // while silently holding chips they can't play with yet.
  applyPendingChipTopUps(room);

  for (const player of room.players) {
    player.currentBet = 0;
    if (player.hasBoughtIn) {
      player.handStatus = player.chips > 0 ? "waiting" : "sitting-out";
    }
  }
}
