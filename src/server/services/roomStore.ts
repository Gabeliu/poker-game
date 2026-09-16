import type { RoomState } from "@/lib/types";
import { Deck } from "@/server/engine/deck";

/**
 * In-memory, single-process authoritative store for all room state.
 *
 * This is intentionally not backed by an external database: rooms are
 * ephemeral private tables (home-game style), chips are virtual, and there
 * is no requirement for state to survive a server restart. If this ever
 * needs to run across multiple server instances, the pieces that would
 * need to move to a shared store (e.g. Redis) are exactly what's isolated
 * here: `rooms`, `decks`, and the socket.io adapter.
 */

const rooms = new Map<string, RoomState>();
const decks = new Map<string, Deck>();
/** roomId -> playerToken -> playerId, used to reattach a reconnecting client to their existing seat. */
const playerTokensByRoom = new Map<string, Map<string, string>>();
/** socket.id -> current room/player, used to clean up on disconnect. */
const socketLocations = new Map<string, { roomId: string; playerId: string }>();
/** roomId -> active turn timer, so we can clear it when the turn changes. */
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const roomStore = {
  get(roomId: string): RoomState | undefined {
    return rooms.get(roomId);
  },
  set(roomId: string, room: RoomState): void {
    rooms.set(roomId, room);
  },
  delete(roomId: string): void {
    rooms.delete(roomId);
    decks.delete(roomId);
    playerTokensByRoom.delete(roomId);
    clearTurnTimer(roomId);
  },
  has(roomId: string): boolean {
    return rooms.has(roomId);
  },

  getOrCreateDeck(roomId: string): Deck {
    let deck = decks.get(roomId);
    if (!deck) {
      deck = new Deck();
      decks.set(roomId, deck);
    }
    return deck;
  },
  replaceDeck(roomId: string): Deck {
    const deck = new Deck();
    decks.set(roomId, deck);
    return deck;
  },

  registerToken(roomId: string, token: string, playerId: string): void {
    let map = playerTokensByRoom.get(roomId);
    if (!map) {
      map = new Map();
      playerTokensByRoom.set(roomId, map);
    }
    map.set(token, playerId);
  },
  resolveToken(roomId: string, token: string): string | undefined {
    return playerTokensByRoom.get(roomId)?.get(token);
  },

  linkSocket(socketId: string, roomId: string, playerId: string): void {
    socketLocations.set(socketId, { roomId, playerId });
  },
  unlinkSocket(socketId: string): { roomId: string; playerId: string } | undefined {
    const loc = socketLocations.get(socketId);
    socketLocations.delete(socketId);
    return loc;
  },
  getSocketLocation(socketId: string) {
    return socketLocations.get(socketId);
  },
  /** Unlinks every socket currently mapped to a given player in a room —
   * used when the host removes someone, so their (still-open) connection
   * stops being treated as that now-nonexistent player for every future
   * broadcast and action. Returns the affected socket ids so the caller can
   * also make them leave the io room and notify them. */
  unlinkPlayer(roomId: string, playerId: string): string[] {
    const affected: string[] = [];
    for (const [socketId, loc] of socketLocations) {
      if (loc.roomId === roomId && loc.playerId === playerId) {
        socketLocations.delete(socketId);
        affected.push(socketId);
      }
    }
    return affected;
  },

  setTurnTimer(roomId: string, timer: ReturnType<typeof setTimeout>): void {
    clearTurnTimer(roomId);
    turnTimers.set(roomId, timer);
  },
};

function clearTurnTimer(roomId: string): void {
  const existing = turnTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    turnTimers.delete(roomId);
  }
}

export function clearRoomTurnTimer(roomId: string): void {
  clearTurnTimer(roomId);
}
