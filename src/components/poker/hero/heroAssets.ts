"use client";

import { useEffect, useState } from "react";

/**
 * Raster artwork for the hero, generated separately from the page (see
 * docs/hero-artwork.md) and dropped into /public/hero. Each layer is optional:
 * until its file exists, the hero draws the built-in vector art instead.
 */
export const HERO_ASSETS = {
  /** Hand pinching the Ace of Spades — transparent, square canvas. */
  hand: "/hero/hand-ace.webp",
  /** Chip stacks / table foreground — transparent. */
  chips: "/hero/chips.webp",
} as const;

export type AssetStatus = "checking" | "ready" | "missing";

/** Probes an image URL once, so the hero can pick raster or vector art without
 * flashing one and swapping to the other. */
export function useAssetStatus(src: string): AssetStatus {
  const [status, setStatus] = useState<AssetStatus>("checking");
  useEffect(() => {
    let live = true;
    const img = new window.Image();
    img.onload = () => live && setStatus("ready");
    img.onerror = () => live && setStatus("missing");
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return status;
}
