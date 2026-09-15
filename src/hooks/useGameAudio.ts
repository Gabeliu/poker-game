"use client";

import { useEffect, useRef } from "react";
import type { ClientRoomView, HandPhase, HandResult } from "@/lib/types";
import { audioManager } from "@/audio/AudioManager";
import { panForPlayer } from "@/lib/seatLayout";

interface PlayerSnapshot {
  handStatus: string;
  currentBet: number;
  hasActedThisStreet: boolean;
}

function snapshotPlayers(room: ClientRoomView): Map<string, PlayerSnapshot> {
  const map = new Map<string, PlayerSnapshot>();
  for (const p of room.players) {
    map.set(p.id, { handStatus: p.handStatus, currentBet: p.currentBet, hasActedThisStreet: p.hasActedThisStreet });
  }
  return map;
}

const DEALT_PHASES = new Set<HandPhase>(["flop", "turn", "river", "showdown"]);

/**
 * Fires semantic sound events by diffing consecutive authoritative
 * `ClientRoomView` broadcasts — this is the single place that decides *when*
 * a sound plays; components never call audioManager directly for gameplay
 * sounds. The first snapshot after mount (a fresh join, or a reconnect) is
 * recorded as a silent baseline so history never gets replayed as sound.
 */
export function useGameAudio(room: ClientRoomView | null): void {
  const initializedRef = useRef(false);
  const prevPlayersRef = useRef<Map<string, PlayerSnapshot>>(new Map());
  const prevPhaseRef = useRef<HandPhase | null>(null);
  const prevActivePlayerRef = useRef<string | null>(null);
  const prevResultRef = useRef<HandResult | null>(null);
  const prevBuyInRef = useRef<Map<string, string>>(new Map());
  const prevChatCountRef = useRef(0);

  useEffect(() => {
    audioManager.attachUnlockListeners();
  }, []);

  useEffect(() => {
    if (!room) return;
    const meId = room.you.playerId;

    if (!initializedRef.current) {
      initializedRef.current = true;
      prevPlayersRef.current = snapshotPlayers(room);
      prevPhaseRef.current = room.hand.phase;
      prevActivePlayerRef.current = room.hand.activePlayerId;
      prevResultRef.current = room.hand.result;
      prevBuyInRef.current = new Map(room.buyInRequests.map((r) => [r.id, r.status]));
      prevChatCountRef.current = room.chatMessages.length;
      return;
    }

    const prevPlayers = prevPlayersRef.current;
    const nextPlayers = snapshotPlayers(room);

    for (const p of room.players) {
      // The viewer's own actions are sounded optimistically from the action
      // buttons the instant the server accepts them (see PokerActions) —
      // deliberately not re-derived here, since an action that completes a
      // betting round advances the street within that same broadcast,
      // leaving no intermediate state for a diff to find.
      if (p.id === meId) continue;
      const prev = prevPlayers.get(p.id);
      if (!prev) continue;
      const cur = nextPlayers.get(p.id)!;
      const pan = panForPlayer(room.players, meId, p.id);
      if (cur.handStatus === "folded" && prev.handStatus !== "folded") {
        audioManager.play("fold", { pan });
      } else if (cur.handStatus === "all-in" && prev.handStatus !== "all-in") {
        audioManager.play("all-in", { pan });
      } else if (cur.hasActedThisStreet && !prev.hasActedThisStreet) {
        if (cur.currentBet === prev.currentBet) {
          audioManager.play("check", { pan });
        } else if (p.id === room.hand.lastAggressorId) {
          audioManager.play("raise", { pan });
        } else {
          audioManager.play("call", { pan });
        }
      }
    }

    for (const p of room.players) {
      if (p.id !== meId && !prevPlayers.has(p.id)) audioManager.play("player-join");
    }
    for (const id of prevPlayers.keys()) {
      if (id !== meId && !nextPlayers.has(id)) audioManager.play("player-leave");
    }

    if (room.hand.phase !== prevPhaseRef.current) {
      if (room.hand.phase === "preflop") audioManager.play("hand-start");
      else if (DEALT_PHASES.has(room.hand.phase)) audioManager.play(room.hand.phase as "flop" | "turn" | "river" | "showdown");
    }

    if (room.hand.activePlayerId === meId && prevActivePlayerRef.current !== meId) {
      audioManager.play("your-turn");
    }

    if (room.hand.result && room.hand.result !== prevResultRef.current) {
      audioManager.play("pot-collect");
      audioManager.play("winner", { delaySeconds: 0.25 });
      for (const w of room.hand.result.winners) {
        audioManager.play("pot-win", { pan: panForPlayer(room.players, meId, w.playerId), delaySeconds: 0.15 });
      }
    }

    const isHost = room.hostPlayerId === meId;
    for (const r of room.buyInRequests) {
      const prevStatus = prevBuyInRef.current.get(r.id);
      if (prevStatus === undefined && r.status === "pending" && isHost) {
        audioManager.play("buyin-request");
      } else if (prevStatus === "pending" && r.status === "approved" && r.playerId === meId) {
        audioManager.play("buyin-approved");
      } else if (prevStatus === "pending" && r.status === "rejected" && r.playerId === meId) {
        audioManager.play("buyin-rejected");
      }
    }

    if (room.chatMessages.length > prevChatCountRef.current) {
      audioManager.play("chat-message");
    }

    prevPlayersRef.current = nextPlayers;
    prevPhaseRef.current = room.hand.phase;
    prevActivePlayerRef.current = room.hand.activePlayerId;
    prevResultRef.current = room.hand.result;
    prevBuyInRef.current = new Map(room.buyInRequests.map((r) => [r.id, r.status]));
    prevChatCountRef.current = room.chatMessages.length;
  }, [room]);

  const turnDeadline = room?.hand.turnDeadline ?? null;
  const isMyTurn = Boolean(room && room.hand.activePlayerId === room.you.playerId);

  useEffect(() => {
    if (!isMyTurn || !turnDeadline) return;
    const remaining = turnDeadline - Date.now();
    const fireAt = remaining - 5000;
    if (fireAt <= 0) return;
    const timeoutId = window.setTimeout(() => audioManager.play("timer-low"), fireAt);
    return () => window.clearTimeout(timeoutId);
  }, [isMyTurn, turnDeadline]);
}
