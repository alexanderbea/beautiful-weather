import { rgba } from '../color.js';
import { mixRgb, hash } from './profile.js';

const WHITE = [255, 255, 255, 1];

/** Green turf over the headland's top edge, a band that follows the contour (theme hill green). */
function drawTurf(ctx, env, api) {
  const { w, h } = api;
  const depth = h * 0.022;
  const step = Math.max(4, w / 160);
  ctx.save();
  ctx.clip(api.path);
  ctx.beginPath();
  for (let x = -step; x <= w + step; x += step) ctx.lineTo(x, api.y(x) - 2);
  for (let x = w + step; x >= -step; x -= step) {
    const u = (x - api.shift) / w + api.offset;
    ctx.lineTo(x, api.y(x) + depth * (0.6 + 0.4 * Math.sin(u * 140) * Math.sin(u * 37 + 1)));
  }
  ctx.closePath();
  ctx.fillStyle = rgba(env.theme.hills[1], api.alpha);
  ctx.fill();
  // The steep sea-facing rock face: darker, more so when the light is behind the headland.
  const cape = api.layer?.capes?.[0];
  if (cape) {
    const lightX = env.moon.x + (env.sun.x - env.moon.x) * Math.min(1, env.dayMix + (env.twilight ?? 0));
    for (let k = Math.floor(api.offset * cape[1]) - 1; k <= Math.ceil((api.offset + 1) * cape[1]) + 1; k++) {
      const x = ((k - cape[2]) / cape[1] - api.offset) * w + api.shift;
      const fw = (cape[3] * 2.2 * w) / cape[1];
      if (x + fw < 0 || x > w) continue;
      const g = ctx.createLinearGradient(x, 0, x + fw, 0);
      const a = api.alpha * (lightX < x ? 0.18 : 0.38);
      g.addColorStop(0, rgba(env.theme.shade, a));
      g.addColorStop(0.6, rgba(env.theme.shade, a * 0.6));
      g.addColorStop(1, rgba(env.theme.shade, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 2, 0, fw + 2, h);
    }
  }
  ctx.restore();
}

/**
 * Coast: an open sea to a flat horizon with low islands far out, a turf-topped cliff headland in the
 * middle distance and a sand beach in front where the surf runs in. The sea itself (sky-tinted water,
 * crests, the sun / moon path) is drawn by the landscape runtime from `sea`; this adds turf and surf.
 */
export function createCoast() {
  return {
    id: 'coast',
    label: 'Coast',
    hint: 'Open sea, a cliff headland and a sand beach',
    swatch: 'linear-gradient(#83b7ea, #e2f1ff 42%, #4f84a8 44%, #4f84a8 70%, #d9c48f 72%)',
    town: false,
    sea: { top: 0.655 },
    layers: [
      // Far: islands and a low headland on the horizon, hazed toward the sky.
      { base: 0.655, speed: 0.0015, haze: 0.4, grey: 0.3,
        bumps: [[0.03, 1, 0.08, 2.5], [0.014, 3, 0.55, 5], [0.005, 7, 0.2, 2]] },
      // Mid: a flat-topped cliff headland dropping steeply into the sea (below the screen elsewhere).
      { base: 1.12, speed: 0.002, paint: [150, 140, 128, 0.85, 1.05],
        capes: [[0.52, 1, 0.55, 0.03, 0.5]], waves: [[0.012, 5, 1.1], [0.006, 11, 0.4], [0.003, 29, 2.2]] },
      // Near: a sand beach with low dunes.
      { base: 0.93, speed: 0.003, paint: [228, 206, 158, 0.9, 1.45],
        waves: [[0.02, 2, 5.1], [0.01, 5, 2.8], [0.004, 11, 0.9]] },
    ],
    drawOver(i, ctx, env, api) {
      if (i === 1) drawTurf(ctx, env, api);
    },
    /** Surf: a broken line of foam washing up and back along the beach, drawn just before the sand. */
    drawBehind(i, ctx, env, api) {
      if (i !== 2) return;
      const { w, h, time } = api;
      const s = Math.max(0.8, Math.min(w, h) / 800);
      const foam = mixRgb(mixRgb(env.theme.sky.bottom, WHITE, 0.65), env.theme.moon.color, (1 - env.dayMix) * 0.5);
      const step = Math.max(3, w / 220);
      const seg = 14; // samples per foam segment
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(foam);
      for (let f = 0; f < 2; f++) {
        const wash = Math.sin(time * 0.45 + f * 2.4);
        const d = (5 + f * 10 + wash * 3.5) * s;
        let n = 0;
        let id = 0;
        for (let x = -step * seg; x <= w + step * seg; x += step) {
          if (n === 0) {
            const u = Math.floor(((x - api.shift) / w + api.offset) * 40);
            id = hash(u, f + 5);
            ctx.beginPath();
          }
          ctx.lineTo(x, api.y(x) - d - Math.sin(x * 0.015 + f * 1.7 + time * 0.3) * 1.5 * s);
          if (++n === seg) {
            n = 0;
            ctx.globalAlpha = api.alpha * (f ? 0.22 : 0.55) * (0.55 + 0.45 * id) * (0.75 + 0.25 * wash);
            ctx.lineWidth = (f ? 1.2 : 2) * s;
            ctx.stroke();
          }
        }
      }
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 1;
    },
  };
}
