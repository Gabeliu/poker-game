"use client";

import { Button } from "@/components/ui/button";
import { formatChips } from "@/lib/format";
import type { ActionRequest, ClientRoomView } from "@/lib/types";
import { BettingControls } from "./BettingControls";
import { getEligiblePlayers } from "@/server/engine/seats";

interface ActionDockProps {
  room: ClientRoomView;
  isHost: boolean;
  onAction: (action: ActionRequest) => Promise<{ ok: true } | { ok: false; error: string }>;
  onStartHand: () => void;
  onSitOut: (sittingOut: boolean) => void;
}

export function ActionDock({ room, isHost, onAction, onStartHand, onSitOut }: ActionDockProps) {
  const me = room.players.find((p) => p.id === room.you.playerId);
  const isMyTurn = Boolean(me) && room.hand.activePlayerId === me!.id;
  const handOver = room.hand.phase === "waiting" || room.hand.phase === "hand-complete";
  const eligibleCount = getEligiblePlayers(room.players).length;

  if (isMyTurn) {
    return (
      <div className="flex justify-center">
        <BettingControls
          key={`${room.hand.activePlayerId}-${room.hand.phase}`}
          room={room}
          onAction={onAction}
        />
      </div>
    );
  }

  if (handOver) {
    return (
      <div className="flex flex-col items-center gap-2">
        {room.hand.result && room.hand.result.winners.length > 0 && (
          <ResultSummary room={room} />
        )}
        {isHost ? (
          <Button
            size="lg"
            disabled={eligibleCount < 2}
            onClick={onStartHand}
            data-testid="start-hand-button"
            className="bg-[var(--gold)] text-black hover:bg-[var(--gold)]/90 font-semibold px-8 shadow-lg"
          >
            {room.hand.handNumber === 0 ? "Start Hand" : "Start Next Hand"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Waiting for the host to start the next hand&hellip;</p>
        )}
        {eligibleCount < 2 && isHost && (
          <p className="text-xs text-muted-foreground">Need at least 2 players with approved chips.</p>
        )}
      </div>
    );
  }

  if (me?.handStatus === "sitting-out" && me.hasBoughtIn) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">You&apos;re sitting out.</p>
        <Button size="sm" variant="outline" onClick={() => onSitOut(false)}>
          Sit back in
        </Button>
      </div>
    );
  }

  const activePlayer = room.players.find((p) => p.id === room.hand.activePlayerId);
  return (
    <div className="flex items-center justify-center gap-2">
      <p className="text-sm text-muted-foreground">
        {activePlayer ? `Waiting for ${activePlayer.displayName}…` : "Hand in progress…"}
      </p>
      {me?.handStatus === "active" && (
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => onSitOut(true)}>
          Sit out next hand
        </Button>
      )}
    </div>
  );
}

function ResultSummary({ room }: { room: ClientRoomView }) {
  const winners = room.hand.result!.winners;
  const byPlayer = new Map<string, number>();
  for (const w of winners) byPlayer.set(w.playerId, (byPlayer.get(w.playerId) ?? 0) + w.amount);

  return (
    <div
      data-testid="hand-result-summary"
      className="flex flex-col items-center gap-1 rounded-xl border border-[var(--gold)]/30 bg-card/90 px-4 py-2 text-center shadow-lg"
    >
      {[...byPlayer.entries()].map(([playerId, amount]) => {
        const player = room.players.find((p) => p.id === playerId);
        const desc = winners.find((w) => w.playerId === playerId)?.handDescription;
        return (
          <p key={playerId} className="text-sm">
            <span className="font-semibold text-[var(--gold)]">{player?.displayName ?? "Player"}</span>{" "}
            won <span className="font-semibold">{formatChips(amount)}</span>
            {desc ? <span className="text-muted-foreground"> — {desc}</span> : null}
          </p>
        );
      })}
    </div>
  );
}
