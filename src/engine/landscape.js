import { rgba } from './color.js';
import { LANDSCAPE_DEFS, DEFAULT_LANDSCAPE_ID, landscapeDef } from './landscapes/index.js';
import { profileAt, mixRgb, hash, frac } from './landscapes/profile.js';

const TRANSITION_S = 1.8;
const WHITE = [255, 255, 255, 1];
const ease = (t) => t * t * (3 - 2 * t);
const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Theme hills[i] colour shaped by a landscape layer's grey / tint / haze (see landscapes/index.js). */
function layerColor(layer, base, theme) {
  let r = base[0];
  let g = base[1];
  let b = base[2];
  if (layer.grey) {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r += (l - r) * layer.grey; g += (l - g) * layer.grey; b += (l - b) * layer.grey;
  }
  if (layer.tint) { r *= layer.tint[0]; g *= layer.tint[1]; b *= layer.tint[2]; }
  if (layer.paint) {
    // Recolour toward a material (sand, rock) at the theme colour's own lightness, so it darkens at night.
    const [pr, pg, pb, amount, light = 1] = layer.paint;
    const k = ((0.3 * r + 0.59 * g + 0.11 * b) / (0.3 * pr + 0.59 * pg + 0.11 * pb)) * light;
    r += (pr * k - r) * amount; g += (pg * k - g) * amount; b += (pb * k - b) * amount;
  }
  if (layer.haze) {
    const s = theme.sky.bottom;
    r += (s[0] - r) * layer.haze; g += (s[1] - g) * layer.haze; b += (s[2] - b) * layer.haze;
  }
  return [clampByte(r), clampByte(g), clampByte(b), base[3] ?? 1];
}

/**
 * Landscape runtime for the scene: which landscape is shown, the cross-fade to the next one, the
 * blended layer contours / colours / speeds, and the open-sea pass. The scene keeps the draw order,
 * parallax, rim light and art-style hooks; this only answers "what shape and colour is layer i".
 */
export function createLandscape() {
  let from = landscapeDef(DEFAULT_LANDSCAPE_ID);
  let to = from;
  let blend = 1;
  let k = 1; // eased blend
  let motion = 0; // detail motion clock (s); holds still under reduced motion
  const colors = [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]];

  const sea = (def) => (def.sea ? 1 : 0);

  return {
    defs: LANDSCAPE_DEFS,
    get id() { return to.id; },
    get def() { return to; },
    /** True when the location's landmark skyline may show (the default hills only). */
    get town() { return !!to.town; },
    get blend() { return k; },

    /** Switches landscape; cross-fades unless immediate. Returns false for unknown ids / no-ops. */
    set(id, immediate = false) {
      const def = landscapeDef(id);
      if (!def || def === to) return false;
      from = immediate ? def : (k < 0.5 ? from : to); // mid-fade: start from what dominates the screen
      to = def;
      blend = immediate ? 1 : 0;
      k = ease(blend);
      return true;
    },

    update(dt, env) {
      if (blend < 1) { blend = Math.min(1, blend + dt / TRANSITION_S); k = ease(blend); }
      if (!env.reducedMotion) motion += dt;
      for (let i = 0; i < 3; i++) {
        const c = layerColor(to.layers[i], env.theme.hills[i], env.theme);
        colors[i] = k >= 1 ? c : mixRgb(layerColor(from.layers[i], env.theme.hills[i], env.theme), c, k);
      }
    },

    /** Contour of layer i (fraction of h) at world coordinate u. */
    y(i, u) {
      const b = profileAt(to.layers[i], u);
      return k >= 1 ? b : profileAt(from.layers[i], u) * (1 - k) + b * k;
    },
    speed(i) { return from.layers[i].speed * (1 - k) + to.layers[i].speed * k; },
    color(i) { return colors[i]; },
    get seaAlpha() { return sea(from) * (1 - k) + sea(to) * k; },
    get seaTop() { return (to.sea ?? from.sea)?.top ?? 0.7; },

    /** Runs a def's detail pass ('drawBehind' | 'drawOver') for layer i, for both sides of a fade. */
    detail(pass, i, ctx, env, api) {
      api.time = motion;
      if (k < 1 && from !== to && from[pass]) { api.alpha = 1 - k; api.layer = from.layers[i]; from[pass](i, ctx, env, api); }
      if (to[pass]) { api.alpha = k; api.layer = to.layers[i]; to[pass](i, ctx, env, api); }
      ctx.globalAlpha = 1;
    },

    /**
     * Open sea from seaTop down: sky-tinted water that deepens toward the shore, a bright horizon line,
     * the sun's or moon's broken light path, and slow wave crests that grow with depth and the wind.
     * Drawn in the distant parallax layer (shift), right after the far layer.
     */
    drawSea(ctx, env, shift) {
      const a = this.seaAlpha;
      if (a <= 0.002) return;
      const { width: w, height: h, theme } = env;
      const top = this.seaTop * h;
      const s = Math.min(w, h) / 800;
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, rgba(mixRgb(theme.sky.bottom, colors[0], 0.35)));
      g.addColorStop(0.3, rgba(mixRgb(theme.sky.mid, colors[1], 0.45)));
      g.addColorStop(1, rgba(mixRgb(theme.sky.top, theme.hills[2], 0.55)));
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(0, top, w, h - top);
      // Horizon: a thin line of light where the sea meets the sky.
      ctx.fillStyle = rgba(mixRgb(theme.sky.bottom, WHITE, 0.35));
      ctx.globalAlpha = a * 0.5;
      ctx.fillRect(0, top, w, Math.max(1, 1.2 * s));

      // Light path: glitter dashes under the sun (or the moon), widening toward the viewer.
      const t = motion;
      if (env.scene !== 'eclipse') {
        for (const [body, style] of [[env.sun, theme.sun], [env.moon, theme.moon]]) {
          if (!body || body.alpha < 0.02) continue;
          ctx.fillStyle = rgba(mixRgb(style.color, style.glow, 0.3));
          const rows = 26;
          for (let r = 0; r < rows; r++) {
            const d = (r + 0.5) / rows;
            const y = top + (h - top) * d ** 1.6;
            const half = body.r * (0.6 + d * 2.4);
            const n = 2 + (r % 3);
            for (let j = 0; j < n; j++) {
              const q = hash(r * 7 + j, 3);
              const x = body.x + (q - 0.5) * 2 * half + Math.sin(t * (0.6 + q) + r) * half * 0.15;
              const len = half * (0.25 + 0.35 * frac(q * 5.3)) * (0.7 + 0.3 * Math.sin(t * 1.3 + q * 9));
              ctx.globalAlpha = a * body.alpha * (0.55 - d * 0.35);
              ctx.fillRect(x - len / 2, y, len, Math.max(1, (1 + d * 2) * s));
            }
          }
        }
      }

      // Wave crests: rows spread in perspective, drifting with the wind (still under reduced motion).
      const crest = mixRgb(mixRgb(theme.sky.bottom, WHITE, 0.45), theme.moon.color, (1 - env.dayMix) * 0.4);
      ctx.fillStyle = rgba(crest);
      const wind = env.wind || 0;
      const rows = 14;
      for (let r = 0; r < rows; r++) {
        const d = (r + 1) / (rows + 1);
        const y = top + (h - top) * d ** 1.7;
        const par = shift * (0.2 + d * 0.8);
        const dashes = 5 + r;
        for (let j = 0; j < dashes; j++) {
          const q = hash(r * 31 + j, 9);
          const x = frac(q + (j / dashes) + t * (0.002 + 0.0015 * d) * (1 + wind / 8)) * w * 1.2 - 0.1 * w + par;
          const len = (10 + 50 * d) * s * (0.6 + q);
          ctx.globalAlpha = a * (0.12 + 0.2 * d) * (0.65 + 0.35 * Math.sin(t * 0.8 + q * 12)) * (0.7 + Math.min(wind, 15) / 50);
          ctx.fillRect(x, y, len, Math.max(1, (0.8 + d * 1.6) * s));
        }
      }
      ctx.globalAlpha = 1;
    },
  };
}
