/**
 * Real-time event contract shared by server and client.
 *
 * Naming convention: client -> server events are commands ("room:create",
 * "action:submit"); server -> client events are facts that already
 * happened ("room:state", "buyin:requested"). The client never mutates
 * game state locally from a command; it always waits for the server's
 * broadcast to update the UI (server is the single source of truth).
 */

import type { ActionRequest, BuyInRequestType, ClientRoomView, RoomSettings, RunItChoice, SeatNumber } from "./types";

// ---- Client -> Server ----

export interface ClientToServerEvents {
  "room:create": (
    payload: { displayName: string; settings: Partial<RoomSettings> },
    ack: (res: { ok: true; roomId: string; playerId: string; playerToken: string } | { ok: false; error: string }) => void
  ) => void;

  "room:join": (
    payload: { roomId: string; displayName: string; playerToken?: string },
    ack: (
      res:
        | { ok: true; playerId: string; playerToken: string }
        // "name-taken": someone at the table already has that name — which
        // may be this very person, from another browser (see seatClaim:*).
        | { ok: false; error: string; code?: "name-taken" }
    ) => void
  ) => void;

  /** "That taken name is me — give me my seat back." Opens a request that
   * the host answers; the asker hears back via seatClaim:approved/rejected. */
  "seatClaim:request": (
    payload: { roomId: string; displayName: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** The asker changed their mind. */
  "seatClaim:cancel": (
    payload: { roomId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** The host's answer. `reason` is shown to the asker when rejecting. */
  "seatClaim:resolve": (
    payload: { roomId: string; claimId: string; approve: boolean; reason?: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** The player is walking away from the table (the "Leave table" button).
   * Their seat, chips and token are kept — they're just marked offline, the
   * same as a dropped connection, and stop receiving this room's state. */
  "room:leave": (
    payload: { roomId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "buyin:request": (
    payload: { roomId: string; amount: number; type: BuyInRequestType },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "buyin:resolve": (
    payload: { roomId: string; requestId: string; approve: boolean },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "host:updateSettings": (
    payload: { roomId: string; settings: Partial<RoomSettings> },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "host:startHand": (
    payload: { roomId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "host:removePlayer": (
    payload: { roomId: string; playerId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "host:transferOwnership": (
    payload: { roomId: string; playerId: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "seat:take": (
    payload: { roomId: string; seat: SeatNumber },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "player:sitOut": (
    payload: { roomId: string; sittingOut: boolean },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "action:submit": (
    payload: { roomId: string; action: ActionRequest },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  "chat:send": (
    payload: { roomId: string; text: string },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** Asks for the current authoritative snapshot without the side effects of
   * room:join (no display-name validation, no room-wide toast/broadcast
   * unless a genuine disconnect->reconnect transition is happening). Used
   * to resync after a mobile tab was backgrounded, on window focus, and on
   * the underlying socket reconnecting. */
  "room:resync": (
    payload: { roomId: string; playerToken?: string },
    ack: (res: { ok: true; view: ClientRoomView } | { ok: false; error: string }) => void
  ) => void;

  "runIt:choose": (
    payload: { roomId: string; choice: RunItChoice },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
}

// ---- Server -> Client ----

export interface ServerToClientEvents {
  /** Full authoritative room snapshot, sent on connect/join and after every mutation. */
  "room:state": (view: ClientRoomView) => void;
  "room:error": (payload: { message: string }) => void;
  "room:closed": (payload: { reason: string }) => void;
  /** Sent only to the specific player the host just removed, on their own
   * (still-open) connection — distinct from "room:closed", which is about
   * the whole room. Tells that one client to reset back to a fresh join. */
  "you:removed": (payload: { reason: string }) => void;
  "toast": (payload: { message: string; variant?: "default" | "success" | "error" }) => void;
  /** To the asker only: the seat is theirs — this token now opens it. */
  "seatClaim:approved": (payload: { roomId: string; playerToken: string }) => void;
  /** To the asker only: turned down, with the host's reason. */
  "seatClaim:rejected": (payload: { roomId: string; reason: string }) => void;
}

// Not used (single-process server); reserved for future horizontal scaling
// (e.g. broadcasting between server instances behind a shared adapter).
export type InterServerEvents = Record<string, never>;

export interface SocketData {
  roomId?: string;
  playerId?: string;
  playerToken?: string;
}
