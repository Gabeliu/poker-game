"use client";

import { WifiOff } from "lucide-react";
import type { ClientRoomView } from "@/lib/types";

/**
 * The host is the only one who can approve buy-ins, start hands, or change
 * settings — if they drop, the room effectively stalls with no explanation
 * unless we say so. Shows a persistent banner (not a toast, since the
 * condition can last a while) whenever the current host's socket is down.
 */
export function HostDisconnectedBanner({ room }: { room: ClientRoomView }) {
  const host = room.players.find((p) => p.id === room.hostPlayerId);
  if (!host || host.connectionStatus !== "disconnected") return null;

  return (
    <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-1.5 text-xs font-medium text-[var(--danger)]">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      Room disconnected — {host.displayName} (host) has lost connection. The game is paused until they reconnect.
    </div>
  );
}
