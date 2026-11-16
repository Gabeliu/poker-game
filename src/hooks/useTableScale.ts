"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The smallest table area (in CSS pixels) a full ring of eight seats is laid
 * out for without anything touching: below this, seats keep their minimum
 * size while the felt under them keeps shrinking, so they collide. The
 * height is what the seat straight across needs to keep its turned-over
 * cards below the header. */
const DESIGN_WIDTH = 760;
const DESIGN_HEIGHT = 560;
/** Past this the table is too small to read whatever is done; let it clip
 * instead of shrinking into dust. */
const MIN_SCALE = 0.5;
/** Phones have their own layout (see the max-width: 767px rules), tuned for
 * exactly this problem already. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Scales the whole table down, as one piece, when its area is smaller than
 * the table was designed for — instead of letting the seats overlap each
 * other and spill out of it.
 *
 * `wrapRef` is the element that carries the scale (`.poker-table-wrap`); the
 * space available is its parent's (`.table-stage`). The scale is published as
 * the `--table-scale` custom property, which the stylesheet turns into a
 * `zoom` and a matching enlargement of the layout box, so the scaled table
 * still fills the stage exactly.
 */
export function useTableScale(wrapRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const stage = wrap?.parentElement;
    if (!wrap || !stage) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);

    const apply = () => {
      const { width, height } = stage.getBoundingClientRect();
      const wanted = desktop.matches && width > 0 && height > 0 ? Math.min(1, width / DESIGN_WIDTH, height / DESIGN_HEIGHT) : 1;
      // Two decimals: a pixel of window resizing shouldn't re-lay-out the table.
      const scale = Math.max(MIN_SCALE, Math.round(wanted * 100) / 100);
      wrap.style.setProperty("--table-scale", String(scale));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(stage);
    desktop.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", apply);
      wrap.style.removeProperty("--table-scale");
    };
  }, [wrapRef]);
}
