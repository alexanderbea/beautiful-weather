import { rgba } from './color.js';

// Atmospheric lighting pass (#21): golden-hour glow, day/golden-hour hill rim light and dawn mist on the
// water. Every weight is driven by solar elevation e (degrees) and is exactly 0 at e <= -6, so night
// palettes render unchanged; the e = 0 twilight (golden 0, day rim share 0, dawn off unless rising) too.
// Weather scaling comes from theme.light (see themes.js), which cross-fades with the theme.

const GOLD = [255, 200, 120];
const GOLD_ALPHA = 0.3;
const GOLD_R = 0.55; // x max(w, h)
const GOLD_Y_SCALE = 0.55;
const HORIZON_WARM = [255, 214, 160];
const HORIZON_WARM_MIX = 0.4; // x g
const RIM_GOLD = [255, 210, 150];
const RIM_GOLD_BOOST = 0.18; // alpha added at g = 1
const RIM_OFF_NIGHT = 0.3; // off-side end of the rim gradient (twilight/night, unchanged)
const RIM_OFF_DAY = 0.15; // ... in day / golden hour
const SKYLINE_RIM_DAY = 0.75; // skyline rim strokes x this in day: crisp line 0.8 * 0.75 = 0.6 x hill rim
const WARM_BUDGET = 0.6; // sunsetGlow + golden + dawn warmth near the horizon

// Dawn mist: vertical extent (fractions of h) and profile relative to the peak.
const DAWN_ALPHA = 0.42;
const DAWN_TOP = 0.69;
const DAWN_BOTTOM = 0.8;
const DAWN_PROFILE = [[0.69, 0], [0.705, 0.12], [0.725, 0.55], [0.745, 1], [0.77, 0.6], [0.8, 0]];
const DAWN_LAVENDER = [200, 194, 216];
const DAWN_PEARL = [240, 224, 206];
const DAWN_NEUTRAL = [232, 236, 240];
// Two soft bands: share of the total alpha, drift (w/s), and horizontal density lumps (periodic: first = last).
const DAWN_BANDS = [
  { share: 0.62, speed: 0.003, lumps: [1, 0.45, 0.85, 0.3, 0.95, 0.5, 0.75, 0.35, 1] },
  { share: 0.45, speed: 0.0022, lumps: [0.4, 0.9, 0.35, 1, 0.55, 0.8, 0.3, 0.9, 0.4] },
];
const DAWN_COLOR_STEP = 3; // rebuild the cached strips only when a channel moves this much

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createLighting() {
  // Preallocated per-frame outputs, exposed as env.light.
  const state = {
    g: 0, // golden-hour weight 0..1
    dayW: 0, // day share of the rim light (0 at e <= 0)
    golden: 0, // golden glow alpha
    dawn: 0, // dawn mist alpha
    horizonGlow: [0, 0, 0, 0], // horizonGlow warmed by g
    rim: [0, 0, 0, 0], // effective hill rim colour + alpha
    rimOff: RIM_OFF_NIGHT,
    skylineRim: 1, // multiplier for the skyline's rimGrad strokes
  };
  const dawnColor = [0, 0, 0];

  let glow = null;
  let glowR = 0;
  const strips = DAWN_BANDS.map(() => ({ canvas: null, ctx: null }));
  let stripW = 0; // viewport size the cached strips were built for
  let stripH = 0;
  const stripColor = [-99, -99, -99];

  function goldGradient(ctx, R) {
    if (glow && glowR === R) return glow;
    glowR = R;
    glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    glow.addColorStop(0, rgba([...GOLD, 1]));
    glow.addColorStop(0.35, rgba([...GOLD, 0.45]));
    glow.addColorStop(0.7, rgba([...GOLD, 0.12]));
    glow.addColorStop(1, rgba([...GOLD, 0]));
    return glow;
  }

  function buildStrips(w, h) {
    const sh = Math.ceil((DAWN_BOTTOM - DAWN_TOP) * h);
    const sw = Math.max(1, Math.ceil(w));
    const color = [dawnColor[0], dawnColor[1], dawnColor[2], 1];
    DAWN_BANDS.forEach((band, i) => {
      const s = strips[i];
      if (!s.canvas) {
        s.canvas = document.createElement('canvas');
        s.ctx = s.canvas.getContext('2d');
      }
      if (s.canvas.width !== sw || s.canvas.height !== sh) {
        s.canvas.width = sw;
        s.canvas.height = sh;
      }
      const c = s.ctx;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, sw, sh);
      const v = c.createLinearGradient(0, 0, 0, sh);
      for (const [f, a] of DAWN_PROFILE) v.addColorStop((f - DAWN_TOP) / (DAWN_BOTTOM - DAWN_TOP), rgba(color, a));
      c.fillStyle = v;
      c.fillRect(0, 0, sw, sh);
      // Horizontal density lumps (periodic across the strip, so it tiles seamlessly).
      c.globalCompositeOperation = 'destination-in';
      const hz = c.createLinearGradient(0, 0, sw, 0);
      band.lumps.forEach((a, k) => hz.addColorStop(k / (band.lumps.length - 1), `rgba(0,0,0,${a})`));
      c.fillStyle = hz;
      c.fillRect(0, 0, sw, sh);
      c.globalCompositeOperation = 'source-over';
    });
    stripColor[0] = dawnColor[0];
    stripColor[1] = dawnColor[1];
    stripColor[2] = dawnColor[2];
    stripW = w;
    stripH = h;
  }

  return {
    state,

    update(env) {
      const { theme } = env;
      const e = env.solarElevation ?? (env.dayMix > 0.5 ? 45 : -18);
      const L = theme.light;
      const g = smoothstep(0, 4, e) * (1 - smoothstep(7, 12, e));
      const dayW = smoothstep(0, 6, e);
      state.g = g;
      state.dayW = dayW;

      // Dawn mist: sunrise only (env.rising eases 0..1), colour lavender -> warm pearl -> neutral.
      const dawnW = smoothstep(-6, -2, e) * (1 - smoothstep(3, 8, e)) * (env.rising ?? 0) * L.dawnFog;
      let dawn = DAWN_ALPHA * dawnW;
      const t1 = smoothstep(-2, 0, e);
      const t2 = smoothstep(4, 7, e);
      for (let i = 0; i < 3; i++) {
        const a = DAWN_LAVENDER[i] + (DAWN_PEARL[i] - DAWN_LAVENDER[i]) * t1;
        dawnColor[i] = a + (DAWN_NEUTRAL[i] - a) * t2;
      }

      // Warm budget near the horizon: sunsetGlow (already twilight-weighted in the theme) is fixed,
      // golden glow and the warm (pearl) share of the mist are scaled down together if they exceed it.
      const art = env.artStyle?.params;
      let golden = GOLD_ALPHA * g * L.golden * (art?.golden ?? 1);
      const dawnWarm = dawn * t1 * (1 - t2);
      const budget = Math.max(0, WARM_BUDGET - theme.sunsetGlow[3]);
      if (golden + dawnWarm > budget) {
        const k = budget / (golden + dawnWarm);
        golden *= k;
        dawn *= 1 - (1 - k) * t1 * (1 - t2); // only the warm share is budgeted
      }
      state.golden = golden;
      state.dawn = dawn;

      const hg = theme.horizonGlow;
      const hk = HORIZON_WARM_MIX * g;
      for (let i = 0; i < 3; i++) state.horizonGlow[i] = hg[i] + (HORIZON_WARM[i] - hg[i]) * hk;
      state.horizonGlow[3] = hg[3];

      // Rim: the palette rim, its day share scaled by light.rim, plus a golden-hour boost.
      const rim = theme.rim;
      const rimK = L.rim;
      const boost = g * RIM_GOLD_BOOST * rimK;
      const a = (rim[3] * (1 + (rimK - 1) * dayW) + boost) * (art?.rim ?? 1);
      const gk = a > 0 ? boost / a : 0; // hue follows the boost's share of the alpha
      for (let i = 0; i < 3; i++) state.rim[i] = rim[i] + (RIM_GOLD[i] - rim[i]) * gk;
      state.rim[3] = a;
      state.rimOff = RIM_OFF_NIGHT + (RIM_OFF_DAY - RIM_OFF_NIGHT) * dayW;
      state.skylineRim = 1 + (SKYLINE_RIM_DAY - 1) * dayW;
    },

    /** Golden-hour glow centred on the sun (sky pass, before the sun disc; the hills occlude it). */
    drawGolden(ctx, env) {
      if (state.golden <= 0.004 || !env.sun) return;
      const R = Math.max(env.width, env.height) * GOLD_R;
      const grad = goldGradient(ctx, R);
      ctx.save();
      ctx.translate(env.sun.x, env.sun.y);
      ctx.scale(1, GOLD_Y_SCALE);
      ctx.globalAlpha = state.golden;
      ctx.fillStyle = grad;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
    },

    /** Dawn mist on the water: after the skyline, before the mid hill, moving with the distant layer. */
    drawDawnFog(ctx, env, shift) {
      if (state.dawn <= 0.004) return;
      const { width: w, height: h, time } = env;
      if (stripW !== w || stripH !== h
        || Math.abs(stripColor[0] - dawnColor[0]) >= DAWN_COLOR_STEP
        || Math.abs(stripColor[1] - dawnColor[1]) >= DAWN_COLOR_STEP
        || Math.abs(stripColor[2] - dawnColor[2]) >= DAWN_COLOR_STEP) buildStrips(w, h);
      const y = DAWN_TOP * h;
      const sh = (DAWN_BOTTOM - DAWN_TOP) * h;
      for (let i = 0; i < DAWN_BANDS.length; i++) {
        const band = DAWN_BANDS[i];
        let x = (time * band.speed * w + shift) % w;
        if (x < 0) x += w;
        ctx.globalAlpha = state.dawn * band.share;
        ctx.drawImage(strips[i].canvas, x - w, y, w, sh);
        ctx.drawImage(strips[i].canvas, x, y, w, sh);
      }
      ctx.globalAlpha = 1;
    },
  };
}
