import { createMeteors } from './meteors.js';
import { drawEclipse } from './eclipse.js';
import { rgba } from './color.js';
import { createSkyline } from './skyline.js';
import { createLighting } from './lighting.js';
import { createSkyLayer } from './skyLayer.js';
import { createAmbient } from './ambient.js';

const TAU = Math.PI * 2;

// Each hill is a sum of sine waves: [amplitude (fraction of height), frequency (per width), phase].
const HILLS = [
  { base: 0.66, speed: 0.004, waves: [[0.045, 1.2, 0.3], [0.02, 2.9, 1.7], [0.008, 7.3, 4.1]] },
  { base: 0.75, speed: 0.009, waves: [[0.04, 0.9, 2.2], [0.022, 2.3, 0.4], [0.01, 5.7, 3.3]] },
  { base: 0.87, speed: 0.016, waves: [[0.035, 0.7, 5.1], [0.018, 1.9, 2.8], [0.009, 4.6, 0.9]] },
];
export const HORIZON = HILLS[0].base;
// Rim light strength per layer: the far ridge catches the most light.
const RIM_LAYER = [1, 0.85, 0.7];
// Sun height: 0.2h at e >= 12deg, at the horizon line at e = 0, fully behind the far hills by e ~ -4.
const SUN_Y_TOP = 0.2;
const SUN_Y_PER_DEG = (HORIZON - SUN_Y_TOP) / 12;
// Where the skyline's rooftops meet the sky (fraction of h); skyBaseStep darkens the sky from here down.
const SKYLINE_BASE = 0.64;
// Hills are sampled this far (fraction of w) past each edge so no edge ever shows.
const HILL_BLEED = 0.04;
const NO_SHIFT = [0, 0, 0];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];

/** Sky gradient colour at t (0 top .. 1 horizon), matching the stops drawSky uses. */
function skyColorAt(theme, t) {
  const { top, mid, bottom, low } = theme.sky;
  if (t <= 0.6) return mixRgb(top, mid, t / 0.6);
  const plain = mixRgb(mid, bottom, (t - 0.6) / 0.4);
  if (low[3] <= 0.001) return plain;
  const at85 = mixRgb(mixRgb(mid, bottom, 0.625), low, low[3]);
  return t <= 0.85 ? mixRgb(mid, at85, (t - 0.6) / 0.25) : mixRgb(at85, bottom, (t - 0.85) / 0.15);
}

/** Background scene: sky, stars + aurora (skyLayer.js), sun/moon and a slowly scrolling layered landscape. */
export function createScene() {
  const skyLayer = createSkyLayer();
  const meteors = createMeteors();
  const offsets = HILLS.map(() => Math.random());
  const skyline = createSkyline();
  const lighting = createLighting();
  const ambient = createAmbient(); // birds, leaves/petals, grass sway, water glints (ambient.js)

  // Foreground ridge handle for the grass: y(x) at screen x under the current scroll and shift.
  const ridge = {
    offset: 0, shift: 0, w: 1, h: 1,
    y(x) { return hillY(HILLS[2], 2, (x - this.shift) / this.w, this.h); },
  };

  function hillY(hill, i, u, h) {
    let y = hill.base * h;
    for (const [amp, freq, phase] of hill.waves) y -= amp * h * Math.sin(TAU * (u + offsets[i]) * freq + phase);
    return y;
  }

  /** One hill layer: sampled across [-HILL_BLEED, 1 + HILL_BLEED] of the width, moved by `shift` px. */
  function drawHill(ctx, env, i, shift, rimGrad) {
    const { width: w, height: h, theme } = env;
    const hill = HILLS[i];
    const step = Math.max(4, w / 240);
    const x0 = -Math.ceil((HILL_BLEED * w) / step) * step; // on the step grid, so samples match x = 0, step, ...
    const x1 = w * (1 + HILL_BLEED) + step;
    ctx.fillStyle = rgba(theme.hills[i]);
    ctx.beginPath();
    ctx.moveTo(x0, h);
    for (let x = x0; x <= x1; x += step) ctx.lineTo(x, hillY(hill, i, (x - shift) / w, h));
    ctx.lineTo(x1, h);
    ctx.closePath();
    ctx.fill();
    // Bokashi (print styles): a darker wipe just under the ridge, faded in three widening strokes that
    // the hill's own shape clips to its inside.
    const shade = env.artStyle.params.hillShade;
    if (shade.alpha > 0.004) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step) ctx.lineTo(x, hillY(hill, i, (x - shift) / w, h));
      ctx.strokeStyle = rgba(theme.shade);
      ctx.lineJoin = 'round';
      const depth = shade.depth * h;
      for (let k = 0; k < 3; k++) {
        ctx.lineWidth = depth * 2 * (1 - k * 0.3);
        ctx.globalAlpha = shade.alpha * (0.22 + k * 0.14) * (i === 0 ? 0.7 : 1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Print keyline (art styles): a crisp ink line along the ridge, in place of / on top of the rim light.
    const key = env.artStyle.params.keyline;
    if (key.alpha > 0.004) {
      ctx.beginPath();
      for (let x = x0; x <= x1; x += step) ctx.lineTo(x, hillY(hill, i, (x - shift) / w, h) + key.width * 0.5);
      ctx.strokeStyle = rgba(key.color, key.alpha);
      ctx.lineWidth = key.width;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (!rimGrad) return;
    // Top edge only (open path, so no strokes down the sides): a wide soft pass then a crisp line.
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) ctx.lineTo(x, hillY(hill, i, (x - shift) / w, h) + 0.75);
    ctx.strokeStyle = rimGrad;
    ctx.globalAlpha = 0.35 * RIM_LAYER[i];
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = RIM_LAYER[i];
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBody(ctx, body, style, cel, key) {
    if (body.alpha <= 0.001) return;
    if (cel.glow > 0.004) {
      const glow = ctx.createRadialGradient(body.x, body.y, body.r * 0.6, body.x, body.y, body.r * 6);
      glow.addColorStop(0, rgba(style.glow, body.alpha * cel.glow));
      glow.addColorStop(1, rgba(style.glow, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(body.x - body.r * 6, body.y - body.r * 6, body.r * 12, body.r * 12);
    }
    ctx.fillStyle = rgba(style.color, body.alpha);
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, TAU);
    ctx.fill();
    // Flat print disc: an ink outline instead of a glow.
    if (cel.outline > 0.004) {
      ctx.strokeStyle = rgba(key.color, cel.outline * body.alpha);
      ctx.lineWidth = key.width;
      ctx.stroke();
    }
  }

  return {
    /** Mid-ground landmark silhouette: 'stockholm' | 'nordic' | null. */
    setLandmark: skyline.setLandmark,
    /** Night sky weights last frame: { darkness, stars, aurora, gate }. */
    sky: skyLayer.state,
    /** Ambient life / micro-motion: flags, setFlags(partial), state. */
    ambient,

    update(dt, env) {
      const { width: w, height: h, theme, dayMix, time } = env;
      meteors.update(dt, env);
      const twilight = env.twilight ?? 0;
      const elev = env.solarElevation ?? (dayMix > 0.5 ? 45 : -18);
      const drift = 1 + env.wind * 0.06;
      HILLS.forEach((hill, i) => { offsets[i] = (offsets[i] + hill.speed * drift * dt) % 1; });

      const m = Math.min(w, h);
      const vis = theme.celestialVisibility;
      const bodySize = env.artStyle.params.celestial.size;
      // The sun tracks solar elevation and sinks behind the far hills (drawn after the sky, so they
      // occlude it); it is gone by e ~ -5. The moon rises as dayMix falls, faint while twilight glows.
      const sunY = Math.min(0.95, Math.max(SUN_Y_TOP, HORIZON - elev * SUN_Y_PER_DEG));
      env.sun = {
        x: w * 0.72 + Math.sin(time * 0.03) * w * 0.004,
        y: h * sunY + Math.sin(time * 0.07) * h * 0.005,
        r: m * 0.05 * theme.sun.size * bodySize,
        alpha: smoothstep(-5, -1, elev) * vis,
      };
      env.moon = {
        x: w * 0.28,
        y: h * (theme.moon.y + dayMix * 0.6) + Math.sin(time * 0.05) * h * 0.004,
        r: m * 0.035 * theme.moon.size * bodySize,
        alpha: (1 - dayMix) * (1 - twilight) ** 2 * Math.max(vis, 0.15),
      };
      env.horizonY = HORIZON * h;
      // Atmospheric lighting weights for this frame (golden hour, rim, dawn mist) -> env.light.
      lighting.update(env);
      env.light = lighting.state;
      skyLayer.update(dt, env);
      ambient.update(dt, env);
    },

    drawSky(ctx, env) {
      const { width: w, height: h, theme } = env;
      const art = env.artStyle.params;
      const sky = ctx.createLinearGradient(0, 0, 0, env.horizonY);
      sky.addColorStop(0, rgba(theme.sky.top));
      sky.addColorStop(0.6, rgba(theme.sky.mid));
      const low = theme.sky.low;
      if (low[3] > 0.001) {
        // Blend the optional 85% stop over the plain mid->bottom mix (identical to no stop at alpha 0).
        const { mid, bottom } = theme.sky;
        const k = low[3];
        const r = (mid[0] + (bottom[0] - mid[0]) * 0.625) * (1 - k) + low[0] * k;
        const g = (mid[1] + (bottom[1] - mid[1]) * 0.625) * (1 - k) + low[1] * k;
        const b = (mid[2] + (bottom[2] - mid[2]) * 0.625) * (1 - k) + low[2] * k;
        sky.addColorStop(0.85, `rgb(${r | 0},${g | 0},${b | 0})`);
      }
      sky.addColorStop(1, rgba(theme.sky.bottom));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Bokashi sky (print styles): the same gradient as hard tonal steps, mixed over the smooth one.
      if (art.sky.mix > 0.004) {
        const n = Math.max(2, Math.round(art.sky.bands));
        const f = Math.min(art.sky.feather, 0.9 / n) / 2;
        const steps = ctx.createLinearGradient(0, 0, 0, env.horizonY);
        for (let i = 0; i < n; i++) {
          const c = rgba(skyColorAt(theme, (i + 0.5) / n));
          steps.addColorStop(Math.max(0, i / n + f), c);
          steps.addColorStop(Math.min(1, (i + 1) / n - f), c);
        }
        ctx.globalAlpha = art.sky.mix;
        ctx.fillStyle = steps;
        ctx.fillRect(0, 0, w, env.horizonY);
        ctx.fillStyle = rgba(skyColorAt(theme, 1));
        ctx.fillRect(0, env.horizonY - 1, w, h - env.horizonY + 1);
        ctx.globalAlpha = 1;
      }
      env.artStyle.skyBase?.(ctx, env);

      // Stars and aurora: right behind the horizon glow, moon, clouds and everything else.
      skyLayer.draw(ctx, env);

      const band = ctx.createLinearGradient(0, env.horizonY - h * 0.28, 0, env.horizonY + h * 0.05);
      const hg = env.light.horizonGlow; // theme.horizonGlow, warmed at golden hour
      band.addColorStop(0, rgba(hg, 0));
      band.addColorStop(0.8, rgba(hg, art.horizonGlow));
      band.addColorStop(1, rgba(hg, 0));
      ctx.fillStyle = band;
      ctx.fillRect(0, env.horizonY - h * 0.28, w, h * 0.33);

      // Night: a short, crisp luminance step at the skyline's base so the town separates from the sky.
      if (theme.skyBaseStep > 0.004) {
        const y = SKYLINE_BASE * h;
        const ramp = Math.max(2, h * 0.008);
        const step = ctx.createLinearGradient(0, y - ramp, 0, y);
        step.addColorStop(0, 'rgba(0,0,0,0)');
        step.addColorStop(1, `rgba(0,0,0,${theme.skyBaseStep})`);
        ctx.fillStyle = step;
        ctx.fillRect(0, y - ramp, w, h - y + ramp);
      }

      // Sunset glow: a wide, flattened radial light centred under the sun at the horizon, so the sky
      // reads as lit from the sunset side. Off (alpha 0) in day and night palettes.
      const sg = theme.sunsetGlow;
      if (sg[3] * art.sunsetGlow > 0.004) {
        const R = Math.max(w, h) * 0.75;
        ctx.save();
        ctx.translate(env.sun.x, env.horizonY);
        ctx.scale(1, 0.55);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        glow.addColorStop(0, rgba(sg));
        glow.addColorStop(0.3, rgba(sg, 0.5));
        glow.addColorStop(0.65, rgba(sg, 0.14));
        glow.addColorStop(1, rgba(sg, 0));
        ctx.fillStyle = glow;
        ctx.globalAlpha = art.sunsetGlow;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      lighting.drawGolden(ctx, env);

      if (env.scene !== 'eclipse') drawBody(ctx, env.moon, theme.moon, art.celestial, art.keyline);
      if (env.scene !== 'eclipse') drawBody(ctx, env.sun, theme.sun, art.celestial, art.keyline);
      env.artStyle.skyTop?.(ctx, env);
      if (env.scene === 'eclipse') drawEclipse(ctx, env);
      meteors.drawSky(ctx, env);
    },

    drawLand(ctx, env) {
      const { width: w } = env;
      const light = env.light;
      const rim = light.rim; // theme.rim + day/golden-hour lighting (identical to theme.rim at night)
      const off = light.rimOff;
      let rimGrad = null;
      if (rim[3] > 0.004) {
        // Rim light is strongest on the light-source side: the sun at dusk, the moon at night.
        // Screen space: the light source is in the sky (parallax factor 0).
        const lightX = env.moon.x + (env.sun.x - env.moon.x) * clamp01(env.dayMix + (env.twilight ?? 0));
        const u = clamp01(lightX / w);
        rimGrad = ctx.createLinearGradient(0, 0, w, 0);
        rimGrad.addColorStop(0, rgba(rim, off + (1 - off) * (1 - u)));
        rimGrad.addColorStop(u, rgba(rim));
        rimGrad.addColorStop(1, rgba(rim, off + (1 - off) * u));
        ctx.lineJoin = 'round';
      }
      // Depth layers, back to front. Each shifts by env.parallax[layer] px on top of its own scroll.
      const shift = env.parallax ?? NO_SHIFT;
      ambient.drawBirds(ctx, env); // dusk birds: in front of the clouds, behind every hill
      drawHill(ctx, env, 0, shift[0], rimGrad); // distant: far ridge
      skyline.draw(ctx, env, rimGrad, shift[0], light.skylineRim); // distant: town between far ridge and mid hill
      ambient.drawWater(ctx, env, { shoreY: skyline.shore * env.height, alpha: skyline.waterAlpha, shift: shift[0] });
      lighting.drawDawnFog(ctx, env, shift[0]); // sunrise mist on the water, still in the distant layer
      drawHill(ctx, env, 1, shift[1], rimGrad); // midground (hides the skyline's foot)
      drawHill(ctx, env, 2, shift[2], rimGrad); // foreground
      // Grass tufts ride the foreground ridge (same scroll + parallax as the hill), then drifting leaves.
      ridge.shift = shift[2];
      ridge.offset = offsets[2];
      ridge.h = env.height;
      ridge.w = w;
      ambient.drawGrass(ctx, env, ridge);
      ambient.drawLeaves(ctx, env, shift);
      meteors.drawGround(ctx, env);
    },
  };
}
