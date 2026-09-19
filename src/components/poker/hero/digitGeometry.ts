/**
 * Builds a finger/thumb outline from a centerline and a width profile, so the
 * hand can be authored in real proportions (positions along the digit, joint
 * creases, nail placement) instead of hand-typed bezier blobs.
 *
 * Units are SVG user units in the card's own frame; the playing card there is
 * 380 wide, i.e. roughly 6 units per millimetre.
 */

export type Pt = readonly [number, number];

export interface DigitSpec {
  /** Centerline, starting at the fingertip and running toward the hand. */
  points: Pt[];
  /** [distance from the tip, width] stops, linearly interpolated. */
  widths: [number, number][];
}

export interface Sample {
  p: Pt;
  /** Unit tangent, pointing from the tip toward the hand. */
  t: Pt;
  /** Unit normal (tangent rotated a quarter turn). */
  n: Pt;
  w: number;
}

export interface Digit {
  /** Closed outline with a rounded fingertip. */
  outline: string;
  /** Position, direction and width at a distance from the tip. */
  at: (distance: number) => Sample;
  length: number;
}

/** Uniform Catmull-Rom through the given points, densely sampled. */
function smooth(points: Pt[], perSegment = 28): Pt[] {
  const pts = [points[0], ...points, points[points.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function widthAt(stops: [number, number][], d: number): number {
  if (d <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [d0, w0] = stops[i - 1];
      const [d1, w1] = stops[i];
      return w0 + ((w1 - w0) * (d - d0)) / (d1 - d0);
    }
  }
  return stops[stops.length - 1][1];
}

export function buildDigit(spec: DigitSpec): Digit {
  const line = smooth(spec.points);
  const dist: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    dist.push(dist[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  const length = dist[dist.length - 1];

  const samples: Sample[] = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { p, t, n: [-t[1], t[0]], w: widthAt(spec.widths, dist[i]) };
  });

  const left = samples.map((s) => [s.p[0] + (s.n[0] * s.w) / 2, s.p[1] + (s.n[1] * s.w) / 2] as const);
  const right = samples.map((s) => [s.p[0] - (s.n[0] * s.w) / 2, s.p[1] - (s.n[1] * s.w) / 2] as const);
  const r = samples[0].w / 2;
  const f = (n: number) => n.toFixed(1);

  let outline = `M ${f(left[0][0])} ${f(left[0][1])}`;
  for (let i = 1; i < left.length; i++) outline += ` L ${f(left[i][0])} ${f(left[i][1])}`;
  for (let i = right.length - 1; i >= 0; i--) outline += ` L ${f(right[i][0])} ${f(right[i][1])}`;
  // Round fingertip: a half circle from the right edge back to the left edge,
  // bulging away from the hand (sweep 0 for this tangent-to-normal handedness).
  outline += ` A ${f(r)} ${f(r)} 0 0 0 ${f(left[0][0])} ${f(left[0][1])} Z`;

  const at = (d: number): Sample => {
    const target = Math.max(0, Math.min(length, d));
    let i = 1;
    while (i < dist.length - 1 && dist[i] < target) i++;
    const span = dist[i] - dist[i - 1] || 1;
    const k = (target - dist[i - 1]) / span;
    const a = samples[i - 1];
    const b = samples[i];
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const t: Pt = [lerp(a.t[0], b.t[0]), lerp(a.t[1], b.t[1])];
    const tl = Math.hypot(t[0], t[1]) || 1;
    const tu: Pt = [t[0] / tl, t[1] / tl];
    return { p: [lerp(a.p[0], b.p[0]), lerp(a.p[1], b.p[1])], t: tu, n: [-tu[1], tu[0]], w: lerp(a.w, b.w) };
  };

  return { outline, at, length };
}

/**
 * A skin crease across the digit at a distance from the tip: a shallow arc
 * spanning `span` of the digit's width, bowed slightly toward the tip.
 */
export function crease(digit: Digit, distance: number, span = 0.78, bow = 4): string {
  const s = digit.at(distance);
  const half = (s.w * span) / 2;
  const a: Pt = [s.p[0] + s.n[0] * half, s.p[1] + s.n[1] * half];
  const b: Pt = [s.p[0] - s.n[0] * half, s.p[1] - s.n[1] * half];
  const c: Pt = [s.p[0] - s.t[0] * bow, s.p[1] - s.t[1] * bow];
  const f = (n: number) => n.toFixed(1);
  return `M ${f(a[0])} ${f(a[1])} Q ${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`;
}

/** Angle, in degrees, of the digit's direction at a distance from the tip. */
export function angleAt(digit: Digit, distance: number): number {
  const s = digit.at(distance);
  return (Math.atan2(s.t[1], s.t[0]) * 180) / Math.PI;
}

/**
 * A line running along the digit at a fraction of its half-width off the
 * centerline (negative = toward the lit side), between two distances from
 * the tip. Stroked and blurred, it reads as a soft highlight or bounce light.
 */
export function offsetLine(digit: Digit, fraction: number, from: number, to: number, steps = 24): string {
  const f = (n: number) => n.toFixed(1);
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const s = digit.at(from + ((to - from) * i) / steps);
    const off = (s.w / 2) * fraction;
    d += `${i === 0 ? "M" : "L"} ${f(s.p[0] + s.n[0] * off)} ${f(s.p[1] + s.n[1] * off)} `;
  }
  return d.trim();
}

/** Gradient endpoints spanning the digit's width at a distance from the tip,
 * from the lit edge (toward -normal) to the shadowed one. */
export function widthGradient(digit: Digit, distance: number) {
  const s = digit.at(distance);
  const h = s.w / 2;
  return {
    x1: s.p[0] - s.n[0] * h,
    y1: s.p[1] - s.n[1] * h,
    x2: s.p[0] + s.n[0] * h,
    y2: s.p[1] + s.n[1] * h,
  };
}
