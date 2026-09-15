import { describe, expect, it } from "vitest";
import { createRoom, joinRoom, removePlayer, RoomServiceError } from "@/server/services/roomService";
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
