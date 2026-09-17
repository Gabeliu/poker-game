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
import { AppShell } from "@/components/poker/AppShell";
import { HandHistoryPanel } from "@/components/poker/HandHistoryPanel";
import { PlayerListPanel } from "@/components/poker/PlayerListPanel";
import { ChatPanel } from "@/components/poker/ChatPanel";
import { LoadingExperience } from "@/components/poker/LoadingExperience";
import { useGameAudio } from "@/hooks/useGameAudio";

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
    sendChat,
    takeSeat,
  } = useRoomStore.getState();

  // Seeded empty (not read from localStorage) so the client's first render
  // matches the server-rendered HTML exactly — localStorage isn't available
  // during SSR, and reading it in a useState initializer here caused a
  // hydration mismatch (and a visible flash) for returning players. The
  // real stored values are applied client-side, after mount, below.
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const attemptedAutoJoin = useRef(false);

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  useEffect(() => {
    const stored = getStoredDisplayName();
    if (stored) setTimeout(() => setDisplayName(stored), 0);
  }, []);

  useEffect(() => {
    if (attemptedAutoJoin.current) return;
    const hasToken = Boolean(getStoredToken(roomId));
    if (hasToken) {
      attemptedAutoJoin.current = true;
      setTimeout(() => setReconnecting(true), 0);
      joinRoom(roomId, getStoredDisplayName() || "Player").finally(() => setReconnecting(false));
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

  useGameAudio(isJoined ? room : null);

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
        <LoadingExperience
          show={reconnecting || joining}
          text={reconnecting ? "Reconnecting…" : "Taking your seat…"}
        />
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

  const handleSit = async (seat: Parameters<typeof takeSeat>[0]) => {
    const res = await takeSeat(seat);
    if (!res.ok) toast.error(res.error);
  };

  return (
    <main className="ambient-page-bg game-page">
      <div className="game-client">
        <RoomControls
          room={room}
          isHost={isHost}
          onResolveBuyIn={resolveBuyIn}
          onUpdateSettings={updateSettings}
          onRemovePlayer={removePlayer}
          onTransferOwnership={transferOwnership}
        />

        <AppShell
          left={
            <>
              <HandHistoryPanel entries={room.you.handHistory} />
              <PlayerListPanel players={room.players} meId={room.you.playerId} />
            </>
          }
          right={<ChatPanel messages={room.chatMessages} meId={room.you.playerId} onSend={sendChat} />}
        >
          <div className="table-stage">
            <HostDisconnectedBanner room={room} />
            <PokerTable room={room} isHost={isHost} onRemovePlayer={removePlayer} onSit={handleSit} onStartHand={startHand} />
          </div>

          <div className="action-area">
            <ActionDock
              room={room}
              isHost={isHost}
              onAction={submitAction}
              onStartHand={startHand}
              onSitOut={sitOut}
              onRequestBuyIn={requestBuyIn}
            />
          </div>
        </AppShell>
      </div>
    </main>
  );
}
