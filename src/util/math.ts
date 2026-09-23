export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Frame-rate independent exponential approach. `lambda` ≈ how many times per second the gap halves-ish. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function randRange(lo: number, hi: number, rng: () => number = Math.random): number {
  return lo + (hi - lo) * rng();
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Deterministic hash-based [0,1) from a seed — for repeatable scenery layouts and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * TypeScript twin of the `shelteredByBox` slab test in weather/effects/instanced.ts.
 *
 * True when a point is inside the box, or when the view ray from that point passes through it —
 * i.e. the particle would be drawn over the vehicle. Kept in step with the GLSL by hand; the
 * tests assert both agree on the cases that matter.
 */
export function shelteredByBox(
  p: readonly [number, number, number],
  d: readonly [number, number, number],
  bmin: readonly [number, number, number],
  bmax: readonly [number, number, number],
): boolean {
  let tn = -Infinity;
  let tf = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / d[i]!;
    const t0 = (bmin[i]! - p[i]!) * inv;
    const t1 = (bmax[i]! - p[i]!) * inv;
    tn = Math.max(tn, Math.min(t0, t1));
    tf = Math.min(tf, Math.max(t0, t1));
  }
  return tf >= Math.max(tn, 0);
}
