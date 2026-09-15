"use client";

import type { ClientRoomView } from "@/lib/types";
import { computeSeatPositions } from "@/lib/seatLayout";
import { PlayerSeat } from "./PlayerSeat";
import { CommunityCards } from "./CommunityCards";
import { PotDisplay } from "./PotDisplay";

interface PokerTableProps {
  room: ClientRoomView;
  canHostRemove: boolean;
  onRemovePlayer: (playerId: string) => void;
}

export function PokerTable({ room, canHostRemove, onRemovePlayer }: PokerTableProps) {
  const seats = computeSeatPositions(room.players, room.you.playerId);
  const liveTotal = room.players.reduce((sum, p) => sum + p.totalCommittedThisHand, 0);
  const handInProgress = room.hand.phase !== "waiting" && room.hand.phase !== "hand-complete";

  return (
    <div className="relative mx-auto aspect-[16/10] h-[min(54vh,480px)] w-auto max-w-full">
      {/* Outer rail */}
      <div className="felt-rail absolute inset-0 rounded-[46%] shadow-[0_20px_50px_rgba(0,0,0,0.55)]" />
      {/* Felt surface */}
      <div className="felt-surface absolute inset-[3.5%] rounded-[46%] border-[6px] border-black/30 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <CommunityCards cards={room.hand.communityCards} />
          {(handInProgress || room.hand.pots.length > 0) && (
            <PotDisplay pots={room.hand.pots} liveTotal={liveTotal} />
          )}
          {room.hand.phase === "waiting" && room.players.length < 2 && (
            <p className="max-w-[60%] text-center text-sm text-white/50">
              Waiting for at least one more player to buy in before the host can start a hand.
            </p>
          )}
        </div>
      </div>

      {/* Seats */}
      {seats.map((seat) => (
        <PlayerSeat
          key={seat.player.id}
          seat={seat}
          isDealer={seat.player.seat === room.hand.dealerSeat && handInProgress}
          isActiveTurn={seat.player.id === room.hand.activePlayerId}
          canHostRemove={canHostRemove}
          turnDeadline={room.hand.turnDeadline}
          turnTimeLimitSeconds={room.settings.turnTimeLimitSeconds}
          onRemove={() => onRemovePlayer(seat.player.id)}
        />
      ))}
    </div>
  );
}
