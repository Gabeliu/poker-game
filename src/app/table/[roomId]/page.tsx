"use client";

import { use, useEffect, useState } from "react";
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
import { SeatClaimRequests } from "@/components/poker/SeatClaimRequests";
import { canResolveSeatClaim } from "@/lib/seatClaims";

export default function TablePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId: roomIdParam } = use(params);
  // Room ids are upper-case everywhere else (the server, the stored token
  // key); a hand-typed lower-case link has to mean the same table, or the
  // join succeeds while this page keeps waiting for a room id that never
  // matches and sits on the join form forever.
  const roomId = roomIdParam.toUpperCase();
  const router = useRouter();
  const room = useRoomStore((s) => s.room);
  const connected = useRoomStore((s) => s.connected);
  const joinError = useRoomStore((s) => s.joinError);
  const nameTaken = useRoomStore((s) => s.nameTaken);
  const seatClaim = useRoomStore((s) => s.seatClaim);
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
    chooseRunIt,
    leaveRoom,
    leaveSoon,
    cancelLeave,
    requestSeatClaim,
    cancelSeatClaim,
    resolveSeatClaim,
  } = useRoomStore.getState();

  // Seeded empty (not read from localStorage) so the client's first render
  // matches the server-rendered HTML exactly — localStorage isn't available
  // during SSR, and reading it in a useState initializer here caused a
  // hydration mismatch (and a visible flash) for returning players. The
  // real stored values are applied client-side, after mount, below.
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  // What to show while we aren't at the table yet:
  //  - "checking": nothing is known yet (the server render, and the first
  //    client render before localStorage has been read) — a neutral loading
  //    screen, never the join form;
  //  - "resuming": a saved seat for this room was found and is being reclaimed;
  //  - "form": there's genuinely nothing to resume, so ask for a name.
  // Starting on the form instead flashed "Join table" at a returning player
  // every time they opened or reloaded the page, before snapping to the table.
  const [entry, setEntry] = useState<"checking" | "resuming" | "form">("checking");
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    initListeners();
  }, [initListeners]);

  useEffect(() => {
    const stored = getStoredDisplayName();
    if (stored) setTimeout(() => setDisplayName(stored), 0);
  }, []);

  // Arriving at the table, and going away from it. Leaving by any route —
  // the browser's Back button, a link, not just the header's Leave button —
  // tells the server, so the seat shows as away instead of "connected" and
  // being dealt into hands nobody is there to play. (Closing the tab is
  // covered by the socket disconnecting.)
  useEffect(() => {
    cancelLeave();
    const departing = () => leaveSoon(roomId);
    // Already at this table (we just created it, or came straight back to
    // it) — the store has the live room, so there's nothing to rejoin, and
    // rejoining would announce "… reconnected" to everyone.
    const current = useRoomStore.getState().room;
    if (current && current.id === roomId && current.you.playerId) return departing;
    // Deferred a tick so these land as their own commit rather than
    // synchronously within the effect.
    if (!getStoredToken(roomId)) {
      setTimeout(() => setEntry("form"), 0);
      return departing;
    }
    setTimeout(() => setEntry("resuming"), 0);
    // Only a failure falls back to the form (where the reason is shown). On
    // success the loading screen stays up for the beat between the server's
    // "ok" and the room snapshot that follows it.
    void joinRoom(roomId, getStoredDisplayName() || "Player").then((res) => {
      if (!res.ok) setEntry("form");
    });
    return departing;
  }, [roomId, joinRoom, leaveSoon, cancelLeave]);

  useEffect(() => {
    for (const t of toasts) {
      if (t.variant === "error") toast.error(t.message);
      else if (t.variant === "success") toast.success(t.message);
      else toast(t.message);
      dismissToast(t.id);
    }
  }, [toasts, dismissToast]);

  const isJoined = room && room.id === roomId && room.you.playerId;
  // Once at the table, anything that takes us back out of it (the host
  // removing us, the table closing) should land on the join form with its
  // explanation — not on a loading screen that would never resolve.
  if (isJoined && entry !== "form") setEntry("form");
  if (isJoined && joining) setJoining(false);

  useGameAudio(isJoined ? room : null);

  const handleJoin = async () => {
    const name = displayName.trim();
    if (!name) return;
    setJoining(true);
    storeDisplayName(name);
    const res = await joinRoom(roomId, name);
    // On success the overlay stays until the room snapshot lands (cleared
    // above), so the form never flashes back in between.
    if (!res.ok) {
      setJoining(false);
      // A taken name gets its own explanation and next step on the form.
      if (res.code !== "name-taken") toast.error(res.error);
    }
  };

  // "That taken name is me" — offered only for the exact name just refused.
  const canAskForSeat =
    nameTaken !== null && nameTaken.toLowerCase() === displayName.trim().toLowerCase() && seatClaim.status === "idle";
  const [askingForSeat, setAskingForSeat] = useState(false);
  const handleAskForSeat = async () => {
    setAskingForSeat(true);
    await requestSeatClaim(roomId, displayName.trim());
    setAskingForSeat(false);
  };

  const handleLeave = () => {
    setLeaving(true);
    leaveRoom();
    router.push("/");
  };

  if (leaving || (!isJoined && entry !== "form")) {
    return (
      <main className="ambient-page-bg min-h-screen" data-testid="table-entry-loading">
        <LoadingExperience
          show
          text={leaving ? "Leaving table…" : entry === "resuming" ? "Reconnecting…" : "Finding your table…"}
        />
      </main>
    );
  }

  if (!isJoined) {
    return (
      <main className="ambient-page-bg flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <LoadingExperience show={joining || seatClaim.status === "approved"} text="Taking your seat…" />
        <div className="flex items-center gap-2">
          <Spade className="h-7 w-7 text-[var(--accent-lime)]" fill="currentColor" />
          <span className="text-xl font-bold text-[var(--text-primary)]">Felt</span>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[var(--surface-app)] p-6 shadow-2xl">
          <h1 className="mb-1 text-center text-lg font-semibold text-[var(--text-primary)]">Join table</h1>
          <p className="mb-4 text-center text-sm text-[var(--text-secondary)]">
            Room code{" "}
            <span className="font-mono font-semibold text-[var(--accent-lime)]">{roomId}</span>
          </p>

          {joinError && seatClaim.status !== "pending" && (
            <p role="alert" className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-center text-sm text-[var(--danger)]">
              {joinError === "Room not found."
                ? "This table isn't open any more — check the code, or ask the host for a new link."
                : joinError}
            </p>
          )}

          {/* The host said no: their reason, in their words. */}
          {seatClaim.status === "rejected" && (
            <div role="alert" data-testid="seat-claim-rejected" className="mb-3 rounded-md bg-[var(--danger)]/10 px-3 py-2 text-center text-sm text-[var(--danger)]">
              <p className="font-semibold">The host didn&rsquo;t give you {seatClaim.name}&rsquo;s seat.</p>
              <p className="mt-0.5">&ldquo;{seatClaim.reason}&rdquo;</p>
            </div>
          )}

          {/* That name is taken — possibly by this very person, in another
              browser. They can ask the host to hand the seat over. */}
          {canAskForSeat && (
            <div data-testid="seat-claim-offer" className="mb-4 rounded-xl border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/8 px-3 py-3 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Is that you?</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                If you joined as {nameTaken} from another browser or device, the host can give you that seat back, chips
                and all.
              </p>
              <Button
                variant="outline"
                className="mt-2.5 w-full border-[var(--accent-lime)]/50 text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/10 hover:text-[var(--accent-lime)]"
                disabled={askingForSeat || !connected}
                data-testid="seat-claim-request"
                onClick={handleAskForSeat}
              >
                Ask the host for my seat back
              </Button>
              <p className="mt-2 text-[11px] text-[var(--text-secondary)]">Not you? Just pick a different name.</p>
            </div>
          )}

          {seatClaim.status === "pending" ? (
            <div data-testid="seat-claim-pending" role="status" className="rounded-xl border border-white/10 bg-black/25 px-4 py-5 text-center">
              <span className="mx-auto mb-3 block h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-lime)]/30 border-t-[var(--accent-lime)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--text-primary)]">Asked the host for {seatClaim.name}&rsquo;s seat</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Waiting for them to answer. Keep this page open — you&rsquo;ll be seated the moment they approve.
              </p>
              <Button variant="ghost" size="sm" className="mt-3 text-[var(--text-secondary)]" data-testid="seat-claim-cancel" onClick={() => cancelSeatClaim(roomId)}>
                Cancel request
              </Button>
            </div>
          ) : (
          <>
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
          </>
          )}

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
  // One floating card at a time in that corner: a seat request waits on a
  // person who can't do anything else meanwhile, so it goes first (buy-in
  // requests stay reachable from the bell).
  const hasSeatClaimToAnswer = (room.seatClaims ?? []).some((claim) => canResolveSeatClaim(room, room.you.playerId, claim));

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
          onLeave={handleLeave}
          hideFloatingRequests={hasSeatClaimToAnswer}
        />
        <SeatClaimRequests
          room={room}
          onResolve={async (claimId, approve, reason) => {
            const res = await resolveSeatClaim(claimId, approve, reason);
            if (!res.ok) toast.error(res.error);
          }}
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

          <div className={`action-area${room.hand.activePlayerId === room.you.playerId ? " action-area-my-turn" : ""}`}>
            <ActionDock
              room={room}
              isHost={isHost}
              onAction={submitAction}
              onStartHand={startHand}
              onSitOut={sitOut}
              onRequestBuyIn={requestBuyIn}
              onChooseRunIt={chooseRunIt}
            />
          </div>
        </AppShell>
      </div>
    </main>
  );
}
