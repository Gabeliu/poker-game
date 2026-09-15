import type { PublicPlayer } from "./types";

export interface SeatPosition {
  player: PublicPlayer;
  /** Percentage-based position within the table container. */
  xPct: number;
  yPct: number;
  /** True for the viewer's own seat (rendered with the hand controls dock). */
  isSelf: boolean;
}

/**
 * Lays players out evenly around an ellipse, always rotated so the
 * viewer's own seat sits at the bottom-center of the table — the
 * conventional online-poker perspective.
 */
export function computeSeatPositions(
  players: PublicPlayer[],
  viewerPlayerId: string | null
): SeatPosition[] {
  if (players.length === 0) return [];

  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const selfIndex = viewerPlayerId ? ordered.findIndex((p) => p.id === viewerPlayerId) : -1;
  const pivot = selfIndex >= 0 ? selfIndex : 0;
  const rotated = [...ordered.slice(pivot), ...ordered.slice(0, pivot)];

  const n = rotated.length;
  const step = 360 / n;
  const radiusX = 45;
  const radiusY = 42;

  return rotated.map((player, i) => {
    const angleDeg = 90 + i * step;
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      player,
      xPct: 50 + radiusX * Math.cos(angleRad),
      yPct: 50 + radiusY * Math.sin(angleRad),
      isSelf: player.id === viewerPlayerId,
    };
  });
}
