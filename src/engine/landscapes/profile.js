/**
 * Shared helpers for landscape definitions (see ./index.js for the contract).
 *
 * A layer profile is a top contour y(u) built from three kinds of terms, all as fractions of the
 * viewport height, over the world coordinate u (fraction of the width; scroll offset included):
 *   waves [amp, freq, phase]          y -= amp * sin(2pi u freq + phase)            rolling hills
 *   bumps [amp, freq, phase, pow]     y -= amp * max(0, sin(2pi (u freq + phase)))^pow   islands / headlands
 *   peaks [amp, freq, phase, pow]     y -= amp * tri(u freq + phase)^pow             ridges and summits
 *   capes [amp, freq, phase, face, end]  a headland: a steep face over the first `face` of each period,
 *                                     a top that tapers back down to the sea by `end` (fractions of a period)
 * tri() is a 0..1..0 triangle wave peaking at a fractional part of 0.5. New landscapes use integer
 * frequencies so the contour is periodic in u and the endless scroll never jumps.
 */
export const TAU = Math.PI * 2;

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] ?? 1];
export const frac = (v) => v - Math.floor(v);

/** Top of a layer profile as a fraction of the height at world coordinate u. */
export function profileAt(layer, u) {
  let y = layer.base;
  const { waves, bumps, peaks, capes } = layer;
  if (waves) for (let i = 0; i < waves.length; i++) { const t = waves[i]; y -= t[0] * Math.sin(TAU * u * t[1] + t[2]); }
  if (bumps) for (let i = 0; i < bumps.length; i++) {
    const t = bumps[i];
    const s = Math.sin(TAU * (u * t[1] + t[2]));
    if (s > 0) y -= t[0] * s ** t[3];
  }
  if (peaks) for (let i = 0; i < peaks.length; i++) {
    const t = peaks[i];
    y -= t[0] * (1 - 2 * Math.abs(frac(u * t[1] + t[2]) - 0.5)) ** t[3];
  }
  if (capes) for (let i = 0; i < capes.length; i++) {
    const t = capes[i];
    const f = frac(u * t[1] + t[2]);
    if (f < t[4]) y -= t[0] * smoothstep(0, t[3], f) * (1 - smoothstep(t[4] * 0.4, t[4], f));
  }
  return y;
}

/** Stable 0..1 hash of an integer (and an optional salt), for per-tree / per-wave variation. */
export function hash(n, salt = 0) {
  let t = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Walks world-anchored slots across the screen: slot k sits at world u = k * du (+ jitter), so objects
 * stay put on their layer while it scrolls and the pattern repeats exactly once per world unit.
 * fn(x, k, r) gets the screen x, the slot index (mod the period) and a per-slot random.
 */
export function eachSlot(api, du, fn, salt = 0) {
  const { w, offset, shift } = api;
  const n = Math.max(1, Math.round(1 / du));
  du = 1 / n;
  const first = Math.floor((offset - 0.1) / du);
  const last = Math.ceil((offset + 1.1) / du);
  for (let k = first; k <= last; k++) {
    const id = ((k % n) + n) % n;
    const r = hash(id, salt);
    const u = k * du + (r - 0.5) * du * 0.6;
    fn((u - offset) * w + shift, id, r);
  }
}
