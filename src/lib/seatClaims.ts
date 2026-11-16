import type { Player, SeatClaim } from "./types";

/**
 * Who may answer a seat claim. Shared by the server (which enforces it) and
 * the client (which uses it only to decide who is shown the request).
 *
 * Normally only the host. The one exception is a claim on the host's own
 * seat while the host is offline: nobody could ever answer it, and a table
 * whose host can't get back in is stuck for good — so then anyone at the
 * table who is connected can vouch for them.
 */
export function canResolveSeatClaim(
  room: { hostPlayerId: string; players: Pick<Player, "id" | "connectionStatus">[] },
  resolverId: string | null,
  claim: Pick<SeatClaim, "playerId">
): boolean {
  if (!resolverId) return false;
  const resolver = room.players.find((p) => p.id === resolverId);
  if (!resolver) return false;
  if (resolver.id === room.hostPlayerId) return true;

  const host = room.players.find((p) => p.id === room.hostPlayerId);
  const hostIsAway = !host || host.connectionStatus === "disconnected";
  return claim.playerId === room.hostPlayerId && hostIsAway && resolver.connectionStatus === "connected";
}
