import { describe, expect, it } from "vitest";
import type { Card, Player, RoomState } from "@/lib/types";
import { Deck } from "@/server/engine/deck";
import { startHand, submitAction } from "@/server/engine/handEngine";

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
