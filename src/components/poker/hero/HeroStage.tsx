"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { AceCard, AceHandBack, AceHandFront } from "./AceHandArt";
import { ChipStackArt } from "./ChipStackArt";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface LayerProps {
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  /** Cursor travel in px at the screen edge — bigger = nearer the viewer. */
  depth: number;
  /** Entrance delay, seconds. */
  delay?: number;
  /** Idle float amplitude in px (0 = still). */
  float?: number;
  /** Degrees of cursor-driven tilt (the ace). */
  tilt?: number;
  className?: string;
  testId?: string;
  children: ReactNode;
}

/**
 * One depth plane. Three nested wrappers so their transforms never fight:
 * outer = entrance, middle = cursor parallax/tilt (spring-smoothed upstream),
 * inner = idle float. Reduced-motion users get a plain fade.
 */
function Layer({ sx, sy, depth, delay = 0, float = 0, tilt = 0, className, testId, children }: LayerProps) {
  const reduced = useReducedMotion();
  const x = useTransform(sx, (v) => v * depth);
  const y = useTransform(sy, (v) => v * depth * 0.7);
  const rotateY = useTransform(sx, (v) => v * tilt);
  const rotateX = useTransform(sy, (v) => v * -tilt * 0.75);

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 70, scale: reduced ? 1 : 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduced ? 0.4 : 1.25, delay, ease: EASE_OUT }}
    >
      <motion.div
        data-testid={testId}
        className="hero-layer-fill"
        style={tilt ? { x, y, rotateX, rotateY, transformPerspective: 1100 } : { x, y }}
      >
        <motion.div
          className="hero-layer-fill"
          animate={reduced || !float ? undefined : { y: [0, -float, 0] }}
          transition={{ duration: 5.5 + delay * 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function Label({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`hero-label ${className}`}
      initial={{ opacity: 0, y: reduced ? 0 : 18 }}
      animate={reduced ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -7, 0] }}
      transition={{
        opacity: { duration: 0.7, delay },
        y: reduced
          ? { duration: 0.7, delay }
          : { duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay },
      }}
    >
      <span className="hero-label-dot" />
      {children}
    </motion.div>
  );
}

/**
 * The hero artwork: a dark, emerald-lit scene — oversized background type,
 * a felt surface and reflective floor, chip stacks at mid depth, and a hand
 * pinching a huge Ace of Spades at the front. Purely decorative and
 * pointer-transparent; all interaction is the cursor drifting each plane by
 * a different amount.
 */
export function HeroStage() {
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spring = { stiffness: 70, damping: 18, mass: 0.7 };
  const sx = useSpring(mx, spring);
  const sy = useSpring(my, spring);

  useEffect(() => {
    if (reduced) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px)");
    const move = (e: PointerEvent) => {
      if (!fine.matches || e.pointerType !== "mouse") return;
      mx.set(Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1)));
      my.set(Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1)));
    };
    const reset = () => {
      mx.set(0);
      my.set(0);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
    };
  }, [reduced, mx, my]);

  const glowX = useTransform(sx, (v) => v * 70);
  const glowY = useTransform(sy, (v) => v * 46);
  const textX = useTransform(sx, (v) => v * -14);

  return (
    <div className="hero-stage" data-testid="hero-stage" aria-hidden="true">
      {/* Background: oversized type, cropped by the top edge like a poster. */}
      <motion.div className="hero-bigtype" style={{ x: textX }}>
        <span>POKER</span>
        <span>ANYWHERE</span>
      </motion.div>
      <motion.div className="hero-glow" style={{ x: glowX, y: glowY }} />
      <div className="hero-glow hero-glow-teal" />
      <div className="hero-grain" />

      <div className="hero-art">
        <Layer sx={sx} sy={sy} depth={8} delay={0.05} className="hero-felt-wrap">
          <div className="hero-felt">
            <svg viewBox="0 0 800 300" className="hero-swirl">
              <defs>
                <linearGradient id="swirl" x1="0" x2="1">
                  <stop offset="0" stopColor="#2dd9a0" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#7dffc9" stopOpacity="0.9" />
                  <stop offset="1" stopColor="#2dd9a0" stopOpacity="0" />
                </linearGradient>
                <filter id="swirlBlur"><feGaussianBlur stdDeviation="3" /></filter>
              </defs>
              <path d="M40 210 C 200 120, 560 110, 760 190" fill="none" stroke="url(#swirl)" strokeWidth="5" filter="url(#swirlBlur)" />
              <path d="M90 250 C 260 170, 540 165, 720 235" fill="none" stroke="url(#swirl)" strokeWidth="2" opacity="0.6" />
            </svg>
          </div>
        </Layer>

        <div className="hero-hand-box">
          <Layer sx={sx} sy={sy} depth={10} delay={0.2} float={6} className="hero-layer-abs">
            <AceHandBack />
          </Layer>
          <Layer sx={sx} sy={sy} depth={22} delay={0.3} float={9} tilt={4} testId="hero-ace" className="hero-layer-abs">
            <AceCard />
          </Layer>
          <Layer sx={sx} sy={sy} depth={15} delay={0.38} float={7} className="hero-layer-abs">
            <AceHandFront />
          </Layer>
          {/* The stacks sit on the table in front of the card, anchored to
              the hand group so they stay tied to it at every viewport size. */}
          <Layer sx={sx} sy={sy} depth={-26} delay={0.45} float={4} className="hero-chips-a">
            <ChipStackArt chips={["black", "black", "emerald", "emerald", "emerald", "emerald", "ivory"]} className="hero-chip-svg" />
          </Layer>
          <Layer sx={sx} sy={sy} depth={-16} delay={0.55} float={3} className="hero-chips-b">
            <ChipStackArt chips={["emerald", "emerald", "red", "black", "emerald"]} className="hero-chip-svg" />
          </Layer>
        </div>

        <Layer sx={sx} sy={sy} depth={-34} delay={0.5} float={3} className="hero-chips-fg">
          <ChipStackArt chips={["black", "emerald", "emerald", "black"]} className="hero-chip-svg hero-chip-blur" />
        </Layer>

        <div className="hero-spill" />

        <Label className="hero-label-1" delay={0.9}>Private Tables</Label>
        <Label className="hero-label-2" delay={1.1}>Play With Friends</Label>
        <Label className="hero-label-3" delay={1.3}>No Download</Label>
      </div>

      <div className="hero-vignette" />
    </div>
  );
}
