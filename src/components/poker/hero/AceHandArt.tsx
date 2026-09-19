import { angleAt, axisGradient, buildDigit, crease, offsetLine, widthGradient } from "./digitGeometry";
import { SPADE_PATH } from "./spade";

/**
 * The hero object: a hand pinching a large Ace of Spades. The thumb presses
 * the card's face near its lower-right corner and the index finger supports it
 * from behind — the two converge on the same spot and open toward the lower
 * right, the way a real pinch does, rather than lying across the card.
 *
 * Only the fingertips are drawn, in normal human proportions (the card is
 * ~6 units per millimetre), and they sink into shadow within a few centimetres
 * so the hand supports the card instead of competing with it. Three
 * identically-sized SVG layers — the finger behind, the card, the thumb in
 * front — let each drift at its own depth under the cursor.
 *
 * Light comes from the emerald glow behind and to the upper left: it rims the
 * card and digits, shades them smoothly into a green-black underside, and the
 * card's edge, thickness and contact shadows follow the same direction.
 */

const VIEW = "0 0 1200 1200";
const PLACE = "translate(470 470) rotate(-12)";

/** Thumb: the pad presses the card face; the tip joint flexes toward the card. */
const THUMB = buildDigit({
  points: [
    [120, 148],
    [163, 193],
    [206, 238],
    [252, 276],
    [318, 330],
    [380, 380],
    [456, 437],
    [556, 510],
    [680, 596],
  ],
  widths: [
    [0, 68],
    [50, 76],
    [120, 80],
    [175, 88],
    [218, 80],
    [300, 90],
    [420, 104],
    [600, 124],
    [900, 150],
  ],
});

/** Index finger: tip behind the card opposite the thumb pad; palm side faces us. */
const INDEX = buildDigit({
  points: [
    [130, 128],
    [188, 150],
    [248, 174],
    [310, 200],
    [372, 226],
    [448, 256],
    [540, 292],
    [650, 336],
    [780, 388],
  ],
  widths: [
    [0, 56],
    [60, 62],
    [112, 63],
    [136, 67],
    [180, 62],
    [258, 70],
    [292, 66],
    [420, 76],
    [700, 92],
    [1000, 108],
  ],
});

/** A little smaller than the digit is wide, like a real nail; free edge toward -x. */
const NAIL = "M -26 -13 Q -27 -20 -18 -20 L 12 -20 Q 27 -18 27 0 Q 27 18 12 20 L -18 20 Q -27 20 -26 13 Z";

const SPADE = SPADE_PATH;

/** Emerald rim on the edges facing the light, drawn without the source graphic
 * so it can be masked and faded separately. */
function RimFilter({ id, strength = 1 }: { id: string; strength?: number }) {
  return (
    <filter id={id} x="-15%" y="-25%" width="130%" height="150%" colorInterpolationFilters="sRGB">
      <feOffset in="SourceAlpha" dx="4" dy="5" result="shifted" />
      <feComposite in="SourceAlpha" in2="shifted" operator="out" result="edge" />
      <feGaussianBlur in="edge" stdDeviation="1.3" result="edgeSoft" />
      <feFlood floodColor="#8dffd0" floodOpacity={0.7 * strength} result="rimColor" />
      <feComposite in="rimColor" in2="edgeSoft" operator="in" result="rim" />
      <feGaussianBlur in="edge" stdDeviation="7" result="edgeGlow" />
      <feFlood floodColor="#1fd99b" floodOpacity={0.09 * strength} result="glowColor" />
      <feComposite in="glowColor" in2="edgeGlow" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="rim" />
      </feMerge>
    </filter>
  );
}

function SkinDefs({ p }: { p: string }) {
  return (
    <defs>
      <RimFilter id={`${p}rimOnly`} strength={0.85} />
      <filter id={`${p}blur8`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id={`${p}blur3`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
      <filter id={`${p}blur2`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      {/* The rim light concentrates near the fingertips, where it would catch. */}
      <linearGradient id={`${p}rimGrad`} gradientUnits="userSpaceOnUse" x1="110" y1="0" x2="440" y2="0">
        <stop offset="0" stopColor="#fff" />
        <stop offset="1" stopColor="#4a4a4a" />
      </linearGradient>
      <mask id={`${p}rimFade`} maskUnits="userSpaceOnUse" x="-300" y="-500" width="1800" height="1400">
        <rect x="-300" y="-500" width="1800" height="1400" fill={`url(#${p}rimGrad)`} />
      </mask>
      <linearGradient id={`${p}nail`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f0cdb9" />
        <stop offset="0.55" stopColor="#d6a48d" />
        <stop offset="1" stopColor="#9c6653" />
      </linearGradient>
      <clipPath id={`${p}cardClip`}>
        <rect x="-190" y="-266" width="380" height="532" rx="28" />
      </clipPath>
    </defs>
  );
}

/**
 * One digit: smooth cylindrical shading across its width (lit edge toward the
 * upper left, a warm translucent band near the terminator, then a green-black
 * underside picking up bounce from the scene), a soft highlight streak, the
 * emerald rim near the fingertip, and a fall into shadow toward the hand.
 */
function DigitBody({
  digit,
  p,
  id,
  gradAt,
  fall,
  fade,
  rim = 1,
}: {
  digit: typeof THUMB;
  p: string;
  id: string;
  gradAt: number;
  fall: [number, number];
  fade: [number, number];
  rim?: number;
}) {
  const g = widthGradient(digit, gradAt);
  const a = axisGradient(digit, fall[0], fall[1]);
  const f = axisGradient(digit, fade[0], fade[1]);
  return (
    <g mask={`url(#${p}${id}-fade)`}>
      <defs>
        {/* Beyond the fall into shadow, the digit dissolves into the dark
            scene, so only the fingertips read as a hand. */}
        <linearGradient id={`${p}${id}-fadeGrad`} gradientUnits="userSpaceOnUse" x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${p}${id}-fade`} maskUnits="userSpaceOnUse" x="-400" y="-600" width="2000" height="1800">
          <rect x="-400" y="-600" width="2000" height="1800" fill={`url(#${p}${id}-fadeGrad)`} />
        </mask>
        <linearGradient id={`${p}${id}-skin`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          <stop offset="0" stopColor="#c99a7c" />
          <stop offset="0.18" stopColor="#a87458" />
          <stop offset="0.46" stopColor="#62402f" />
          <stop offset="0.66" stopColor="#4a2a20" />
          <stop offset="0.84" stopColor="#22120d" />
          <stop offset="1" stopColor="#0b1612" />
        </linearGradient>
        <linearGradient id={`${p}${id}-fall`} gradientUnits="userSpaceOnUse" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}>
          <stop offset="0" stopColor="#030201" stopOpacity="0" />
          <stop offset="1" stopColor="#030201" stopOpacity="0.96" />
        </linearGradient>
        <linearGradient id={`${p}${id}-streakLit`} gradientUnits="userSpaceOnUse" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}>
          <stop offset="0" stopColor="#e2b394" stopOpacity="0.36" />
          <stop offset="0.8" stopColor="#e2b394" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}${id}-streakBounce`} gradientUnits="userSpaceOnUse" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}>
          <stop offset="0" stopColor="#3fe6b0" stopOpacity="0.24" />
          <stop offset="0.8" stopColor="#3fe6b0" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={digit.outline} fill={`url(#${p}${id}-skin)`} />
      <path
        d={offsetLine(digit, -0.42, 20, 360)}
        fill="none"
        stroke={`url(#${p}${id}-streakLit)`}
        strokeWidth="8"
        strokeLinecap="round"
        filter={`url(#${p}blur3)`}
      />
      <path
        d={offsetLine(digit, 0.8, 30, 360)}
        fill="none"
        stroke={`url(#${p}${id}-streakBounce)`}
        strokeWidth="6"
        strokeLinecap="round"
        filter={`url(#${p}blur3)`}
      />
      <g mask={`url(#${p}rimFade)`} opacity={rim}>
        <path d={digit.outline} fill="#000" filter={`url(#${p}rimOnly)`} />
      </g>
      <path d={digit.outline} fill={`url(#${p}${id}-fall)`} />
    </g>
  );
}

/** Skin creases: a dark fold with a faint catch-light beside it. */
function Creases({ digit, spots }: { digit: typeof THUMB; spots: { d: number; span?: number; bow?: number }[] }) {
  return (
    <>
      {spots.map(({ d, span, bow }) => {
        const path = crease(digit, d, span, bow);
        const lit = crease(digit, d - 3.2, span, bow);
        return (
          <g key={d}>
            <path d={lit} fill="none" stroke="#f0c7aa" strokeOpacity="0.13" strokeWidth="1.1" strokeLinecap="round" />
            <path d={path} fill="none" stroke="#120806" strokeOpacity="0.34" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        );
      })}
    </>
  );
}

/** Behind the card: the index finger, palm side toward us, past the card's edge. */
export function AceHandBack() {
  const p = "hb-";
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        <DigitBody digit={INDEX} p={p} id="idx" gradAt={190} fall={[90, 240]} fade={[250, 400]} rim={0.4} />
        {/* Palm-side creases at the fingertip joint (DIP) and the middle joint (PIP). */}
        <Creases
          digit={INDEX}
          spots={[
            { d: 128, span: 0.72, bow: 3 },
            { d: 138, span: 0.58, bow: 3 },
            { d: 262, span: 0.76, bow: 4 },
            { d: 272, span: 0.62, bow: 4 },
          ]}
        />
        {/* The card's edge shadows the finger just behind it. */}
        <rect
          x="-176"
          y="-250"
          width="380"
          height="532"
          rx="28"
          fill="#000"
          opacity="0.62"
          transform="translate(20 22)"
          filter={`url(#${p}blur8)`}
        />
      </g>
    </svg>
  );
}

/** The card itself: paper thickness, edge light, grain, and an embossed spade. */
export function AceCard() {
  const p = "ac-";
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${p}face`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.5" stopColor="#f2edde" />
          <stop offset="1" stopColor="#d6d0ba" />
        </linearGradient>
        <linearGradient id={`${p}spade`} x1="0" y1="-70" x2="0" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f4a40" />
          <stop offset="0.35" stopColor="#0e1a15" />
          <stop offset="1" stopColor="#03070a" />
        </linearGradient>
        <linearGradient id={`${p}glare`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.26" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Paper edge: pale on the lit side, darkening as it turns from the light. */}
        <linearGradient id={`${p}edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3efe1" />
          <stop offset="0.5" stopColor="#b9b39c" />
          <stop offset="1" stopColor="#6d6959" />
        </linearGradient>
        <linearGradient id={`${p}emerald`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#8dffd4" stopOpacity="1" />
          <stop offset="0.42" stopColor="#25d59d" stopOpacity="0.3" />
          <stop offset="1" stopColor="#25d59d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}edgeHi`} x1="0" y1="0" x2="1" y2="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}back`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f4a39" />
          <stop offset="1" stopColor="#03130e" />
        </linearGradient>
        {/* Where the thumb presses, the card takes a soft, slightly darker dent. */}
        <radialGradient id={`${p}press`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#3a3222" stopOpacity="0.2" />
          <stop offset="1" stopColor="#3a3222" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${p}clip`}>
          <rect x="-190" y="-266" width="380" height="532" rx="28" />
        </clipPath>
        <filter id={`${p}blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={`${p}bloom`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id={`${p}soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        {/* Fine paper grain, barely there. */}
        <filter id={`${p}grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
        </filter>
      </defs>

      {/* One faint card behind the ace, purely atmospheric. */}
      <g className="hero-fan" opacity="0.28" filter={`url(#${p}blur)`}>
        <g transform="translate(420 455) rotate(-24)">
          <rect x="-190" y="-266" width="380" height="532" rx="28" fill={`url(#${p}back)`} stroke="#39d6a0" strokeOpacity="0.35" strokeWidth="2" />
        </g>
      </g>

      <g transform={PLACE}>
        {/* Emerald bloom spilling from behind the card. */}
        <rect x="-200" y="-276" width="400" height="552" rx="34" fill="#30e0a5" opacity="0.34" filter={`url(#${p}bloom)`} />
        {/* Paper thickness: a few layered edges stepping away from the light. */}
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="#4d4a3f" transform="translate(8 11)" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill={`url(#${p}edge)`} transform="translate(5.5 7.5)" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="#e2ddc9" transform="translate(3 4)" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill={`url(#${p}face)`} />

        <g clipPath={`url(#${p}clip)`}>
          <rect x="-176" y="-252" width="352" height="504" rx="18" fill="none" stroke="#0b1512" strokeOpacity="0.16" strokeWidth="2" />
          <rect x="-170" y="-246" width="340" height="492" rx="14" fill="none" stroke="#0b1512" strokeOpacity="0.07" strokeWidth="1" />
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
          {/* The big spade, lightly embossed: a pale lip below-right, a dark
              inner edge above-left. */}
          <g transform="translate(0 6) scale(2.35)">
            <path d={SPADE} fill="#fff" opacity="0.75" transform="translate(0.7 0.8)" />
            <path d={SPADE} fill={`url(#${p}spade)`} />
            <path
              d="M0,-62 C 8,-42 46,-20 50,6"
              fill="none"
              stroke="#7dffc9"
              strokeOpacity="0.32"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
          <circle cx="112" cy="146" r="86" fill={`url(#${p}press)`} />
          <rect x="-190" y="-266" width="380" height="532" filter={`url(#${p}grain)`} opacity="0.055" style={{ mixBlendMode: "multiply" }} />
          <rect x="-190" y="-266" width="380" height="532" fill={`url(#${p}glare)`} />
        </g>
        {/* Edge light: a crisp white catch on the lit corner, the emerald key
            light along the left and top, and a dark seam where the face meets
            the paper edge. */}
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="1" transform="translate(0.6 0.6)" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="none" stroke={`url(#${p}emerald)`} strokeWidth="4.5" />
        <rect x="-190" y="-266" width="380" height="532" rx="28" fill="none" stroke={`url(#${p}edgeHi)`} strokeWidth="1.6" filter={`url(#${p}soft)`} />
      </g>
    </svg>
  );
}

/** In front of the card: the thumb pressing on its face. */
export function AceHandFront() {
  const p = "hf-";
  const nail = THUMB.at(40);
  const nailAngle = angleAt(THUMB, 40);
  const nailTransform = `translate(${nail.p[0].toFixed(1)} ${nail.p[1].toFixed(1)}) rotate(${nailAngle.toFixed(1)})`;
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        {/* Contact shadows on the card: tight and dark right at the pad, then a
            broader, softer one falling away from the light. */}
        <g clipPath={`url(#${p}cardClip)`}>
          <path d={THUMB.outline} fill="#000" opacity="0.5" transform="translate(14 21)" filter={`url(#${p}blur8)`} />
          <path d={THUMB.outline} fill="#000" opacity="0.62" transform="translate(5 8)" filter={`url(#${p}blur2)`} />
        </g>
        <DigitBody digit={THUMB} p={p} id="thumb" gradAt={230} fall={[120, 270]} fade={[290, 450]} />
        {/* Knuckle folds over the tip joint. */}
        <Creases
          digit={THUMB}
          spots={[
            { d: 168, span: 0.5, bow: 3 },
            { d: 180, span: 0.6, bow: 3 },
            { d: 193, span: 0.38, bow: 3 },
          ]}
        />
        {/* Thumbnail: squared free edge toward the card, arched cuticle toward
            the hand, seen a little translucent over pink skin. */}
        <g transform={nailTransform}>
          <path d={NAIL} fill={`url(#${p}nail)`} opacity="0.92" />
          <ellipse cx="17" cy="0" rx="6" ry="10" fill="#f6dccb" opacity="0.3" />
          <path d={NAIL} fill="none" stroke="#8dffd0" strokeOpacity="0.26" strokeWidth="1.1" />
          <path d="M -17 -14 Q -5 -17 8 -14" fill="none" stroke="#fff" strokeOpacity="0.36" strokeWidth="2.6" strokeLinecap="round" filter={`url(#${p}blur2)`} />
          <path d="M 25 -11 Q 31 0 25 11" fill="none" stroke="#120806" strokeOpacity="0.3" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
