import { describe, expect, it } from "vitest";
import { createRoom, joinRoom, removePlayer } from "@/server/services/roomService";
import { roomStore } from "@/server/services/roomStore";
import {
  removeSeatClaim,
  requestSeatClaim,
  sanitizeRejectionReason,
  takeSeatClaim,
} from "@/server/services/seatClaimService";
import { canResolveSeatClaim } from "@/lib/seatClaims";

function table() {
  const { room, playerId: hostId } = createRoom("Host", {});
  const sam = joinRoom(room.id, "Sam");
  const alex = joinRoom(room.id, "Alex");
  return { room, hostId, samId: sam.playerId, samToken: sam.playerToken, alexId: alex.playerId };
}

describe("asking for a seat by name", () => {
  it("a taken name is refused with a code the client can act on", () => {
    const { room } = table();
    expect(() => joinRoom(room.id, "sam")).toThrowError(expect.objectContaining({ code: "name-taken" }));
  });

  it("opens a claim on the seat with that name, whatever the capitalisation", () => {
    const { room, samId } = table();
    const claim = requestSeatClaim(room, "  sAM ");
    expect(claim.playerId).toBe(samId);
    expect(claim.playerDisplayName).toBe("Sam");
    expect(room.seatClaims).toEqual([claim]);
  });

  it("refuses a name nobody at the table has", () => {
    const { room } = table();
    expect(() => requestSeatClaim(room, "Nobody")).toThrow("No one at this table has that name.");
    expect(() => requestSeatClaim(room, "   ")).toThrow("No one at this table has that name.");
  });

  it("allows only one waiting claim per seat", () => {
    const { room } = table();
    requestSeatClaim(room, "Sam");
    expect(() => requestSeatClaim(room, "Sam")).toThrow("already asked for that seat");
    expect(() => requestSeatClaim(room, "Alex")).not.toThrow();
  });
});

describe("who may answer a seat claim", () => {
  it("the host can; an ordinary player cannot — not even for their own seat", () => {
    const { room, hostId, samId, alexId } = table();
    const claim = requestSeatClaim(room, "Sam");
    expect(canResolveSeatClaim(room, hostId, claim)).toBe(true);
    expect(canResolveSeatClaim(room, alexId, claim)).toBe(false);
    expect(canResolveSeatClaim(room, samId, claim)).toBe(false);
    expect(canResolveSeatClaim(room, null, claim)).toBe(false);
    expect(() => takeSeatClaim(room, claim.id, alexId)).toThrow("Only the room host can answer that.");
    expect(room.seatClaims).toHaveLength(1);
  });

  it("a claim on the host's own seat: the host while connected, any connected player once the host is away", () => {
    const { room, hostId, samId, alexId } = table();
    const claim = requestSeatClaim(room, "Host");
    expect(canResolveSeatClaim(room, hostId, claim)).toBe(true);
    expect(canResolveSeatClaim(room, samId, claim)).toBe(false);

    room.players.find((p) => p.id === hostId)!.connectionStatus = "disconnected";
    expect(canResolveSeatClaim(room, samId, claim)).toBe(true);
    // …but an offline player can't vouch, and it only applies to the host's seat.
    room.players.find((p) => p.id === alexId)!.connectionStatus = "disconnected";
    expect(canResolveSeatClaim(room, alexId, claim)).toBe(false);
    expect(canResolveSeatClaim(room, samId, requestSeatClaim(room, "Alex"))).toBe(false);
  });

  it("answering takes the claim off the table, once", () => {
    const { room, hostId } = table();
    const claim = requestSeatClaim(room, "Sam");
    expect(takeSeatClaim(room, claim.id, hostId)).toEqual(claim);
    expect(room.seatClaims).toEqual([]);
    expect(() => takeSeatClaim(room, claim.id, hostId)).toThrow("no longer waiting");
  });
});

describe("claims go away with what they depend on", () => {
  it("removing the seat drops the claims on it", () => {
    const { room, samId } = table();
    requestSeatClaim(room, "Sam");
    const onAlex = requestSeatClaim(room, "Alex");
    removePlayer(room, samId);
    expect(room.seatClaims).toEqual([onAlex]);
  });

  it("a withdrawn claim is removed and reported; a missing one is a no-op", () => {
    const { room } = table();
    const claim = requestSeatClaim(room, "Sam");
    expect(removeSeatClaim(room, claim.id)).toEqual(claim);
    expect(removeSeatClaim(room, claim.id)).toBeUndefined();
    expect(room.seatClaims).toEqual([]);
  });

  it("handing a seat over retires its old token, so the old browser can't come back in", () => {
    const { room, samId, samToken } = table();
    expect(roomStore.resolveToken(room.id, samToken)).toBe(samId);
    roomStore.revokeTokensForPlayer(room.id, samId);
    roomStore.registerToken(room.id, "fresh-token", samId);
    expect(roomStore.resolveToken(room.id, samToken)).toBeUndefined();
    expect(roomStore.resolveToken(room.id, "fresh-token")).toBe(samId);
    // The old token now reads as a stranger using a taken name.
    expect(() => joinRoom(room.id, "Sam", samToken)).toThrowError(expect.objectContaining({ code: "name-taken" }));
  });
});

describe("the reason shown to someone turned down", () => {
  it("keeps the host's words to one short line, with a default when there are none", () => {
    expect(sanitizeRejectionReason("  Not   you,\n sorry  ")).toBe("Not you, sorry");
    expect(sanitizeRejectionReason("")).toBe("The host declined the request.");
    expect(sanitizeRejectionReason(undefined)).toBe("The host declined the request.");
    expect(sanitizeRejectionReason(42)).toBe("The host declined the request.");
    expect(sanitizeRejectionReason("x".repeat(500))).toHaveLength(140);
  });
});
