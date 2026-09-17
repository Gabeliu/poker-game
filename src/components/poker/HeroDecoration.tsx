"use client";

import { PlayingCard } from "./PlayingCard";
import { PokerChip } from "./PokerChip";
import { Deck } from "./Deck";
import { useEffect, useRef } from "react";

/** A still life built from the same physical objects as the live table. */
export function HeroDecoration() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      scene.style.setProperty("--parallax-x", "0");
      scene.style.setProperty("--parallax-y", "0");
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse") return;
      const x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1));
      const y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        scene.style.setProperty("--parallax-x", String(x));
        scene.style.setProperty("--parallax-y", String(y));
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);
    media.addEventListener("change", reset);
    return () => {
      reset();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
      media.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div ref={sceneRef} className="hero-scene" aria-hidden="true">
      <div className="hero-table table-dome-rim">
        <div className="hero-felt table-dome-surface">
          <div className="hero-table-brand">&#9824; FELT <small>GOOD COMPANY. GREAT HANDS.</small></div>
          <div className="hero-hand">
            <PlayingCard card={{ rank: "A", suit: "spades" }} size="xl" rotationDeg={-14} />
            <PlayingCard card={{ rank: "A", suit: "hearts" }} size="xl" rotationDeg={7} />
          </div>
          <div className="hero-chips">
            {[25, 100, 1000].map((denomination, index) => (
              <div key={denomination} className="hero-chip-column" style={{ height: 40 + index * 9 }}>
                {Array.from({ length: 4 + index }).map((_, chip) => <PokerChip key={chip} size={46} denomination={denomination} style={{ position: "absolute", bottom: chip * 5 }} />)}
              </div>
            ))}
          </div>
          <span className="hero-dealer dealer-puck">D</span>
          <Deck handNumber={0} className="hero-deck" />
        </div>
      </div>
    </div>
  );
}
