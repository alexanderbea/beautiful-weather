/**
 * Night sky layer: a star field that fades in with darkness and a soft aurora band on clear nights.
 * Drawn by the scene right after the sky gradient, so the horizon glow, moon, clouds (effect.drawBack),
 * landscape and every weather effect sit in front of it. Sky elements, so parallax factor 0.
 *
 * Darkness comes from env.solarElevation (degrees): 0 at e >= -1, 1 at e <= -12 (nautical dusk).
 * Stars:  theme.stars (condition + day/twilight/night cross-fade) x per-star fade-in on darkness
 *         (brighter stars appear first) x a slow, shallow twinkle.
 * Aurora: theme.aurora (1 only in the clear-night palette) x astronomical darkness (e -10 -> -16)
 *         x a condition gate that eases toward env.condition === 'clear'.
 * Per frame: no allocation. The aurora texture is built once per viewport size.
 */

const TAU = Math.PI * 2;
const STAR_COUNT = 180;
const STAR_SKY = 0.62; // stars live in the top 62% of the viewport
// Twinkle: 9-25 s periods, 6-18% depth. Slow enough to never read as flicker.
const TWINKLE_RATE = [0.25, 0.7]; // rad/s
const TWINKLE_DEPTH = [0.06, 0.18];
const STAR_FADE = 0.35; // darkness span over which one star fades in

const AURORA_TEX_W = 256; // one tile; the canvas holds two for seamless scrolling
const AURORA_TEX_H = 64;
const AURORA_STRIPS = 36;
const AURORA_TOP = 0.1; // band top, fraction of h
const AURORA_H = 0.3; // band height, fraction of h (bottom edge ~0.4h, well above the ridge)
const AURORA_ALPHA = 0.32; // peak, so it stays a background glow
const AURORA_SCROLL = 0.0035; // texture tiles per second
const GATE_S = 1.8; // condition gate ease time (matches the engine's transition)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (min, max) => min + Math.random() * (max - min);

/** 0 in daylight/twilight, 1 by nautical dusk (e = -12). */
export const darknessAt = (elev) => smoothstep(-1, -12, elev);
/** 0 until the sky is nearly astronomically dark. */
export const auroraDarknessAt = (elev) => smoothstep(-10, -16, elev);

function createStars() {
  return Array.from({ length: STAR_COUNT }, () => {
    const mag = Math.random() ** 2.2; // mostly faint, a few bright
    return {
      x: Math.random(),
      y: Math.random() * STAR_SKY,
      r: 0.5 + mag * 1.3,
      base: 0.45 + mag * 0.55,
      // Bright stars show first at dusk, faint ones only once it is properly dark.
      threshold: (1 - mag) * (1 - STAR_FADE) * 0.9,
      phase: Math.random() * TAU,
      rate: rand(TWINKLE_RATE[0], TWINKLE_RATE[1]),
      depth: rand(TWINKLE_DEPTH[0], TWINKLE_DEPTH[1]),
    };
  });
}

/** Periodic (tileable in x) curtain texture: bright green lower edge, violet fringe, vertical rays. */
function buildAuroraTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = AURORA_TEX_W * 2;
  canvas.height = AURORA_TEX_H;
  const c = canvas.getContext('2d');
  const img = c.createImageData(AURORA_TEX_W, AURORA_TEX_H);
  const d = img.data;
  for (let x = 0; x < AURORA_TEX_W; x++) {
    const u = x / AURORA_TEX_W;
    // Integer frequencies keep it periodic. Rays: fine streaks over a broad brightness swell.
    const swell = 0.55 + 0.25 * Math.sin(TAU * u * 2 + 0.7) + 0.2 * Math.sin(TAU * u * 5 + 2.1);
    const rays = 0.7 + 0.18 * Math.sin(TAU * u * 17 + 1.3) + 0.12 * Math.sin(TAU * u * 31 + 4.2);
    const lit = clamp01(swell * rays);
    for (let y = 0; y < AURORA_TEX_H; y++) {
      const v = y / (AURORA_TEX_H - 1); // 0 top .. 1 bottom
      // Sharp-ish lower edge at v ~ 0.85, long soft fade upward.
      const profile = smoothstep(1, 0.82, v) * smoothstep(0, 0.75, v) ** 1.6;
      const i = (y * AURORA_TEX_W + x) * 4;
      const top = 1 - v; // green low, violet high
      d[i] = 70 + 110 * top * top;
      d[i + 1] = 255 - 150 * top;
      d[i + 2] = 160 + 90 * top;
      d[i + 3] = 255 * profile * lit;
    }
  }
  c.putImageData(img, 0, 0);
  c.drawImage(canvas, 0, 0, AURORA_TEX_W, AURORA_TEX_H, AURORA_TEX_W, 0, AURORA_TEX_W, AURORA_TEX_H);
  return canvas;
}

export function createSkyLayer() {
  const stars = createStars();
  let aurora = null; // lazily built on the first dark clear night
  let gate = 0; // condition gate, eases toward env.condition === 'clear'
  // Last computed weights, for tests / QA (engine.state.sky).
  const state = { darkness: 0, stars: 0, aurora: 0, gate: 0 };

  function drawStars(ctx, env, amount) {
    const { width: w, height: h, time } = env;
    const dark = state.darkness;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const fade = smoothstep(s.threshold, s.threshold + STAR_FADE, dark);
      if (fade <= 0) continue;
      const twinkle = 1 - s.depth * (0.5 + 0.5 * Math.sin(time * s.rate + s.phase));
      ctx.globalAlpha = amount * fade * s.base * twinkle;
      ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawAurora(ctx, env, amount) {
    const { width: w, height: h, time } = env;
    if (!aurora) aurora = buildAuroraTexture();
    const top = AURORA_TOP * h;
    const bandH = AURORA_H * h;
    const stripW = w / AURORA_STRIPS;
    const srcW = AURORA_TEX_W / AURORA_STRIPS;
    const scroll = ((time * AURORA_SCROLL) % 1) * AURORA_TEX_W;
    const breathe = 0.85 + 0.15 * Math.sin(time * 0.11);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < AURORA_STRIPS; i++) {
      const u = (i + 0.5) / AURORA_STRIPS;
      // Slow ribbon sway plus a gentle arc (higher at the edges); both well under a strip's width per second.
      const dy = h * (0.035 * Math.sin(TAU * u * 1.2 + time * 0.06)
        + 0.015 * Math.sin(TAU * u * 2.9 - time * 0.041)
        + 0.05 * (u - 0.5) * (u - 0.5) * -4);
      const fadeEdges = smoothstep(0, 0.18, u) * smoothstep(1, 0.82, u);
      const pulse = 0.75 + 0.25 * Math.sin(TAU * u * 1.7 - time * 0.09 + 1.1);
      ctx.globalAlpha = amount * fadeEdges * pulse * breathe;
      const sx = (scroll + i * srcW) % AURORA_TEX_W;
      // +1px overlap hides strip seams.
      ctx.drawImage(aurora, sx, 0, srcW, AURORA_TEX_H, i * stripW, top + dy, stripW + 1, bandH);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return {
    state,

    update(dt, env) {
      const elev = env.solarElevation ?? (env.dayMix > 0.5 ? 45 : -18);
      const clear = env.condition === undefined || env.condition === 'clear';
      const step = dt / GATE_S;
      gate += Math.max(-step, Math.min(step, (clear ? 1 : 0) - gate));
      state.darkness = darknessAt(elev);
      state.stars = (env.theme.stars ?? 0) * state.darkness;
      state.gate = gate;
      state.aurora = AURORA_ALPHA * clamp01(env.theme.aurora ?? 0) * auroraDarknessAt(elev) * gate * gate * (3 - 2 * gate);
    },

    draw(ctx, env) {
      if (state.stars > 0.005) drawStars(ctx, env, state.stars);
      if (state.aurora > 0.004) drawAurora(ctx, env, state.aurora);
    },
  };
}
