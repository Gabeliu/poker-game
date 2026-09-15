"use client";

import { create } from "zustand";
import type {
  ActionRequest,
  BuyInRequestType,
  ClientRoomView,
  RoomSettings,
} from "@/lib/types";
import { getSocket, getStoredToken, storeToken } from "@/lib/socketClient";

type Ack = { ok: true } | { ok: false; error: string };

interface RoomStoreState {
  room: ClientRoomView | null;
  myPlayerId: string | null;
  connected: boolean;
  joinError: string | null;
  toasts: { id: number; message: string; variant?: "default" | "success" | "error" }[];

  initListeners: () => void;
  createRoom: (displayName: string, settings: Partial<RoomSettings>) => Promise<Ack & { roomId?: string }>;
  joinRoom: (roomId: string, displayName: string) => Promise<Ack>;
  requestBuyIn: (amount: number, type: BuyInRequestType) => Promise<Ack>;
  resolveBuyIn: (requestId: string, approve: boolean) => Promise<Ack>;
  updateSettings: (settings: Partial<RoomSettings>) => Promise<Ack>;
  startHand: () => Promise<Ack>;
  removePlayer: (playerId: string) => Promise<Ack>;
  transferOwnership: (playerId: string) => Promise<Ack>;
  sitOut: (sittingOut: boolean) => Promise<Ack>;
  submitAction: (action: ActionRequest) => Promise<Ack>;
  dismissToast: (id: number) => void;
}

let listenersInitialized = false;
let toastCounter = 0;

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  room: null,
  myPlayerId: null,
  connected: false,
  joinError: null,
  toasts: [],

  initListeners: () => {
    if (listenersInitialized) return;
    listenersInitialized = true;
    const socket = getSocket();

    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));
    socket.on("room:state", (view) => set({ room: view, myPlayerId: view.you.playerId }));
    socket.on("room:error", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.message, variant: "error" }] }));
    });
    socket.on("room:closed", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.reason, variant: "error" }] }));
    });
    socket.on("toast", (payload) => {
      const id = ++toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, message: payload.message, variant: payload.variant }] }));
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
  submitAction: (action) => emitWithAck("action:submit", { roomId: get().room!.id, action }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

function emitWithAck<K extends string, P>(event: K, payload: P): Promise<Ack> {
  return new Promise((resolve) => {
    const socket = getSocket();
    // @ts-expect-error -- generic emit wrapper across many differently-shaped events
    socket.emit(event, payload, (res: Ack) => resolve(res));
  });
}
