"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, LogOut, Settings, Spade } from "lucide-react";
import type { ClientRoomView } from "@/lib/types";
import { copyInviteLink } from "@/lib/invite";
import { HostRequestsPanel } from "./HostRequestsPanel";
import { HostSettingsDialog } from "./HostSettingsDialog";
import { LedgerPanel } from "./LedgerPanel";
import { BuyInDialog } from "./BuyInDialog";
import { PlayerAvatar } from "./PlayerAvatar";

interface RoomControlsProps {
  room: ClientRoomView;
  isHost: boolean;
  onResolveBuyIn: (requestId: string, approve: boolean) => void;
  onUpdateSettings: (settings: Partial<import("@/lib/types").RoomSettings>) => void;
  onRemovePlayer: (playerId: string) => void;
  onTransferOwnership: (playerId: string) => void;
  onRequestBuyIn: (amount: number, type: "initial" | "topup") => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Thin, minimal top nav — logo left, room/blinds center, actions right. */
export function RoomControls({
  room,
  isHost,
  onResolveBuyIn,
  onUpdateSettings,
  onRemovePlayer,
  onTransferOwnership,
  onRequestBuyIn,
}: RoomControlsProps) {
  const router = useRouter();
  const me = room.players.find((p) => p.id === room.you.playerId);
  const pendingMine = room.buyInRequests.find((r) => r.playerId === me?.id && r.status === "pending");

  return (
    <header className="relative flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Spade className="h-4 w-4 shrink-0 text-[var(--accent-lime)]" fill="currentColor" />
        <span className="hidden text-sm font-semibold text-[var(--text-primary)] sm:inline">Felt</span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[40%] -translate-x-1/2 -translate-y-1/2 text-center sm:block">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{room.settings.roomName}</p>
        <p className="text-[10px] text-[var(--text-secondary)]">
          Blinds {room.settings.smallBlind}/{room.settings.bigBlind}
        </p>
      </div>

      <div className="flex flex-1 shrink-0 items-center justify-end gap-1 sm:gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2 text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)] sm:px-3"
          onClick={() => copyInviteLink(room.id)}
        >
          <Link2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invite Friends</span>
        </Button>

        {me && (
          <BuyInDialog player={me} settings={room.settings} pendingRequest={pendingMine} onRequest={onRequestBuyIn}>
            <Button
              variant="ghost"
              size="sm"
              data-testid="buyin-trigger"
              className="px-2 text-[var(--text-secondary)] hover:bg-white/8 hover:text-[var(--text-primary)] sm:px-3"
            >
              <span className="sm:hidden">{!me.hasBoughtIn ? "Buy In" : "+Chips"}</span>
              <span className="hidden sm:inline">{!me.hasBoughtIn ? "Buy In" : "Add Chips"}</span>
            </Button>
          </BuyInDialog>
        )}

        {me && <LedgerPanel entries={room.ledger.filter((e) => e.playerId === me.id)} currentChips={me.chips} />}

        {isHost && <HostRequestsPanel requests={room.buyInRequests} onResolve={onResolveBuyIn} />}

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
          onClick={() => router.push("/")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
