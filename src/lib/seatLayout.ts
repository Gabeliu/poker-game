import type { PublicPlayer } from "./types";

export interface ArcPosition {
  xPct: number;
  yPct: number;
}

export interface SeatPosition extends ArcPosition {
  player: PublicPlayer;
  isSelf: boolean;
}

/**
 * Pure positioning math: lays `count` slots along the top arc of the table
 * dome, evenly spaced. The viewer isn't seated on the ring at all — their
 * identity is the large hole cards at bottom-center plus the stack panel —
 * so the arc only ever needs to fit "everyone else" (real players and/or
 * empty-seat placeholders), and it widens as more slots are added instead
 * of wrapping fully around (which would put seats behind/below the
 * viewer's own cards).
 */
export function computeArcPositions(count: number): ArcPosition[] {
  if (count === 0) return [];

  // Arc widens as more slots are added, capped before it would wrap around
  // into the viewer's own space at the bottom.
  const arcSpan = Math.min(320, 130 + Math.max(0, count - 2) * 27);
  const arcStart = 270 - arcSpan / 2;

  // Radius grows a little as more slots are added, spreading seats over
  // more of the available dome surface so adjacent seats don't crowd.
  const radiusX = Math.min(47, 40 + count * 0.6);
  const radiusY = Math.min(38, 28 + count * 0.8);

  return Array.from({ length: count }, (_, i) => {
    const angleDeg = count === 1 ? 270 : arcStart + ((i + 0.5) / count) * arcSpan;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      xPct: 50 + radiusX * Math.cos(angleRad),
      yPct: 50 + radiusY * Math.sin(angleRad),
    };
  });
}

/** Lays out every player *other than the viewer*, sorted by seat. */
export function computeSeatPositions(others: PublicPlayer[]): SeatPosition[] {
  if (others.length === 0) return [];
  const ordered = [...others].sort((a, b) => a.seat - b.seat);
  const positions = computeArcPositions(ordered.length);
  return ordered.map((player, i) => ({ player, isSelf: false, ...positions[i] }));
}

/** A stereo pan value (-1..1) for a player's seat, for positional sound —
 * the viewer's own seat (bottom-center) is always dead center. */
export function panForPlayer(players: PublicPlayer[], viewerId: string | null, playerId: string): number {
  if (playerId === viewerId) return 0;
  const others = players.filter((p) => p.id !== viewerId).sort((a, b) => a.seat - b.seat);
  const idx = others.findIndex((p) => p.id === playerId);
  if (idx === -1) return 0;
  const positions = computeArcPositions(others.length);
  const xPct = positions[idx]?.xPct ?? 50;
  return Math.max(-1, Math.min(1, (xPct - 50) / 42));
}
