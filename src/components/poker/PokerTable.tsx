"use client";

import { useEffect, useRef, useState } from "react";
import type { Card, ClientRoomView, HandResult, SeatNumber } from "@/lib/types";
import { playerAtSeat, ringPositionForSeat, ringSeatPositions, type ArcPosition } from "@/lib/seatLayout";
import { copyInviteLink } from "@/lib/invite";
import { usePlayerStatusLabels } from "@/hooks/usePlayerStatusLabels";
import { useRoomStore } from "@/hooks/useRoomStore";
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
/** Payout-flight origins when a hand ran two boards — bets themselves
 * always land in the single shared POT_POINT above (the pot doesn't split
 * physically until payout), these are only where each board's winnings
 * visually appear to come from. */
const POT_POINT_RUN_1: ArcPosition = { xPct: 50, yPct: 35 };
const POT_POINT_RUN_2: ArcPosition = { xPct: 50, yPct: 45 };
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
  const resyncNonce = useRoomStore((s) => s.resyncNonce);
  const statusLabels = usePlayerStatusLabels(
    room.players,
    room.hand.lastAggressorId,
    `${room.hand.handNumber}:${resyncNonce}`
  );
  const ringSeats = ringSeatPositions(mySeat);
  const eligibleCount = getEligiblePlayers(room.players).length;
  const startError = getStartHandError(room.players);
  const waiting = room.hand.phase === "waiting";
  const result = room.hand.result;
  const secondResult = room.hand.secondBoard?.result ?? null;
  // Run 2 is dealt and revealed strictly after run 1 finishes — don't show
  // the dual-board layout (or Run 2's board at all) until the server has
  // actually moved on to it (activeRun flips to 2 the instant run 1
  // resolves) or the hand is fully done. Until then this stays a single,
  // fully-focused board on run 1, even though `secondBoard` already exists
  // as an empty placeholder the moment both players agree to run it twice.
  const showDualBoard = Boolean(room.hand.secondBoard) && (room.hand.runout?.activeRun === 2 || !room.hand.runout);
  const winners = result?.winners ?? [];
  const allWinnerIds = new Set([...winners, ...(secondResult?.winners ?? [])].map((w) => w.playerId));
  // Reached showdown (present in revealedHands) but didn't win a share of
  // either board, and the hand is fully resolved — dim distinctly from a
  // fold, which dims immediately rather than only once the hand ends.
  const isLoser = (playerId: string) =>
    room.hand.phase === "hand-complete" &&
    Boolean(result?.revealedHands[playerId]) &&
    !allWinnerIds.has(playerId);

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
  const prevSecondResultRef = useRef(secondResult);
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
    const current = room.hand.result;
    if (current && current !== prevResultRef.current) {
      const from = room.hand.secondBoard ? POT_POINT_RUN_1 : POT_POINT;
      const spawned: Flight[] = current.winners
        .map((w) => {
          const to = seatPointFor(w.playerId);
          if (!to) return null;
          flightIdRef.current += 1;
          return { id: `win-${w.playerId}-${w.potId}-${flightIdRef.current}`, from, to, amount: w.amount };
        })
        .filter((f): f is Flight => f !== null);
      if (spawned.length > 0) {
        setTimeout(() => setFlights((f) => [...f, ...spawned]), 0);
      }
    }
    prevResultRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to the result object changing identity
  }, [room.hand.result]);

  // Second board's payout, when the hand ran it twice — same mechanics as
  // above, its own ref/effect so the two never clobber each other, distinct
  // flight ids, and a different visual origin point.
  useEffect(() => {
    const current = room.hand.secondBoard?.result ?? null;
    if (current && current !== prevSecondResultRef.current) {
      const spawned: Flight[] = current.winners
        .map((w) => {
          const to = seatPointFor(w.playerId);
          if (!to) return null;
          flightIdRef.current += 1;
          return { id: `win2-${w.playerId}-${w.potId}-${flightIdRef.current}`, from: POT_POINT_RUN_2, to, amount: w.amount };
        })
        .filter((f): f is Flight => f !== null);
      if (spawned.length > 0) {
        setTimeout(() => setFlights((f) => [...f, ...spawned]), 0);
      }
    }
    prevSecondResultRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to the secondBoard result object changing identity
  }, [room.hand.secondBoard?.result]);

  const removeFlight = (id: string) => setFlights((f) => f.filter((fl) => fl.id !== id));

  /** The specific board cards that made up a board's winning hand(s), so
   * CommunityCards can outline just those — bestFive includes hole cards
   * too, but CommunityCards only ever matches against its own rendered
   * community cards, so passing the full set through is safe. */
  const highlightForBoard = (boardResult: HandResult | null): Card[] | undefined => {
    if (!boardResult) return undefined;
    const cards: Card[] = [];
    for (const w of boardResult.winners) {
      const best = boardResult.revealedHands[w.playerId]?.bestFive;
      if (best) cards.push(...best);
    }
    return cards.length > 0 ? cards : undefined;
  };

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
          <div className={cn("table-board", showDualBoard && "table-board-dual")}>
            {!waiting && <>
            <Pot pots={room.hand.pots} liveTotal={room.players.reduce((s, p) => s + p.totalCommittedThisHand, 0)} />
            {showDualBoard && room.hand.secondBoard ? (
              <div className="dual-board" data-boards="2">
                <CommunityCards
                  cards={room.hand.communityCards}
                  label="Run 1"
                  highlightCards={highlightForBoard(result)}
                />
                <CommunityCards
                  cards={room.hand.secondBoard.communityCards}
                  label="Run 2"
                  highlightCards={highlightForBoard(secondResult)}
                />
              </div>
            ) : (
              <CommunityCards cards={room.hand.communityCards} highlightCards={highlightForBoard(result)} />
            )}
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
                isWinner={allWinnerIds.has(player.id)}
                isLoser={isLoser(player.id)}
                canHostRemove={isHost}
                turnDeadline={room.hand.turnDeadline}
                turnTimeLimitSeconds={room.settings.turnTimeLimitSeconds}
                statusLabel={statusLabels[player.id]?.label ?? null}
                statusKey={statusLabels[player.id]?.key ?? 0}
                handDescription={room.hand.result?.revealedHands[player.id]?.description ?? null}
                secondHandDescription={room.hand.secondBoard?.result?.revealedHands[player.id]?.description ?? null}
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
          <div className={cn("self-seat", me.id === room.hand.activePlayerId && "seat-active", allWinnerIds.has(me.id) && "seat-winner", isLoser(me.id) && "seat-loser", showDualBoard && "self-seat-dual-board")}>
            <div className="self-cards"><HoleCards cards={me.holeCards} folded={me.handStatus === "folded"} /></div>
            {me.currentBet > 0 && <ChipStack amount={me.currentBet} variant="bet" className="self-bet" />}
            <div className="self-identity">
              <PlayerAvatar name={me.displayName} size="sm" />
              <div><span className="self-name">{me.displayName} <small>(you)</small></span><ChipStack amount={me.chips} /></div>
              {me.isHost && <span className="host-label">Host</span>}
              {badgeFor(mySeat) && <span className={cn("dealer-puck", badgeFor(mySeat) !== "D" && "blind-puck")}>{badgeFor(mySeat)}</span>}
            </div>
            {room.hand.result?.revealedHands[me.id]?.description && (
              <span className="flex flex-col text-xs font-medium text-[var(--accent-lime)]">
                <span>
                  {room.hand.secondBoard ? "Run 1: " : ""}
                  {room.hand.result.revealedHands[me.id].description}
                </span>
                {room.hand.secondBoard?.result?.revealedHands[me.id]?.description && (
                  <span>Run 2: {room.hand.secondBoard.result.revealedHands[me.id].description}</span>
                )}
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
