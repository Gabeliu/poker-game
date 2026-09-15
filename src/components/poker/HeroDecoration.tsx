"use client";

import { useEffect, useRef } from "react";
import { PlayingCard } from "./PlayingCard";
import { PokerChip } from "./PokerChip";
import type { Card } from "@/lib/types";

type FloatItem =
  | { kind: "card"; card: Card; size: "lg" | "xl"; top: string; left: string; rot: number; floatY: number; duration: number; delay: number; depth: number }
  | { kind: "chip"; chipSize: number; top: string; left: string; rot: number; floatY: number; duration: number; delay: number; depth: number };

const ITEMS: FloatItem[] = [
  { kind: "card", card: { rank: "A", suit: "spades" }, size: "xl", top: "6%", left: "4%", rot: -12, floatY: -18, duration: 7, delay: 0, depth: 20 },
  { kind: "card", card: { rank: "K", suit: "hearts" }, size: "lg", top: "60%", left: "1%", rot: 10, floatY: -12, duration: 6, delay: 0.5, depth: 14 },
  { kind: "chip", chipSize: 56, top: "16%", left: "90%", rot: 0, floatY: -12, duration: 5.5, delay: 0.2, depth: 26 },
  { kind: "card", card: { rank: "Q", suit: "clubs" }, size: "lg", top: "68%", left: "92%", rot: -8, floatY: -14, duration: 6.5, delay: 0.7, depth: 16 },
  { kind: "card", card: { rank: "10", suit: "diamonds" }, size: "xl", top: "4%", left: "78%", rot: 14, floatY: -16, duration: 7.5, delay: 0.3, depth: 18 },
  { kind: "chip", chipSize: 40, top: "82%", left: "12%", rot: 0, floatY: -10, duration: 5, delay: 0.9, depth: 22 },
];

/** Floating hero cards/chips with a subtle idle float and optional mouse
 * parallax. Parallax is driven by writing CSS custom properties directly to
 * the container on pointer move (no React state), so it never triggers a
 * re-render and stays cheap even on lower-end devices. */
export function HeroDecoration() {
  const ref = useRef<HTMLDivElement>(null);

  // The decoration layer is pointer-events-none (so clicks pass through to
  // the CTAs beneath it), which means it never receives its own mouse
  // events — track position on window instead and scope the resulting
  // offset with the element's own bounding rect.
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width - 0.5;
      const my = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--mx", mx.toFixed(3));
      el.style.setProperty("--my", my.toFixed(3));
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden>
      {ITEMS.map((item, i) => (
        <div
          key={i}
          className="absolute transition-transform duration-300 ease-out"
          style={{
            top: item.top,
            left: item.left,
            transform: `translate(calc(var(--mx, 0) * ${item.depth}px), calc(var(--my, 0) * ${item.depth}px))`,
          }}
        >
          <div
            className="animate-hero-float opacity-90 drop-shadow-[0_18px_30px_rgba(0,0,0,0.55)]"
            style={
              {
                "--float-rot": `${item.rot}deg`,
                "--float-y": `${item.floatY}px`,
                "--float-duration": `${item.duration}s`,
                animationDelay: `${item.delay}s`,
                transform: `rotate(${item.rot}deg)`,
              } as React.CSSProperties
            }
          >
            {item.kind === "card" ? (
              <PlayingCard card={item.card} size={item.size} />
            ) : (
              <PokerChip size={item.chipSize} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
