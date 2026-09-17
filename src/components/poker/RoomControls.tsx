"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, LogOut, Settings, Spade } from "lucide-react";
import type { ClientRoomView } from "@/lib/types";
import { copyInviteLink } from "@/lib/invite";
import { HostRequestsPanel } from "./HostRequestsPanel";
import { HostSettingsDialog } from "./HostSettingsDialog";
import { LedgerPanel } from "./LedgerPanel";
import { PlayerAvatar } from "./PlayerAvatar";
import { SoundControl } from "./SoundControl";

interface RoomControlsProps {
  room: ClientRoomView;
  isHost: boolean;
  onResolveBuyIn: (requestId: string, approve: boolean) => void;
  onUpdateSettings: (settings: Partial<import("@/lib/types").RoomSettings>) => void;
  onRemovePlayer: (playerId: string) => void;
  onTransferOwnership: (playerId: string) => void;
}

/** Thin, minimal top nav — logo left, room/blinds center, actions right.
 * Buy-in lives at the table/action dock instead (see ActionDock) — it's a
 * core gameplay action, not a settings-tier one, so it doesn't belong here
 * competing with invite/ledger/sound/settings for attention. */
export function RoomControls({
  room,
  isHost,
  onResolveBuyIn,
  onUpdateSettings,
  onRemovePlayer,
  onTransferOwnership,
}: RoomControlsProps) {
  const router = useRouter();
  const me = room.players.find((p) => p.id === room.you.playerId);

  return (
    <header className="room-header relative flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Spade className="h-4 w-4 shrink-0 text-[var(--accent-lime)]" fill="currentColor" />
        <span className="hidden text-sm font-semibold text-[var(--text-primary)] sm:inline">Felt</span>
      </div>

      <div className="room-title">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{room.settings.roomName}</p>
        <p className="text-[10px] text-[var(--text-secondary)]">
          {room.settings.smallBlind} / {room.settings.bigBlind} · No Limit Hold’em
        </p>
      </div>

      <div className="flex flex-1 shrink-0 items-center justify-end gap-1 sm:gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)] sm:px-3"
          aria-label="Invite Friends"
          onClick={() => copyInviteLink(room.id)}
        >
          <Link2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invite Friends</span>
        </Button>

        {me && <LedgerPanel entries={room.ledger.filter((e) => e.playerId === me.id)} currentChips={me.chips} />}

        {isHost && <HostRequestsPanel requests={room.buyInRequests} onResolve={onResolveBuyIn} />}

        <SoundControl />

        {isHost && (
          <HostSettingsDialog
            settings={room.settings}
            players={room.players}
            hostPlayerId={room.hostPlayerId}
            onUpdateSettings={onUpdateSettings}
            onRemovePlayer={onRemovePlayer}
            onTransferOwnership={onTransferOwnership}
          >
            <Button
              variant="ghost"
              size="icon"
              data-testid="host-settings-trigger"
              aria-label="Table settings"
              className="text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)]"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </HostSettingsDialog>
        )}

        {me && <PlayerAvatar name={me.displayName} size="sm" className="ml-0.5" />}

        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--text-secondary)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
          aria-label="Leave table"
          onClick={() => router.push("/")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
