import type { BuyInRequestType, RoomState } from "@/lib/types";
import { RoomServiceError } from "./roomService";
import { generateRequestId } from "@/server/utils/ids";

let ledgerCounter = 0;
function nextLedgerId(): string {
  ledgerCounter += 1;
  return `ledger-buyin-${Date.now()}-${ledgerCounter}`;
}

export function requestBuyIn(
  room: RoomState,
  playerId: string,
  amount: number,
  type: BuyInRequestType
): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new RoomServiceError("Player not found in this room.");

  const roundedAmount = Math.floor(amount);
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new RoomServiceError("Buy-in amount must be a positive number.");
  }

  if (room.settings.minBuyIn != null && roundedAmount < room.settings.minBuyIn) {
    throw new RoomServiceError(`Minimum buy-in is ${room.settings.minBuyIn.toLocaleString()} chips.`);
  }
  if (room.settings.maxBuyIn != null && roundedAmount > room.settings.maxBuyIn) {
    throw new RoomServiceError(`Maximum buy-in is ${room.settings.maxBuyIn.toLocaleString()} chips.`);
  }

  const hasPending = room.buyInRequests.some((r) => r.playerId === playerId && r.status === "pending");
  if (hasPending) {
    throw new RoomServiceError("You already have a pending buy-in request.");
  }

  if (type === "topup") {
    if (!room.settings.allowAdditionalBuyIns) {
      throw new RoomServiceError("Additional buy-ins are disabled for this room.");
    }
    if (!player.hasBoughtIn) {
      throw new RoomServiceError("Request your initial buy-in first.");
    }
  } else {
    if (player.hasBoughtIn && player.chips > 0) {
      throw new RoomServiceError("You've already bought in. Use \"Request more chips\" instead.");
    }
  }

  room.buyInRequests.push({
    id: generateRequestId(),
    playerId,
    playerDisplayName: player.displayName,
    amount: roundedAmount,
    type,
    status: "pending",
    createdAt: Date.now(),
  });
}

export function resolveBuyInRequest(room: RoomState, requestId: string, approve: boolean): void {
  const request = room.buyInRequests.find((r) => r.id === requestId);
  if (!request) throw new RoomServiceError("Buy-in request not found.");
  if (request.status !== "pending") throw new RoomServiceError("This request has already been resolved.");

  request.status = approve ? "approved" : "rejected";
  request.resolvedAt = Date.now();

  if (!approve) return;

  const player = room.players.find((p) => p.id === request.playerId);
  if (!player) return;

  player.chips += request.amount;
  player.hasBoughtIn = true;
  if (player.handStatus === "waiting" || player.handStatus === "sitting-out") {
    player.handStatus = "waiting";
  }

  room.ledger.push({
    id: nextLedgerId(),
    playerId: player.id,
    type: request.type === "initial" ? "initial-buy-in" : "additional-buy-in",
    amount: request.amount,
    balanceAfter: player.chips,
    createdAt: Date.now(),
  });
}
