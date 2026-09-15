import type { ClientRoomView, Player, PublicPlayer, RoomSettings, RoomState, SeatNumber } from "@/lib/types";
import { MAX_SEATS } from "@/lib/types";
import { advanceGameFlow, checkForImmediateHandEnd } from "@/server/engine/handEngine";
import { roomStore } from "./roomStore";
import { generatePlayerId, generatePlayerToken, generateRoomId } from "@/server/utils/ids";

export class RoomServiceError extends Error {}

const DEFAULT_SETTINGS: RoomSettings = {
  roomName: "Poker Night",
  smallBlind: 25,
  bigBlind: 50,
  minBuyIn: null,
  maxBuyIn: null,
  allowAdditionalBuyIns: true,
  allowJoinDuringHand: true,
  turnTimeLimitSeconds: 30,
};

function sanitizeSettings(partial: Partial<RoomSettings>): RoomSettings {
  const merged = { ...DEFAULT_SETTINGS, ...partial };
  return {
    roomName: (merged.roomName || "Poker Night").slice(0, 60),
    smallBlind: clampPositiveInt(merged.smallBlind, 1, 1_000_000),
    bigBlind: clampPositiveInt(merged.bigBlind, 1, 2_000_000),
    minBuyIn: merged.minBuyIn == null ? null : clampPositiveInt(merged.minBuyIn, 1, 100_000_000),
    maxBuyIn: merged.maxBuyIn == null ? null : clampPositiveInt(merged.maxBuyIn, 1, 100_000_000),
    allowAdditionalBuyIns: Boolean(merged.allowAdditionalBuyIns),
    allowJoinDuringHand: Boolean(merged.allowJoinDuringHand),
    turnTimeLimitSeconds: clampPositiveInt(merged.turnTimeLimitSeconds, 5, 300),
  };
}

function clampPositiveInt(value: number | null | undefined, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizeDisplayName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Player";
}

function occupiedSeatCount(room: RoomState): number {
  return room.players.filter((p) => p.seat !== null).length;
}

function makePlayer(id: string, displayName: string, seat: SeatNumber | null, isHost: boolean): Player {
  return {
    id,
    displayName,
    isHost,
    connectionStatus: "connected",
    chips: 0,
    seat,
    hasBoughtIn: false,
    sittingOut: false,
    handStatus: "waiting",
    currentBet: 0,
    totalCommittedThisHand: 0,
    hasActedThisStreet: false,
    holeCards: [],
    holeCardsRevealed: false,
    handHistory: [],
  };
}

export function createRoom(displayName: string, settingsPartial: Partial<RoomSettings>): {
  room: RoomState;
  playerId: string;
  playerToken: string;
} {
  let roomId = generateRoomId();
  while (roomStore.has(roomId)) roomId = generateRoomId();

  const playerId = generatePlayerId();
  const playerToken = generatePlayerToken();
  const player = makePlayer(playerId, sanitizeDisplayName(displayName), 0, true);

  const room: RoomState = {
    id: roomId,
    createdAt: Date.now(),
    hostPlayerId: playerId,
    settings: sanitizeSettings(settingsPartial),
    status: "lobby",
    players: [player],
    buyInRequests: [],
    ledger: [],
    chatMessages: [],
    hand: {
      phase: "waiting",
      handNumber: 0,
      dealerSeat: 0,
      smallBlindSeat: null,
      bigBlindSeat: null,
      communityCards: [],
      pots: [],
      currentBetAmount: 0,
      minRaiseAmount: 0,
      activePlayerId: null,
      turnDeadline: null,
      lastAggressorId: null,
      result: null,
    },
  };

  roomStore.set(roomId, room);
  roomStore.registerToken(roomId, playerToken, playerId);
  return { room, playerId, playerToken };
}

export function joinRoom(
  roomId: string,
  displayName: string,
  playerToken?: string
): { room: RoomState; playerId: string; playerToken: string; reconnected: boolean } {
  const room = roomStore.get(roomId.toUpperCase());
  if (!room) throw new RoomServiceError("Room not found.");

  if (playerToken) {
    const existingPlayerId = roomStore.resolveToken(room.id, playerToken);
    const existingPlayer = existingPlayerId ? room.players.find((p) => p.id === existingPlayerId) : undefined;
    if (existingPlayer) {
      existingPlayer.connectionStatus = "connected";
      return { room, playerId: existingPlayer.id, playerToken, reconnected: true };
    }
  }

  if (room.status === "in-hand" && !room.settings.allowJoinDuringHand) {
    throw new RoomServiceError("This room isn't accepting new players while a hand is in progress.");
  }

  // No spectator mode: without an open seat there's nothing for a new
  // arrival to do here, so the table itself is closed to them.
  if (occupiedSeatCount(room) >= MAX_SEATS) {
    throw new RoomServiceError("This table is full.");
  }

  const sanitizedName = sanitizeDisplayName(displayName);
  const nameTaken = room.players.some((p) => p.displayName.toLowerCase() === sanitizedName.toLowerCase());
  if (nameTaken) {
    throw new RoomServiceError("That name is already taken at this table. Try a different one.");
  }

  const playerId = generatePlayerId();
  const token = generatePlayerToken();
  // Joining puts you in the room, not in a seat — sitting down is a
  // separate, explicit, server-validated action (see takeSeat below).
  const player = makePlayer(playerId, sanitizedName, null, false);
  room.players.push(player);
  roomStore.registerToken(room.id, token, playerId);

  return { room, playerId, playerToken: token, reconnected: false };
}

/** Seats a player at a specific, empty seat. Fully server-validated — the
 * client only ever suggests a seat, never decides whether it's actually
 * available. Synchronous, so there's no window for two requests to race
 * each other onto the same seat. */
export function takeSeat(room: RoomState, playerId: string, seat: SeatNumber): void {
  if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) {
    throw new RoomServiceError("That seat doesn't exist.");
  }
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new RoomServiceError("You're not in this room.");
  if (player.seat !== null) {
    throw new RoomServiceError("You're already seated.");
  }
  const taken = room.players.some((p) => p.seat === seat);
  if (taken) {
    throw new RoomServiceError("That seat is already taken.");
  }
  player.seat = seat;
}

export function getRoomOrThrow(roomId: string): RoomState {
  const room = roomStore.get(roomId);
  if (!room) throw new RoomServiceError("Room not found.");
  return room;
}

export function assertHost(room: RoomState, playerId: string): void {
  if (room.hostPlayerId !== playerId) {
    throw new RoomServiceError("Only the room host can do that.");
  }
}

export function toPublicPlayer(player: Player, revealTo: "self" | "everyone" | "none"): PublicPlayer {
  const shouldRevealCards = revealTo === "everyone" || revealTo === "self" || player.holeCardsRevealed;
  const { holeCards, handHistory: _handHistory, ...rest } = player;
  return {
    ...rest,
    holeCards: shouldRevealCards ? holeCards : [],
    hasHoleCards: holeCards.length > 0,
  };
}

export function buildClientView(room: RoomState, viewerPlayerId: string | null): ClientRoomView {
  const { players, ...rest } = room;
  const viewer = viewerPlayerId ? players.find((p) => p.id === viewerPlayerId) : undefined;
  return {
    ...rest,
    players: players.map((p) =>
      toPublicPlayer(p, p.id === viewerPlayerId ? "self" : "none")
    ),
    you: {
      playerId: viewerPlayerId,
      holeCards: viewer?.holeCards ?? [],
      handHistory: viewer?.handHistory ?? [],
    },
  };
}

export function updateSettings(room: RoomState, partial: Partial<RoomSettings>): void {
  room.settings = sanitizeSettings({ ...room.settings, ...partial });
}

export function transferOwnership(room: RoomState, toPlayerId: string): void {
  const target = room.players.find((p) => p.id === toPlayerId);
  if (!target) throw new RoomServiceError("Player not found in this room.");
  const currentHost = room.players.find((p) => p.id === room.hostPlayerId);
  if (currentHost) currentHost.isHost = false;
  target.isHost = true;
  room.hostPlayerId = target.id;
}

/**
 * Removes a player from the room, safely handling the case where a hand is
 * currently in progress. All-in players can't be removed mid-hand — their
 * chips are already committed to a pot they're still eligible to win, and
 * removing them would corrupt the pot/showdown math.
 */
export function removePlayer(room: RoomState, playerId: string): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new RoomServiceError("Player not found in this room.");

  if (room.status === "in-hand") {
    if (player.handStatus === "all-in") {
      throw new RoomServiceError("Can't remove a player who is all-in until the current hand finishes.");
    }
    if (player.handStatus === "active") {
      const deck = roomStore.getOrCreateDeck(room.id);
      if (room.hand.activePlayerId === player.id) {
        player.handStatus = "folded";
        player.hasActedThisStreet = true;
        // Only a seated player can ever be mid-hand-active, so this is always non-null.
        advanceGameFlow(room, deck, player.seat!);
      } else {
        player.handStatus = "folded";
        checkForImmediateHandEnd(room);
      }
    }
  }

  room.players = room.players.filter((p) => p.id !== playerId);
  room.buyInRequests = room.buyInRequests.filter((r) => r.playerId !== playerId || r.status !== "pending");

  if (room.hostPlayerId === playerId && room.players.length > 0) {
    // Prefer handing off to a seated player (an unseated one sorts last via the fallback).
    const next = [...room.players].sort((a, b) => (a.seat ?? MAX_SEATS) - (b.seat ?? MAX_SEATS))[0];
    transferOwnership(room, next.id);
  }
}
