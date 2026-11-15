"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Smallest the pot and boards will be scaled to before they're allowed to
 * overflow instead — past this the cards stop being readable. */
const MIN_FIT = 0.45;
/** Smallest they'll be scaled to purely to stay clear of other players'
 * seats. Below this a readable board matters more than a small overlap. */
const MIN_CLEAR_FIT = 0.7;
/** Breathing room kept between the board and a seat it's steering around. */
const SEAT_GAP = 3;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Lays the pot and community cards out in the space that's actually free.
 *
 * The felt between the player seated straight across (whose panel hangs well
 * into the table, and grows with hand descriptions at showdown) and the
 * viewer's own cards varies a lot with the window, so no fixed percentage
 * works everywhere: on a short window it's less than a pot and two boards
 * need, and the seat ended up covering the pot. Instead this measures that
 * band, hands the board its top/bottom padding through CSS variables, and
 * scales the pot + boards down (--board-fit) only when they don't fit.
 *
 * It also steers around the other seats. On a phone the table is narrow
 * enough that the players at the sides (and the cards they turn over at
 * showdown) sit in the same band as the board, and the table itself shrinks
 * whenever the action bar below it grows — so within that band this looks
 * for the largest size, nearest the middle, at which the pot and the board
 * touch nobody's seat or cards.
 *
 * `seatKey` identifies who is in the top-centre seat (null when empty) so a
 * different player taking it is measured afresh; `waiting` is true while the
 * lobby is showing instead of the pot and boards; `obstacleKey` changes
 * whenever a seat fills, empties, or shows/hides cards.
 */
export function useBoardFit(
  tableRef: RefObject<HTMLElement | null>,
  seatKey: string | null,
  waiting: boolean,
  obstacleKey: string
) {
  useLayoutEffect(() => {
    const table = tableRef.current;
    const board = table?.querySelector<HTMLElement>(".table-board");
    if (!table || !board) return;
    const content = board.querySelector<HTMLElement>(".table-board-content, .table-lobby");
    const seat = seatKey ? table.querySelector<HTMLElement>('[data-bet-edge="top-center"]') : null;
    const own = table.querySelector<HTMLElement>(".self-cards");
    const ownSeat = table.querySelector<HTMLElement>(".self-seat");

    const measure = () => {
      board.style.setProperty("--board-pad-top", "0px");
      board.style.setProperty("--board-pad-bottom", "0px");
      content?.style.setProperty("--board-fit", "1");
      const box = board.getBoundingClientRect();
      const top = seat ? Math.max(box.top, seat.getBoundingClientRect().bottom + 8) : box.top;
      // The board spans the whole felt below its top inset; it ends where the
      // viewer's cards begin. `.self-cards` is anchored just above the panel
      // only once it actually has cards in it (real height) — while it's
      // empty (no hand dealt yet, e.g. the lobby) it collapses to sit right
      // at the panel's own top edge instead, so the panel itself, with a
      // clear gap, is the right boundary to use in that case.
      const ownBox = own?.getBoundingClientRect();
      const bottom = ownBox && ownBox.height > 0
        ? ownBox.top - 2
        : ownSeat
          ? ownSeat.getBoundingClientRect().top - 12
          : box.bottom - box.height * 0.2;
      let padTop = top - box.top;
      let padBottom = box.bottom - bottom;
      let fit = 1;

      if (content) {
        const natural = content.getBoundingClientRect();
        const free = bottom - top;
        fit = natural.height > free && natural.height > 0 ? Math.max(MIN_FIT, free / natural.height) : 1;

        // Each piece (pot, board…) measured on its own, relative to the
        // content's top-centre: the pot is far narrower than the board, so
        // one box around both would dodge seats neither of them is near.
        const centreX = natural.left + natural.width / 2;
        const parts = [...content.children]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ left: r.left - centreX, right: r.right - centreX, top: r.top - natural.top, bottom: r.bottom - natural.top }));
        const obstacles: Box[] = [...table.querySelectorAll<HTMLElement>(".player-seat .seat-panel, .player-seat .opponent-cards")]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({ left: r.left - SEAT_GAP, top: r.top - SEAT_GAP, right: r.right + SEAT_GAP, bottom: r.bottom + SEAT_GAP }));

        const clearAt = (scale: number, y0: number) =>
          parts.every((p) => {
            const placed = { left: centreX + p.left * scale, right: centreX + p.right * scale, top: y0 + p.top * scale, bottom: y0 + p.bottom * scale };
            return obstacles.every((o) => !intersects(placed, o));
          });

        if (obstacles.length > 0 && parts.length > 0 && free > 0) {
          search: for (let scale = fit; scale >= Math.min(fit, MIN_CLEAR_FIT) - 0.001; scale -= 0.02) {
            const height = natural.height * scale;
            const slack = Math.max(0, free - height);
            const centred = top + slack / 2;
            // Nearest the middle first, then progressively further up/down.
            for (let offset = 0; offset <= slack / 2 + 0.5; offset += 3) {
              for (const y0 of offset === 0 ? [centred] : [centred - offset, centred + offset]) {
                if (!clearAt(scale, y0)) continue;
                fit = scale;
                padTop = y0 - box.top;
                padBottom = box.bottom - (y0 + height);
                break search;
              }
            }
          }
        }
        content.style.setProperty("--board-fit", fit.toFixed(3));
      }
      board.style.setProperty("--board-pad-top", `${Math.max(0, Math.round(padTop))}px`);
      board.style.setProperty("--board-pad-bottom", `${Math.max(0, Math.round(padBottom))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [table, seat, own, ownSeat, content]) if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      for (const prop of ["--board-pad-top", "--board-pad-bottom"]) board.style.removeProperty(prop);
      content?.style.removeProperty("--board-fit");
    };
  }, [tableRef, seatKey, waiting, obstacleKey]);
}
