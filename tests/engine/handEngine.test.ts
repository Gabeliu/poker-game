import { describe, expect, it } from "vitest";
import type { Card, Player, RoomState } from "@/lib/types";
import { Deck } from "@/server/engine/deck";
import { HAND_CATEGORY } from "@/server/engine/evaluator";
import {
  chooseRunIt,
  continueRunout,
  HandEngineError,
  resolveRunItByTimeout,
  startHand,
  submitAction,
} from "@/server/engine/handEngine";

describe("start-hand connectivity validation", () => {
  it.each([
    { label: "funded player", opts: {} },
    { label: "sitting-out player", opts: { sittingOut: true } },
    { label: "player awaiting buy-in", opts: { hasBoughtIn: false, chips: 0 } },
  ])("blocks a disconnected seated $label even with two other eligible players", ({ opts }) => {
    const room = makeRoom([makePlayer("host", 0, 1000), makePlayer("other", 1, 1000), makePlayer("offline", 2, 1000, { ...opts, connectionStatus: "disconnected" })]);
    const before = structuredClone(room);
    const deck = new Deck();
    expect(() => startHand(room, deck)).toThrow("Waiting for all seated players to reconnect.");
    expect(room).toEqual(before);
    room.players[2].connectionStatus = "connected";
    expect(() => startHand(room, deck)).not.toThrow();
    expect(room.hand.phase).toBe("preflop");
  });

  it("does not block on a disconnected unseated player", () => {
    const room = makeRoom([makePlayer("host", 0, 1000), makePlayer("guest", 1, 1000), makePlayer("spectator", 2, 0, { seat: null, connectionStatus: "disconnected", hasBoughtIn: false })]);
    expect(() => startHand(room, new Deck())).not.toThrow();
    expect(room.players[2].holeCards).toEqual([]);
  });

  it.each([{ chips: 0 }, { hasBoughtIn: false }, { sittingOut: true }, { seat: null }])("still requires two funded, seated participants after reconnection: %j", (opts) => {
    const room = makeRoom([makePlayer("host", 0, 1000), makePlayer("guest", 1, 1000, opts)]);
    expect(() => startHand(room, new Deck())).toThrow("At least 2 players with approved chips");
  });
});

function card(spec: string): Card {
  const suitChar = spec.slice(-1);
  const rank = spec.slice(0, -1) as Card["rank"];
  const suitMap: Record<string, Card["suit"]> = { c: "clubs", d: "diamonds", h: "hearts", s: "spades" };
  return { rank, suit: suitMap[suitChar] };
}

function cards(...specs: string[]): Card[] {
  return specs.map(card);
}

function makePlayer(id: string, seat: number, chips: number, opts: Partial<Player> = {}): Player {
  return {
    id,
    displayName: id,
    isHost: seat === 0,
    connectionStatus: "connected",
    chips,
    seat,
    hasBoughtIn: true,
    sittingOut: false,
    handStatus: "waiting",
    currentBet: 0,
    totalCommittedThisHand: 0,
    hasActedThisStreet: false,
    holeCards: [],
    holeCardsRevealed: false,
    handHistory: [],
    ...opts,
  };
}

function makeRoom(players: Player[], overrides: Partial<RoomState["settings"]> = {}): RoomState {
  return {
    id: "TEST01",
    createdAt: Date.now(),
    hostPlayerId: players[0].id,
    settings: {
      roomName: "Test Room",
      smallBlind: 5,
      bigBlind: 10,
      minBuyIn: null,
      maxBuyIn: null,
      allowAdditionalBuyIns: true,
      allowJoinDuringHand: true,
      turnTimeLimitSeconds: 30,
      runItTwiceEnabled: true,
      ...overrides,
    },
    status: "lobby",
    players,
    buyInRequests: [],
    ledger: [],
    hand: {
      phase: "waiting",
      handNumber: 0,
      dealerSeat: 0,
      smallBlindSeat: null,
      bigBlindSeat: null,
      communityCards: [],
      pots: [],
      currentBetAmount: 0,
      minRaiseAmount: 0,
      activePlayerId: null,
      turnDeadline: null,
      lastAggressorId: null,
      result: null,
    },
  };
}

describe("startHand", () => {
  it("throws if fewer than 2 eligible players", () => {
    const room = makeRoom([makePlayer("p1", 0, 100)]);
    expect(() => startHand(room, new Deck())).toThrow();
  });

  it("assigns dealer to seat 0 on the very first hand and posts blinds", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100), makePlayer("p3", 2, 100)]);
    startHand(room, new Deck());
    expect(room.hand.dealerSeat).toBe(0);
    expect(room.hand.smallBlindSeat).toBe(1);
    expect(room.hand.bigBlindSeat).toBe(2);
    const p2 = room.players.find((p) => p.id === "p2")!;
    const p3 = room.players.find((p) => p.id === "p3")!;
    expect(p2.currentBet).toBe(5);
    expect(p3.currentBet).toBe(10);
    expect(room.hand.phase).toBe("preflop");
    // First to act preflop (3-handed) is the dealer (UTG in 3-handed = button).
    expect(room.hand.activePlayerId).toBe("p1");
  });

  it("assigns dealer as small blind in heads-up play", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100)]);
    startHand(room, new Deck());
    expect(room.hand.smallBlindSeat).toBe(room.hand.dealerSeat);
    expect(room.hand.dealerSeat).toBe(0);
    expect(room.hand.bigBlindSeat).toBe(1);
  });

  it("deals exactly two hole cards to each eligible player and none to a sitting-out player", () => {
    const room = makeRoom([
      makePlayer("p1", 0, 100),
      makePlayer("p2", 1, 100),
      makePlayer("p3", 2, 100, { sittingOut: true }),
    ]);
    startHand(room, new Deck());
    expect(room.players.find((p) => p.id === "p1")!.holeCards).toHaveLength(2);
    expect(room.players.find((p) => p.id === "p2")!.holeCards).toHaveLength(2);
    expect(room.players.find((p) => p.id === "p3")!.holeCards).toHaveLength(0);
  });

  it("rotates the dealer button forward on the next hand", () => {
    const room = makeRoom([makePlayer("p1", 0, 500), makePlayer("p2", 1, 500), makePlayer("p3", 2, 500)]);
    startHand(room, new Deck());
    expect(room.hand.dealerSeat).toBe(0);

    // Fold everyone but the big blind to end the hand quickly.
    submitAction(room, new Deck(), room.hand.activePlayerId!, { action: "fold" });
    submitAction(room, new Deck(), room.hand.activePlayerId!, { action: "fold" });

    startHand(room, new Deck());
    expect(room.hand.dealerSeat).toBe(1);
  });
});

describe("full hand flow with side pots", () => {
  it("correctly awards a main pot and side pot to different winners", () => {
    const p0 = makePlayer("short", 0, 20); // will go all-in preflop
    const p1 = makePlayer("mid", 1, 100);
    const p2 = makePlayer("big", 2, 100);
    const room = makeRoom([p0, p1, p2]);

    const deck = Deck.fromOrderedDraws(
      cards(
        "Ah", "As", // short: pocket aces (best hand)
        "Kh", "Ks", // mid: pocket kings
        "Qh", "Qs", // big: pocket queens
        "Jd", // burn
        "2c", "7d", "9h", // flop
        "Td", // burn
        "4d", // turn
        "8d", // burn
        "6d", // river
        "2d", "3c", "5c", "6c", "7c", "8c" // unused filler
      )
    );

    startHand(room, deck);
    expect(room.hand.dealerSeat).toBe(0);
    expect(room.hand.activePlayerId).toBe("short"); // dealer acts first, 3-handed preflop

    // Preflop: short goes all-in for 20 (raise), mid calls, big calls.
    expect(submitAction(room, deck, "short", { action: "all-in" }).ok).toBe(true);
    expect(submitAction(room, deck, "mid", { action: "call" }).ok).toBe(true);
    expect(submitAction(room, deck, "big", { action: "call" }).ok).toBe(true);

    expect(room.hand.phase).toBe("flop");
    expect(room.hand.activePlayerId).toBe("mid");

    // Flop: mid bets 30, big calls.
    expect(submitAction(room, deck, "mid", { action: "bet", amount: 30 }).ok).toBe(true);
    expect(submitAction(room, deck, "big", { action: "call" }).ok).toBe(true);

    expect(room.hand.phase).toBe("turn");
    // Turn: both check.
    expect(submitAction(room, deck, "mid", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "big", { action: "check" }).ok).toBe(true);

    expect(room.hand.phase).toBe("river");
    // River: both check -> showdown.
    expect(submitAction(room, deck, "mid", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "big", { action: "check" }).ok).toBe(true);

    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.pots).toHaveLength(2);
    expect(room.hand.pots[0].amount).toBe(60); // 20 * 3
    expect(room.hand.pots[1].amount).toBe(60); // 30 * 2

    const short = room.players.find((p) => p.id === "short")!;
    const mid = room.players.find((p) => p.id === "mid")!;
    const big = room.players.find((p) => p.id === "big")!;

    // short: committed 20, wins main pot (60) -> ends with 60.
    expect(short.chips).toBe(60);
    // mid: committed 50 (100 -> 50), wins side pot (60) -> ends with 100 - 50 + 60 = 110.
    expect(mid.chips).toBe(110);
    // big: committed 50, wins nothing -> ends with 50.
    expect(big.chips).toBe(50);

    // Total chips conserved.
    expect(short.chips + mid.chips + big.chips).toBe(20 + 100 + 100);

    expect(room.hand.result?.winners.length).toBe(2);
    const winnerIds = room.hand.result!.winners.map((w) => w.playerId).sort();
    expect(winnerIds).toEqual(["mid", "short"]);
  });
});

describe("uncontested pot (everyone folds but one)", () => {
  it("awards the entire pot to the last remaining player without showdown", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100), makePlayer("p3", 2, 100)]);
    const deck = new Deck();
    startHand(room, deck);

    const firstActor = room.hand.activePlayerId!;
    submitAction(room, deck, firstActor, { action: "fold" });
    const secondActor = room.hand.activePlayerId!;
    submitAction(room, deck, secondActor, { action: "fold" });

    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.result?.winners).toHaveLength(1);
    expect(room.hand.result?.winners[0].amount).toBe(5 + 10); // SB + BB, dealer never put in chips preflop before folding
    const winnerId = room.hand.result!.winners[0].playerId;
    const winner = room.players.find((p) => p.id === winnerId)!;
    expect(winner.chips).toBe(100 + 15 - (winnerId === "p2" ? 5 : winnerId === "p3" ? 10 : 0));
  });
});

describe("betting validation", () => {
  it("rejects a raise below the minimum raise amount", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100), makePlayer("p3", 2, 100)]);
    const deck = new Deck();
    startHand(room, deck);

    const firstActor = room.hand.activePlayerId!;
    // Min raise preflop should be to 20 (BB 10 + min increment 10).
    const result = submitAction(room, deck, firstActor, { action: "raise", amount: 15 });
    expect(result.ok).toBe(false);
  });

  it("rejects acting out of turn", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100), makePlayer("p3", 2, 100)]);
    const deck = new Deck();
    startHand(room, deck);
    const notActive = room.players.find((p) => p.id !== room.hand.activePlayerId)!;
    const result = submitAction(room, deck, notActive.id, { action: "check" });
    expect(result.ok).toBe(false);
  });

  it("allows check only when there is nothing to call", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100), makePlayer("p3", 2, 100)]);
    const deck = new Deck();
    startHand(room, deck);
    // First actor faces the big blind and cannot check.
    const result = submitAction(room, deck, room.hand.activePlayerId!, { action: "check" });
    expect(result.ok).toBe(false);
  });
});

describe("split pot", () => {
  it("splits the pot evenly when two players tie at showdown", () => {
    const p1 = makePlayer("p1", 0, 100);
    const p2 = makePlayer("p2", 1, 100);
    const room = makeRoom([p1, p2]);

    // Both play the same board straight; identical hole cards in different suits so hands tie exactly.
    const deck = Deck.fromOrderedDraws(
      cards(
        "2h", "3h", // p1 (dealer/SB in heads-up)
        "2d", "3d", // p2 (BB)
        "Jc", // burn
        "9c", "10c", "Jh", // flop -> with turn/river completes a straight for both using board
        "Qd", // burn
        "Kd", // turn
        "8d", // burn
        "4s", // river
        "5s", "6s", "7s", "8s", "9s", "As" // filler
      )
    );

    startHand(room, deck);
    // Heads-up: dealer/SB (p1) acts first preflop.
    expect(submitAction(room, deck, "p1", { action: "call" }).ok).toBe(true);
    expect(submitAction(room, deck, "p2", { action: "check" }).ok).toBe(true);

    // Postflop heads-up: non-dealer (p2) acts first.
    expect(submitAction(room, deck, "p2", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "p1", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "p2", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "p1", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "p2", { action: "check" }).ok).toBe(true);
    expect(submitAction(room, deck, "p1", { action: "check" }).ok).toBe(true);

    expect(room.hand.phase).toBe("hand-complete");
    const finalP1 = room.players.find((p) => p.id === "p1")!;
    const finalP2 = room.players.find((p) => p.id === "p2")!;
    // Both started with 100, bet 10 each (blinds only), split the 20 pot -> back to 100 each.
    expect(finalP1.chips).toBe(100);
    expect(finalP2.chips).toBe(100);
    expect(room.hand.result?.winners).toHaveLength(2);
  });
});

describe("startHand guard", () => {
  it("refuses to start a hand while one is already in progress", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100)]);
    startHand(room, new Deck());
    expect(room.status).toBe("in-hand");
    expect(() => startHand(room, new Deck())).toThrow(HandEngineError);
    expect(() => startHand(room, new Deck())).toThrow("already in progress");
  });
});

/** Drains a paced runout one street at a time until it resolves, mirroring
 * what the server's reveal timer does in real time (see broadcast.ts). */
function drainRunout(room: RoomState, deck: Deck): void {
  let guard = 0;
  while (room.hand.runout && guard++ < 12) {
    continueRunout(room, deck);
  }
}

describe("paced all-in runout (single board)", () => {
  it("paces one street per continueRunout call instead of resolving instantly", () => {
    const p1 = makePlayer("p1", 0, 20);
    const p2 = makePlayer("p2", 1, 100);
    const room = makeRoom([p1, p2], { runItTwiceEnabled: false });
    const deck = new Deck();

    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "call" }, { paced: true });

    // Betting is over but no street has been revealed yet.
    expect(room.hand.communityCards).toHaveLength(0);
    expect(room.hand.runout).not.toBeNull();
    expect(room.hand.result).toBeNull();

    continueRunout(room, deck);
    expect(room.hand.communityCards).toHaveLength(3);
    expect(room.hand.phase).toBe("flop");
    expect(room.hand.result).toBeNull();

    continueRunout(room, deck);
    expect(room.hand.communityCards).toHaveLength(4);
    expect(room.hand.phase).toBe("turn");

    continueRunout(room, deck);
    expect(room.hand.communityCards).toHaveLength(5);
    expect(room.hand.phase).toBe("river");
    expect(room.hand.result).toBeNull(); // river dealt, not yet resolved

    continueRunout(room, deck);
    expect(room.hand.result).not.toBeNull();
    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.runout).toBeNull();
  });

  it("unpaced callers still resolve the whole hand synchronously in one call (regression fence)", () => {
    // Same scenario as "player busting" below, but asserting the exact
    // no-opts path is untouched by the paced-runout machinery.
    const p1 = makePlayer("short", 0, 20);
    const p2 = makePlayer("big", 1, 100);
    const room = makeRoom([p1, p2]);
    const deck = new Deck();

    startHand(room, deck);
    submitAction(room, deck, "short", { action: "all-in" }); // no opts
    submitAction(room, deck, "big", { action: "call" }); // no opts

    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.communityCards).toHaveLength(5);
    expect(room.hand.runout).toBeNull();
  });

  it("reveals hole cards for still-in players but keeps a folded player's hidden", () => {
    const p1 = makePlayer("p1", 0, 20);
    const p2 = makePlayer("p2", 1, 100);
    const p3 = makePlayer("p3", 2, 100);
    const room = makeRoom([p1, p2, p3], { runItTwiceEnabled: false });
    const deck = new Deck();

    startHand(room, deck);
    // 3-handed, dealer (p1) acts first preflop.
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "fold" }, { paced: true });
    submitAction(room, deck, "p3", { action: "call" }, { paced: true });

    expect(room.hand.runout).not.toBeNull();
    expect(room.players.find((p) => p.id === "p1")!.holeCardsRevealed).toBe(true);
    expect(room.players.find((p) => p.id === "p3")!.holeCardsRevealed).toBe(true);
    expect(room.players.find((p) => p.id === "p2")!.holeCardsRevealed).toBe(false);
  });

  it("does not offer a run-it decision with three players all-in", () => {
    const p1 = makePlayer("p1", 0, 20);
    const p2 = makePlayer("p2", 1, 20);
    const p3 = makePlayer("p3", 2, 100);
    const room = makeRoom([p1, p2, p3]);
    const deck = new Deck();

    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p3", { action: "call" }, { paced: true });

    expect(room.hand.runItDecision).toBeNull();
    expect(room.hand.runout).toEqual(expect.objectContaining({ runs: 1 }));
    expect(room.hand.phase).toBe("preflop");
  });
});

describe("run it once / run it twice (heads-up all-in)", () => {
  it("offers the decision only with exactly two players left and streets remaining", () => {
    const p1 = makePlayer("p1", 0, 20);
    const p2 = makePlayer("p2", 1, 100);
    const room = makeRoom([p1, p2]);
    const deck = new Deck();

    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "call" }, { paced: true });

    expect(room.hand.phase).toBe("showdown");
    expect(room.hand.runItDecision?.eligiblePlayerIds.sort()).toEqual(["p1", "p2"]);
    expect(room.hand.communityCards).toHaveLength(0);
    expect(room.hand.runout).toBeNull();
    expect(room.status).toBe("in-hand");

    // Hole cards stay hidden while the once/twice decision is pending —
    // nobody should be able to see the other's cards before choosing.
    expect(room.players.find((p) => p.id === "p1")!.holeCardsRevealed).toBe(false);
    expect(room.players.find((p) => p.id === "p2")!.holeCardsRevealed).toBe(false);

    chooseRunIt(room, "p1", "once");
    // Resolved — now (and only now) both hands flip face-up.
    expect(room.players.find((p) => p.id === "p1")!.holeCardsRevealed).toBe(true);
    expect(room.players.find((p) => p.id === "p2")!.holeCardsRevealed).toBe(true);
  });

  it("resolves to a single run immediately when either player picks once, without waiting on the other", () => {
    const room = makeRoom([makePlayer("p1", 0, 20), makePlayer("p2", 1, 100)]);
    const deck = new Deck();
    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "call" }, { paced: true });

    const res = chooseRunIt(room, "p1", "once");
    expect(res).toEqual({ ok: true, resolved: true });
    expect(room.hand.runItDecision).toBeNull();
    expect(room.hand.runout).toEqual(expect.objectContaining({ runs: 1 }));

    // The decision is gone — p2 can no longer weigh in on it.
    const late = chooseRunIt(room, "p2", "twice");
    expect(late.ok).toBe(false);
    expect(room.hand.secondBoard).toBeNull();
  });

  it("defaults to running it once when a player never answers before the deadline", () => {
    const room = makeRoom([makePlayer("p1", 0, 20), makePlayer("p2", 1, 100)]);
    const deck = new Deck();
    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "call" }, { paced: true });

    chooseRunIt(room, "p1", "twice"); // one player answers, the other times out
    expect(room.hand.runItDecision).not.toBeNull(); // still pending

    resolveRunItByTimeout(room);
    expect(room.hand.runItDecision).toBeNull();
    expect(room.hand.runout).toEqual(expect.objectContaining({ runs: 1 }));
    expect(room.hand.secondBoard).toBeNull();

    drainRunout(room, deck);
    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.result).not.toBeNull();
  });

  it("reveals runs strictly in sequence — run 2 has no cards or result while run 1 is still being dealt or is only just resolved", () => {
    const p1 = makePlayer("p1", 0, 51);
    const p2 = makePlayer("p2", 1, 51);
    const room = makeRoom([p1, p2]);
    const deck = Deck.fromOrderedDraws(
      cards(
        "2h", "3h", "9c", "9d", // holes
        "Jc", "4h", "5h", "6h", // burn, run-1 flop
        "Td", "7h", // burn, run-1 turn
        "8d", "9h", // burn, run-1 river
        "2c", "3d", "4d", "5d", // burn, run-2 flop
        "Ts", "6d", // burn, run-2 turn
        "8s", "7d" // burn, run-2 river
      )
    );

    startHand(room, deck);
    submitAction(room, deck, "p1", { action: "all-in" }, { paced: true });
    submitAction(room, deck, "p2", { action: "call" }, { paced: true });
    chooseRunIt(room, "p1", "twice");
    chooseRunIt(room, "p2", "twice");
    expect(room.hand.secondBoard).toEqual({ communityCards: [], result: null });

    // Dealing run 1's flop, turn, river — run 2 stays completely untouched
    // the whole time, not just "hidden", but literally not dealt yet.
    continueRunout(room, deck); // run-1 flop
    expect(room.hand.communityCards).toHaveLength(3);
    expect(room.hand.secondBoard).toEqual({ communityCards: [], result: null });
    expect(room.hand.result).toBeNull();

    continueRunout(room, deck); // run-1 turn
    continueRunout(room, deck); // run-1 river
    expect(room.hand.communityCards).toHaveLength(5);
    expect(room.hand.secondBoard).toEqual({ communityCards: [], result: null });
    expect(room.hand.result).toBeNull(); // river dealt, not yet evaluated

    // Run 1 resolves — its result appears, but run 2 is still nothing.
    continueRunout(room, deck);
    expect(room.hand.result).not.toBeNull();
    expect(room.hand.secondBoard).toEqual({ communityCards: [], result: null });
    expect(room.hand.runout).toEqual(expect.objectContaining({ runs: 2, activeRun: 2 }));
    expect(room.hand.phase).not.toBe("hand-complete"); // still mid-reveal, run 2 hasn't happened

    // Now run 2 deals and resolves on its own, independently.
    continueRunout(room, deck); // run-2 flop
    expect(room.hand.secondBoard!.communityCards).toHaveLength(3);
    continueRunout(room, deck); // run-2 turn
    continueRunout(room, deck); // run-2 river
    expect(room.hand.secondBoard!.result).toBeNull();
    continueRunout(room, deck); // evaluate run 2 + finalize
    expect(room.hand.secondBoard!.result).not.toBeNull();
    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.runout).toBeNull();
  });

  it("runs it twice when both agree, sharing the pre-decision board and splitting each pot across runs with the odd chip to run 1", () => {
    const p1 = makePlayer("p1", 0, 51);
    const p2 = makePlayer("p2", 1, 51);
    const room = makeRoom([p1, p2]);

    // Heads-up: p1 is dealer/SB. Runs are dealt strictly in sequence, never
    // in lockstep: run 1 is fully dealt and evaluated first (flop/turn/
    // river), then run 2 gets its own independent flop/turn/river from the
    // same remaining deck. Give p1 a flush on board A only, and let board B
    // run out as a chop (both playing the board with unrelated hole cards)
    // so each run's winner-set differs and the odd chip's placement is
    // observable.
    const deck = Deck.fromOrderedDraws(
      cards(
        "2h", "3h", // p1
        "9c", "9d", // p2
        "Jc", "4h", "5h", "6h", // burn, run-1 flop (p1 building a heart flush)
        "Td", "7h", // burn, run-1 turn (flush completes for p1)
        "8d", "9h", // burn, run-1 river
        "2c", "3d", "4d", "5d", // burn, run-2 flop (unrelated, chop board)
        "Ts", "6d", // burn, run-2 turn
        "8s", "7d", // burn, run-2 river
        "2d", "3c", "5c", "6c" // filler
      )
    );

    startHand(room, deck);
    expect(submitAction(room, deck, "p1", { action: "all-in" }, { paced: true }).ok).toBe(true);
    expect(submitAction(room, deck, "p2", { action: "call" }, { paced: true }).ok).toBe(true);
    expect(room.hand.runItDecision).not.toBeNull();

    expect(chooseRunIt(room, "p1", "twice")).toEqual({ ok: true, resolved: false });
    expect(chooseRunIt(room, "p2", "twice")).toEqual({ ok: true, resolved: true });
    expect(room.hand.runout).toEqual(expect.objectContaining({ runs: 2 }));
    expect(room.hand.secondBoard).toEqual({ communityCards: [], result: null });

    drainRunout(room, deck);

    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.communityCards).toHaveLength(5);
    expect(room.hand.secondBoard!.communityCards).toHaveLength(5);
    // The two boards never share a dealt card beyond the (empty) common prefix.
    const boardACards = room.hand.communityCards.map((c) => `${c.rank}${c.suit}`);
    const boardBCards = room.hand.secondBoard!.communityCards.map((c) => `${c.rank}${c.suit}`);
    expect(boardACards.filter((c) => boardBCards.includes(c))).toHaveLength(0);

    expect(room.hand.result).not.toBeNull();
    expect(room.hand.secondBoard!.result).not.toBeNull();

    const finalP1 = room.players.find((p) => p.id === "p1")!;
    const finalP2 = room.players.find((p) => p.id === "p2")!;
    // Pot is 102 (odd once halved: 51/51, no remainder here — chip
    // conservation is what actually matters).
    expect(finalP1.chips + finalP2.chips).toBe(102);

    // Exactly one combined net-result history entry per player, not two.
    expect(finalP1.handHistory).toHaveLength(1);
    expect(finalP2.handHistory).toHaveLength(1);
    expect(finalP1.handHistory[0].netChange + finalP2.handHistory[0].netChange).toBe(0);
  });

  it("evaluates each run completely independently, with its own winner, hand rank, and kicker comparison", () => {
    // All-in ON THE FLOP (not preflop) so both runs share that flop and only
    // diverge on turn/river — the exact shape that exposed the regression:
    // Run 1 board: 6c 5d Ad 5h As -> both players make two pair, Aces and
    //   5s; p1's King kicker beats p2's 6 kicker.
    // Run 2 board: 6c 5d Ad 2c Kh -> p1 pairs both boarded pairs (Kings and
    //   2s) while p2 only pairs the 2 (a plain pair) — a different category
    //   entirely, and a different winner-deciding reason, from run 1.
    // p1 (K♦2♦) wins BOTH runs outright; a description or winner bleeding
    // from one run into the other must not change that.
    const p1 = makePlayer("p1", 0, 1000);
    const p2 = makePlayer("p2", 1, 1000);
    const room = makeRoom([p1, p2]);
    const deck = Deck.fromOrderedDraws(
      cards(
        "Kd", "2d", // p1 hole
        "2h", "7s", // p2 hole (no wheel-straight risk: no 3/4 on either board)
        "Ts", "6c", "5d", "Ad", // burn, flop (shared by both runs)
        "Ts", "5h", // burn, run-1 turn
        "Ts", "As", // burn, run-1 river (run 1 fully dealt+evaluated here)
        "Ts", "2c", // burn, run-2 turn
        "Ts", "Kh" // burn, run-2 river
      )
    );

    startHand(room, deck);
    submitAction(room, deck, room.hand.activePlayerId!, { action: "call" });
    submitAction(room, deck, room.hand.activePlayerId!, { action: "check" });
    expect(room.hand.communityCards).toHaveLength(3);

    submitAction(room, deck, room.hand.activePlayerId!, { action: "all-in" }, { paced: true });
    submitAction(room, deck, room.hand.activePlayerId!, { action: "call" }, { paced: true });
    expect(room.hand.runItDecision).not.toBeNull();

    chooseRunIt(room, "p1", "twice");
    chooseRunIt(room, "p2", "twice");
    drainRunout(room, deck);

    expect(room.hand.phase).toBe("hand-complete");
    expect(room.hand.communityCards).toEqual(cards("6c", "5d", "Ad", "5h", "As"));
    expect(room.hand.secondBoard!.communityCards).toEqual(cards("6c", "5d", "Ad", "2c", "Kh"));

    const run1 = room.hand.result!;
    const run2 = room.hand.secondBoard!.result!;

    // Run 1: both make two pair (Aces and 5s) — p1 wins on the King kicker.
    expect(run1.revealedHands.p1.rank).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(run1.revealedHands.p2.rank).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(run1.winners.map((w) => w.playerId)).toEqual(["p1"]);

    // Run 2: p1 makes two pair (Kings and 2s); p2 only makes a single pair
    // of 2s — a genuinely different category, only possible if run 2 was
    // evaluated against its own board instead of reusing run 1's.
    expect(run2.revealedHands.p1.rank).toBe(HAND_CATEGORY.TWO_PAIR);
    expect(run2.revealedHands.p2.rank).toBe(HAND_CATEGORY.PAIR);
    expect(run2.winners.map((w) => w.playerId)).toEqual(["p1"]);

    // The two runs' hand descriptions for the same player must differ (run
    // 1 is "two pair, Aces and 5s"; run 2 is "two pair, Kings and 2s") —
    // this is the exact bug report: the UI/engine reusing run 1's
    // description for run 2.
    expect(run1.revealedHands.p1.description).not.toBe(run2.revealedHands.p1.description);

    // p1 scoops both runs outright — the whole pot, not a split.
    const finalP1 = room.players.find((p) => p.id === "p1")!;
    const finalP2 = room.players.find((p) => p.id === "p2")!;
    expect(finalP1.chips).toBeGreaterThan(finalP2.chips);
    expect(finalP2.chips).toBe(0);
    expect(finalP1.chips + finalP2.chips).toBe(2000); // full pot conserved
  });
});

describe("uncalled bets", () => {
  it("returns the unmatched excess to the deeper stack as a refund, so it is never a pot, a run-split, or a win", () => {
    // p1 is short (200) and p2 deep (1000). Flop: p2 bets 500, p1 can only
    // call all-in for 190 more -> 310 of p2's bet was never matched.
    // Run 1 (board Qc 4c 2d 9h 8c): p1's 99 makes trips, p2 has queen high.
    // Run 2 (board Qc 4c 2d 10s 10h): p2's T6 makes trips tens, p1 only two pair.
    const p1 = makePlayer("p1", 0, 200);
    const p2 = makePlayer("p2", 1, 1000);
    const room = makeRoom([p1, p2]);
    const deck = Deck.fromOrderedDraws(
      cards(
        "9d", "9s", // p1
        "10d", "6d", // p2
        "3h", "Qc", "4c", "2d", // burn, flop
        "3s", "9h", // burn, run-1 turn
        "3c", "8c", // burn, run-1 river
        "5h", "10s", // burn, run-2 turn
        "5s", "10h" // burn, run-2 river
      )
    );

    startHand(room, deck);
    submitAction(room, deck, room.hand.activePlayerId!, { action: "call" }); // p1 completes the blind
    submitAction(room, deck, room.hand.activePlayerId!, { action: "check" });
    expect(room.hand.communityCards).toHaveLength(3);

    expect(submitAction(room, deck, "p2", { action: "bet", amount: 500 }, { paced: true }).ok).toBe(true);
    expect(submitAction(room, deck, "p1", { action: "call" }, { paced: true }).ok).toBe(true);

    // The 310 nobody could match went straight back and is reported as such.
    expect(room.hand.uncalledBet).toEqual({ playerId: "p2", amount: 310 });
    expect(room.players.find((p) => p.id === "p2")!.totalCommittedThisHand).toBe(200);
    expect(room.players.find((p) => p.id === "p2")!.chips).toBe(800);

    chooseRunIt(room, "p1", "twice");
    chooseRunIt(room, "p2", "twice");
    drainRunout(room, deck);

    // Only the contested 400 is a pot — no one-player "side pot".
    expect(room.hand.pots).toHaveLength(1);
    expect(room.hand.pots[0].amount).toBe(400);

    // Each run independently has exactly one winner; the refund is not a win.
    const run1 = room.hand.result!;
    const run2 = room.hand.secondBoard!.result!;
    expect(run1.winners).toEqual([expect.objectContaining({ playerId: "p1", amount: 200 })]);
    expect(run2.winners).toEqual([expect.objectContaining({ playerId: "p2", amount: 200 })]);
    expect(run1.revealedHands.p1.rank).toBe(HAND_CATEGORY.THREE_OF_A_KIND);
    expect(run2.revealedHands.p2.rank).toBe(HAND_CATEGORY.THREE_OF_A_KIND);

    // Chips: p1 wins run 1's half; p2 wins run 2's half and keeps the refund.
    expect(room.players.find((p) => p.id === "p1")!.chips).toBe(200);
    expect(room.players.find((p) => p.id === "p2")!.chips).toBe(1000);
    // A split run breaks exactly even for both players.
    expect(room.players.find((p) => p.id === "p1")!.handHistory[0].netChange).toBe(0);
    expect(room.players.find((p) => p.id === "p2")!.handHistory[0].netChange).toBe(0);
  });

  it("returns nothing when every contributor matched", () => {
    const room = makeRoom([makePlayer("p1", 0, 100), makePlayer("p2", 1, 100)]);
    const deck = new Deck();
    startHand(room, deck);
    submitAction(room, deck, room.hand.activePlayerId!, { action: "call" });
    submitAction(room, deck, room.hand.activePlayerId!, { action: "check" });
    expect(room.hand.uncalledBet).toBeNull();
  });
});

describe("player busting", () => {
  it("marks a player with zero chips as sitting-out after losing an all-in hand", () => {
    const p1 = makePlayer("short", 0, 20);
    const p2 = makePlayer("big", 1, 100);
    const room = makeRoom([p1, p2]);

    const deck = Deck.fromOrderedDraws(
      cards(
        "2c", "7c", // short: weak, disconnected hand
        "Ah", "As", // big: pocket aces
        "Td", "9h", "Jd", "4s", // burn+flop
        "3d", "Kc", // burn+turn
        "6c", "8d", // burn+river
        "2d", "3c", "5c", "6d", "7d", "8c" // filler
      )
    );

    startHand(room, deck);
    submitAction(room, deck, "short", { action: "all-in" });
    submitAction(room, deck, "big", { action: "call" });

    const short = room.players.find((p) => p.id === "short")!;
    expect(short.chips).toBe(0);
    expect(short.handStatus).toBe("sitting-out");
  });
});
