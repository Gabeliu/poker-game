import type { Server } from "socket.io";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@/lib/events";
import { buildClientView } from "@/server/services/roomService";
import { roomStore } from "@/server/services/roomStore";
import { forceTimeoutAction } from "@/server/engine/handEngine";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Sends every connected socket in a room its own personalized view (hole cards hidden from others). */
export async function broadcastRoomState(io: AppServer, roomId: string): Promise<void> {
  const room = roomStore.get(roomId);
  if (!room) return;

  const sockets = await io.in(roomId).fetchSockets();
  for (const socket of sockets) {
    const loc = roomStore.getSocketLocation(socket.id);
    const view = buildClientView(room, loc?.playerId ?? null);
    socket.emit("room:state", view);
  }
}

/**
 * Ensures exactly one timer is running for a room's current turn. Called
 * after any mutation that could change whose turn it is. When the timer
 * fires, it auto-checks/folds the stalled player server-side (never trusts
 * the client to enforce this) and re-broadcasts.
 */
export function scheduleTurnTimer(io: AppServer, roomId: string): void {
  const room = roomStore.get(roomId);
  if (!room || !room.hand.activePlayerId || !room.hand.turnDeadline) return;

  const delay = Math.max(0, room.hand.turnDeadline - Date.now());
  const timer = setTimeout(() => {
    const current = roomStore.get(roomId);
    if (!current || !current.hand.activePlayerId) return;
    const deck = roomStore.getOrCreateDeck(roomId);
    forceTimeoutAction(current, deck);
    void broadcastRoomState(io, roomId);
    scheduleTurnTimer(io, roomId);
  }, delay);

  roomStore.setTurnTimer(roomId, timer);
}
