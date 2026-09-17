"use client";

import { create } from "zustand";
import type {
  ActionRequest,
  BuyInRequestType,
  ClientRoomView,
  RoomSettings,
  RunItChoice,
  SeatNumber,
} from "@/lib/types";
import { clearStoredToken, getSocket, getStoredDisplayName, getStoredToken, storeToken } from "@/lib/socketClient";

type Ack = { ok: true } | { ok: false; error: string };

interface RoomStoreState {
  room: ClientRoomView | null;
  myPlayerId: string | null;
  connected: boolean;
  joinError: string | null;
  toasts: { id: number; message: string; variant?: "default" | "success" | "error" }[];
  /** Bumped every time a resync (as opposed to a normal room:state push)
   * lands — presentation code (e.g. the transient status-pill labels) uses
   * this to reset its own diffing instead of comparing across the gap. */
  resyncNonce: number;
  /** The highest ClientRoomView.stateVersion applied so far — guards against
   * a slow resync ack landing after a newer room:state push already did. */
  appliedStateVersion: number;

  initListeners: () => void;
  /** Re-fetches the current authoritative snapshot without going through
   * room:join's side effects. Called on tab focus/visibility, network
   * "online", and the socket reconnecting — safe to call anytime, a no-op
   * if there's no room to resync. */
  resync: () => void;
  createRoom: (displayName: string, settings: Partial<RoomSettings>) => Promise<Ack & { roomId?: string }>;
  joinRoom: (roomId: string, displayName: string) => Promise<Ack>;
  requestBuyIn: (amount: number, type: BuyInRequestType) => Promise<Ack>;
  resolveBuyIn: (requestId: string, approve: boolean) => Promise<Ack>;
  updateSettings: (settings: Partial<RoomSettings>) => Promise<Ack>;
  startHand: () => Promise<Ack>;
  removePlayer: (playerId: string) => Promise<Ack>;
  transferOwnership: (playerId: string) => Promise<Ack>;
  sitOut: (sittingOut: boolean) => Promise<Ack>;
  takeSeat: (seat: SeatNumber) => Promise<Ack>;
  submitAction: (action: ActionRequest) => Promise<Ack>;
  chooseRunIt: (choice: RunItChoice) => Promise<Ack>;
  sendChat: (text: string) => Promise<Ack>;
  dismissToast: (id: number) => void;
}

let listenersInitialized = false;
let toastCounter = 0;
let lastResyncAt = 0;

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  room: null,
  myPlayerId: null,
  connected: false,
  joinError: null,
  toasts: [],
  resyncNonce: 0,
  appliedStateVersion: -1,

  initListeners: () => {
    if (listenersInitialized) return;
    listenersInitialized = true;
    const socket = getSocket();

    socket.on("connect", () => {
      set({ connected: true });
      get().resync();
    });
    socket.on("disconnect", () => set({ connected: false }));
    socket.on("room:state", (view) => applyView(set, get, view));

    // The root cause of the mobile "frozen after backgrounding" bug:
    // socket.io auto-reconnects the underlying transport on its own, but
    // that's a silent transport-level event — nothing re-links this socket
    // to its player or re-sends state unless something explicitly asks.
    // Cover every way a client can come back from being away: the socket
    // itself reconnecting, the tab regaining focus/visibility, or the
    // network coming back online.
    socket.io.on("reconnect", () => get().resync());
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") get().resync();
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", () => get().resync());
      window.addEventListener("online", () => get().resync());
    }

    socket.on("room:error", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.message, variant: "error" }] }));
    });
    socket.on("room:closed", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.reason, variant: "error" }] }));
    });
    socket.on("you:removed", (payload) => {
      const id = ++toastCounter;
      const roomId = get().room?.id;
      if (roomId) clearStoredToken(roomId);
      // Reset back to a clean, unjoined state — without this, the page kept
      // showing the (now-broken) table view: `room.you.playerId` stayed set
      // to an id that no longer matched any player, so every control tied
      // to "me" silently vanished with no way to rejoin or buy back in.
      set((s) => ({
        room: null,
        myPlayerId: null,
        toasts: [...s.toasts, { id, message: payload.reason, variant: "error" }],
      }));
    });
    socket.on("toast", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.message, variant: payload.variant }] }));
    });
  },

  resync: () => {
    const roomId = get().room?.id;
    if (!roomId) return;
    // visibilitychange and focus commonly fire together for the same
    // event (a tab regaining focus fires both) — one resync covers both.
    const now = Date.now();
    if (now - lastResyncAt < 750) return;
    lastResyncAt = now;

    const socket = getSocket();
    if (!socket.connected) return; // the "connect"/"reconnect" handler will fire this itself
    socket.emit("room:resync", { roomId, playerToken: getStoredToken(roomId) }, (res) => {
      if (res.ok) {
        applyView(set, get, res.view, { fromResync: true });
      } else {
        // The server didn't recognize this socket/token pair at all (e.g. it
        // restarted and lost its token map) — fall back to a real join,
        // which re-validates and re-links from scratch.
        const name = getStoredDisplayName() || "Player";
        void get().joinRoom(roomId, name);
      }
    });
  },

  createRoom: (displayName, settings) =>
    new Promise((resolve) => {
      const socket = getSocket();
      socket.emit("room:create", { displayName, settings }, (res) => {
        if (res.ok) {
          storeToken(res.roomId, res.playerToken);
          set({ myPlayerId: res.playerId });
          resolve({ ok: true, roomId: res.roomId });
        } else {
          set({ joinError: res.error });
          resolve(res);
        }
      });
    }),

  joinRoom: (roomId, displayName) =>
    new Promise((resolve) => {
      const socket = getSocket();
      const token = getStoredToken(roomId);
      socket.emit("room:join", { roomId, displayName, playerToken: token }, (res) => {
        if (res.ok) {
          storeToken(roomId, res.playerToken);
          set({ myPlayerId: res.playerId, joinError: null });
          resolve({ ok: true });
        } else {
          set({ joinError: res.error });
          resolve(res);
        }
      });
    }),

  requestBuyIn: (amount, type) =>
    emitWithAck("buyin:request", { roomId: get().room!.id, amount, type }),
  resolveBuyIn: (requestId, approve) =>
    emitWithAck("buyin:resolve", { roomId: get().room!.id, requestId, approve }),
  updateSettings: (settings) =>
    emitWithAck("host:updateSettings", { roomId: get().room!.id, settings }),
  startHand: () => emitWithAck("host:startHand", { roomId: get().room!.id }),
  removePlayer: (playerId) => emitWithAck("host:removePlayer", { roomId: get().room!.id, playerId }),
  transferOwnership: (playerId) => emitWithAck("host:transferOwnership", { roomId: get().room!.id, playerId }),
  sitOut: (sittingOut) => emitWithAck("player:sitOut", { roomId: get().room!.id, sittingOut }),
  takeSeat: (seat) => emitWithAck("seat:take", { roomId: get().room!.id, seat }),
  submitAction: (action) => emitWithAck("action:submit", { roomId: get().room!.id, action }),
  chooseRunIt: (choice) => emitWithAck("runIt:choose", { roomId: get().room!.id, choice }),
  sendChat: (text) => emitWithAck("chat:send", { roomId: get().room!.id, text }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

function emitWithAck<K extends string, P>(event: K, payload: P): Promise<Ack> {
  return new Promise((resolve) => {
    const socket = getSocket();
    // @ts-expect-error -- generic emit wrapper across many differently-shaped events
    socket.emit(event, payload, (res: Ack) => resolve(res));
  });
}

/** The single place a fresh server snapshot gets applied, whether it arrived
 * via the normal room:state push or a resync ack — always a full replace
 * (the client never computes state locally), guarded against a stale view
 * (lower stateVersion) landing after a newer one already did. Resync-sourced
 * views also bump resyncNonce so presentation-only diffing (e.g. the
 * transient status-pill labels) knows to reseed instead of comparing across
 * whatever gap just happened. */
function applyView(
  set: (partial: Partial<RoomStoreState>) => void,
  get: () => RoomStoreState,
  view: ClientRoomView,
  opts?: { fromResync?: boolean }
): void {
  const current = get();
  if (current.room?.id === view.id && view.stateVersion < current.appliedStateVersion) return;
  set({
    room: view,
    myPlayerId: view.you.playerId,
    appliedStateVersion: view.stateVersion,
    resyncNonce: opts?.fromResync ? current.resyncNonce + 1 : current.resyncNonce,
  });
}
