"use client";

import { cn } from "@/lib/utils";

interface PokerChipProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** A simple stylised poker chip — edge notches, a lime face, for decorative use. */
export function PokerChip({ size = 64, className, style }: PokerChipProps) {
  return (
    <div
      className={cn("relative shrink-0 rounded-full shadow-[0_10px_24px_rgba(0,0,0,0.5)]", className)}
      style={{ width: size, height: size, ...style }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(oklch(0.97 0.02 128) 0deg 22.5deg, var(--accent-lime) 22.5deg 45deg)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ inset: size * 0.1, background: "var(--accent-lime)" }}
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
            fill="var(--accent-lime)"
          />
        </svg>
      </div>
    </div>
  );
}
