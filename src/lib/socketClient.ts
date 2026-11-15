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

/** The seat token is also kept in a cookie. Some browsers and privacy modes
 * refuse localStorage outright while still allowing cookies; without a second
 * copy, a reload there forgot the seat, and rejoining failed with "that name
 * is already taken" — by the player's own stranded seat. */
function tokenCookieName(roomId: string): string {
  return `poker_token_${roomId.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
}
const TOKEN_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function readCookie(name: string): string | undefined {
  try {
    const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
  } catch {
    return undefined;
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  } catch {
    // ignore — cookies blocked too; the seat just won't survive a reload
  }
}

export function getStoredToken(roomId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(tokenStorageKey(roomId));
    if (stored) return stored;
  } catch {
    // fall through to the cookie copy
  }
  return readCookie(tokenCookieName(roomId));
}

export function storeToken(roomId: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tokenStorageKey(roomId), token);
  } catch {
    // ignore (private browsing etc.) — the cookie copy below still applies
  }
  writeCookie(tokenCookieName(roomId), token, TOKEN_COOKIE_MAX_AGE_SECONDS);
}

export function clearStoredToken(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(tokenStorageKey(roomId));
  } catch {
    // ignore
  }
  writeCookie(tokenCookieName(roomId), "", 0);
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
