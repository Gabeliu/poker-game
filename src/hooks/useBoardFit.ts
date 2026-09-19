"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Smallest the pot and boards will be scaled to before they're allowed to
 * overflow instead — past this the cards stop being readable. */
const MIN_FIT = 0.5;

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
 * `seatKey` identifies who is in the top-centre seat (null when empty) so a
 * different player taking it is measured afresh; `waiting` is true while the
 * lobby is showing instead of the pot and boards.
 */
export function useBoardFit(tableRef: RefObject<HTMLElement | null>, seatKey: string | null, waiting: boolean) {
  useLayoutEffect(() => {
    const table = tableRef.current;
    const board = table?.querySelector<HTMLElement>(".table-board");
    if (!table || !board) return;
    const content = board.querySelector<HTMLElement>(".table-board-content");
    const seat = seatKey ? table.querySelector<HTMLElement>('[data-bet-edge="top-center"]') : null;
    const own = table.querySelector<HTMLElement>(".self-cards");

    const measure = () => {
      board.style.setProperty("--board-pad-top", "0px");
      board.style.setProperty("--board-pad-bottom", "0px");
      content?.style.setProperty("--board-fit", "1");
      const box = board.getBoundingClientRect();
      const top = seat ? Math.max(box.top, seat.getBoundingClientRect().bottom + 8) : box.top;
      // The board spans the whole felt below its top inset; it ends where the
      // viewer's cards begin (or, for a spectator, a little above the bottom).
      const bottom = own ? own.getBoundingClientRect().top - 2 : box.bottom - box.height * 0.2;
      board.style.setProperty("--board-pad-top", `${Math.max(0, Math.round(top - box.top))}px`);
      board.style.setProperty("--board-pad-bottom", `${Math.max(0, Math.round(box.bottom - bottom))}px`);
      if (content) {
        const natural = content.getBoundingClientRect().height;
        const free = bottom - top;
        const fit = natural > free && natural > 0 ? Math.max(MIN_FIT, free / natural) : 1;
        content.style.setProperty("--board-fit", fit.toFixed(3));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [table, seat, own, content]) if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      for (const prop of ["--board-pad-top", "--board-pad-bottom"]) board.style.removeProperty(prop);
      content?.style.removeProperty("--board-fit");
    };
  }, [tableRef, seatKey, waiting]);
}
