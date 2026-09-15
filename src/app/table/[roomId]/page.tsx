"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spade } from "lucide-react";
import { useRoomStore } from "@/hooks/useRoomStore";
import { getStoredDisplayName, getStoredToken, storeDisplayName } from "@/lib/socketClient";
import { RoomControls } from "@/components/poker/RoomControls";
import { PokerTable } from "@/components/poker/PokerTable";
import { ActionDock } from "@/components/poker/ActionDock";
import { HostDisconnectedBanner } from "@/components/poker/HostDisconnectedBanner";

export default function TablePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const room = useRoomStore((s) => s.room);
  const connected = useRoomStore((s) => s.connected);
  const joinError = useRoomStore((s) => s.joinError);
  const toasts = useRoomStore((s) => s.toasts);
  const dismissToast = useRoomStore((s) => s.dismissToast);
  const {
    initListeners,
    joinRoom,
    requestBuyIn,
    resolveBuyIn,
    updateSettings,
    startHand,
    removePlayer,
    transferOwnership,
    sitOut,
    submitAction,
  } = useRoomStore.getState();

  const [displayName, setDisplayName] = useState(() => getStoredDisplayName());
  const [joining, setJoining] = useState(false);
  const attemptedAutoJoin = useRef(false);

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  useEffect(() => {
    if (attemptedAutoJoin.current) return;
    const hasToken = Boolean(getStoredToken(roomId));
    if (hasToken) {
      attemptedAutoJoin.current = true;
      joinRoom(roomId, getStoredDisplayName() || "Player");
    }
  }, [roomId, joinRoom]);

  useEffect(() => {
    for (const t of toasts) {
      if (t.variant === "error") toast.error(t.message);
      else toast(t.message);
      dismissToast(t.id);
    }
  }, [toasts, dismissToast]);

  const isJoined = room && room.id === roomId && room.you.playerId;

  const handleJoin = async () => {
    const name = displayName.trim();
    if (!name) return;
    setJoining(true);
    storeDisplayName(name);
    const res = await joinRoom(roomId, name);
    setJoining(false);
    if (!res.ok) {
      toast.error(res.error);
    }
  };

  if (!isJoined) {
    return (
      <main className="ambient-page-bg flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <div className="flex items-center gap-2">
          <Spade className="h-7 w-7 text-[var(--accent-lime)]" fill="currentColor" />
          <span className="text-xl font-bold text-[var(--text-primary)]">Felt</span>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[var(--surface-app)] p-6 shadow-2xl">
          <h1 className="mb-1 text-center text-lg font-semibold text-[var(--text-primary)]">Join table</h1>
          <p className="mb-4 text-center text-sm text-[var(--text-secondary)]">
            Room code{" "}
            <span className="font-mono font-semibold text-[var(--accent-lime)]">{roomId.toUpperCase()}</span>
          </p>

          {joinError && (
            <p className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-center text-sm text-[var(--danger)]">
              {joinError}
            </p>
          )}

          <div className="grid gap-1.5 mb-4">
            <Label htmlFor="name">Your display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Gabriel"
              maxLength={24}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>

          <Button
            className="w-full bg-[var(--accent-lime)] text-[var(--accent-lime-foreground)] hover:bg-[var(--accent-lime)]/90 font-semibold"
            disabled={!displayName.trim() || joining || !connected}
            data-testid="table-join-submit"
            onClick={handleJoin}
          >
            {connected ? "Join Table" : "Connecting…"}
          </Button>

          <button
            className="mt-3 w-full text-center text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => router.push("/")}
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }

  const isHost = room.hostPlayerId === room.you.playerId;

  return (
    <main className="ambient-page-bg flex min-h-screen items-center justify-center p-2 sm:p-5">
      <div className="relative flex h-[calc(100vh-1rem)] w-full max-w-[1400px] flex-col overflow-hidden rounded-[28px] border border-white/8 bg-[var(--surface-app)] shadow-[0_40px_100px_rgba(0,0,0,0.6)] sm:h-[calc(100vh-2.5rem)] sm:rounded-[36px]">
        <RoomControls
          room={room}
          isHost={isHost}
          onResolveBuyIn={resolveBuyIn}
          onUpdateSettings={updateSettings}
          onRemovePlayer={removePlayer}
          onTransferOwnership={transferOwnership}
          onRequestBuyIn={requestBuyIn}
        />

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-3 py-2 sm:px-6">
          <HostDisconnectedBanner room={room} />
          <PokerTable room={room} canHostRemove={isHost} onRemovePlayer={removePlayer} />
        </div>

        <div className="px-3 pb-4 sm:px-6 sm:pb-6">
          <ActionDock room={room} isHost={isHost} onAction={submitAction} onStartHand={startHand} onSitOut={sitOut} />
        </div>
      </div>
    </main>
  );
}
