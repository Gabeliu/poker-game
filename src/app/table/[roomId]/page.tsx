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
import { TopBar } from "@/components/poker/TopBar";
import { PokerTable } from "@/components/poker/PokerTable";
import { ActionDock } from "@/components/poker/ActionDock";

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
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
        <div className="flex items-center gap-2">
          <Spade className="h-7 w-7 text-[var(--gold)]" fill="currentColor" />
          <span className="text-xl font-bold">Felt</span>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card/80 p-6 shadow-xl">
          <h1 className="mb-1 text-center text-lg font-semibold">Join table</h1>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Room code <span className="font-mono font-semibold text-[var(--gold)]">{roomId.toUpperCase()}</span>
          </p>

          {joinError && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
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
            className="w-full bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90 font-semibold"
            disabled={!displayName.trim() || joining || !connected}
            data-testid="table-join-submit"
            onClick={handleJoin}
          >
            {connected ? "Join Table" : "Connecting…"}
          </Button>

          <button
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
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
    <main className="flex min-h-screen flex-col bg-background">
      <TopBar
        room={room}
        isHost={isHost}
        onResolveBuyIn={resolveBuyIn}
        onUpdateSettings={updateSettings}
        onRemovePlayer={removePlayer}
        onTransferOwnership={transferOwnership}
        onRequestBuyIn={requestBuyIn}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-4 min-h-0">
        <PokerTable room={room} canHostRemove={isHost} onRemovePlayer={removePlayer} />
        <div className="w-full">
          <ActionDock room={room} isHost={isHost} onAction={submitAction} onStartHand={startHand} onSitOut={sitOut} />
        </div>
      </div>
    </main>
  );
}
