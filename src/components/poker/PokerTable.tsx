"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientRoomView, SeatNumber } from "@/lib/types";
import { playerAtSeat, ringPositionForSeat, ringSeatPositions, type ArcPosition } from "@/lib/seatLayout";
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
import { Button } from "@/components/ui/button";
import { getEligiblePlayers, getStartHandError } from "@/server/engine/seats";
import { formatChips } from "@/lib/format";
import { PlayerAvatar } from "./PlayerAvatar";
import { ChipStack } from "./ChipStack";
import { cn } from "@/lib/utils";

/** Where the pot visually sits within the table, in the same xPct/yPct
 * coordinate space as seat positions — used as the destination for bet
 * flights and the origin for payout flights. */
const POT_POINT: ArcPosition = { xPct: 50, yPct: 40 };
/** The viewer's own seat is never drawn as a ring seat — their identity is
 * the large hole cards + stack panel below the table — so their chip
 * flights originate/land at that panel's position instead. */
const SELF_POINT: ArcPosition = { xPct: 50, yPct: 91 };

interface Flight {
  id: string;
  from: ArcPosition;
  to: ArcPosition;
  amount: number;
}

interface PokerTableProps {
  room: ClientRoomView;
  isHost: boolean;
  onRemovePlayer: (playerId: string) => void;
  onSit: (seat: SeatNumber) => void;
  onStartHand: () => void;
}

export function PokerTable({ room, isHost, onRemovePlayer, onSit, onStartHand }: PokerTableProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const mySeat = me?.seat ?? null;
  const canSit = Boolean(me) && mySeat === null;
  const handInProgress = room.hand.phase !== "waiting" && room.hand.phase !== "hand-complete";
  const statusLabels = usePlayerStatusLabels(room.players, room.hand.lastAggressorId);
  const ringSeats = ringSeatPositions(mySeat);
  const eligibleCount = getEligiblePlayers(room.players).length;
  const startError = getStartHandError(room.players);
  const waiting = room.hand.phase === "waiting";
  const winners = room.hand.result?.winners ?? [];

  const seatPointFor = (playerId: string): ArcPosition | null => {
    if (playerId === room.you.playerId) return SELF_POINT;
    const p = room.players.find((pl) => pl.id === playerId);
    if (!p || p.seat === null) return null;
    return ringPositionForSeat(p.seat, mySeat);
  };

  const [flights, setFlights] = useState<Flight[]>([]);
  const prevBetsRef = useRef<Record<string, number>>({});
  const prevHandNumberRef = useRef(room.hand.handNumber);
  const prevResultRef = useRef(room.hand.result);
  const flightIdRef = useRef(0);

  const betSignature = room.players.map((p) => `${p.id}:${p.currentBet}`).join("|");

  useEffect(() => {
    const spawned: Flight[] = [];
    for (const p of room.players) {
      const prev = prevBetsRef.current[p.id] ?? 0;
      if (p.currentBet > prev) {
        const from = seatPointFor(p.id);
        if (from) {
          flightIdRef.current += 1;
          spawned.push({ id: `bet-${p.id}-${flightIdRef.current}`, from, to: POT_POINT, amount: p.currentBet - prev });
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
          if (!to) return null;
          flightIdRef.current += 1;
          return { id: `win-${w.playerId}-${w.potId}-${flightIdRef.current}`, from: POT_POINT, to, amount: w.amount };
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
    <div className="poker-table-wrap">
      <div className="poker-table">
        <div className="table-dome-rim absolute inset-0 rounded-[46%] shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
        <div className="table-dome-surface absolute inset-[4.5%] rounded-[46%]">
          <div className="table-board">
            {!waiting && <>
            <Pot pots={room.hand.pots} liveTotal={room.players.reduce((s, p) => s + p.totalCommittedThisHand, 0)} />
            <CommunityCards cards={room.hand.communityCards} />
            </>}
            {waiting && (
              <div className="table-lobby">
                <span className="room-eyebrow">Your private table</span>
                <h1>{room.settings.roomName}</h1>
                <p className="table-stakes">{formatChips(room.settings.smallBlind)} <span>/</span> {formatChips(room.settings.bigBlind)}</p>
                <span className="room-eyebrow">No Limit Hold’em</span>
                <div className="seated-count"><span />{room.players.filter((p) => p.seat !== null).length} / 8 players seated</div>
                {isHost && eligibleCount >= 2 ? (
                  <Button className="room-primary" disabled={Boolean(startError)} aria-describedby="start-hand-status" onClick={onStartHand} data-testid="start-hand-button">Start Hand</Button>
                ) : (
                  <Button variant="outline" className="table-invite" onClick={() => copyInviteLink(room.id)}>Copy Invite Link</Button>
                )}
                <p id="start-hand-status" className="lobby-hint" role="status">{startError ?? (isHost ? "The table is ready. Deal them in." : "Waiting for the host to deal")}</p>
              </div>
            )}
          </div>
          {/* Subtle centre branding, understated. */}
          <div className="table-watermark">
            <Spade className="h-3 w-3" style={{ color: "var(--table-branding)" }} fill="currentColor" />
            <span
              className="text-[10px] font-bold tracking-[0.3em]"
              style={{ color: "var(--table-branding)" }}
            >
              FELT
            </span>
          </div>

          <Deck handNumber={room.hand.handNumber} className="table-deck absolute left-[68%] top-[20%] opacity-90" />
        </div>

        {ringSeats.map(({ seat, position }) => {
          const player = playerAtSeat(room.players, seat);
          if (player) {
            return (
              <PlayerSeat
                key={seat}
                player={player}
                position={position}
                badge={badgeFor(seat)}
                isActiveTurn={player.id === room.hand.activePlayerId}
                isWinner={winners.some((w) => w.playerId === player.id)}
                canHostRemove={isHost}
                turnDeadline={room.hand.turnDeadline}
                turnTimeLimitSeconds={room.settings.turnTimeLimitSeconds}
                statusLabel={statusLabels[player.id]?.label ?? null}
                statusKey={statusLabels[player.id]?.key ?? 0}
                handDescription={room.hand.result?.revealedHands[player.id]?.description ?? null}
                onRemove={() => onRemovePlayer(player.id)}
              />
            );
          }
          return (
            <EmptySeat
              key={seat}
              position={position}
              canSit={canSit}
              onSit={() => onSit(seat)}
              canInvite={isHost && !canSit}
              onInvite={() => copyInviteLink(room.id)}
            />
          );
        })}

        {flights.map((f) => (
          <ChipFlight key={f.id} from={f.from} to={f.to} amount={f.amount} onDone={() => removeFlight(f.id)} />
        ))}
      {me &&
        (mySeat !== null ? (
          <div className={cn("self-seat", me.id === room.hand.activePlayerId && "seat-active", winners.some((w) => w.playerId === me.id) && "seat-winner")}>
            <div className="self-cards"><HoleCards cards={me.holeCards} folded={me.handStatus === "folded"} /></div>
            {me.currentBet > 0 && <ChipStack amount={me.currentBet} variant="bet" className="self-bet" />}
            <div className="self-identity">
              <PlayerAvatar name={me.displayName} size="sm" />
              <div><span className="self-name">{me.displayName} <small>(you)</small></span><ChipStack amount={me.chips} /></div>
              {me.isHost && <span className="host-label">Host</span>}
              {badgeFor(mySeat) && <span className={cn("dealer-puck", badgeFor(mySeat) !== "D" && "blind-puck")}>{badgeFor(mySeat)}</span>}
            </div>
            {room.hand.result?.revealedHands[me.id]?.description && (
              <span className="text-xs font-medium text-[var(--accent-lime)]">
                {room.hand.result.revealedHands[me.id].description}
              </span>
            )}
          </div>
        ) : (
          <div className="spectator-hint">
            {me.displayName}, pick an open seat to join the table
          </div>
        ))}
      </div>
    </div>
  );
}
