import { angleAt, buildDigit, crease, offsetLine, widthGradient } from "./digitGeometry";

/**
 * The hero object: a hand pinching a large Ace of Spades between the thumb
 * (pressing on the front) and the middle finger (supporting from behind).
 * Drawn as three identically-sized SVG layers — the finger behind, the card,
 * then the thumb in front — so each can drift at its own depth under the
 * cursor and the card visibly slides between them.
 *
 * Only the two digits are shown, in normal human proportions (the card is
 * ~6 units per millimetre, so the thumb is ~20mm wide and the middle finger
 * ~15mm), and they run off toward the hand, which stays out of frame. Each
 * digit is a rounded, lit form — shaded by a lighting filter from a blurred
 * height map, then edged by the same emerald key light as the card — with
 * joint creases and a nail, rather than a flat silhouette.
 */

const VIEW = "0 0 1200 1200";
const PLACE = "translate(470 470) rotate(-12)";

/** Thumb: tip presses the card face near its right edge; runs off lower-right. */
const THUMB = buildDigit({
  points: [
    [112, 128],
    [190, 150],
    [268, 173],
    [350, 198],
    [432, 224],
    [520, 252],
    [612, 282],
    [740, 326],
    [900, 380],
  ],
  widths: [
    [0, 78],
    [60, 86],
    [130, 88],
    [180, 100],
    [225, 94],
    [300, 104],
    [420, 120],
    [640, 142],
    [1000, 166],
  ],
});

/** Middle finger: tip is behind the card, opposite the thumb; its palm side
 * shows past the card's right edge. */
const MIDDLE = buildDigit({
  points: [
    [136, 122],
    [212, 111],
    [290, 100],
    [372, 90],
    [456, 82],
    [546, 76],
    [640, 74],
    [780, 76],
    [920, 82],
  ],
  widths: [
    [0, 66],
    [70, 72],
    [120, 72],
    [150, 78],
    [200, 73],
    [300, 84],
    [340, 79],
    [450, 90],
    [700, 108],
    [1000, 124],
  ],
});

/** Smaller than the digit is wide, like a real nail; free edge toward -x. */
const NAIL = "M -30 -15 Q -31 -23 -21 -23 L 14 -23 Q 31 -21 31 0 Q 31 21 14 23 L -21 23 Q -31 23 -30 15 Z";

const SPADE =
  "M0,-70 C 10,-45 62,-20 62,15 C 62,40 42,52 22,48 C 16,47 10,44 8,42 " +
  "C 10,55 16,68 28,80 L -28,80 C -16,68 -10,55 -8,42 C -10,44 -16,47 -22,48 " +
  "C -42,52 -62,40 -62,15 C -62,-20 -10,-45 0,-70 Z";

/** Hard emerald rim on the edges facing the light, optionally without the
 * source graphic so it can be masked separately. */
function RimFilter({ id, strength = 1, rimOnly = false }: { id: string; strength?: number; rimOnly?: boolean }) {
  return (
    <filter id={id} x="-15%" y="-25%" width="130%" height="150%" colorInterpolationFilters="sRGB">
      <feOffset in="SourceAlpha" dx="7" dy="9" result="shifted" />
      <feComposite in="SourceAlpha" in2="shifted" operator="out" result="edge" />
      <feGaussianBlur in="edge" stdDeviation="2.2" result="edgeSoft" />
      <feFlood floodColor="#8dffd0" floodOpacity={0.9 * strength} result="rimColor" />
      <feComposite in="rimColor" in2="edgeSoft" operator="in" result="rim" />
      <feGaussianBlur in="edge" stdDeviation="8" result="edgeGlow" />
      <feFlood floodColor="#1fd99b" floodOpacity={0.45 * strength} result="glowColor" />
      <feComposite in="glowColor" in2="edgeGlow" operator="in" result="glow" />
      <feMerge>
        {!rimOnly && <feMergeNode in="SourceGraphic" />}
        <feMergeNode in="glow" />
        <feMergeNode in="rim" />
      </feMerge>
    </filter>
  );
}

function SkinDefs({ p }: { p: string }) {
  return (
    <defs>
      <RimFilter id={`${p}rimOnly`} rimOnly strength={0.85} />
      <filter id={`${p}blur8`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id={`${p}blur3`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
      <filter id={`${p}blur2`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      {/* Toward the hand, which stays out of frame, the digits sink into shadow. */}
      <linearGradient id={`${p}streakLit`} gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="470" y2="0">
        <stop offset="0" stopColor="#e2b394" stopOpacity="0.34" />
        <stop offset="1" stopColor="#e2b394" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${p}streakBounce`} gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="470" y2="0">
        <stop offset="0" stopColor="#3fe6b0" stopOpacity="0.2" />
        <stop offset="1" stopColor="#3fe6b0" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${p}shadowFall`} gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="720" y2="0">
        <stop offset="0" stopColor="#030201" stopOpacity="0" />
        <stop offset="1" stopColor="#030201" stopOpacity="0.92" />
      </linearGradient>
      {/* Rim light concentrates near the fingertips, where it would catch. */}
      <linearGradient id={`${p}rimGrad`} gradientUnits="userSpaceOnUse" x1="110" y1="0" x2="420" y2="0">
        <stop offset="0" stopColor="#fff" />
        <stop offset="1" stopColor="#4a4a4a" />
      </linearGradient>
      <mask id={`${p}rimFade`} maskUnits="userSpaceOnUse" x="-300" y="-500" width="1800" height="1400">
        <rect x="-300" y="-500" width="1800" height="1400" fill={`url(#${p}rimGrad)`} />
      </mask>
      <linearGradient id={`${p}nail`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3d3c0" />
        <stop offset="0.55" stopColor="#d9a891" />
        <stop offset="1" stopColor="#a86f5b" />
      </linearGradient>
      <clipPath id={`${p}cardClip`}>
        <rect x="-190" y="-266" width="380" height="532" rx="28" />
      </clipPath>
    </defs>
  );
}

/**
 * One digit: a smooth cylindrical shade across its width (lit edge toward the
 * upper left, falling to a green-black underside that picks up bounce from the
 * scene), a soft highlight streak, then the emerald rim near the tip.
 */
function DigitBody({ digit, p, id, gradAt, rim = 1 }: { digit: typeof THUMB; p: string; id: string; gradAt: number; rim?: number }) {
  const g = widthGradient(digit, gradAt);
  return (
    <>
      <defs>
        <linearGradient id={`${p}${id}-skin`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          <stop offset="0" stopColor="#b98a6f" />
          <stop offset="0.16" stopColor="#9a6c54" />
          <stop offset="0.48" stopColor="#5f3d2e" />
          <stop offset="0.82" stopColor="#24140e" />
          <stop offset="1" stopColor="#0b1612" />
        </linearGradient>
      </defs>
      <path d={digit.outline} fill={`url(#${p}${id}-skin)`} />
      <path d={digit.outline} fill={`url(#${p}shadowFall)`} />
      <path d={offsetLine(digit, -0.42, 20, 420)} fill="none" stroke={`url(#${p}streakLit)`} strokeWidth="9" strokeLinecap="round" filter={`url(#${p}blur3)`} />
      <path d={offsetLine(digit, 0.78, 30, 420)} fill="none" stroke={`url(#${p}streakBounce)`} strokeWidth="7" strokeLinecap="round" filter={`url(#${p}blur3)`} />
      <g mask={`url(#${p}rimFade)`} opacity={rim}>
        <path d={digit.outline} fill="#000" filter={`url(#${p}rimOnly)`} />
      </g>
    </>
  );
}

/** Skin creases: a dark fold with a faint catch-light beside it. */
function Creases({ digit, spots }: { digit: typeof THUMB; spots: { d: number; span?: number; bow?: number }[] }) {
  return (
    <>
      {spots.map(({ d, span, bow }) => {
        const path = crease(digit, d, span, bow);
        const lit = crease(digit, d - 3.5, span, bow);
        return (
          <g key={d}>
            <path d={lit} fill="none" stroke="#f0c7aa" strokeOpacity="0.14" strokeWidth="1.2" strokeLinecap="round" />
            <path d={path} fill="none" stroke="#120806" strokeOpacity="0.36" strokeWidth="1.7" strokeLinecap="round" />
          </g>
        );
      })}
    </>
  );
}

/** Behind the card: the middle finger, palm side toward us, past the card's edge. */
export function AceHandBack() {
  const p = "hb-";
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        <g>
          <DigitBody digit={MIDDLE} p={p} id="mid" gradAt={200} rim={0.4} />
          {/* Palm-side creases at the fingertip joint (DIP) and the middle joint (PIP). */}
          <Creases
            digit={MIDDLE}
            spots={[
              { d: 150, span: 0.74, bow: 3 },
              { d: 304, span: 0.78, bow: 4 },
            ]}
          />
        </g>
        {/* The card's own shadow falling across the finger behind it. */}
        <rect
          x="-176"
          y="-250"
          width="380"
          height="532"
          rx="28"
          fill="#000"
          opacity="0.6"
          transform="translate(22 26)"
          filter={`url(#${p}blur8)`}
        />
      </g>
    </svg>
  );
}

/** The card itself. */
export function AceCard() {
  const p = "ac-";
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${p}face`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.55" stopColor="#f0ebdb" />
          <stop offset="1" stopColor="#d3cdb6" />
        </linearGradient>
        <linearGradient id={`${p}spade`} x1="0" y1="-70" x2="0" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f4a40" />
          <stop offset="0.35" stopColor="#0e1a15" />
          <stop offset="1" stopColor="#03070a" />
        </linearGradient>
        <linearGradient id={`${p}glare`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.28" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}emerald`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#7dffc9" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#25d59d" stopOpacity="0.28" />
          <stop offset="1" stopColor="#25d59d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}back`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f4a39" />
          <stop offset="1" stopColor="#03130e" />
        </linearGradient>
        <clipPath id={`${p}clip`}>
          <rect x="-190" y="-266" width="380" height="532" rx="28" />
        </clipPath>
        <filter id={`${p}blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id={`${p}bloom`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <pattern id={`${p}lattice`} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0H26M0 0V26" stroke="#3dd9a4" strokeOpacity="0.18" strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* Two more cards fanned behind the ace — only slivers show. */}
      <g className="hero-fan" opacity="0.85" filter={`url(#${p}blur)`}>
        {[-30, -20].map((rot, i) => (
          <g key={rot} transform={`translate(${430 - i * 8} 455) rotate(${rot})`}>
            <rect
              x="-190"
              y="-266"
              width="380"
              height="532"
              rx="28"
              fill={`url(#${p}back)`}
              stroke="#39d6a0"
              strokeOpacity="0.4"
              strokeWidth="2"
            />
            <rect x="-190" y="-266" width="380" height="532" rx="28" fill={`url(#${p}lattice)`} />
          </g>
        ))}
      </g>

      <g transform={PLACE}>
        {/* Emerald bloom spilling from behind the card. */}
        <rect x="-200" y="-276" width="400" height="552" rx="34" fill="#30e0a5" opacity="0.5" filter={`url(#${p}bloom)`} />
        {/* Card thickness. */}
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="#a7a28c" transform="translate(6 8)" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill={`url(#${p}face)`} />

        <g clipPath={`url(#${p}clip)`}>
          <rect x="-176" y="-252" width="352" height="504" rx="18" fill="none" stroke="#0b1512" strokeOpacity="0.14" strokeWidth="2" />
          {/* Corner indices. */}
          <g fill="#0a120f" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="800">
            <text x="-158" y="-172" fontSize="88" textAnchor="middle">
              A
            </text>
            <g transform="translate(-158 -128) scale(0.34)">
              <path d={SPADE} />
            </g>
            <g transform="rotate(180)">
              <text x="-158" y="-172" fontSize="88" textAnchor="middle">
                A
              </text>
              <g transform="translate(-158 -128) scale(0.34)">
                <path d={SPADE} />
              </g>
            </g>
          </g>
          {/* The big spade. */}
          <g transform="translate(0 6) scale(2.35)">
            <path d={SPADE} fill={`url(#${p}spade)`} />
            <path
              d="M0,-62 C 8,-42 46,-20 50,6"
              fill="none"
              stroke="#7dffc9"
              strokeOpacity="0.35"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
          <rect x="-190" y="-266" width="380" height="532" fill={`url(#${p}glare)`} />
        </g>
        {/* Rim light: the left and top edges catch the emerald key light. */}
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="none" stroke={`url(#${p}emerald)`} strokeWidth="4" />
      </g>
    </svg>
  );
}

/** In front of the card: the thumb pressing on its face. */
export function AceHandFront() {
  const p = "hf-";
  const nail = THUMB.at(58);
  const nailAngle = angleAt(THUMB, 58);
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        {/* The thumb's shadow on the card face, darkest right at the fingertip. */}
        <g clipPath={`url(#${p}cardClip)`}>
          <path d={THUMB.outline} fill="#000" opacity="0.55" transform="translate(13 20)" filter={`url(#${p}blur8)`} />
        </g>
        <g>
          <DigitBody digit={THUMB} p={p} id="thumb" gradAt={220} />
          {/* Knuckle folds over the thumb's tip joint. */}
          <Creases
            digit={THUMB}
            spots={[
              { d: 176, span: 0.5, bow: 3 },
              { d: 190, span: 0.6, bow: 3 },
            ]}
          />
          {/* Thumbnail: squared-off free edge toward the card, arched cuticle
              toward the hand, seen a little translucent over pink skin. */}
          <g transform={`translate(${nail.p[0].toFixed(1)} ${nail.p[1].toFixed(1)}) rotate(${nailAngle.toFixed(1)})`}>
            <path d={NAIL} fill={`url(#${p}nail)`} opacity="0.9" />
            <path d={NAIL} fill="none" stroke="#8dffd0" strokeOpacity="0.28" strokeWidth="1.2" />
            <path d="M -22 -17 Q -6 -21 11 -18" fill="none" stroke="#fff" strokeOpacity="0.34" strokeWidth="3" strokeLinecap="round" filter={`url(#${p}blur2)`} />
            <path d="M 36 -14 Q 43 0 36 14" fill="none" stroke="#120806" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}
