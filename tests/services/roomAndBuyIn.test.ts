import { describe, expect, it } from "vitest";
import { buildClientView, createRoom, joinRoom, removePlayer, RoomServiceError, takeSeat } from "@/server/services/roomService";
import { requestBuyIn, resolveBuyInRequest } from "@/server/services/buyInService";
import { startHand, submitAction } from "@/server/engine/handEngine";
import { Deck } from "@/server/engine/deck";

describe("room + buy-in lifecycle", () => {
  it("walks through the create -> join -> request -> approve -> reject -> resubmit flow", () => {
    const { room, playerId: hostId } = createRoom("Gabriel", { smallBlind: 5, bigBlind: 10 });
    expect(room.hostPlayerId).toBe(hostId);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].isHost).toBe(true);

    const { playerId: bobId } = joinRoom(room.id, "Bob");
    expect(room.players).toHaveLength(2);

    expect(() => joinRoom(room.id, "bob")).toThrow(RoomServiceError);
    expect(() => joinRoom(room.id, "  BOB  ")).toThrow(RoomServiceError);
    expect(room.players).toHaveLength(2);

    requestBuyIn(room, bobId, 2500, "initial");
    expect(room.buyInRequests).toHaveLength(1);
    expect(room.buyInRequests[0].status).toBe("pending");
    expect(room.buyInRequests[0].amount).toBe(2500);

    resolveBuyInRequest(room, room.buyInRequests[0].id, true);
    const bob = room.players.find((p) => p.id === bobId)!;
    expect(bob.chips).toBe(2500);
    expect(bob.hasBoughtIn).toBe(true);
    expect(room.ledger).toHaveLength(1);
    expect(room.ledger[0].type).toBe("initial-buy-in");
    expect(room.ledger[0].amount).toBe(2500);

    const { playerId: carolId } = joinRoom(room.id, "Carol");
    requestBuyIn(room, carolId, 3000, "initial");
    const carolRequestId = room.buyInRequests.find((r) => r.playerId === carolId)!.id;
    resolveBuyInRequest(room, carolRequestId, false);
    const carol = room.players.find((p) => p.id === carolId)!;
    expect(carol.chips).toBe(0);
    expect(carol.hasBoughtIn).toBe(false);
    expect(room.buyInRequests.find((r) => r.id === carolRequestId)!.status).toBe("rejected");

    // Rejected player can submit a new request.
    requestBuyIn(room, carolId, 1000, "initial");
    const secondRequest = room.buyInRequests.filter((r) => r.playerId === carolId).at(-1)!;
    expect(secondRequest.status).toBe("pending");
    resolveBuyInRequest(room, secondRequest.id, true);
    expect(room.players.find((p) => p.id === carolId)!.chips).toBe(1000);
  });

  it("reconnects a player to their existing seat using their token instead of creating a duplicate", () => {
    const { room, playerToken } = createRoom("Gabriel", {});
    const before = room.players.length;
    const result = joinRoom(room.id, "Gabriel", playerToken);
    expect(result.reconnected).toBe(true);
    expect(room.players.length).toBe(before);
  });

  it("prevents starting a hand with fewer than 2 approved players", () => {
    const { room } = createRoom("Gabriel", {});
    expect(() => startHand(room, new Deck())).toThrow();
  });

  it("enforces min/max buy-in bounds when configured", () => {
    const { room, playerId } = createRoom("Gabriel", { minBuyIn: 500, maxBuyIn: 5000 });
    expect(() => requestBuyIn(room, playerId, 100, "initial")).toThrow(RoomServiceError);
    expect(() => requestBuyIn(room, playerId, 10000, "initial")).toThrow(RoomServiceError);
    expect(() => requestBuyIn(room, playerId, 1000, "initial")).not.toThrow();
  });

  it("rejects a second pending request while one is already pending", () => {
    const { room, playerId } = createRoom("Gabriel", {});
    requestBuyIn(room, playerId, 1000, "initial");
    expect(() => requestBuyIn(room, playerId, 500, "initial")).toThrow(RoomServiceError);
  });

  it("blocks removing an all-in player mid-hand but allows it once the hand ends", () => {
    const { room, playerId: hostId } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    const { playerId: guestId } = joinRoom(room.id, "Guest");
    takeSeat(room, guestId, 1);
    requestBuyIn(room, hostId, 100, "initial");
    resolveBuyInRequest(room, room.buyInRequests[0].id, true);
    requestBuyIn(room, guestId, 100, "initial");
    resolveBuyInRequest(room, room.buyInRequests.find((r) => r.playerId === guestId)!.id, true);

    const deck = new Deck();
    startHand(room, deck);
    // Heads-up: host is dealer/SB and acts first preflop.
    expect(room.hand.activePlayerId).toBe(hostId);
    submitAction(room, deck, hostId, { action: "call" });
    // Now guest (BB) acts; push them all-in.
    expect(room.hand.activePlayerId).toBe(guestId);
    submitAction(room, deck, guestId, { action: "all-in" });

    expect(room.players.find((p) => p.id === guestId)!.handStatus).toBe("all-in");
    expect(() => removePlayer(room, guestId)).toThrow(RoomServiceError);

    // Host calls the shove, hand runs to completion.
    submitAction(room, deck, hostId, { action: "call" });
    expect(room.hand.phase).toBe("hand-complete");

    expect(() => removePlayer(room, guestId)).not.toThrow();
    expect(room.players.find((p) => p.id === guestId)).toBeUndefined();
  });

  it("host can remove a player who has not bought in without issue", () => {
    const { room } = createRoom("Gabriel", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    expect(room.players).toHaveLength(2);
    removePlayer(room, bobId);
    expect(room.players).toHaveLength(1);
  });

  it("transfers host to the next-lowest seat when the host is removed", () => {
    const { room, playerId: hostId } = createRoom("Gabriel", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    removePlayer(room, hostId);
    expect(room.hostPlayerId).toBe(bobId);
    expect(room.players.find((p) => p.id === bobId)!.isHost).toBe(true);
  });
});

describe("seat assignment", () => {
  it("host is auto-seated at 0 on creation; joining players start unseated", () => {
    const { room, playerId: hostId } = createRoom("Host", {});
    expect(room.players.find((p) => p.id === hostId)!.seat).toBe(0);

    const { playerId: bobId } = joinRoom(room.id, "Bob");
    expect(room.players.find((p) => p.id === bobId)!.seat).toBeNull();
  });

  it("lets an unseated player take any open seat, server-validated", () => {
    const { room } = createRoom("Host", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    takeSeat(room, bobId, 3);
    expect(room.players.find((p) => p.id === bobId)!.seat).toBe(3);
  });

  it("rejects taking an already-occupied seat", () => {
    const { room, playerId: hostId } = createRoom("Host", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    expect(() => takeSeat(room, bobId, 0)).toThrow(RoomServiceError); // host already has seat 0
    expect(room.players.find((p) => p.id === hostId)!.seat).toBe(0);
  });

  it("rejects an invalid seat number", () => {
    const { room } = createRoom("Host", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    // @ts-expect-error -- deliberately testing server-side rejection of an out-of-range seat
    expect(() => takeSeat(room, bobId, 8)).toThrow(RoomServiceError);
    // @ts-expect-error -- deliberately testing server-side rejection of a negative seat
    expect(() => takeSeat(room, bobId, -1)).toThrow(RoomServiceError);
  });

  it("rejects a player taking a second seat", () => {
    const { room } = createRoom("Host", {});
    const { playerId: bobId } = joinRoom(room.id, "Bob");
    takeSeat(room, bobId, 2);
    expect(() => takeSeat(room, bobId, 3)).toThrow(RoomServiceError);
    expect(room.players.find((p) => p.id === bobId)!.seat).toBe(2);
  });

  it("caps a table at 8 seated players and rejects joining once full", () => {
    const { room } = createRoom("Host", {}); // seat 0 taken
    for (let seat = 1; seat < 8; seat++) {
      const { playerId } = joinRoom(room.id, `Player${seat}`);
      takeSeat(room, playerId, seat as 1 | 2 | 3 | 4 | 5 | 6 | 7);
    }
    expect(room.players).toHaveLength(8);
    expect(() => joinRoom(room.id, "OneTooMany")).toThrow(RoomServiceError);
  });
});

describe("buy-ins only between hands", () => {
  it("rejects a buy-in request while a hand is in progress, and allows it again once the hand ends", () => {
    const { room, playerId: hostId } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    const { playerId: guestId } = joinRoom(room.id, "Guest");
    takeSeat(room, guestId, 1);
    requestBuyIn(room, hostId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests[0].id, true);
    requestBuyIn(room, guestId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests.find((r) => r.playerId === guestId)!.id, true);

    startHand(room, new Deck());
    expect(room.status).toBe("in-hand");
    expect(() => requestBuyIn(room, guestId, 500, "topup")).toThrow(RoomServiceError);

    submitAction(room, new Deck(), room.hand.activePlayerId!, { action: "fold" });
    expect(room.status).toBe("lobby");
    expect(() => requestBuyIn(room, guestId, 500, "topup")).not.toThrow();
  });
});

describe("client view hole card visibility", () => {
  it("shows a player their own hole cards, but hides other players' hole cards", () => {
    const { room, playerId: hostId } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    const { playerId: guestId } = joinRoom(room.id, "Guest");
    takeSeat(room, guestId, 1);
    requestBuyIn(room, hostId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests[0].id, true);
    requestBuyIn(room, guestId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests.find((r) => r.playerId === guestId)!.id, true);

    startHand(room, new Deck());

    const hostView = buildClientView(room, hostId);
    const hostSelf = hostView.players.find((p) => p.id === hostId)!;
    const hostOpponent = hostView.players.find((p) => p.id === guestId)!;

    // The viewer sees their own two hole cards...
    expect(hostSelf.holeCards).toHaveLength(2);
    expect(hostView.you.holeCards).toHaveLength(2);
    expect(hostSelf.holeCards).toEqual(hostView.you.holeCards);
    // ...but not their opponent's.
    expect(hostOpponent.holeCards).toHaveLength(0);
    expect(hostOpponent.hasHoleCards).toBe(true); // still knows they were dealt in

    // From the guest's perspective, it's reversed.
    const guestView = buildClientView(room, guestId);
    expect(guestView.players.find((p) => p.id === guestId)!.holeCards).toHaveLength(2);
    expect(guestView.players.find((p) => p.id === hostId)!.holeCards).toHaveLength(0);
  });
});

describe("hand history", () => {
  it("records each player's own hand privately after it completes", () => {
    const { room, playerId: hostId } = createRoom("Host", { smallBlind: 5, bigBlind: 10 });
    const { playerId: guestId } = joinRoom(room.id, "Guest");
    takeSeat(room, guestId, 1);
    requestBuyIn(room, hostId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests[0].id, true);
    requestBuyIn(room, guestId, 1000, "initial");
    resolveBuyInRequest(room, room.buyInRequests.find((r) => r.playerId === guestId)!.id, true);

    startHand(room, new Deck());
    // Heads-up: host is dealer/SB, acts first. Fold immediately to end the hand fast.
    submitAction(room, new Deck(), room.hand.activePlayerId!, { action: "fold" });
    expect(room.hand.phase).toBe("hand-complete");

    const hostView = buildClientView(room, hostId);
    const guestView = buildClientView(room, guestId);

    expect(hostView.you.handHistory).toHaveLength(1);
    expect(guestView.you.handHistory).toHaveLength(1);
    // A player's history entry carries their own real hole cards.
    expect(hostView.you.handHistory[0].holeCards).toHaveLength(2);
    // But never leaks into what the OTHER player receives about them.
    const guestSeesHostAsPublicPlayer = guestView.players.find((p) => p.id === hostId) as unknown as Record<
      string,
      unknown
    >;
    expect(guestSeesHostAsPublicPlayer.handHistory).toBeUndefined();

    // Net changes should be opposite and sum to zero (a fold just moves the blinds).
    const hostNet = hostView.you.handHistory[0].netChange;
    const guestNet = guestView.you.handHistory[0].netChange;
    expect(hostNet + guestNet).toBe(0);
  });
});
