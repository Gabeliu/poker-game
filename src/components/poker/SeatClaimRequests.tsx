"use client";

import { useState } from "react";
import type { ClientRoomView, SeatClaim } from "@/lib/types";
import { canResolveSeatClaim } from "@/lib/seatClaims";

/** Ready-made answers for turning a seat request down. The asker is shown
 * whichever one the host picks, so each is written to them directly. */
const REJECTION_REASONS = [
  "I couldn't confirm it's really you — message me first.",
  "That player is still at the table.",
  "Please join under a different name.",
] as const;
const OTHER = "other";
const MAX_REASON_LENGTH = 140;

interface SeatClaimRequestsProps {
  room: ClientRoomView;
  onResolve: (claimId: string, approve: boolean, reason?: string) => void;
}

/**
 * Floating cards for seat requests this viewer can answer: someone without a
 * seat's token (the same player in another browser, they say) asking to be
 * given it. Normally only the host sees these; see `canResolveSeatClaim` for
 * the one case where other players do.
 */
export function SeatClaimRequests({ room, onResolve }: SeatClaimRequestsProps) {
  const mine = (room.seatClaims ?? []).filter((claim) => canResolveSeatClaim(room, room.you.playerId, claim));
  if (mine.length === 0) return null;
  return (
    <div className="seat-claims" data-testid="seat-claims">
      {mine.map((claim) => (
        <SeatClaimCard key={claim.id} room={room} claim={claim} onResolve={onResolve} />
      ))}
    </div>
  );
}

function SeatClaimCard({ room, claim, onResolve }: SeatClaimRequestsProps & { claim: SeatClaim }) {
  const [rejecting, setRejecting] = useState(false);
  const [choice, setChoice] = useState<string>(REJECTION_REASONS[0]);
  const [custom, setCustom] = useState("");

  const holder = room.players.find((p) => p.id === claim.playerId);
  const holderOnline = holder?.connectionStatus === "connected";
  const isOwnSeat = claim.playerId === room.you.playerId;
  const reason = choice === OTHER ? custom.trim() : choice;

  return (
    <div className="seat-claim-card" data-testid="seat-claim-card" data-claim-name={claim.playerDisplayName} role="group" aria-label={`Seat request for ${claim.playerDisplayName}`}>
      <p className="seat-claim-eyebrow">Seat request</p>
      {!rejecting ? (
        <>
          <p className="seat-claim-title">
            Someone on another browser or device says they&rsquo;re <strong>{claim.playerDisplayName}</strong> and
            wants {isOwnSeat ? "your" : "that"} seat back.
          </p>
          <p className="seat-claim-note" data-testid="seat-claim-status">
            {isOwnSeat
              ? "If that's you switching devices, approve — this screen will be signed out of the seat."
              : holderOnline
                ? `${claim.playerDisplayName} is still connected on their current device. Approving signs that device out.`
                : `${claim.playerDisplayName} is offline right now.`}{" "}
            {!isOwnSeat && "They get the seat's chips and cards, so only approve if you're sure it's them."}
          </p>
          <div className="seat-claim-actions">
            <button key="reject" type="button" className="seat-claim-reject" data-testid="seat-claim-reject" onClick={() => setRejecting(true)}>
              Reject
            </button>
            <button key="approve" type="button" className="seat-claim-approve" data-testid="seat-claim-approve" onClick={() => onResolve(claim.id, true)}>
              Approve
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="seat-claim-title">Tell them why — they&rsquo;ll see this:</p>
          <div className="seat-claim-reasons" role="radiogroup" aria-label="Reason for rejecting">
            {[...REJECTION_REASONS, OTHER].map((value) => (
              <label key={value} className="seat-claim-reason">
                <input
                  type="radio"
                  name={`seat-claim-reason-${claim.id}`}
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                <span>{value === OTHER ? "Something else…" : value}</span>
              </label>
            ))}
            {choice === OTHER && (
              <input
                type="text"
                className="seat-claim-custom"
                data-testid="seat-claim-custom-reason"
                aria-label="Your reason"
                placeholder="Type a short reason"
                maxLength={MAX_REASON_LENGTH}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                autoFocus
              />
            )}
          </div>
          <div className="seat-claim-actions">
            <button key="back" type="button" className="seat-claim-back" onClick={() => setRejecting(false)}>
              Back
            </button>
            <button
              key="reject-confirm"
              type="button"
              className="seat-claim-reject seat-claim-reject-confirm"
              data-testid="seat-claim-reject-confirm"
              disabled={reason.length === 0}
              onClick={() => onResolve(claim.id, false, reason)}
            >
              Send rejection
            </button>
          </div>
        </>
      )}
    </div>
  );
}
