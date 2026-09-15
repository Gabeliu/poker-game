import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "@/lib/events";
import { roomStore } from "@/server/services/roomStore";
import {
  RoomServiceError,
  assertHost,
  buildClientView,
  createRoom,
  getRoomOrThrow,
  joinRoom,
  removePlayer,
  transferOwnership,
  updateSettings,
} from "@/server/services/roomService";
import { requestBuyIn, resolveBuyInRequest } from "@/server/services/buyInService";
import { HandEngineError, startHand, submitAction } from "@/server/engine/handEngine";
import { broadcastRoomState, scheduleTurnTimer } from "./broadcast";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function errorMessage(err: unknown): string {
  if (err instanceof RoomServiceError || err instanceof HandEngineError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export function registerRoomHandlers(io: AppServer, socket: AppSocket): void {
  socket.on("room:create", (payload, ack) => {
    try {
      const { room, playerId, playerToken } = createRoom(payload.displayName, payload.settings ?? {});
      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.playerId = playerId;
      socket.data.playerToken = playerToken;
      roomStore.linkSocket(socket.id, room.id, playerId);
      socket.emit("room:state", buildClientView(room, playerId));
      ack({ ok: true, roomId: room.id, playerId, playerToken });
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("room:join", (payload, ack) => {
    try {
      const { room, playerId, playerToken, reconnected } = joinRoom(
        payload.roomId,
        payload.displayName,
        payload.playerToken
      );
      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.playerId = playerId;
      socket.data.playerToken = playerToken;
      roomStore.linkSocket(socket.id, room.id, playerId);
      ack({ ok: true, playerId, playerToken });
      void broadcastRoomState(io, room.id);
      if (reconnected) {
        io.to(room.id).emit("toast", {
          message: `${room.players.find((p) => p.id === playerId)?.displayName ?? "A player"} reconnected.`,
        });
      } else {
        io.to(room.id).emit("toast", {
          message: `${room.players.find((p) => p.id === playerId)?.displayName ?? "A player"} joined the table.`,
        });
      }
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("buyin:request", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      requestBuyIn(room, playerId, payload.amount, payload.type);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("buyin:resolve", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      assertHost(room, playerId);
      resolveBuyInRequest(room, payload.requestId, payload.approve);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("host:updateSettings", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      assertHost(room, playerId);
      updateSettings(room, payload.settings);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("host:startHand", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      assertHost(room, playerId);
      const deck = roomStore.replaceDeck(room.id);
      startHand(room, deck);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
      scheduleTurnTimer(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("host:removePlayer", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      assertHost(room, playerId);
      removePlayer(room, payload.playerId);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
      scheduleTurnTimer(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("host:transferOwnership", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      assertHost(room, playerId);
      transferOwnership(room, payload.playerId);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("player:sitOut", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      const player = room.players.find((p) => p.id === playerId);
      if (!player) throw new RoomServiceError("Player not found in this room.");
      player.sittingOut = payload.sittingOut;
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("action:submit", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      const deck = roomStore.getOrCreateDeck(room.id);
      const result = submitAction(room, deck, playerId, payload.action);
      if (!result.ok) {
        ack({ ok: false, error: result.error ?? "Invalid action." });
        return;
      }
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
      scheduleTurnTimer(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("disconnect", () => {
    const loc = roomStore.unlinkSocket(socket.id);
    if (!loc) return;
    const room = roomStore.get(loc.roomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === loc.playerId);
    if (!player) return;

    // Only mark disconnected if no other socket for this player is still
    // connected (e.g. a duplicate tab), otherwise a stray disconnect from
    // an old tab would wrongly flip a reconnected player back to offline.
    const stillConnected = [...io.sockets.sockets.values()].some(
      (s) => s.id !== socket.id && s.data.roomId === loc.roomId && s.data.playerId === loc.playerId
    );
    if (!stillConnected) {
      player.connectionStatus = "disconnected";
      void broadcastRoomState(io, loc.roomId);
      io.to(loc.roomId).emit("toast", { message: `${player.displayName} disconnected.`, variant: "default" });
    }
  });
}

function requirePlayerId(socket: AppSocket): string {
  if (!socket.data.playerId) throw new RoomServiceError("You are not in a room.");
  return socket.data.playerId;
}
