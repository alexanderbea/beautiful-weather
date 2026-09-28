import { rgba } from '../color.js';
import { rand } from './util.js';

// Skyline band (fraction of h, rooftops/spires to waterline) that haze.skylineClear keeps fog off.
const CLEAR_TOP = 0.5;
const CLEAR_BOTTOM = 0.74;
const CLEAR_EDGE = 0.03;
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Fog strength multiplier at height f (fraction of h): 1 outside the skyline band, 1 - k inside it. */
const clearance = (f, k) =>
  1 - k * smoothstep(CLEAR_TOP - CLEAR_EDGE, CLEAR_TOP, f) * (1 - smoothstep(CLEAR_BOTTOM, CLEAR_BOTTOM + CLEAR_EDGE, f));

/** Basic v1 fog: drifting horizontal haze bands over the landscape. TODO: richer volumetric look. */
export function createFog() {
  let bands = [];
  return {
    init(env) {
      bands = Array.from({ length: 6 }, (_, i) => ({
        y: 0.5 + i * 0.09 + rand(-0.02, 0.02),
        h: rand(0.08, 0.16),
        phase: rand(0, Math.PI * 2),
        rate: rand(0.05, 0.15),
      }));
    },
    update() {},
    draw(ctx, env) {
      const { width: w, height: h, theme, time } = env;
      const amount = theme.haze.amount * env.weight;
      if (amount < 0.01) return;
      const k = theme.haze.skylineClear ?? 0;
      if (k > 0.004) {
        // Fog starts above the rooftops: the wash thins out across the skyline band.
        const a = amount * 0.25;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        for (const f of [0, CLEAR_TOP - CLEAR_EDGE, CLEAR_TOP, CLEAR_BOTTOM, CLEAR_BOTTOM + CLEAR_EDGE, 1]) {
          g.addColorStop(f, rgba(theme.haze.color, a * clearance(f, k)));
        }
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = rgba(theme.haze.color, amount * 0.25);
      }
      ctx.fillRect(0, 0, w, h);
      for (const b of bands) {
        const y = (b.y + Math.sin(time * b.rate + b.phase) * 0.015) * h;
        const bh = b.h * h;
        const a = amount * (0.35 + 0.2 * Math.sin(time * b.rate * 2 + b.phase));
        const g = ctx.createLinearGradient(0, y - bh, 0, y + bh);
        if (k > 0.004) {
          // Sample the band's bell profile with the skyline clearance applied.
          for (let s = 0; s <= 8; s++) {
            const t = s / 8;
            const bell = 1 - Math.abs(t - 0.5) * 2;
            g.addColorStop(t, rgba(theme.haze.color, a * bell * clearance((y - bh + t * 2 * bh) / h, k)));
          }
        } else {
          g.addColorStop(0, rgba(theme.haze.color, 0));
          g.addColorStop(0.5, rgba(theme.haze.color, a));
          g.addColorStop(1, rgba(theme.haze.color, 0));
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, y - bh, w, bh * 2);
      }
    },
  };
}
