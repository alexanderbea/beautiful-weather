/** Colors are compiled to [r, g, b, a] arrays so themes can be interpolated numerically. */

export function isColorString(v) {
  return typeof v === 'string' && /^(#|rgba?\()/i.test(v.trim());
}

export function parseColor(input) {
  const s = input.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (h.length === 8) return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(parseFloat);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  throw new Error(`Unsupported color: ${input}`);
}

export function rgba(c, alpha = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, c[3] * alpha)).toFixed(3)})`;
}

export const lerp = (a, b, t) => a + (b - a) * t;

/** Deep interpolation over numbers, arrays (incl. compiled colors) and plain objects. */
export function lerpDeep(a, b, t) {
  if (typeof a === 'number') return lerp(a, b, t);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return t < 0.5 ? a : b;
    return a.map((v, i) => lerpDeep(v, b[i], t));
  }
  if (a && typeof a === 'object') {
    const out = {};
    for (const k in b) out[k] = k in a ? lerpDeep(a[k], b[k], t) : b[k];
    return out;
  }
  return t < 0.5 ? a : b;
}
