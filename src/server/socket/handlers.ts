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
  takeSeat,
  transferOwnership,
  updateSettings,
} from "@/server/services/roomService";
import { requestBuyIn, resolveBuyInRequest } from "@/server/services/buyInService";
import { postChatMessage, postSystemMessage } from "@/server/services/chatService";
import { chooseRunIt, HandEngineError, startHand, submitAction } from "@/server/engine/handEngine";
import { broadcastRoomState, scheduleHandFlowTimer, scheduleTurnTimer } from "./broadcast";

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
      roomStore.markActive(room.id);
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
      roomStore.markActive(room.id);
      ack({ ok: true, playerId, playerToken });
      const displayName = room.players.find((p) => p.id === playerId)?.displayName ?? "A player";
      if (reconnected) {
        io.to(room.id).emit("toast", { message: `${displayName} reconnected.` });
      } else {
        io.to(room.id).emit("toast", { message: `${displayName} joined the table.` });
        postSystemMessage(room, `${displayName} joined the table`);
      }
      void broadcastRoomState(io, room.id);
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
      const request = room.buyInRequests.find((r) => r.id === payload.requestId);
      resolveBuyInRequest(room, payload.requestId, payload.approve);
      if (request) {
        postSystemMessage(
          room,
          payload.approve
            ? `${request.playerDisplayName}'s ${request.amount.toLocaleString()} chip buy-in was approved`
            : `${request.playerDisplayName}'s ${request.amount.toLocaleString()} chip buy-in was rejected`
        );
      }
      // The chat line is easy to miss, so the player who was turned down also
      // gets a message on screen, on top of whatever they're looking at.
      if (request && !payload.approve) {
        for (const socketId of roomStore.socketsForPlayer(room.id, request.playerId)) {
          io.to(socketId).emit("toast", {
            message: `The host declined your ${request.amount.toLocaleString()} chip buy-in.`,
            variant: "error",
          });
        }
      }
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
      // Must be checked before touching the timer or deck: a duplicate/stray
      // start request mid-reveal would otherwise cancel the pending reveal
      // timer and swap the deck out from under the runout, then throw —
      // leaving the hand stuck forever with nothing left to advance it.
      if (room.status === "in-hand") {
        throw new RoomServiceError("A hand is already in progress.");
      }
      roomStore.clearRevealTimer(room.id);
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
      const removedName = room.players.find((p) => p.id === payload.playerId)?.displayName;
      removePlayer(room, payload.playerId);
      if (removedName) postSystemMessage(room, `${removedName} left the table`);

      // The removed player's own connection stays open (they weren't
      // disconnected) but must stop being treated as a player who no
      // longer exists here — otherwise their client keeps a stale
      // `you.playerId`, looks "still joined," and every action they take
      // (including trying to buy back in) silently fails server-side with
      // "Player not found," leaving them stuck with no way back in.
      for (const socketId of roomStore.unlinkPlayer(room.id, payload.playerId)) {
        const removedSocket = io.sockets.sockets.get(socketId);
        if (removedSocket) {
          removedSocket.leave(room.id);
          removedSocket.data.roomId = undefined;
          removedSocket.data.playerId = undefined;
          removedSocket.data.playerToken = undefined;
          removedSocket.emit("you:removed", { reason: "The host removed you from this table." });
        }
      }

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

  socket.on("seat:take", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      takeSeat(room, playerId, payload.seat);
      const player = room.players.find((p) => p.id === playerId);
      if (player) postSystemMessage(room, `${player.displayName} took a seat`);
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
      const result = submitAction(room, deck, playerId, payload.action, { paced: true });
      if (!result.ok) {
        ack({ ok: false, error: result.error ?? "Invalid action." });
        return;
      }
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
      scheduleTurnTimer(io, room.id);
      scheduleHandFlowTimer(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("runIt:choose", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      const result = chooseRunIt(room, playerId, payload.choice);
      if (!result.ok) {
        ack({ ok: false, error: result.error ?? "Can't choose right now." });
        return;
      }
      ack({ ok: true });
      if (result.resolved) {
        postSystemMessage(room, room.hand.runout?.runs === 2 ? "Running it twice." : "Running it once.");
      }
      void broadcastRoomState(io, room.id);
      // Re-derives its own target from live state — an early "once" cancels
      // the decision timer and installs the first reveal timer automatically.
      scheduleHandFlowTimer(io, room.id);
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("room:resync", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const loc = roomStore.getSocketLocation(socket.id);

      // Fast path: this socket is still correctly linked — the common case,
      // since most visibility/focus/online events fire without the
      // transport actually having dropped. Just the latest snapshot, no
      // broadcast, no toast.
      if (loc && loc.roomId === room.id && room.players.some((p) => p.id === loc.playerId)) {
        ack({ ok: true, view: buildClientView(room, loc.playerId) });
        return;
      }

      // Slow path: the transport genuinely dropped and reconnected as a new
      // Socket.IO connection, so this socket has fresh, empty socket.data.
      // Re-link exactly like room:join does, but skip its display-name
      // validation and its always-broadcast/always-toast side effects —
      // those would spam every player each time someone's phone screen
      // locks, when nothing actually needs telling.
      if (!payload.playerToken) {
        ack({ ok: false, error: "Not linked to a player in this room." });
        return;
      }
      const playerId = roomStore.resolveToken(room.id, payload.playerToken);
      const player = playerId ? room.players.find((p) => p.id === playerId) : undefined;
      if (!player) {
        ack({ ok: false, error: "Not linked to a player in this room." });
        return;
      }

      socket.join(room.id);
      socket.data.roomId = room.id;
      socket.data.playerId = player.id;
      socket.data.playerToken = payload.playerToken;
      roomStore.linkSocket(socket.id, room.id, player.id);
      roomStore.markActive(room.id);

      const wasDisconnected = player.connectionStatus === "disconnected";
      player.connectionStatus = "connected";

      ack({ ok: true, view: buildClientView(room, player.id) });

      if (wasDisconnected) {
        io.to(room.id).emit("toast", { message: `${player.displayName} reconnected.` });
        void broadcastRoomState(io, room.id);
      }
    } catch (err) {
      ack({ ok: false, error: errorMessage(err) });
    }
  });

  socket.on("chat:send", (payload, ack) => {
    try {
      const room = getRoomOrThrow(payload.roomId);
      const playerId = requirePlayerId(socket);
      postChatMessage(room, playerId, payload.text);
      ack({ ok: true });
      void broadcastRoomState(io, room.id);
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
      if (room.players.every((p) => p.connectionStatus === "disconnected")) {
        roomStore.markEmpty(loc.roomId);
      }
      void broadcastRoomState(io, loc.roomId);
      io.to(loc.roomId).emit("toast", { message: `${player.displayName} disconnected.`, variant: "default" });
    }
  });
}

function requirePlayerId(socket: AppSocket): string {
  if (!socket.data.playerId) throw new RoomServiceError("You are not in a room.");
  return socket.data.playerId;
}
