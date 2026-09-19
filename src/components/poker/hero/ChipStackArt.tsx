import { useId } from "react";
import { SPADE_PATH } from "./spade";

export type ChipTone = "emerald" | "black" | "red" | "ivory";

const TONES: Record<ChipTone, { body: string; deep: string; stripe: string; face: string }> = {
  emerald: { body: "#13a071", deep: "#06382a", stripe: "#eaf6ee", face: "#0e7a58" },
  black: { body: "#2b3430", deep: "#070b09", stripe: "#a6f0c9", face: "#161d1a" },
  red: { body: "#c23a3a", deep: "#4a0d10", stripe: "#f6e6e2", face: "#a02a2d" },
  ivory: { body: "#e9e4d2", deep: "#7c7864", stripe: "#1c5a44", face: "#d6d1bd" },
};

const W = 200;
const CHIP_H = 17;
const ELL_RY = 25;

/**
 * A premium chip stack drawn in perspective: each chip is a side band with
 * edge inlays, capped by an elliptical face; the top chip's face carries the
 * emerald key light. Sized in its own viewBox so it can be dropped at any
 * scale (and blurred, as an out-of-focus foreground piece).
 */
export function ChipStackArt({ chips, className }: { chips: ChipTone[]; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const height = ELL_RY * 2 + chips.length * CHIP_H + 14;
  const baseY = height - ELL_RY - 6;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className={className} aria-hidden="true">
      <defs>
        {(Object.keys(TONES) as ChipTone[]).map((tone) => (
          <g key={tone}>
            <linearGradient id={`${uid}-${tone}-side`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={TONES[tone].body} />
              <stop offset="0.5" stopColor={TONES[tone].body} stopOpacity="0.85" />
              <stop offset="1" stopColor={TONES[tone].deep} />
            </linearGradient>
            <radialGradient id={`${uid}-${tone}-face`} cx="0.35" cy="0.3" r="0.9">
              <stop offset="0" stopColor={TONES[tone].body} />
              <stop offset="1" stopColor={TONES[tone].face} />
            </radialGradient>
          </g>
        ))}
        <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9dffd5" stopOpacity="0.6" />
          <stop offset="0.35" stopColor="#9dffd5" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx={W / 2 + 14} cy={baseY + 20} rx={W / 2 + 26} ry={ELL_RY + 9} fill={`url(#${uid}-floor)`} opacity="0.75" />
      <ellipse cx={W / 2 + 3} cy={baseY + CHIP_H - 2} rx={W / 2 - 2} ry={ELL_RY - 1} fill="#000" opacity="0.85" />

      {chips.map((tone, i) => {
        const y = baseY - i * CHIP_H;
        const t = TONES[tone];
        const isTop = i === chips.length - 1;
        const rx = W / 2 - 6;
        const left = W / 2 - rx;
        const right = W / 2 + rx;
        const midY = y + CHIP_H / 2;
        const side = `M ${left} ${y} L ${left} ${y + CHIP_H} A ${rx} ${ELL_RY} 0 0 0 ${right} ${y + CHIP_H} L ${right} ${y} Z`;
        return (
          <g key={i} transform={`translate(${i % 2 === 0 ? 0 : 1.5} 0)`}>
            {/* The side of the chip: the region between its top and bottom
                ellipse arcs, with edge inlays that follow the same curve. */}
            <path d={side} fill={`url(#${uid}-${tone}-side)`} />
            <path
              d={`M ${left} ${midY} A ${rx} ${ELL_RY} 0 0 0 ${right} ${midY}`}
              fill="none"
              stroke={t.stripe}
              strokeWidth={CHIP_H * 0.6}
              strokeDasharray="15 15"
              strokeOpacity="0.74"
            />
            <path d={side} fill={`url(#${uid}-shine)`} />
            {/* Occlusion where each chip sits on the one below, and a lit left edge. */}
            <path d={`M ${left} ${y + CHIP_H} A ${rx} ${ELL_RY} 0 0 0 ${right} ${y + CHIP_H}`} fill="none" stroke="#000" strokeOpacity="0.42" strokeWidth="3.4" />
            <path d={`M ${left + 0.8} ${y + 1} L ${left + 0.8} ${y + CHIP_H - 1}`} stroke="#b6ffe2" strokeOpacity="0.32" strokeWidth="1.4" />
            <ellipse cx={W / 2} cy={y} rx={rx} ry={ELL_RY} fill={`url(#${uid}-${tone}-face)`} />
            <ellipse
              cx={W / 2}
              cy={y}
              rx={rx}
              ry={ELL_RY}
              fill="none"
              stroke="#c9ffe8"
              strokeOpacity={isTop ? 0.22 : 0.12}
              strokeWidth="1.4"
            />
            <path d={`M ${left + 3} ${y + 5} A ${rx} ${ELL_RY} 0 0 1 ${W / 2 + 22} ${y - ELL_RY + 0.5}`} fill="none" stroke="#d8fff0" strokeOpacity={isTop ? 0.62 : 0.3} strokeWidth="1.7" strokeLinecap="round" />
            {isTop && (
              <>
                <ellipse cx={W / 2} cy={y} rx={rx - 30} ry={ELL_RY - 9} fill="none" stroke={t.stripe} strokeOpacity="0.75" strokeWidth="2.2" strokeDasharray="11 9" />
                <ellipse cx={W / 2} cy={y} rx={rx - 58} ry={ELL_RY - 16} fill="none" stroke={t.stripe} strokeOpacity="0.4" strokeWidth="1.4" />
                <g transform={`translate(${W / 2} ${y + 1}) scale(0.24 0.086)`} fill={t.stripe} opacity="0.55">
                  <path d={SPADE_PATH} />
                </g>
                <ellipse cx={W / 2 - 26} cy={y - 8} rx={34} ry={4.5} fill="#fff" opacity="0.16" />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
