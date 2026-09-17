"use client";

import { cn } from "@/lib/utils";

interface PokerChipProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  denomination?: number;
}

/** A simple stylised poker chip — edge notches, a lime face, for decorative use. */
export function PokerChip({ size = 64, className, style, denomination = 25 }: PokerChipProps) {
  const color = denomination >= 1000 ? "#c4aa70" : denomination >= 100 ? "#587e9e" : denomination >= 25 ? "#72a980" : "#b77570";
  return (
    <div
      aria-hidden="true"
      className={cn("physical-chip relative shrink-0 rounded-full", className)}
      style={{ width: size, height: size, "--chip-color": color, ...style } as React.CSSProperties}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(#e5e1d1 0deg 12deg, var(--chip-color) 12deg 45deg)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ inset: size * 0.1, background: "var(--chip-color)" }}
      />
      <div
        className="absolute rounded-full border-2 border-dashed"
        style={{ inset: size * 0.16, borderColor: "oklch(0.97 0.02 128 / 0.55)" }}
      />
      <div
        className="absolute rounded-full"
        style={{ inset: size * 0.24, background: "var(--accent-lime-foreground)" }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" style={{ width: size * 0.28, height: size * 0.28 }}>
          <path
            d="M12 2C9 7 5 9.5 5 13.5a7 7 0 0014 0C19 9.5 15 7 12 2z"
            fill="var(--chip-color)"
          />
        </svg>
      </div>
    </div>
  );
}
