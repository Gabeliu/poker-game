import type { PublicPlayer } from "./types";

export interface SeatPosition {
  player: PublicPlayer;
  /** Percentage-based position within the table container. */
  xPct: number;
  yPct: number;
  isSelf: boolean;
}

/**
 * Lays out every player *other than the viewer* along the top arc of the
 * table dome, evenly spaced. The viewer isn't seated on the ring at all —
 * their identity is the large hole cards at bottom-center plus the stack
 * panel — so the arc only ever needs to fit "everyone else," and it widens
 * as more players join instead of wrapping fully around (which would put
 * seats behind/below the viewer's own cards).
 */
export function computeSeatPositions(others: PublicPlayer[]): SeatPosition[] {
  if (others.length === 0) return [];

  const ordered = [...others].sort((a, b) => a.seat - b.seat);
  const n = ordered.length;

  // Arc widens as more players join, capped before it would wrap around
  // into the viewer's own space at the bottom.
  const arcSpan = Math.min(320, 130 + Math.max(0, n - 2) * 27);
  const arcStart = 270 - arcSpan / 2;

  // Radius grows a little as more players join, spreading seats over more
  // of the available dome surface so adjacent seats don't crowd together.
  const radiusX = Math.min(47, 40 + n * 0.6);
  const radiusY = Math.min(38, 28 + n * 0.8);

  return ordered.map((player, i) => {
    const angleDeg = n === 1 ? 270 : arcStart + ((i + 0.5) / n) * arcSpan;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      player,
      xPct: 50 + radiusX * Math.cos(angleRad),
      yPct: 50 + radiusY * Math.sin(angleRad),
      isSelf: false,
    };
  });
}
