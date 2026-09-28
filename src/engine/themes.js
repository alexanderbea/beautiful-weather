import { isColorString, parseColor } from './color.js';

/**
 * Data-driven palettes. Each condition has optional `common`, `day`, `twilight` and `night` partials,
 * deep-merged over BASE_THEME. Colors accept hex or rgba() strings. Designers can swap
 * variants at runtime via engine.setThemes({ rain: { day: { sky: { top: '#123' } } } }).
 *
 * Keys:
 *   sky.{top,mid,bottom}   background gradient stops (bottom sits at the horizon)
 *   sky.low                extra stop at 85% of the sky; its alpha is how strongly it replaces the
 *                          plain mid->bottom blend there (0 = off, so day gradients stay identical)
 *   horizonGlow            soft band of light along the horizon
 *   sunsetGlow             elliptical glow centred on the sun's x at the horizon; alpha = strength (0 = off)
 *   rim                    thin highlight catching the top edge of each hill layer; alpha = strength (0 = off)
 *   hills[3]               far, mid, near landscape layers
 *   skyline                town/landmark silhouette between hills[0] and hills[1]; aerial perspective,
 *                          so a touch hazier/bluer than the hills it sits between (near-black at night)
 *   skylineRim             thin 1.5px light on the skyline's top edge in the sky's warmest hue; alpha = strength (0 = off)
 *   skyBaseStep            0-1 luminance drop of the sky strip where the skyline stands (0 = off)
 *   sun / moon             disc color, glow color, relative size; moon.y = height as a fraction of the viewport
 *   celestialVisibility    0-1, how much the sun/moon shows through the weather
 *   stars                  0-1 star field opacity (the sky layer also fades stars in with darkness)
 *   aurora                 0-1 aurora band strength; only the clear-night palette sets it (skyLayer.js
 *                          also requires astronomical darkness and condition === 'clear')
 *   cloud                  color, shadow, cover (0-1 sky coverage), opacity, band (overcast strip),
 *                          moonBreak (0-1, thins the cloud over the moon so it shines through; 0 = off)
 *   particle               rain/snow color
 *   particleGlow           soft halo behind near rain streaks (transparent = off; used at night)
 *   accent                 highlight color (sun rays, motes)
 *   ambient                0-1 scene light; lower darkens the landscape via `shade`
 *   haze                   fog color + amount; skylineClear (0-1) holds the fog off the skyline band
 *                          so it starts above the rooftops (0 = off)
 *   light                  per-condition multipliers (0-1) for the atmospheric lighting pass (lighting.js):
 *                          golden = golden-hour glow, rim = day/golden-hour share of the hill rim light,
 *                          dawnFog = sunrise mist on the water. Set in `common`, so they cross-fade with the
 *                          condition. None of them apply at e <= -6 or change the night / e = 0 twilight rims.
 */
export const BASE_THEME = {
  // sky.low / sunsetGlow / rim are day-neutral (alpha 0). Their RGB is a warm rose/amber on purpose:
  // when fading in toward twilight only the alpha ramps, so the hue never drifts through grey.
  sky: { top: '#3d7fd9', mid: '#83b7ea', bottom: '#e2f1ff', low: 'rgba(214,130,140,0)' },
  horizonGlow: 'rgba(255,244,214,0.45)',
  sunsetGlow: 'rgba(255,150,90,0)',
  hills: ['#9cc3b4', '#6aa384', '#3f7a58'],
  skyline: '#86a4b0',
  skylineRim: 'rgba(214,228,255,0)',
  skyBaseStep: 0,
  // Day rim: a faint warm-white edge (the lighting pass scales it by light.rim and boosts it at golden hour).
  rim: 'rgba(255,236,204,0.10)',
  sun: { color: '#fff7dc', glow: 'rgba(255,214,120,0.55)', size: 1 },
  moon: { color: '#eef1ff', glow: 'rgba(190,210,255,0.30)', size: 1, y: 0.17 },
  celestialVisibility: 1,
  stars: 0,
  aurora: 0,
  cloud: { color: '#ffffff', shadow: '#cfdbea', cover: 0.15, opacity: 0.9, band: 0, moonBreak: 0 },
  particle: 'rgba(255,255,255,0.9)',
  particleGlow: 'rgba(0,0,0,0)',
  accent: '#ffd98a',
  ambient: 1,
  shade: '#0a1428',
  haze: { color: 'rgba(230,236,242,1)', amount: 0, skylineClear: 0 },
  light: { golden: 1, rim: 1, dawnFog: 1 },
};

// Night diorama: painterly indigo (violet-leaning blue, not flat navy), hills in cool shadow that
// get lighter with distance (aerial perspective), each edge caught by soft moonlight.
const NIGHT_BASE = {
  sky: { top: '#080c26', mid: '#1a2154', bottom: '#3a4580' },
  horizonGlow: 'rgba(130,140,220,0.20)',
  hills: ['#283160', '#1b2346', '#10162e'],
  // Near-black silhouette with a cool moonlit rim and a darker sky strip at its base, so the town
  // reads as its own layer in every low-light sky (rain/snow/fog nights inherit these).
  skyline: '#070a14',
  skylineRim: 'rgba(214,228,255,0.8)',
  skyBaseStep: 0.12,
  rim: 'rgba(170,190,255,0.34)',
  stars: 1,
  cloud: { color: '#3a4668', shadow: '#1d2640', opacity: 0.8 },
  ambient: 0.85,
};

// Twilight (sun at the horizon, e = 0): indigo zenith -> violet -> rose -> warm peach at the horizon.
// Hues were picked so RGB mixes stay saturated: twilight<->night passes through mauve/violet,
// twilight<->day through periwinkle and pale pink. The vivid orange lives in alpha-driven layers
// (sunsetGlow, horizonGlow, sun.glow), which fade without changing hue, so no muddy midpoints.
const TWILIGHT_BASE = {
  sky: { top: '#1c2458', mid: '#6a5b9a', bottom: '#f2b08a', low: 'rgba(226,138,132,0.85)' },
  horizonGlow: 'rgba(255,176,110,0.62)',
  sunsetGlow: 'rgba(255,140,72,0.58)',
  // Backlit silhouettes: dusty violet far ridge, deepening toward the foreground.
  hills: ['#6b5a82', '#3e3a64', '#221f3c'],
  skyline: '#4e4672',
  skylineRim: 'rgba(255,184,120,0)', // amber, off at twilight itself: only the dusk<->night blend shows it
  rim: 'rgba(255,184,120,0.55)', // warm, strongest on the sun side
  sun: { color: '#ffe0b0', glow: 'rgba(255,128,56,0.72)', size: 1.3 },
  stars: 0,
  cloud: { color: '#f0b0a0', shadow: '#6a5586', opacity: 0.9 },
  accent: '#ffb27a',
  ambient: 0.92,
  shade: '#24123a', // violet shadow instead of navy
};
const twilight = (partial) => deepMerge(TWILIGHT_BASE, partial);

// Colour keys the rain palettes are damped on (RGB only; alpha kept). Everything else (skyline,
// skylineRim, skyBaseStep, haze, particle, particleGlow, sun, moon, celestialVisibility, ambient,
// shade) is left alone.
const DAMP_PATHS = [
  ['sky', 'top'], ['sky', 'mid'], ['sky', 'bottom'], ['sky', 'low'], ['horizonGlow'], ['sunsetGlow'],
  ['hills', 0], ['hills', 1], ['hills', 2], ['cloud', 'color'], ['cloud', 'shadow'], ['accent'],
];

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h, s, l) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * Rain darkening, baked into a palette: multiplies HSL saturation and lightness of the DAMP_PATHS
 * colours. Colours the partial inherits from `base` are looked up there and damped too. The result
 * is the partial plus the damped keys (with full = true: merged over base, like twilight()).
 */
function damp(base, partial, { sat, light }, { full = false } = {}) {
  const src = deepMerge(base, partial);
  const out = full ? src : deepMerge({}, partial);
  for (const path of DAMP_PATHS) {
    let from = src;
    let to = out;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      from = from?.[k];
      if (to[k] === undefined) to[k] = Array.isArray(from) ? [...from] : {};
      else if (Array.isArray(to[k])) to[k] = [...to[k]];
      to = to[k];
    }
    const key = path[path.length - 1];
    if (!from || !isColorString(from[key])) continue;
    const c = parseColor(from[key]);
    const [h, s, l] = toHsl(c);
    const [r, g, b] = fromHsl(h, Math.min(1, s * sat), Math.min(1, l * light));
    to[key] = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+c[3].toFixed(3)})`;
  }
  return out;
}

export const THEMES = {
  clear: {
    common: { cloud: { cover: 0.12 } },
    day: {},
    twilight: TWILIGHT_BASE,
    night: { ...NIGHT_BASE, aurora: 1 }, // the only palette with an aurora
  },
  clouds: {
    common: { celestialVisibility: 0.35, cloud: { cover: 0.75, band: 0.35 }, light: { golden: 0.3, rim: 0.35, dawnFog: 0.7 } },
    day: {
      sky: { top: '#7f93ab', mid: '#a9b6c6', bottom: '#d6dde5' },
      horizonGlow: 'rgba(235,238,242,0.3)',
      hills: ['#9aa9a8', '#728a82', '#4f675d'],
      skyline: '#8595a0',
      cloud: { color: '#eef1f5', shadow: '#a4afbd' },
      accent: '#dfe5ec',
      ambient: 0.85,
    },
    // Overcast dusk: the glow is only a warm blush under a lilac-grey deck, low contrast.
    twilight: twilight({
      sky: { top: '#3e4468', mid: '#7d7690', bottom: '#cfa898', low: 'rgba(180,140,142,0.55)' },
      horizonGlow: 'rgba(240,184,146,0.34)',
      sunsetGlow: 'rgba(240,160,120,0.22)',
      hills: ['#77738a', '#555a70', '#383d52'],
      skyline: '#62647c',
      rim: 'rgba(255,196,160,0.18)',
      cloud: { color: '#bba8b0', shadow: '#5f5b74' },
      accent: '#e8c4aa',
      ambient: 0.84,
    }),
    night: { ...NIGHT_BASE, stars: 0.25, cloud: { color: '#2f3854', shadow: '#161c2e', opacity: 0.9 } },
  },
  rain: {
    common: {
      celestialVisibility: 0.08,
      cloud: { cover: 0.95, opacity: 0.95, band: 0.75 },
      light: { golden: 0, rim: 0, dawnFog: 0.3 },
    },
    // Damped: saturation x0.80, lightness x0.90 (see damp()).
    day: damp(BASE_THEME, {
      sky: { top: '#3f4b5c', mid: '#5f6e80', bottom: '#8d9aa8' },
      horizonGlow: 'rgba(170,185,200,0.2)',
      hills: ['#5c6f72', '#44585a', '#2f4142'],
      skyline: '#4f5f6a',
      cloud: { color: '#6f7b8a', shadow: '#3a4452' },
      particle: 'rgba(200,215,235,0.75)',
      ambient: 0.7,
    }, { sat: 0.8, light: 0.9 }),
    // Rainy dusk: no sunset behind the rain, just a faint warm grey where the sun would be.
    // Damped: saturation x0.85, lightness x0.92.
    twilight: damp(TWILIGHT_BASE, {
      sky: { top: '#262b3e', mid: '#464b60', bottom: '#7e7680', low: 'rgba(112,98,114,0.4)' },
      horizonGlow: 'rgba(214,166,146,0.2)',
      sunsetGlow: 'rgba(220,150,120,0.12)',
      hills: ['#4d5464', '#363d4b', '#232834'],
      skyline: '#404758',
      rim: 'rgba(230,184,164,0.1)',
      cloud: { color: '#5a5e70', shadow: '#2a2e3c' },
      particle: 'rgba(204,208,228,0.72)',
      accent: '#c9b2aa',
      ambient: 0.74,
      shade: '#141424',
    }, { sat: 0.85, light: 0.92 }, { full: true }),
    // Rainy night (also reachable as the 'night-rain' condition): deep blue to near-black sky,
    // a veiled moon glowing through the overcast, distinct cool-blue hill layers and lighter,
    // softly glowing streaks. The moon sits lower (clear of the readout) and shines through a cloud
    // break (cloud.moonBreak) so it reads against the sky. Ambient/shade tuned so clear night -> rainy night has no brightness pop.
    night: {
      ...NIGHT_BASE,
      sky: { top: '#060a18', mid: '#141d36', bottom: '#2e3a5c' },
      horizonGlow: 'rgba(118,136,186,0.32)',
      hills: ['#2a3450', '#1a2238', '#0c111d'],
      moon: { color: '#dfe6fa', glow: 'rgba(170,190,240,0.55)', size: 1.1, y: 0.27 },
      celestialVisibility: 0.6,
      stars: 0.12,
      cloud: { color: '#2c3654', shadow: '#0c111e', cover: 0.8, opacity: 0.82, band: 0.55, moonBreak: 0.8 },
      particle: 'rgba(186,206,245,0.75)',
      particleGlow: 'rgba(130,160,230,0.12)',
      accent: '#a9bde8',
      ambient: 0.8,
      shade: '#060a16',
    },
  },
  snow: {
    common: { celestialVisibility: 0.3, cloud: { cover: 0.6, band: 0.3 }, light: { golden: 0.35, rim: 0.5, dawnFog: 0.5 } },
    day: {
      sky: { top: '#9fb3c8', mid: '#c9d6e3', bottom: '#eef3f8' },
      horizonGlow: 'rgba(255,255,255,0.4)',
      hills: ['#dfe7ee', '#c8d4de', '#b2c0cd'],
      skyline: '#bfcbd9',
      cloud: { color: '#f4f7fa', shadow: '#bcc8d6' },
      particle: 'rgba(255,255,255,0.95)',
      ambient: 0.95,
    },
    // Snowy dusk: peach light on lavender snow under a soft overcast.
    twilight: twilight({
      sky: { top: '#4a5480', mid: '#9a93b4', bottom: '#eac6b4', low: 'rgba(216,170,176,0.55)' },
      horizonGlow: 'rgba(255,208,178,0.4)',
      sunsetGlow: 'rgba(255,176,140,0.28)',
      hills: ['#c9bac9', '#a9a0ba', '#8b87a4'],
      skyline: '#b2a8c2',
      rim: 'rgba(255,212,186,0.3)',
      cloud: { color: '#e2cfd4', shadow: '#918aa8' },
      particle: 'rgba(255,242,236,0.95)',
      accent: '#ffd2b4',
      ambient: 0.92,
    }),
    night: {
      ...NIGHT_BASE,
      sky: { top: '#0b1428', mid: '#1d2c4c', bottom: '#3a4c70' },
      hills: ['#5a6a88', '#4a5a78', '#3b4a66'],
      stars: 0.3,
      particle: 'rgba(225,235,255,0.9)',
    },
  },
  // Basic v1 palettes for the remaining conditions.
  wind: {
    common: { cloud: { cover: 0.55, band: 0.15 }, light: { golden: 1, rim: 1, dawnFog: 0.35 } },
    day: {
      sky: { top: '#5a86b8', mid: '#98b6d4', bottom: '#dbe6ef' },
      hills: ['#a1b9a6', '#76987c', '#51725a'],
      skyline: '#8aa3a8',
      particle: 'rgba(255,255,255,0.35)',
    },
    // Windy dusk: the clear sunset, slightly cooler, with streaks catching the warm light.
    twilight: twilight({ sunsetGlow: 'rgba(255,140,72,0.5)', particle: 'rgba(255,214,190,0.3)' }),
    night: { ...NIGHT_BASE, stars: 0.6, particle: 'rgba(200,210,240,0.2)' },
  },
  fog: {
    common: { celestialVisibility: 0.15, cloud: { cover: 0.35, opacity: 0.6, band: 0.2 }, light: { golden: 0.2, rim: 0.2, dawnFog: 0 } },
    day: {
      sky: { top: '#a7afb6', mid: '#c4c9ce', bottom: '#dfe2e4' },
      hills: ['#b9bfbf', '#9ba5a2', '#7c8a85'],
      skyline: '#adb4b8',
      cloud: { color: '#e8eaec', shadow: '#c2c7cc' },
      ambient: 0.9,
      haze: { color: 'rgba(226,230,233,1)', amount: 0.8 },
    },
    // Foggy dusk: a diffuse rose-beige veil, the sun only a smudge.
    twilight: twilight({
      sky: { top: '#6b6a84', mid: '#aa9ea8', bottom: '#dcc0b0', low: 'rgba(202,170,168,0.5)' },
      horizonGlow: 'rgba(255,202,164,0.3)',
      sunsetGlow: 'rgba(255,180,140,0.2)',
      hills: ['#aa9fa8', '#8f8896', '#737181'],
      skyline: '#9c93a2',
      rim: 'rgba(255,204,172,0.12)',
      cloud: { color: '#d6c6c6', shadow: '#a2969e' },
      accent: '#f0cdb4',
      ambient: 0.9,
      haze: { color: 'rgba(214,190,184,1)', amount: 0.8 },
    }),
    night: {
      ...NIGHT_BASE,
      stars: 0.05,
      haze: { color: 'rgba(70,82,110,1)', amount: 0.8, skylineClear: 0.85 },
    },
  },
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(target, ...sources) {
  const out = { ...target };
  for (const src of sources) {
    if (!src) continue;
    for (const k in src) {
      out[k] = isPlainObject(src[k]) && isPlainObject(out[k]) ? deepMerge(out[k], src[k]) : src[k];
    }
  }
  return out;
}

function compile(value) {
  if (isColorString(value)) return parseColor(value);
  if (Array.isArray(value)) return value.map(compile);
  if (isPlainObject(value)) {
    const out = {};
    for (const k in value) out[k] = compile(value[k]);
    return out;
  }
  return value;
}

/**
 * Returns a compiled (numeric, interpolatable) theme for a condition + phase.
 * phase: 'day' | 'twilight' | 'night', or a boolean (true = 'day', false = 'night').
 */
export function resolveTheme(themes, condition, phase = 'day') {
  const p = phase === true ? 'day' : phase === false ? 'night' : phase;
  const def = themes[condition] ?? themes.clear;
  const variant = p === 'twilight' ? def.twilight ?? TWILIGHT_BASE : p === 'night' ? def.night : def.day;
  return compile(deepMerge(BASE_THEME, def.common, variant));
}
