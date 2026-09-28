import { rgba } from '../color.js';
import { darknessAt } from '../skyLayer.js';

/**
 * Van Gogh (post-impressionist, Arles / Saint-Remy) art style.
 *
 * Treatment: thick complementary colour (cobalt / ultramarine against chrome yellow, viridian against
 * orange, nothing muted by distance), a full-frame field of short curved impasto dabs that swirl
 * around a few vortices in the sky and follow the contours on the hills, chrome-yellow / orange /
 * violet flecks on top, a sun that radiates straight yellow rays and rings by day (The Sower) and
 * haloed yellow stars and a ringed moon at night (Starry Night). Rain is thick short dashes, snow is
 * big dabs, the night sky stays a luminous ultramarine (never near-black).
 *
 * Per frame: two drawImage calls (the dab field with 'overlay' so the strokes take on whatever
 * palette is underneath, then the flecks), a ring of sun dabs or a dozen star sprites. The textures
 * are built once per viewport size; nothing per-pixel per frame.
 */

// Palette (THEMES-shaped partial; keys not listed inherit the base palette of that condition/phase).
const NIGHT = {
  sky: { top: '#14246a', mid: '#2b4f9e', bottom: '#4f78b6', low: 'rgba(60,72,120,0)' },
  horizonGlow: 'rgba(120,160,230,0.3)',
  rim: 'rgba(140,180,255,0.4)',
  hills: ['#3a5590', '#243b70', '#12203f'],
  skyline: '#0c1230',
  skylineRim: 'rgba(255,220,120,0.6)', // warm-yellow town windows
  moon: { color: '#ffe98a', glow: 'rgba(255,220,90,0.55)', size: 1.4, y: 0.16 },
  stars: 1,
  cloud: { color: '#3f5a9e', shadow: '#1e2f60' },
  accent: '#ffe27a',
  ambient: 0.9, // never navy-black: the ultramarine has to glow
  shade: '#0a1040',
};
const TWILIGHT = {
  sky: { top: '#243a8c', mid: '#6a6ab0', bottom: '#ffe66a', low: 'rgba(255,170,60,0.9)' },
  horizonGlow: 'rgba(255,200,60,0.7)',
  sunsetGlow: 'rgba(255,150,30,0.65)',
  hills: ['#6d5aa0', '#4a3f8a', '#2a2a6a'], // violet against the chrome-yellow horizon
  skyline: '#3e3a80',
  rim: 'rgba(255,200,60,0.6)',
  sun: { color: '#fff7a0', glow: 'rgba(255,190,40,0.85)', size: 1.6 },
  cloud: { color: '#f0b060', shadow: '#7050a0' },
  accent: '#ffcf3a',
  shade: '#22184a',
};
const DAY = {
  sky: { top: '#1e3f9a', mid: '#3b86c9', bottom: '#cfe5d8', low: 'rgba(214,130,140,0)' },
  horizonGlow: 'rgba(255,230,120,0.5)',
  rim: 'rgba(255,220,90,0.28)',
  hills: ['#6f7ab8', '#6a9a3c', '#d6a22a'], // blue-violet far ridge, viridian, chrome-yellow field
  skyline: '#5b62a0',
  sun: { color: '#fff28a', glow: 'rgba(255,214,60,0.75)', size: 1.25 },
  cloud: { color: '#f4f1dc', shadow: '#8fb0d8' },
  accent: '#ffe14a',
  shade: '#1a1e5c',
};
const THEMES = {
  clear: {
    common: { light: { golden: 1, rim: 1, dawnFog: 0.4 } },
    day: DAY,
    twilight: TWILIGHT,
    night: NIGHT,
  },
  clouds: {
    common: { light: { golden: 0.6, rim: 0.6, dawnFog: 0.4 } },
    day: {
      ...DAY,
      sky: { top: '#3355a0', mid: '#6f92c8', bottom: '#d8dcc8', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(255,236,160,0.35)',
      hills: ['#7a84b8', '#6f9a48', '#c9a038'],
      skyline: '#5f66a4',
      rim: 'rgba(255,220,90,0.2)',
      sun: { color: '#fff28a', glow: 'rgba(255,214,60,0.6)', size: 1.25 },
      cloud: { color: '#f2eedc', shadow: '#7d9ccf' },
      accent: '#f0d858',
      ambient: 0.95,
    },
    twilight: { ...TWILIGHT, sky: { top: '#2a3a84', mid: '#6c64a8', bottom: '#f0c868', low: 'rgba(240,150,70,0.7)' }, horizonGlow: 'rgba(255,196,80,0.45)', sunsetGlow: 'rgba(255,150,40,0.35)', hills: ['#68589c', '#463d84', '#2a2a68'], skyline: '#403c7c', rim: 'rgba(255,200,60,0.3)', cloud: { color: '#e0a070', shadow: '#5c4890' }, accent: '#f0c050', ambient: 0.92 },
    night: { ...NIGHT, sky: { top: '#122060', mid: '#274792', bottom: '#4468a8', low: 'rgba(60,72,120,0)' }, hills: ['#345088', '#213868', '#111e3c'], moon: { color: '#ffe98a', glow: 'rgba(255,220,90,0.45)', size: 1.4, y: 0.16 }, stars: 0.4, cloud: { color: '#35508e', shadow: '#1a2a58', opacity: 0.9 }, ambient: 0.88 },
  },
  rain: {
    // Rain at Auvers: still blue-violet and green, never grey.
    common: { light: { golden: 0.2, rim: 0.3, dawnFog: 0.2 } },
    day: {
      ...DAY,
      sky: { top: '#3a4f9a', mid: '#6b80b6', bottom: '#b8c4c8', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(220,220,160,0.3)',
      hills: ['#6c78b0', '#5f8e52', '#a8923a'],
      skyline: '#585ea0',
      rim: 'rgba(230,220,140,0.14)',
      cloud: { color: '#9aa8c8', shadow: '#4a5690' },
      particle: 'rgba(230,240,255,0.85)',
      accent: '#e0d060',
      ambient: 0.88,
    },
    twilight: { ...TWILIGHT, sky: { top: '#2a3478', mid: '#5e5a98', bottom: '#c0a070', low: 'rgba(200,130,80,0.55)' }, horizonGlow: 'rgba(240,190,90,0.3)', sunsetGlow: 'rgba(240,150,50,0.2)', hills: ['#5b4f90', '#3e3878', '#262660'], skyline: '#3a3676', rim: 'rgba(240,200,90,0.16)', cloud: { color: '#8878a8', shadow: '#3a3468' }, particle: 'rgba(255,230,180,0.8)', accent: '#e0b850', ambient: 0.86 },
    night: {
      ...NIGHT,
      sky: { top: '#0f1a52', mid: '#243f88', bottom: '#3c5a98', low: 'rgba(60,72,120,0)' },
      hills: ['#2f4780', '#1d3060', '#111c3c'],
      moon: { color: '#ffe98a', glow: 'rgba(255,210,80,0.5)', size: 1.3, y: 0.27 },
      cloud: { color: '#2e4a88', shadow: '#12204a', moonBreak: 0.8 },
      particle: 'rgba(200,220,255,0.85)',
      particleGlow: 'rgba(150,180,255,0.18)',
      ambient: 0.86,
    },
  },
  snow: {
    common: { light: { golden: 0.6, rim: 0.7, dawnFog: 0.3 } },
    day: {
      ...DAY,
      sky: { top: '#3e64b0', mid: '#8fb4dc', bottom: '#f2eee0', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(255,240,180,0.4)',
      hills: ['#a9b2dc', '#d8dcd8', '#efe8d2'],
      skyline: '#8a90c0',
      rim: 'rgba(255,230,140,0.2)',
      sun: { color: '#fff28a', glow: 'rgba(255,214,60,0.5)', size: 1.25 },
      cloud: { color: '#f6f2e6', shadow: '#a0b4dc' },
      particle: 'rgba(255,255,255,0.95)',
      accent: '#ffe6a0',
    },
    twilight: { ...TWILIGHT, sky: { top: '#2c3c88', mid: '#8878b0', bottom: '#ffd890', low: 'rgba(250,160,90,0.7)' }, horizonGlow: 'rgba(255,200,100,0.45)', sunsetGlow: 'rgba(255,150,40,0.35)', hills: ['#a89ccc', '#d0bcc0', '#eed8b8'], skyline: '#8478b0', rim: 'rgba(255,200,80,0.35)', cloud: { color: '#f0c0a0', shadow: '#7860a0' }, particle: 'rgba(255,245,220,0.95)', accent: '#ffcf60' },
    night: { ...NIGHT, sky: { top: '#101d60', mid: '#2a4590', bottom: '#4f6cb0', low: 'rgba(60,72,120,0)' }, hills: ['#6f7fb8', '#5a6ba4', '#465788'], stars: 0.6, particle: 'rgba(240,245,255,0.95)' },
  },
  wind: {
    day: { ...DAY, sky: { top: '#2a56aa', mid: '#5d95d2', bottom: '#d2e2d8', low: 'rgba(214,130,140,0)' }, hills: ['#6f7cbc', '#6e9c40', '#dcae2c'], particle: 'rgba(255,245,200,0.45)' },
    twilight: { ...TWILIGHT, sunsetGlow: 'rgba(255,150,30,0.6)', particle: 'rgba(255,220,140,0.4)' },
    night: { ...NIGHT, stars: 0.8, particle: 'rgba(210,225,255,0.3)' },
  },
  fog: {
    day: { ...DAY, sky: { top: '#5c74b0', mid: '#9aa8c8', bottom: '#dcd8c8', low: 'rgba(214,130,140,0)' }, hills: ['#8890bc', '#7f9a70', '#b8a458'], skyline: '#7a80b0', haze: { color: 'rgba(214,214,204,1)', amount: 0.65 }, accent: '#e8d880' },
    twilight: { ...TWILIGHT, hills: ['#8a7aa8', '#6c6098', '#4c4880'], haze: { color: 'rgba(220,196,160,1)', amount: 0.65 } },
    night: { ...NIGHT, haze: { color: 'rgba(60,80,150,1)', amount: 0.65, skylineClear: 0.85 }, moon: { color: '#ffe98a', glow: 'rgba(255,220,90,0.4)', size: 1.4, y: 0.16 } },
  },
};

const TAU = Math.PI * 2;
const HORIZON = 0.66; // scene HORIZON (fraction of h): swirl dabs above it, contour dabs below
const TEX_RES_MAX = 1.5; // texture resolution cap (x CSS px): the dabs stay crisp on retina, build stays cheap
const DAB_DENSITY = 0.0075; // dabs per CSS px^2 (about 1x coverage of the frame)
const FLECK_SHARE = 0.06; // flecks as a fraction of the dab count
const FIELD_ALPHA = 0.85; // dab field opacity at weight 1 ('overlay')
const FLECK_ALPHA = 0.28; // fleck layer opacity at weight 1 (source-over)
const FLECK_NIGHT_BOOST = 0.4; // flecks glow a little more at night
const FIELD_FRAMES = 3; // independent dab fields, cycled so the impasto seems to churn
const FIELD_FRAME_S = 1.1; // s per cross-fade between two fields
const FLECK_JITTER = 3; // px (at dab scale 1) the flecks orbit along the swirl
const FLECK_ORBIT = 1.6; // rad/s
// Impasto dab tints [r, g, b, share]: overlay-composited, so pale tints lighten and the ultramarine darkens
// whatever palette lies underneath. No rebuild on condition or day/night.
const DAB_TINTS = [
  [255, 238, 150, 0.3], // pale chrome yellow
  [160, 190, 255, 0.3], // pale cobalt
  [255, 255, 255, 0.14], // white
  [28, 44, 130, 0.26], // dark ultramarine
];
const DAB_ALPHAS = [0.26, 0.35, 0.45];
const SKY_FLECK = [255, 225, 74, 1]; // chrome yellow
const LAND_FLECKS = [[232, 120, 30, 1], [106, 79, 168, 1]]; // orange, violet: complements of the greens and yellows
// Sky vortices [x (fraction of w), y (fraction of h), spin]; the flow field is their tangents plus a
// horizontal drift, so the dabs read as Starry Night's swirls.
const VORTICES = [[0.30, 0.25, 1], [0.62, 0.18, -1], [0.86, 0.36, 1], [0.10, 0.48, -1]];
const VORTEX_REACH = 0.22; // fraction of w at which a vortex's pull halves
const VORTEX_PULL = 2.4;
// Haloed night stars [x (fraction of w), y (fraction of h), size]: fixed, top 55% of the sky, off the moon.
const STARS = [
  [0.07, 0.11, 1.15], [0.17, 0.30, 0.9], [0.36, 0.07, 1.0], [0.46, 0.21, 1.25], [0.57, 0.33, 0.85],
  [0.64, 0.09, 1.1], [0.75, 0.24, 0.95], [0.87, 0.13, 1.2], [0.94, 0.32, 0.9], [0.40, 0.35, 0.8],
  [0.12, 0.44, 0.7], [0.80, 0.42, 0.75], [0.52, 0.04, 0.8], [0.26, 0.05, 0.95],
];
const STAR_SPRITE = 56; // sprite size in CSS px at scale 1 (halo radius 22 + margin)
const STAR_DISC = [255, 244, 192, 1];
const STAR_RING = [255, 226, 122, 1];
const STAR_RINGS = [[6, 0.35], [11, 0.22], [16, 0.12]]; // [radius px, alpha]
const STAR_GLOW_R = 22;
const STAR_GLOW_ALPHA = 0.3;
const MOON_RINGS = [[1.3, 0.4], [1.7, 0.25], [2.2, 0.12]]; // [x moon r, alpha]
const SUN_DABS = 28; // radiating dabs round the sun (The Sower)
const SUN_DAB_IN = 1.35; // ring of dabs from this ... (x sun r)
const SUN_DAB_OUT = 2.5; // ... to this
const SUN_RINGS = [[1.6, 0.3], [2.3, 0.3]]; // [x sun r, alpha]
const SUN_RAY_ALPHA = 0.35;
const SUN_RAY_BREATH = 0.1; // alpha swell over SUN_BREATH_S
const SUN_BREATH_S = 8;
const SUN_SPIN = 0.01; // rad/s
const SUN_EDGE = [240, 160, 32, 1]; // orange edge on the disc

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Dab size scale for this viewport (dabs are sized for a ~900 px frame). */
const dabScale = (w, h) => clamp(Math.min(w, h) / 900, 0.6, 1.4);

/** Unit flow direction at (x, y) into out: sky swirl above the horizon, hill contours below. */
function flowAt(x, y, w, h, out) {
  if (y >= HORIZON * h) {
    // Mostly horizontal, with the same gentle undulation the hill contours have.
    const a = Math.sin((x / w) * TAU * 1.1 + (y / h) * 5) * 0.3;
    out[0] = Math.cos(a);
    out[1] = Math.sin(a);
    return;
  }
  let vx = 1;
  let vy = 0;
  for (const [cx, cy, spin] of VORTICES) {
    const dx = x - cx * w;
    const dy = y - cy * h;
    const d = Math.hypot(dx, dy) + 1;
    const k = (spin * VORTEX_PULL) / (1 + d / (VORTEX_REACH * w));
    vx -= (dy / d) * k;
    vy += (dx / d) * k;
  }
  const n = Math.hypot(vx, vy) || 1;
  out[0] = vx / n;
  out[1] = vy / n;
}

/** One curved dab from (x, y): tangent to the flow at its start and again at its middle, so it bends with the field. */
function strokeDab(c, x, y, len, w, h, d0, d1) {
  flowAt(x, y, w, h, d0);
  const mx = x + d0[0] * len * 0.5;
  const my = y + d0[1] * len * 0.5;
  flowAt(mx, my, w, h, d1);
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(mx, my, mx + d1[0] * len * 0.5, my + d1[1] * len * 0.5);
  c.stroke();
}

function makeCanvas(w, h, res) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * res));
  canvas.height = Math.max(1, Math.round(h * res));
  const c = canvas.getContext('2d');
  c.scale(res, res);
  c.lineCap = 'round';
  return { canvas, c };
}

/**
 * The impasto field: short curved dabs over the whole frame, swirling in the sky and following the
 * contours on the land, in four tints for the 'overlay' pass. Returns { field, flecks }: the flecks
 * (chrome yellow in the sky, orange and violet on the land) are a separate source-over layer so they
 * keep their own hue instead of taking the palette's.
 */
function buildTextures(w, h, res) {
  const s = dabScale(w, h);
  const field = makeCanvas(w, h, res);
  const flecks = makeCanvas(w, h, res);
  const d0 = [0, 0];
  const d1 = [0, 0];
  const total = Math.round(w * h * DAB_DENSITY);
  const styles = DAB_TINTS.map((t) => DAB_ALPHAS.map((a) => rgba([t[0], t[1], t[2], 1], a)));
  // Grouped by tint so the stroke style changes rarely; positions are uniform over the frame.
  DAB_TINTS.forEach((tint, ti) => {
    const n = Math.round(total * tint[3]);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const sky = y < HORIZON * h;
      // Sky dabs are longer and lengthen further inside the vortices; land dabs are shorter and fatter.
      let len = (sky ? 18 + Math.random() * 22 : 14 + Math.random() * 14) * s;
      if (sky) {
        for (const [cx, cy] of VORTICES) if (Math.hypot(x - cx * w, y - cy * h) < 0.12 * w) len *= 1.4;
      }
      field.c.lineWidth = (3 + Math.random() * 4) * s;
      field.c.strokeStyle = styles[ti][(Math.random() * DAB_ALPHAS.length) | 0];
      strokeDab(field.c, x, y, len, w, h, d0, d1);
    }
  });
  const nFlecks = Math.round(total * FLECK_SHARE);
  for (let i = 0; i < nFlecks; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const sky = y < HORIZON * h;
    const tint = sky ? SKY_FLECK : LAND_FLECKS[(Math.random() * LAND_FLECKS.length) | 0];
    flecks.c.strokeStyle = rgba(tint, 0.75 + Math.random() * 0.25);
    flecks.c.lineWidth = (2.5 + Math.random() * 2.5) * s;
    strokeDab(flecks.c, x, y, (8 + Math.random() * 12) * s, w, h, d0, d1);
  }
  return { field: field.canvas, flecks: flecks.canvas };
}

/** Haloed star sprite (Starry Night): yellow glow, three rings and a pale disc, sized for `s`. */
function buildStarSprite(s, res) {
  const size = STAR_SPRITE * s;
  const { canvas, c } = makeCanvas(size, size, res);
  const cx = size / 2;
  const glow = c.createRadialGradient(cx, cx, 2 * s, cx, cx, STAR_GLOW_R * s);
  glow.addColorStop(0, rgba(STAR_RING, STAR_GLOW_ALPHA));
  glow.addColorStop(1, rgba(STAR_RING, 0));
  c.fillStyle = glow;
  c.fillRect(0, 0, size, size);
  c.lineWidth = 2 * s;
  for (const [r, a] of STAR_RINGS) {
    c.strokeStyle = rgba(STAR_RING, a);
    c.beginPath();
    c.arc(cx, cx, r * s, 0, TAU);
    c.stroke();
  }
  c.fillStyle = rgba(STAR_DISC);
  c.beginPath();
  c.arc(cx, cx, 3.2 * s, 0, TAU);
  c.fill();
  return canvas;
}

function createInstance() {
  let frames = []; // FIELD_FRAMES independent dab fields over the same flow, cross-faded in turn ("boiling" paint)
  let field = null;
  let flecks = null;
  let star = null;
  let builtW = 0;
  let builtH = 0;
  let builtRes = 0;

  function build(env) {
    const { width: w, height: h } = env;
    const res = Math.min(env.dpr || 1, TEX_RES_MAX);
    if (w === builtW && h === builtH && res === builtRes) return;
    builtW = w;
    builtH = h;
    builtRes = res;
    frames = Array.from({ length: FIELD_FRAMES }, () => buildTextures(w, h, res));
    ({ field, flecks } = frames[0]);
    star = buildStarSprite(dabScale(w, h), res);
  }

  return {
    init(env) { build(env); },
    resize(env) { build(env); },
    destroy() { frames = []; field = flecks = star = null; builtW = builtH = 0; },

    /** By day, rays and rings round the sun; at night, haloed stars and rings round the moon. */
    drawSkyTop(ctx, env, weight) {
      const { width: w, height: h, theme, time, sun, moon } = env;
      const s = dabScale(w, h);
      ctx.lineCap = 'round';
      if (sun.alpha > 0.01) {
        const breath = 0.5 + 0.5 * Math.sin((time * TAU) / SUN_BREATH_S);
        const a = weight * sun.alpha * (SUN_RAY_ALPHA + SUN_RAY_BREATH * breath);
        const rot = time * SUN_SPIN;
        ctx.strokeStyle = rgba(theme.accent);
        ctx.globalAlpha = a;
        ctx.lineWidth = 3.5 * s;
        ctx.beginPath();
        for (let i = 0; i < SUN_DABS; i++) {
          const ang = rot + (i * TAU) / SUN_DABS;
          const r1 = sun.r * (i % 2 ? SUN_DAB_IN + (SUN_DAB_OUT - SUN_DAB_IN) * 0.7 : SUN_DAB_OUT);
          ctx.moveTo(sun.x + Math.cos(ang) * sun.r * SUN_DAB_IN, sun.y + Math.sin(ang) * sun.r * SUN_DAB_IN);
          ctx.lineTo(sun.x + Math.cos(ang) * r1, sun.y + Math.sin(ang) * r1);
        }
        ctx.stroke();
        ctx.lineWidth = 3 * s;
        for (const [k, ra] of SUN_RINGS) {
          ctx.globalAlpha = weight * sun.alpha * ra;
          ctx.beginPath();
          ctx.arc(sun.x, sun.y, sun.r * k, 0, TAU);
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(SUN_EDGE);
        ctx.globalAlpha = weight * sun.alpha * 0.6;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, sun.r - s, 0, TAU);
        ctx.stroke();
      }
      const night = darknessAt(env.solarElevation) * theme.stars * weight;
      if (night > 0.01 && star) {
        const size = STAR_SPRITE * s;
        for (let i = 0; i < STARS.length; i++) {
          const [fx, fy, k] = STARS[i];
          const twinkle = 0.85 + 0.15 * Math.sin(time * 0.9 + i * 1.7);
          const d = size * k;
          ctx.globalAlpha = night * twinkle;
          ctx.drawImage(star, fx * w - d / 2, fy * h - d / 2, d, d);
        }
      }
      if (moon.alpha > 0.01) {
        ctx.strokeStyle = rgba(STAR_RING);
        ctx.lineWidth = 3 * s;
        for (const [k, ra] of MOON_RINGS) {
          ctx.globalAlpha = weight * moon.alpha * ra;
          ctx.beginPath();
          ctx.arc(moon.x, moon.y, moon.r * k, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },

    /** The impasto: the dab field with 'overlay' (takes the scene's own colours), then the flecks. */
    drawPost(ctx, env, weight) {
      if (!field) return;
      const { width: w, height: h, theme } = env;
      // Boil: the brushwork re-paints itself, cross-fading frame i -> i + 1 every FIELD_FRAME_S, and the
      // flecks circle a few px along the flow. Reduced motion holds the first frame still.
      const n = frames.length;
      const u = env.reducedMotion ? 0 : env.time / FIELD_FRAME_S;
      const i = Math.floor(u) % n;
      const f = env.reducedMotion ? 0 : ease(u - Math.floor(u));
      const haze = theme.haze.amount;
      const fleckA = FLECK_ALPHA * weight * (1 - 0.6 * haze) * (1 + FLECK_NIGHT_BOOST * (1 - env.dayMix));
      const jx = env.reducedMotion ? 0 : Math.sin(env.time * FLECK_ORBIT) * FLECK_JITTER * dabScale(w, h);
      const jy = env.reducedMotion ? 0 : Math.cos(env.time * FLECK_ORBIT * 1.3) * FLECK_JITTER * dabScale(w, h);
      for (const [k, share] of [[i, 1 - f], [(i + 1) % n, f]]) {
        if (share < 0.01) continue;
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = FIELD_ALPHA * weight * share;
        ctx.drawImage(frames[k].field, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fleckA * share;
        ctx.drawImage(frames[k].flecks, jx, jy, w, h);
      }
      ctx.globalAlpha = 1;
    },
  };
}

export function createVanGogh() {
  return {
    id: 'vangogh',
    label: 'Van Gogh',
    hint: 'Swirling impasto, starry skies',
    swatch: 'conic-gradient(#1e3f9a, #ffe14a, #6a9a3c, #1e3f9a)',
    themes: THEMES,
    params: {
      rim: 1.2,
      golden: 1.3,
      celestial: { glow: 1.4, size: 1.15 },
      cloud: { scale: 1.1, highlight: 0.35 },
      sunRays: 0.5,
      rain: { len: 0.55, width: 2.4, glow: 0.6 },
      snow: { size: 1.6 },
      // Turbulent: fast clouds that bob and boil, restless grass, choppy water.
      motion: { cloudSpeed: 1.6, cloudBob: 0.8, bobRate: 0.9, cloudBoil: 0.09, boilRate: 2.2, sway: 1.5, swayRate: 1.5, ripple: 1.8 },
    },
    create: createInstance,
  };
}
