import { rgba } from '../color.js';
import { darknessAt } from '../skyLayer.js';

/**
 * Ghibli (Studio Ghibli / Kazuo Oga background painting) art style.
 *
 * Treatment: a smooth airbrushed cerulean sky that warms to a pale cream horizon, big soft cel-shaded
 * cumulus with bright white caps, lush saturated greens with a brushy foliage tooth on the nearer
 * hills, a warm nostalgic bloom round the sun that swells at golden hour, and deep blue-violet nights
 * with a huge softly glowing moon, gentle stars and a few four-point sparkles. Edges soft, no
 * outlines, no texture on the sky. Rain is fine and long, snow is large and soft.
 *
 * Per frame: one linear gradient (lower-sky wash), one drawImage for the bloom, one for the foliage
 * texture and a handful of sparkle lines. The bloom sprites and the foliage tile are built once per
 * viewport size; nothing per-pixel per frame.
 */

// Palette (THEMES-shaped partial; keys not listed inherit the base palette of that condition/phase).
const MOON = { color: '#fff8dc', glow: 'rgba(220,225,255,0.5)', size: 1.6, y: 0.2 };
const NIGHT = {
  sky: { top: '#0c1236', mid: '#1f2a6a', bottom: '#4a5aa0', low: 'rgba(60,72,120,0)' },
  horizonGlow: 'rgba(150,160,240,0.25)',
  rim: 'rgba(180,200,255,0.4)',
  hills: ['#31427a', '#203258', '#14263f'],
  skyline: '#080c1c',
  skylineRim: 'rgba(220,230,255,0.8)',
  moon: MOON,
  stars: 1,
  cloud: { color: '#4a5a96', shadow: '#26305c', opacity: 0.75 },
  accent: '#c8d4ff',
  ambient: 0.88,
  shade: '#0c1030',
};
const TWILIGHT = {
  sky: { top: '#2c3a78', mid: '#8a6a9a', bottom: '#ffd39a', low: 'rgba(240,150,110,0.9)' },
  horizonGlow: 'rgba(255,190,110,0.7)',
  sunsetGlow: 'rgba(255,150,70,0.65)',
  hills: ['#7a6a8e', '#4c5a5a', '#2c4a3a'], // the hills keep a hint of green
  skyline: '#564e78',
  rim: 'rgba(255,190,120,0.6)',
  sun: { color: '#fff0c0', glow: 'rgba(255,150,60,0.8)', size: 1.4 },
  cloud: { color: '#ffd0b0', shadow: '#8a6aa0', opacity: 0.95 },
  accent: '#ffc87a',
  shade: '#2a1a40',
};
const DAY = {
  sky: { top: '#3a8fd6', mid: '#8fc8ee', bottom: '#f2ecd8', low: 'rgba(214,130,140,0)' },
  horizonGlow: 'rgba(255,240,200,0.5)',
  rim: 'rgba(255,245,210,0.18)',
  hills: ['#86b9a6', '#5aa456', '#2f7d3c'], // lush saturated greens
  skyline: '#7f9fb0',
  sun: { color: '#fffbe6', glow: 'rgba(255,230,150,0.5)', size: 1.05 },
  cloud: { color: '#ffffff', shadow: '#b9cfe6', opacity: 0.95 },
  accent: '#ffe9a8',
  shade: '#1c2a4a',
};
const THEMES = {
  clear: {
    day: DAY,
    twilight: TWILIGHT,
    night: NIGHT,
  },
  clouds: {
    // Cumulus day: the sky stays blue between big white clouds; the overcast band is light.
    common: { celestialVisibility: 0.45, cloud: { cover: 0.75, band: 0.2 }, light: { golden: 0.6, rim: 0.6, dawnFog: 0.6 } },
    day: {
      ...DAY,
      sky: { top: '#5a9ad4', mid: '#a8d0ec', bottom: '#eef0e4', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(255,244,214,0.4)',
      hills: ['#8ab4a4', '#5c9c56', '#357a3c'],
      skyline: '#8299ab',
      rim: 'rgba(255,245,210,0.14)',
      sun: { color: '#fffbe6', glow: 'rgba(255,230,150,0.45)', size: 1.05 },
      cloud: { color: '#ffffff', shadow: '#a8bedc', opacity: 0.95 },
      accent: '#f6e6b0',
      ambient: 0.93,
    },
    twilight: { ...TWILIGHT, sky: { top: '#33406e', mid: '#8f7898', bottom: '#f0c49c', low: 'rgba(230,150,120,0.7)' }, horizonGlow: 'rgba(255,190,130,0.45)', sunsetGlow: 'rgba(255,150,80,0.35)', hills: ['#746a88', '#4a5560', '#2c4238'], skyline: '#5c5478', rim: 'rgba(255,196,150,0.3)', cloud: { color: '#f0b8a8', shadow: '#705a88', opacity: 0.95 }, accent: '#f8c890', ambient: 0.9 },
    night: { ...NIGHT, sky: { top: '#0b1132', mid: '#1c2760', bottom: '#404f90', low: 'rgba(60,72,120,0)' }, hills: ['#2c3c70', '#1c2c50', '#12223a'], moon: { ...MOON, glow: 'rgba(220,225,255,0.4)', size: 1.5 }, stars: 0.3, cloud: { color: '#3a4a80', shadow: '#1c2448', opacity: 0.85 }, ambient: 0.86 },
  },
  rain: {
    // Bus-stop rain: blue-grey light, but the greens stay green.
    common: { celestialVisibility: 0.1, cloud: { cover: 0.95, opacity: 0.95, band: 0.7 }, light: { golden: 0, rim: 0.1, dawnFog: 0.3 } },
    day: {
      ...DAY,
      sky: { top: '#546f96', mid: '#8aa2bc', bottom: '#c9d2d4', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(210,222,230,0.3)',
      hills: ['#6f948c', '#4a7e58', '#2e5e3e'],
      skyline: '#6a7f92',
      rim: 'rgba(220,235,240,0.08)',
      cloud: { color: '#aab8c8', shadow: '#5e6f88' },
      particle: 'rgba(220,235,250,0.7)',
      accent: '#cfd8e0',
      ambient: 0.8,
      haze: { color: 'rgba(200,214,226,1)', amount: 0.2 }, // the rain veil
    },
    twilight: { ...TWILIGHT, sky: { top: '#2c3458', mid: '#6a5f82', bottom: '#c59e88', low: 'rgba(150,110,120,0.5)' }, horizonGlow: 'rgba(230,180,150,0.25)', sunsetGlow: 'rgba(240,160,120,0.15)', hills: ['#5c5672', '#3e4e50', '#26402f'], skyline: '#4a4666', rim: 'rgba(240,200,180,0.1)', cloud: { color: '#7c7288', shadow: '#36324a' }, particle: 'rgba(240,215,200,0.7)', accent: '#d8b8a8', ambient: 0.8, shade: '#1a1430', haze: { color: 'rgba(190,170,180,1)', amount: 0.2 } },
    night: {
      ...NIGHT,
      sky: { top: '#080d24', mid: '#182450', bottom: '#34457a', low: 'rgba(60,72,120,0)' },
      horizonGlow: 'rgba(120,140,220,0.3)',
      hills: ['#2c3a66', '#1c2a4a', '#12203a'],
      moon: { color: '#fff8dc', glow: 'rgba(190,205,255,0.55)', size: 1.45, y: 0.27 },
      celestialVisibility: 0.6,
      cloud: { color: '#2a3660', shadow: '#0c1224', cover: 0.8, opacity: 0.82, band: 0.55, moonBreak: 0.9 },
      particle: 'rgba(190,210,250,0.75)',
      particleGlow: 'rgba(140,170,240,0.14)',
      accent: '#b0c0f0',
      ambient: 0.82,
      shade: '#080c1c',
    },
  },
  snow: {
    common: { celestialVisibility: 0.35, cloud: { cover: 0.6, band: 0.25 }, light: { golden: 0.5, rim: 0.5, dawnFog: 0.5 } },
    day: {
      ...DAY,
      sky: { top: '#8fb6d8', mid: '#c8dcec', bottom: '#f4f2ec', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(255,255,255,0.45)',
      hills: ['#dfe8ee', '#c4d6e0', '#a8c0cc'], // cool lavender-white snow
      skyline: '#b8c6d6',
      rim: 'rgba(255,255,255,0.2)',
      sun: { color: '#fffbe6', glow: 'rgba(255,235,180,0.4)', size: 1.05 },
      cloud: { color: '#fbfcfd', shadow: '#c0cfe0', opacity: 0.95 },
      particle: 'rgba(255,255,255,0.95)',
      accent: '#fff4d0',
      ambient: 0.97,
    },
    twilight: { ...TWILIGHT, sky: { top: '#3e4a86', mid: '#a090b8', bottom: '#ffd0b0', low: 'rgba(230,170,170,0.6)' }, horizonGlow: 'rgba(255,210,170,0.5)', sunsetGlow: 'rgba(255,170,120,0.35)', hills: ['#d4c2d0', '#b4a8c4', '#9490ac'], skyline: '#aaa0bc', rim: 'rgba(255,214,186,0.4)', cloud: { color: '#f0d0d0', shadow: '#9088a8', opacity: 0.95 }, particle: 'rgba(255,245,238,0.95)', accent: '#ffd4b0' },
    night: { ...NIGHT, sky: { top: '#0c1438', mid: '#1e2c62', bottom: '#405494', low: 'rgba(60,72,120,0)' }, hills: ['#66789c', '#54668c', '#42527a'], moon: { ...MOON, size: 1.5 }, stars: 0.4, cloud: { color: '#3c4c86', shadow: '#1e2850', opacity: 0.8 }, particle: 'rgba(235,242,255,0.95)' },
  },
  wind: {
    day: { ...DAY, sky: { top: '#3a8ed0', mid: '#94c8ec', bottom: '#eef0e0', low: 'rgba(214,130,140,0)' }, hills: ['#88b8a6', '#5aa050', '#2e7c3a'], particle: 'rgba(255,255,255,0.35)' },
    twilight: { ...TWILIGHT, sunsetGlow: 'rgba(255,150,70,0.6)' },
    night: { ...NIGHT, stars: 0.6, particle: 'rgba(200,210,240,0.2)' },
  },
  fog: {
    day: { ...DAY, sky: { top: '#9fb4c4', mid: '#c6d2d8', bottom: '#e6e8e2', low: 'rgba(214,130,140,0)' }, hills: ['#a8c0b8', '#84a690', '#5c8a6a'], skyline: '#a4b2bc', haze: { color: 'rgba(228,234,232,1)', amount: 0.75 }, accent: '#f0e8c8' },
    twilight: { ...TWILIGHT, hills: ['#a89aa8', '#8a8a90', '#66807a'], haze: { color: 'rgba(222,196,186,1)', amount: 0.75 } },
    night: { ...NIGHT, haze: { color: 'rgba(66,76,120,1)', amount: 0.75, skylineClear: 0.85 }, moon: { ...MOON, glow: 'rgba(220,225,255,0.4)', size: 1.5 } },
  },
};

const TAU = Math.PI * 2;
const TEX_RES_MAX = 1.5; // texture resolution cap (x CSS px)
// Lower-sky warm wash: sky.bottom laid over the gradient from this height down to the horizon.
const WASH_TOP = 0.45; // fraction of h
const WASH_ALPHA = 0.25;
// Sun bloom: a soft warm radial light ('screen') that swells at golden hour; the moon gets a blue-violet one.
const BLOOM_R = 0.5; // x max(w, h)
const BLOOM_ALPHA = 0.22;
const BLOOM_GOLDEN = 0.13; // added at env.light.g = 1
const BLOOM_GOLDEN_GROW = 0.2; // radius growth at g = 1
const BLOOM_WARM = [255, 225, 170, 1];
const MOON_BLOOM_ALPHA = 0.25;
const MOON_BLOOM_R = 0.32;
const BLOOM_COOL = [170, 180, 255, 1];
const BLOOM_SPRITE = 256; // sprite resolution: it is a smooth gradient, so it scales cleanly
// Foliage tooth: clustered round gouache dabs over the mid and near hills. The far ridge's lowest top is
// ~0.73 h, so a texture fading in from FOLIAGE_TOP never touches the sky whatever the hills do.
const FOLIAGE_TOP = 0.76; // fraction of h where the texture starts fading in
const FOLIAGE_FULL = 0.88; // ... and is at full strength
const FOLIAGE_ALPHA = 0.36; // at weight 1, daytime ('overlay')
const FOLIAGE_NIGHT = 0.4; // share kept at night (alpha x (FOLIAGE_NIGHT + (1 - FOLIAGE_NIGHT) x dayMix))
const CLUSTER_DENSITY = 1 / 7000; // clusters per CSS px^2 of the textured band
const LOOSE_DENSITY = 1 / 900; // single loose dabs per CSS px^2
const DAB_LIGHT = [236, 246, 220, 1];
const DAB_DARK = [26, 58, 38, 1];
// Four-point sparkle stars [x (fraction of w), y (fraction of h), arm scale]: fixed, off the moon.
const SPARKLES = [[0.09, 0.09, 1], [0.44, 0.14, 1.2], [0.62, 0.06, 0.9], [0.82, 0.18, 1.1], [0.18, 0.34, 0.8], [0.93, 0.35, 0.9]];
const SPARKLE_ARM = 4; // px at scale 1
const SPARKLE_ALPHA = 0.8;
const SPARKLE_COLOR = [255, 250, 230, 1];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** Dab / sparkle size scale for this viewport (sized for a ~900 px frame). */
const dabScale = (w, h) => clamp(Math.min(w, h) / 900, 0.6, 1.4);

function makeCanvas(w, h, res) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * res));
  canvas.height = Math.max(1, Math.round(h * res));
  const c = canvas.getContext('2d');
  c.scale(res, res);
  return { canvas, c };
}

/** Soft radial bloom sprite in `tint`: opaque centre fading to nothing at the edge. */
function buildBloom(tint) {
  const { canvas, c } = makeCanvas(BLOOM_SPRITE, BLOOM_SPRITE, 1);
  const r = BLOOM_SPRITE / 2;
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(tint, 1));
  g.addColorStop(0.25, rgba(tint, 0.55));
  g.addColorStop(0.6, rgba(tint, 0.14));
  g.addColorStop(1, rgba(tint, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, BLOOM_SPRITE, BLOOM_SPRITE);
  return canvas;
}

function dot(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/**
 * Foliage tooth: clumps of round dabs, lit from above-right (the sun side) with darker dabs below, plus
 * loose single dabs, masked to fade in from FOLIAGE_TOP so it only ever sits on the hills.
 */
function buildFoliage(w, h, res) {
  const s = dabScale(w, h);
  const { canvas, c } = makeCanvas(w, h, res);
  const top = FOLIAGE_TOP * h;
  const band = h - top;
  const light = rgba(DAB_LIGHT, 0.55);
  const dark = rgba(DAB_DARK, 0.5);
  const clusters = Math.round(w * band * CLUSTER_DENSITY);
  for (let i = 0; i < clusters; i++) {
    const cx = Math.random() * w;
    const cy = top + Math.random() * band;
    const cr = (24 + Math.random() * 32) * s;
    const n = 16 + (Math.random() * 22) | 0;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * cr;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d * 0.7; // clumps are wider than tall
      // Lit side: above and to the right of the clump centre (the sun sits at x = 0.72 w).
      const lit = (x - cx) * 0.6 - (y - cy) > cr * 0.05;
      c.fillStyle = lit ? light : dark;
      dot(c, x, y, (5 + Math.random() * 8) * s);
    }
  }
  const loose = Math.round(w * band * LOOSE_DENSITY);
  for (let i = 0; i < loose; i++) {
    c.fillStyle = Math.random() < 0.5 ? light : dark;
    dot(c, Math.random() * w, top + Math.random() * band, (4 + Math.random() * 6) * s);
  }
  // Fade the texture in from the top of the band so the far ridge and the horizon stay clean.
  const mask = c.createLinearGradient(0, top, 0, FOLIAGE_FULL * h);
  mask.addColorStop(0, 'rgba(0,0,0,0)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = mask;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  return canvas;
}

function createInstance() {
  let foliage = null;
  let bloomSun = null;
  let bloomMoon = null;
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
    foliage = buildFoliage(w, h, res);
    if (!bloomSun) bloomSun = buildBloom(BLOOM_WARM);
    if (!bloomMoon) bloomMoon = buildBloom(BLOOM_COOL);
  }

  return {
    init(env) { build(env); },
    resize(env) { build(env); },
    destroy() { foliage = bloomSun = bloomMoon = null; builtW = builtH = 0; },

    /** Airbrushed lower sky: the horizon colour washed up over the gradient, under the stars and glows. */
    drawSkyBase(ctx, env, weight) {
      const { width: w, height: h, theme } = env;
      const y0 = WASH_TOP * h;
      const g = ctx.createLinearGradient(0, y0, 0, env.horizonY);
      g.addColorStop(0, rgba(theme.sky.bottom, 0));
      g.addColorStop(1, rgba(theme.sky.bottom, WASH_ALPHA * weight));
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, w, env.horizonY - y0);
    },

    /** Warm bloom round the sun (bigger and warmer at golden hour), a cool one round the moon, sparkles at night. */
    drawSkyTop(ctx, env, weight) {
      const { width: w, height: h, theme, time, sun, moon } = env;
      const g = env.light?.g ?? 0;
      ctx.globalCompositeOperation = 'screen';
      if (sun.alpha > 0.01 && bloomSun) {
        const R = Math.max(w, h) * BLOOM_R * (1 + BLOOM_GOLDEN_GROW * g);
        ctx.globalAlpha = (BLOOM_ALPHA + BLOOM_GOLDEN * g) * sun.alpha * weight;
        ctx.drawImage(bloomSun, sun.x - R, sun.y - R, R * 2, R * 2);
      }
      if (moon.alpha > 0.01 && bloomMoon) {
        const R = Math.max(w, h) * MOON_BLOOM_R;
        ctx.globalAlpha = MOON_BLOOM_ALPHA * moon.alpha * weight;
        ctx.drawImage(bloomMoon, moon.x - R, moon.y - R, R * 2, R * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      const night = darknessAt(env.solarElevation) * theme.stars * weight;
      if (night > 0.01) {
        const s = dabScale(w, h);
        ctx.strokeStyle = rgba(SPARKLE_COLOR);
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.2 * s;
        for (let i = 0; i < SPARKLES.length; i++) {
          const [fx, fy, k] = SPARKLES[i];
          const twinkle = 0.6 + 0.4 * Math.sin(time * 1.3 + i * 2.1);
          const arm = SPARKLE_ARM * k * s * (0.8 + 0.2 * twinkle);
          const x = fx * w;
          const y = fy * h;
          ctx.globalAlpha = night * SPARKLE_ALPHA * twinkle;
          ctx.beginPath();
          ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
          ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },

    /** Foliage tooth over the mid and near hills: brushy leaf clumps by day, kept subtle at night. */
    drawLand(ctx, env, weight) {
      if (!foliage) return;
      const { width: w, height: h } = env;
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = FOLIAGE_ALPHA * weight * (FOLIAGE_NIGHT + (1 - FOLIAGE_NIGHT) * env.dayMix);
      ctx.drawImage(foliage, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
}

export function createGhibli() {
  return {
    id: 'ghibli',
    label: 'Ghibli',
    hint: 'Soft painterly skies, lush warm hills',
    swatch: 'linear-gradient(#3a8fd6, #ffffff 55%, #5aa456 56%)',
    themes: THEMES,
    params: {
      rim: 1.6,
      golden: 1.6,
      horizonGlow: 1.3,
      sunsetGlow: 1.2,
      celestial: { glow: 1.3, size: 1.1 },
      cloud: { scale: 1.45, flat: 0, highlight: 0.8 },
      rain: { len: 1.2, width: 1.2 },
      snow: { size: 1.3 },
      // Gentle: unhurried drifting clouds that breathe softly, a slow easy sway.
      motion: { cloudSpeed: 0.7, cloudBob: 0.35, bobRate: 0.25, cloudBoil: 0.025, boilRate: 0.5, sway: 1.1, swayRate: 0.75, ripple: 0.9 },
    },
    create: createInstance,
  };
}
