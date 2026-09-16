"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
  }
  return socket;
}

export function tokenStorageKey(roomId: string): string {
  return `poker:token:${roomId.toUpperCase()}`;
}

export function getStoredToken(roomId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(tokenStorageKey(roomId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeToken(roomId: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tokenStorageKey(roomId), token);
  } catch {
    // ignore (private browsing etc.)
  }
}

export function clearStoredToken(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(tokenStorageKey(roomId));
  } catch {
    // ignore
  }
}

export function getStoredDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("poker:displayName") ?? "";
  } catch {
    return "";
  }
}

export function storeDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("poker:displayName", name);
  } catch {
    // ignore
  }
}
