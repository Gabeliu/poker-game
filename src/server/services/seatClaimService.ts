import type { RoomState, SeatClaim } from "@/lib/types";
import { RoomServiceError } from "./roomService";
import { generateRequestId } from "@/server/utils/ids";
import { canResolveSeatClaim } from "@/lib/seatClaims";

/**
 * Getting a seat back from a browser that doesn't hold its token.
 *
 * A seat belongs to whichever browser has its token, so a player who comes
 * back in a different browser or on another device (an invite opened in a
 * chat app's built-in browser, then again in Safari) is a stranger to the
 * server: their own name is "taken", and their chips sit at a seat they can
 * no longer reach. They can ask for that seat by name instead — but a name
 * proves nothing, so it's a person at the table who decides, exactly like a
 * buy-in: the host, who can also say why not.
 */

const MAX_REASON_LENGTH = 140;
const DEFAULT_REJECTION_REASON = "The host declined the request.";
/** More than a table could ever legitimately have waiting at once. */
const MAX_PENDING_CLAIMS = 8;

/** Opens a request for the seat currently held under `displayName`. */
export function requestSeatClaim(room: RoomState, displayName: string): SeatClaim {
  const wanted = (displayName ?? "").trim().toLowerCase();
  const player = wanted ? room.players.find((p) => p.displayName.toLowerCase() === wanted) : undefined;
  if (!player) throw new RoomServiceError("No one at this table has that name.");

  const claims = (room.seatClaims ??= []);
  if (claims.some((c) => c.playerId === player.id)) {
    throw new RoomServiceError("Someone has already asked for that seat — wait for the host to answer.");
  }
  if (claims.length >= MAX_PENDING_CLAIMS) {
    throw new RoomServiceError("Too many seat requests are waiting at this table. Try again in a moment.");
  }

  const claim: SeatClaim = {
    id: generateRequestId(),
    playerId: player.id,
    playerDisplayName: player.displayName,
    createdAt: Date.now(),
  };
  claims.push(claim);
  return claim;
}

/** Takes a claim off the table for `resolverId` to answer; throws if it's
 * gone already or isn't theirs to answer. */
export function takeSeatClaim(room: RoomState, claimId: string, resolverId: string): SeatClaim {
  const claim = room.seatClaims?.find((c) => c.id === claimId);
  if (!claim) throw new RoomServiceError("That seat request is no longer waiting.");
  if (!canResolveSeatClaim(room, resolverId, claim)) {
    throw new RoomServiceError("Only the room host can answer that.");
  }
  removeSeatClaim(room, claimId);
  return claim;
}

/** Drops a claim without answering it (the asker left, or the seat is gone). */
export function removeSeatClaim(room: RoomState, claimId: string): SeatClaim | undefined {
  const claim = room.seatClaims?.find((c) => c.id === claimId);
  if (claim) room.seatClaims = room.seatClaims!.filter((c) => c.id !== claimId);
  return claim;
}

/** What the asker is told when turned down: the host's words, kept to one
 * short line, or a neutral default if they gave none. */
export function sanitizeRejectionReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.replace(/\s+/g, " ").trim().slice(0, MAX_REASON_LENGTH) : "";
  return text.length > 0 ? text : DEFAULT_REJECTION_REASON;
}
