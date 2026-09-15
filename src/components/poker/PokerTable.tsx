"use client";

import type { ClientRoomView } from "@/lib/types";
import { computeSeatPositions } from "@/lib/seatLayout";
import { usePlayerStatusLabels } from "@/hooks/usePlayerStatusLabels";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityCards } from "./CommunityCards";
import { Pot } from "./Pot";
import { HoleCards } from "./HoleCards";

interface PokerTableProps {
  room: ClientRoomView;
  canHostRemove: boolean;
  onRemovePlayer: (playerId: string) => void;
}

function densityFor(otherPlayerCount: number): "roomy" | "cozy" | "tight" {
  if (otherPlayerCount <= 4) return "roomy";
  if (otherPlayerCount <= 7) return "cozy";
  return "tight";
}

export function PokerTable({ room, canHostRemove, onRemovePlayer }: PokerTableProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const others = room.players.filter((p) => p.id !== room.you.playerId);
  const seats = computeSeatPositions(others);
  const liveTotal = room.players.reduce((sum, p) => sum + p.totalCommittedThisHand, 0);
  const handInProgress = room.hand.phase !== "waiting" && room.hand.phase !== "hand-complete";
  const density = densityFor(others.length);
  const statusLabels = usePlayerStatusLabels(room.players, room.hand.lastAggressorId);

  const badgeFor = (seatNum: number): "D" | "SB" | "BB" | null => {
    if (!handInProgress) return null;
    if (seatNum === room.hand.dealerSeat) return "D";
    if (seatNum === room.hand.smallBlindSeat) return "SB";
    if (seatNum === room.hand.bigBlindSeat) return "BB";
    return null;
  };

  return (
    <div className="relative mx-auto aspect-[16/10] h-[min(56vh,500px)] w-auto max-w-full">
      <div className="table-dome-rim absolute inset-0 rounded-[46%] shadow-[0_24px_60px_rgba(0,0,0,0.6)]" />
      <div className="table-dome-surface absolute inset-[3%] rounded-[46%] shadow-[inset_0_0_50px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pt-[16%]">
          <Pot pots={room.hand.pots} liveTotal={liveTotal} />
          <CommunityCards cards={room.hand.communityCards} />
          {room.hand.phase === "waiting" && room.players.length < 2 && (
            <p className="max-w-[55%] text-center text-xs text-[var(--text-secondary)]">
              Waiting for at least one more player to buy in.
            </p>
          )}
        </div>
      </div>

      {seats.map((seat) => (
        <PlayerSeat
          key={seat.player.id}
          seat={seat}
          badge={badgeFor(seat.player.seat)}
          isActiveTurn={seat.player.id === room.hand.activePlayerId}
          canHostRemove={canHostRemove}
          turnDeadline={room.hand.turnDeadline}
          turnTimeLimitSeconds={room.settings.turnTimeLimitSeconds}
          statusLabel={statusLabels[seat.player.id]?.label ?? null}
          statusKey={statusLabels[seat.player.id]?.key ?? 0}
          density={density}
          onRemove={() => onRemovePlayer(seat.player.id)}
        />
      ))}

      {me && (
        <div className="absolute left-1/2 -bottom-6 -translate-x-1/2 sm:-bottom-8">
          <HoleCards cards={me.holeCards} folded={me.handStatus === "folded"} />
        </div>
      )}
    </div>
  );
}
