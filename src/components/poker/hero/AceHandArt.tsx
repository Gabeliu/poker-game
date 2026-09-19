/**
 * The hero object: a hand entering from the right, pinching a large Ace of
 * Spades between thumb (in front) and fingers (behind). Drawn as three
 * stacked, identically-sized SVG layers — fingers/hand behind, the card,
 * then the thumb in front — so each can drift at its own depth under the
 * cursor and the card visibly slides between thumb and fingers.
 *
 * Everything is authored in the card's own frame (origin = card centre,
 * card 380x532) and placed with one shared transform. The hand is
 * deliberately low-key — near-black skin, lit only by a hard emerald rim
 * from the left/top plus a warm bounce off the card — which is what keeps
 * it looking cinematic instead of like clip-art.
 */

const VIEW = "0 0 1200 1200";
const PLACE = "translate(470 470) rotate(-12)";
/** The hand swings clockwise about the pinch point, so it reaches up-left
 * from the bottom-right corner instead of poking in flat from the side. */
const HAND = "rotate(27 150 110)";

const THUMB =
  "M 120 98 C 160 100, 250 150, 345 196 C 400 222, 470 262, 540 300 L 575 520 " +
  "C 470 470, 380 386, 300 322 C 230 268, 170 212, 128 172 C 96 142, 92 108, 120 98 Z";
const MASS =
  "M 405 34 C 470 -8, 640 -32, 820 -12 L 1400 10 L 1400 1000 L 470 1000 " +
  "C 445 780, 530 600, 476 470 C 436 372, 366 250, 405 34 Z";
const INDEX = "M 470 18 C 400 24, 290 38, 160 70";
const MIDDLE = "M 480 122 C 400 126, 290 122, 150 122";
const SPADE =
  "M0,-70 C 10,-45 62,-20 62,15 C 62,40 42,52 22,48 C 16,47 10,44 8,42 " +
  "C 10,55 16,68 28,80 L -28,80 C -16,68 -10,55 -8,42 C -10,44 -16,47 -22,48 " +
  "C -42,52 -62,40 -62,15 C -62,-20 -10,-45 0,-70 Z";

/** Hard emerald rim on the edges facing the light (top-left). */
function RimFilter({ id, strength = 1, rimOnly = false }: { id: string; strength?: number; rimOnly?: boolean }) {
  return (
    <filter id={id} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
      <feOffset in="SourceAlpha" dx="8" dy="10" result="shifted" />
      <feComposite in="SourceAlpha" in2="shifted" operator="out" result="edge" />
      <feGaussianBlur in="edge" stdDeviation="2.4" result="edgeSoft" />
      <feFlood floodColor="#8dffd0" floodOpacity={0.95 * strength} result="rimColor" />
      <feComposite in="rimColor" in2="edgeSoft" operator="in" result="rim" />
      <feGaussianBlur in="edge" stdDeviation="9" result="edgeGlow" />
      <feFlood floodColor="#1fd99b" floodOpacity={0.55 * strength} result="glowColor" />
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
      <RimFilter id={`${p}rim`} />
      <RimFilter id={`${p}rimSoft`} strength={0.6} />
      <RimFilter id={`${p}rimFaint`} strength={0.28} />
      <RimFilter id={`${p}rimOnly`} rimOnly />
      <linearGradient id={`${p}tipFade`} gradientUnits="userSpaceOnUse" x1="110" y1="100" x2="430" y2="290">
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={`${p}tipMask`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="1200" height="1200">
        <rect x="-200" y="-200" width="1200" height="1200" fill={`url(#${p}tipFade)`} />
      </mask>
      <filter id={`${p}blur8`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id={`${p}blur3`} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <linearGradient id={`${p}thumb`} gradientUnits="userSpaceOnUse" x1="110" y1="100" x2="560" y2="470">
        <stop offset="0" stopColor="#3b251c" />
        <stop offset="0.22" stopColor="#170c09" />
        <stop offset="0.55" stopColor="#080404" />
        <stop offset="1" stopColor="#010000" />
      </linearGradient>
      <linearGradient id={`${p}mass`} gradientUnits="userSpaceOnUse" x1="400" y1="0" x2="1100" y2="900">
        <stop offset="0" stopColor="#1a0f0b" />
        <stop offset="0.3" stopColor="#070303" />
        <stop offset="1" stopColor="#000000" />
      </linearGradient>
      <linearGradient id={`${p}finger`} gradientUnits="userSpaceOnUse" x1="160" y1="40" x2="500" y2="170">
        <stop offset="0" stopColor="#26160f" />
        <stop offset="1" stopColor="#050202" />
      </linearGradient>
      <linearGradient id={`${p}nail`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9a7261" />
        <stop offset="1" stopColor="#4a2b22" />
      </linearGradient>
      <clipPath id={`${p}cardClip`}>
        <rect x="-190" y="-266" width="380" height="532" rx="28" />
      </clipPath>
    </defs>
  );
}

/** Behind the card: the index and middle fingers and the body of the hand. */
export function AceHandBack() {
  const p = "hb-";
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        <g transform={HAND}>
        {[INDEX, MIDDLE].map((d, i) => (
          <g key={d}>
            <path
              d={d}
              fill="none"
              stroke={`url(#${p}finger)`}
              strokeWidth={i === 0 ? 92 : 88}
              strokeLinecap="round"
              filter={`url(#${p}rimFaint)`}
            />
            <path
              d={d}
              fill="none"
              stroke="#a5735a"
              strokeOpacity="0.28"
              strokeWidth="12"
              strokeLinecap="round"
              transform="translate(-6,-22)"
              filter={`url(#${p}blur3)`}
            />
          </g>
        ))}
        {/* The palm: no rim of its own, just falling into shadow. */}
        <path d={MASS} fill={`url(#${p}mass)`} />
        </g>
        {/* The card's own shadow falling across the fingers behind it. */}
        <rect
          x="-176"
          y="-250"
          width="380"
          height="532"
          rx="28"
          fill="#000"
          opacity="0.6"
          transform="translate(24 30)"
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
  return (
    <svg viewBox={VIEW} className="hero-svg" aria-hidden="true">
      <SkinDefs p={p} />
      <g transform={PLACE}>
        {/* The thumb's shadow on the card face. */}
        <g clipPath={`url(#${p}cardClip)`}>
          <g transform={HAND}>
            <path d={THUMB} fill="#000" opacity="0.55" transform="translate(16 24)" filter={`url(#${p}blur8)`} />
          </g>
        </g>
        <g transform={HAND}>
        <path d={THUMB} fill={`url(#${p}thumb)`} />
        <g mask={`url(#${p}tipMask)`}>
          <path d={THUMB} fill="#000" filter={`url(#${p}rimOnly)`} />
        </g>
        {/* Soft top light along the thumb, and a warm bounce off the card. */}
        <path
          d="M 150 118 C 210 132, 300 176, 380 214"
          fill="none"
          stroke="#b57a5f"
          strokeOpacity="0.26"
          strokeWidth="14"
          strokeLinecap="round"
          filter={`url(#${p}blur3)`}
        />
        <path
          d="M 200 200 C 250 236, 320 280, 390 316"
          fill="none"
          stroke="#ffd9bd"
          strokeOpacity="0.1"
          strokeWidth="26"
          strokeLinecap="round"
          filter={`url(#${p}blur8)`}
        />
        {/* Thumbnail. */}
        <g transform="translate(184 140) rotate(31)">
          <rect x="-40" y="-27" width="80" height="54" rx="24" fill={`url(#${p}nail)`} filter={`url(#${p}rimSoft)`} />
          <ellipse cx="-8" cy="-11" rx="20" ry="7" fill="#fff" opacity="0.2" />
        </g>
        </g>
      </g>
    </svg>
  );
}
