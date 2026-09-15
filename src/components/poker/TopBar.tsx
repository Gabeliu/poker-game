"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Link2, LogOut, Settings, Spade } from "lucide-react";
import { toast } from "sonner";
import type { ClientRoomView } from "@/lib/types";
import { HostRequestsPanel } from "./HostRequestsPanel";
import { HostSettingsDialog } from "./HostSettingsDialog";
import { LedgerPanel } from "./LedgerPanel";
import { BuyInDialog } from "./BuyInDialog";

interface TopBarProps {
  room: ClientRoomView;
  isHost: boolean;
  onResolveBuyIn: (requestId: string, approve: boolean) => void;
  onUpdateSettings: (settings: Partial<import("@/lib/types").RoomSettings>) => void;
  onRemovePlayer: (playerId: string) => void;
  onTransferOwnership: (playerId: string) => void;
  onRequestBuyIn: (amount: number, type: "initial" | "topup") => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function TopBar({
  room,
  isHost,
  onResolveBuyIn,
  onUpdateSettings,
  onRemovePlayer,
  onTransferOwnership,
  onRequestBuyIn,
}: TopBarProps) {
  const router = useRouter();
  const me = room.players.find((p) => p.id === room.you.playerId);
  const pendingMine = room.buyInRequests.find((r) => r.playerId === me?.id && r.status === "pending");

  const copyInvite = async () => {
    const url = `${window.location.origin}/table/${room.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy link — copy it from the address bar instead.");
    }
  };

  return (
    <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-card/60 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Spade className="h-5 w-5 shrink-0 text-[var(--gold)]" fill="currentColor" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{room.settings.roomName}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            Blinds {room.settings.smallBlind}/{room.settings.bigBlind} · {room.id}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <Button variant="outline" size="sm" className="border-white/15 bg-card/80 gap-1.5 px-2 sm:px-3" onClick={copyInvite}>
          <Link2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invite Friends</span>
        </Button>

        {me && (
          <BuyInDialog player={me} settings={room.settings} pendingRequest={pendingMine} onRequest={onRequestBuyIn}>
            <Button
              variant="outline"
              size="sm"
              data-testid="buyin-trigger"
              className="border-white/15 bg-card/80 px-2 sm:px-3"
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
              variant="outline"
              size="icon"
              data-testid="host-settings-trigger"
              className="border-white/15 bg-card/80"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </HostSettingsDialog>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => router.push("/")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
