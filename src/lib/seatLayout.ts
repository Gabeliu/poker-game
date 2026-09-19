import type { PublicPlayer, SeatNumber } from "./types";
import { ALL_SEATS, MAX_SEATS } from "./types";

export interface ArcPosition {
  xPct: number;
  yPct: number;
}

/**
 * Fixed 8-seat table. The local player's own seat is never drawn as a ring
 * seat — their identity is the large hole cards + stack panel at the
 * bottom, exactly as before — so the table only ever needs 7 fixed ring
 * positions for "everyone else." Server seat numbers are authoritative and
 * never change; this module only maps them to *visual* positions so the
 * viewer's own seat always reads as "the bottom."
 *
 * Positions are evenly spaced every 45° around the ellipse, starting just
 * past the viewer's own spot (at 90°, skipped) and going all the way
 * around back to it — offset 1 sits just anticlockwise of the viewer,
 * offset 7 just clockwise, matching real turn-order adjacency.
 */
const RING_RADIUS_X = 44;
const RING_RADIUS_Y = 37;

function positionForAngleDeg(angleDeg: number): ArcPosition {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    xPct: 50 + RING_RADIUS_X * Math.cos(rad),
    yPct: 50 + RING_RADIUS_Y * Math.sin(rad),
  };
}

/** Index 0 is the viewer's own spot (bottom-centre, 90°) — rendered as the
 * hole-cards/stack panel rather than a ring seat once the viewer is seated,
 * but still a real position: an unseated viewer has no anchor yet, so all 8
 * seats (including whichever lands on offset 0) render as plain ring seats. */
const RING_POSITIONS: ArcPosition[] = Array.from({ length: 8 }, (_, i) => positionForAngleDeg(90 + 45 * i));

/** How many seats clockwise from the viewer's own seat, in server-seat
 * terms (1-7 for every other seat; 0 would be the viewer's own). Falls
 * back to treating seat 0 as the anchor when the viewer isn't seated yet,
 * so the pre-seated lobby view still renders a stable, sensible layout. */
export function seatOffsetFromViewer(seat: SeatNumber, mySeat: SeatNumber | null): number {
  const anchor = mySeat ?? 0;
  return ((seat - anchor + MAX_SEATS) % MAX_SEATS);
}

/** The visual ring position for a given server seat, relative to the viewer. */
export function ringPositionForSeat(seat: SeatNumber, mySeat: SeatNumber | null): ArcPosition {
  const offset = seatOffsetFromViewer(seat, mySeat);
  return RING_POSITIONS[offset] ?? RING_POSITIONS[1];
}

/** The seats PokerTable should render as ring seats: all 8 if the viewer
 * hasn't sat down yet (no anchor, so nothing is reserved for "you"), or the
 * other 7 once they have (their own seat renders as the hole-cards panel
 * instead), each paired with its visual ring position. */
export function ringSeatPositions(mySeat: SeatNumber | null): { seat: SeatNumber; position: ArcPosition }[] {
  return ALL_SEATS.filter((s) => s !== mySeat).map((seat) => ({ seat, position: ringPositionForSeat(seat, mySeat) }));
}

/** The seat straight across from the viewer sits right where the pot and the
 * top of the board are drawn, so the table lays those out around it. */
export function isTopCenterPosition(position: ArcPosition): boolean {
  return Math.abs(position.xPct - 50) < 8 && position.yPct < 35;
}

/** Looks up the occupying player for a seat, if any. */
export function playerAtSeat(players: PublicPlayer[], seat: SeatNumber): PublicPlayer | null {
  return players.find((p) => p.seat === seat) ?? null;
}

/** A stereo pan value (-1..1) for a player's seat, for positional sound —
 * the viewer's own seat (bottom-center) is always dead center. */
export function panForPlayer(players: Pick<PublicPlayer, "id" | "seat">[], viewerId: string | null, playerId: string): number {
  const player = players.find((p) => p.id === playerId);
  if (!player || player.seat === null) return 0;
  const viewer = players.find((p) => p.id === viewerId);
  const mySeat = viewer?.seat ?? null;
  if (player.seat === mySeat) return 0;
  const { xPct } = ringPositionForSeat(player.seat, mySeat);
  return Math.max(-1, Math.min(1, (xPct - 50) / 44));
}
