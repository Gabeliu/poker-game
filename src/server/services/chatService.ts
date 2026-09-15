import type { RoomState } from "@/lib/types";
import { RoomServiceError } from "./roomService";
import { generateRequestId } from "@/server/utils/ids";

const MAX_MESSAGES = 200;

function pushMessage(room: RoomState, msg: Omit<RoomState["chatMessages"][number], "id" | "createdAt">): void {
  room.chatMessages.push({ ...msg, id: generateRequestId(), createdAt: Date.now() });
  if (room.chatMessages.length > MAX_MESSAGES) {
    room.chatMessages.splice(0, room.chatMessages.length - MAX_MESSAGES);
  }
}

export function postChatMessage(room: RoomState, playerId: string, text: string): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new RoomServiceError("Player not found in this room.");
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) throw new RoomServiceError("Message can't be empty.");
  pushMessage(room, { type: "chat", playerId, playerName: player.displayName, text: trimmed });
}

/** Host/system events — "Tom joined the table", buy-in approvals, etc. */
export function postSystemMessage(room: RoomState, text: string): void {
  pushMessage(room, { type: "system", text });
}
