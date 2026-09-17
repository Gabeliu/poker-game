import type { Server } from "socket.io";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@/lib/events";
import { buildClientView } from "@/server/services/roomService";
import { roomStore } from "@/server/services/roomStore";
import { continueRunout, forceTimeoutAction, resolveRunItByTimeout } from "@/server/engine/handEngine";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Sends every connected socket in a room its own personalized view (hole cards hidden from others). */
export async function broadcastRoomState(io: AppServer, roomId: string): Promise<void> {
  const room = roomStore.get(roomId);
  if (!room) return;

  // Bumped once per broadcast (not per resync ack — see room:resync in
  // handlers.ts) so a client can tell a stale snapshot from the current one.
  roomStore.bumpVersion(roomId);

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
    forceTimeoutAction(current, deck, { paced: true });
    void broadcastRoomState(io, roomId);
    scheduleTurnTimer(io, roomId);
    scheduleHandFlowTimer(io, roomId);
  }, delay);

  roomStore.setTurnTimer(roomId, timer);
}

/**
 * Ensures exactly one timer is running for a room's in-flight run-it
 * decision or paced all-in reveal — mirrors scheduleTurnTimer's discipline
 * exactly: re-fetch live room state inside the callback (never close over a
 * stale reference), verify nothing has already superseded what this timer
 * was scheduled for before acting, then broadcast and reschedule. Uses its
 * own timer slot (roomStore.setRevealTimer) so it can never collide with
 * the per-turn action timer above.
 */
export function scheduleHandFlowTimer(io: AppServer, roomId: string): void {
  const room = roomStore.get(roomId);
  if (!room) return;

  const decisionDeadline = room.hand.runItDecision?.deadline ?? null;
  const nextRevealAt = room.hand.runout?.nextRevealAt ?? null;
  const target = decisionDeadline ?? nextRevealAt;
  if (target == null) {
    roomStore.clearRevealTimer(roomId);
    return;
  }

  const handNumber = room.hand.handNumber;
  const delay = Math.max(0, target - Date.now());
  const timer = setTimeout(() => {
    const current = roomStore.get(roomId);
    if (!current || current.hand.handNumber !== handNumber) return;

    if (decisionDeadline !== null) {
      // Something (an early "once" choice) may have already resolved this
      // exact decision before the timer fired — only act if it's still the
      // same pending decision.
      if (current.hand.runItDecision?.deadline === decisionDeadline) {
        resolveRunItByTimeout(current);
      }
    } else if (nextRevealAt !== null && current.hand.runout?.nextRevealAt === nextRevealAt) {
      const deck = roomStore.getOrCreateDeck(roomId);
      continueRunout(current, deck);
    }

    void broadcastRoomState(io, roomId);
    scheduleHandFlowTimer(io, roomId);
  }, delay);

  roomStore.setRevealTimer(roomId, timer);
}
