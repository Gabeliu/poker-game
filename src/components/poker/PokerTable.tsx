"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientRoomView } from "@/lib/types";
import { computeArcPositions, type ArcPosition } from "@/lib/seatLayout";
import { copyInviteLink } from "@/lib/invite";
import { usePlayerStatusLabels } from "@/hooks/usePlayerStatusLabels";
import { PlayerSeat } from "./PlayerSeat";
import { EmptySeat } from "./EmptySeat";
import { CommunityCards } from "./CommunityCards";
import { Pot } from "./Pot";
import { HoleCards } from "./HoleCards";
import { ChipFlight } from "./ChipFlight";
import { Deck } from "./Deck";
import { Spade } from "lucide-react";

/** Where the pot visually sits within the table, in the same xPct/yPct
 * coordinate space as seat positions — used as the destination for bet
 * flights and the origin for payout flights. */
const POT_POINT: ArcPosition = { xPct: 50, yPct: 40 };
/** The viewer isn't seated on the ring (see seatLayout.ts) — their chip
 * flights originate/land at their hole-card position instead. */
const SELF_POINT: ArcPosition = { xPct: 50, yPct: 91 };

interface Flight {
  id: string;
  from: ArcPosition;
  to: ArcPosition;
  amount: number;
}

interface PokerTableProps {
  room: ClientRoomView;
  canHostRemove: boolean;
  onRemovePlayer: (playerId: string) => void;
}

function densityFor(seatCount: number): "roomy" | "cozy" | "tight" {
  if (seatCount <= 4) return "roomy";
  if (seatCount <= 7) return "cozy";
  return "tight";
}

/** How many empty invite-seats to show so the waiting room never looks like
 * a near-empty oval — padded up to this minimum, never removed once real
 * players exceed it. */
const MIN_LOBBY_SEATS = 4;

export function PokerTable({ room, canHostRemove, onRemovePlayer }: PokerTableProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const others = [...room.players.filter((p) => p.id !== room.you.playerId)].sort((a, b) => a.seat - b.seat);
  const isLobby = room.status === "lobby" && room.hand.phase === "waiting";
  const emptySeatCount = isLobby ? Math.max(0, MIN_LOBBY_SEATS - room.players.length) : 0;
  const totalSlots = others.length + emptySeatCount;
  const positions = computeArcPositions(totalSlots);
  const handInProgress = room.hand.phase !== "waiting" && room.hand.phase !== "hand-complete";
  const density = densityFor(totalSlots);
  const statusLabels = usePlayerStatusLabels(room.players, room.hand.lastAggressorId);

  const seatPointFor = (playerId: string): ArcPosition | null => {
    if (playerId === room.you.playerId) return SELF_POINT;
    const idx = others.findIndex((p) => p.id === playerId);
    return idx === -1 ? null : positions[idx];
  };

  const [flights, setFlights] = useState<Flight[]>([]);
  const prevBetsRef = useRef<Record<string, number>>({});
  const prevHandNumberRef = useRef(room.hand.handNumber);
  const prevResultRef = useRef(room.hand.result);

  const betSignature = room.players.map((p) => `${p.id}:${p.currentBet}`).join("|");

  useEffect(() => {
    const spawned: Flight[] = [];
    for (const p of room.players) {
      const prev = prevBetsRef.current[p.id] ?? 0;
      if (p.currentBet > prev) {
        const from = seatPointFor(p.id);
        if (from) {
          spawned.push({ id: `bet-${p.id}-${Date.now()}`, from, to: POT_POINT, amount: p.currentBet - prev });
        }
      }
      prevBetsRef.current[p.id] = p.currentBet;
    }
    if (room.hand.handNumber !== prevHandNumberRef.current) {
      prevBetsRef.current = {};
      prevHandNumberRef.current = room.hand.handNumber;
    }
    if (spawned.length > 0) {
      // Deferred a tick so the update lands as its own commit rather than
      // synchronously within this effect's execution.
      setTimeout(() => setFlights((f) => [...f, ...spawned]), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the bet signature string, not the individual arrays it derives from
  }, [betSignature]);

  useEffect(() => {
    const result = room.hand.result;
    if (result && result !== prevResultRef.current) {
      const spawned: Flight[] = result.winners
        .map((w) => {
          const to = seatPointFor(w.playerId);
          return to ? { id: `win-${w.playerId}-${w.potId}-${Date.now()}`, from: POT_POINT, to, amount: w.amount } : null;
        })
        .filter((f): f is Flight => f !== null);
      if (spawned.length > 0) {
        setTimeout(() => setFlights((f) => [...f, ...spawned]), 0);
      }
    }
    prevResultRef.current = result;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to the result object changing identity
  }, [room.hand.result]);

  const removeFlight = (id: string) => setFlights((f) => f.filter((fl) => fl.id !== id));

  const badgeFor = (seatNum: number): "D" | "SB" | "BB" | null => {
    if (!handInProgress) return null;
    if (seatNum === room.hand.dealerSeat) return "D";
    if (seatNum === room.hand.smallBlindSeat) return "SB";
    if (seatNum === room.hand.bigBlindSeat) return "BB";
    return null;
  };

  return (
    <div className="relative mx-auto aspect-[3/4] h-[min(96cqh,600px,calc(100cqw*4/3))] w-auto max-w-full sm:aspect-[16/11] sm:h-[min(94cqh,720px,calc(100cqw*11/16))]">
      <div className="table-dome-rim absolute inset-0 rounded-[46%] shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
      <div className="table-dome-surface absolute inset-[4.5%] rounded-[46%]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pt-[16%]">
          <Pot pots={room.hand.pots} liveTotal={room.players.reduce((s, p) => s + p.totalCommittedThisHand, 0)} />
          <CommunityCards cards={room.hand.communityCards} />
          {room.hand.phase === "waiting" && room.players.length < 2 && (
            <p className="max-w-[55%] text-center text-xs text-[var(--text-secondary)]">
              Waiting for players · Blinds {room.settings.smallBlind}/{room.settings.bigBlind}
            </p>
          )}
        </div>
        {/* Subtle centre branding, understated. */}
        <div className="pointer-events-none absolute left-1/2 top-[8%] flex -translate-x-1/2 items-center gap-1.5 opacity-[0.35]">
          <Spade className="h-3 w-3" style={{ color: "var(--table-branding)" }} fill="currentColor" />
          <span
            className="text-[10px] font-bold tracking-[0.3em]"
            style={{ color: "var(--table-branding)" }}
          >
            FELT
          </span>
        </div>

        <Deck handNumber={room.hand.handNumber} className="absolute left-[61%] top-[7.5%] opacity-90" />
      </div>

      {others.map((player, i) => (
        <PlayerSeat
          key={player.id}
          seat={{ player, isSelf: false, ...positions[i] }}
          badge={badgeFor(player.seat)}
          isActiveTurn={player.id === room.hand.activePlayerId}
          canHostRemove={canHostRemove}
          turnDeadline={room.hand.turnDeadline}
          turnTimeLimitSeconds={room.settings.turnTimeLimitSeconds}
          statusLabel={statusLabels[player.id]?.label ?? null}
          statusKey={statusLabels[player.id]?.key ?? 0}
          density={density}
          handDescription={room.hand.result?.revealedHands[player.id]?.description ?? null}
          onRemove={() => onRemovePlayer(player.id)}
        />
      ))}

      {Array.from({ length: emptySeatCount }, (_, i) => {
        const pos = positions[others.length + i];
        return <EmptySeat key={`empty-${i}`} xPct={pos.xPct} yPct={pos.yPct} onInvite={() => copyInviteLink(room.id)} />;
      })}

      {me && (
        // Top-anchored (not bottom-anchored) so the gap below the table is
        // always the fixed margin below, never `height - offset` creeping
        // upward into the oval when the table itself shrinks at narrower
        // viewports — bottom-anchoring let a tall, fixed-size hand overlap
        // the community cards on a short table.
        <div className="absolute left-1/2 top-full mt-1 flex -translate-x-1/2 flex-col items-center gap-1 sm:mt-2">
          <HoleCards cards={me.holeCards} folded={me.handStatus === "folded"} />
          {room.hand.result?.revealedHands[me.id]?.description && (
            <span className="text-xs font-medium text-[var(--accent-lime)]">
              {room.hand.result.revealedHands[me.id].description}
            </span>
          )}
        </div>
      )}

      {flights.map((f) => (
        <ChipFlight key={f.id} from={f.from} to={f.to} amount={f.amount} onDone={() => removeFlight(f.id)} />
      ))}
    </div>
  );
}
