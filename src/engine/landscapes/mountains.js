import { rgba } from '../color.js';
import { mixRgb, clamp01 } from './profile.js';
import { drawTreeRow } from './trees.js';

const WHITE = [255, 255, 255, 1];

/** Where the light comes from on screen: the sun by day and at dusk, the moon at night (as the rim light). */
function lightX(env) {
  return env.moon.x + (env.sun.x - env.moon.x) * clamp01(env.dayMix + (env.twilight ?? 0));
}

/** Snow above a ragged snowline, clipped to the layer; lower in snowfall and in winter. */
function drawSnow(ctx, env, api, line) {
  const { w, h } = api;
  const y0 = (line + (env.condition === 'snow' ? 0.07 : 0) + (env.season === 'winter' ? 0.05 : 0)) * h;
  const lit = mixRgb(env.theme.sky.bottom, WHITE, 0.25 + 0.4 * env.dayMix);
  const snow = mixRgb(lit, api.color, 0.2);
  const step = Math.max(4, w / 120);
  ctx.save();
  ctx.clip(api.path);
  ctx.beginPath();
  ctx.moveTo(-step, 0);
  for (let x = -step; x <= w + step; x += step) {
    const u = (x - api.shift) / w + api.offset;
    const rag = Math.sin(u * 97) * 0.6 + Math.sin(u * 211 + 1.3) * 0.4;
    ctx.lineTo(x, y0 + rag * h * 0.018);
  }
  ctx.lineTo(w + step, 0);
  ctx.closePath();
  ctx.fillStyle = rgba(snow, api.alpha * 0.92);
  ctx.fill();
  ctx.restore();
}

/** Shadowed faces: from each main summit down the side away from the light, so the peaks read as 3D. */
function drawFacets(ctx, env, api, layer, strength) {
  const [, f, p] = layer.peaks[0];
  const { w, h } = api;
  const lx = lightX(env);
  const half = (0.5 / f) * w;
  const step = Math.max(4, w / 160);
  ctx.save();
  ctx.clip(api.path);
  ctx.beginPath();
  const k0 = Math.floor((api.offset - 0.2) * f);
  const k1 = Math.ceil((api.offset + 1.2) * f);
  for (let k = k0; k <= k1; k++) {
    const xa = ((k + 0.5 - p) / f - api.offset) * w + api.shift;
    if (xa < -half || xa > w + half) continue;
    const side = lx > xa ? -1 : 1; // shade the face that looks away from the light
    const xv = xa + side * half;
    ctx.moveTo(xa, api.y(xa));
    for (let x = xa; side > 0 ? x <= xv : x >= xv; x += side * step) ctx.lineTo(x, api.y(x));
    ctx.lineTo(xa + side * half * 0.45, h); // valley spur, then the summit's own spur back up
    ctx.closePath();
  }
  const a = api.alpha * strength * (0.6 + 0.4 * env.dayMix);
  const top = h * (layer.base - layer.peaks[0][0]);
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, rgba(env.theme.shade, a));
  g.addColorStop(0.55, rgba(env.theme.shade, a * 0.7));
  g.addColorStop(1, rgba(env.theme.shade, 0));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * Mountains: a hazy range of tall snow-capped summits, a nearer rocky ridge with a dusting of snow, and
 * an alpine meadow in front with a few spruces. Summits occlude the low sun earlier than the hills.
 */
export function createMountains() {
  return {
    id: 'mountains',
    label: 'Mountains',
    hint: 'Snow-capped peaks above an alpine meadow',
    swatch: 'linear-gradient(135deg, #83b7ea 30%, #f4f7fb 31%, #f4f7fb 38%, #7d8fa8 39%, #5c7a5e 75%)',
    town: false,
    sea: null,
    layers: [
      { base: 0.62, speed: 0.0012, haze: 0.3, grey: 0.55, tint: [0.96, 1, 1.12],
        peaks: [[0.21, 2, 0.12, 1.5], [0.09, 5, 0.31, 1.2], [0.018, 17, 0.7, 1]] },
      { base: 0.78, speed: 0.003, grey: 0.45, tint: [0.92, 0.95, 1.02],
        peaks: [[0.15, 3, 0.58, 1.3], [0.04, 8, 0.2, 1], [0.01, 23, 0.4, 1]] },
      { base: 0.9, speed: 0.008,
        waves: [[0.028, 1, 1.6], [0.012, 3, 4.2], [0.004, 9, 0.7]] },
    ],
    drawOver(i, ctx, env, api) {
      if (i === 0) { drawSnow(ctx, env, api, 0.47); drawFacets(ctx, env, api, api.layer, 0.22); }
      else if (i === 1) { drawSnow(ctx, env, api, 0.63); drawFacets(ctx, env, api, api.layer, 0.28); }
      else drawTreeRow(ctx, env, api, { du: 1 / 16, keep: 0.4, height: [0.06, 0.11], width: 0.34, salt: 53 });
    },
  };
}
