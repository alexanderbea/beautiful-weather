import { rgba } from '../color.js';

/**
 * Ukiyo-e (Japanese woodblock print) art style.
 *
 * Treatment: flat, stepped "bokashi" sky bands, a dark indigo bokashi at the top of the sheet, ink
 * keylines along every ridge, roof and cloud, no rim light or glows, a flat vermilion sun and a flat
 * pale moon with an outline, long straight Hiroshige rain lines, flat outlined "yokogumo" cloud bars
 * near the horizon, and washi paper grain over everything. Palette: Prussian blue / indigo, cream
 * paper, muted pine and moss greens, ochre and vermilion accents.
 *
 * Per frame: two gradient fills, one pattern fill and a few flat bars; the grain tile is built once.
 */

// Palette (THEMES-shaped partial; keys not listed inherit the base palette of that condition/phase).
// Prussian-blue far ridge, moss mid hill, indigo near hill; vermilion sun with no halo; cream sky foot.
const INK = [28, 36, 64, 1];
const FLAT_SUN = { color: '#d2452b', glow: 'rgba(210,69,43,0)', size: 1.15 };
const FLAT_MOON = { color: '#f2ecd6', glow: 'rgba(240,230,200,0)', size: 1.35, y: 0.17 };
const NO_RIM = 'rgba(28,38,66,0)';
const NIGHT = {
  sky: { top: '#101a36', mid: '#1b2a52', bottom: '#2c3d6a', low: 'rgba(60,72,120,0)' },
  horizonGlow: 'rgba(160,170,220,0.15)',
  hills: ['#26345a', '#1a2544', '#0f1730'],
  skyline: '#0a0e1c',
  skylineRim: 'rgba(200,210,235,0.5)',
  skyBaseStep: 0.08,
  rim: 'rgba(150,170,220,0.2)',
  moon: { ...FLAT_MOON, glow: 'rgba(240,230,200,0.18)' },
  stars: 0.7,
  aurora: 0,
  cloud: { color: '#3c4a7a', shadow: '#1c2542', opacity: 1 },
  particle: 'rgba(200,210,235,0.7)',
  particleGlow: 'rgba(0,0,0,0)',
  accent: '#d9c9a0',
  ambient: 0.97, // keep the flat moon and the keylines crisp
  shade: '#0c1224',
};
const TWILIGHT = {
  sky: { top: '#1e2a4e', mid: '#5c5a80', bottom: '#f0c48a', low: 'rgba(214,96,64,0.85)' },
  horizonGlow: 'rgba(240,170,90,0.55)',
  sunsetGlow: 'rgba(214,80,40,0.5)',
  hills: ['#4a5478', '#2e3a5c', '#1a2540'],
  skyline: '#3c4468',
  rim: 'rgba(214,120,80,0.2)',
  sun: { color: '#d0402b', glow: 'rgba(208,64,43,0.25)', size: 1.4 },
  moon: FLAT_MOON,
  cloud: { color: '#e6b89a', shadow: '#7a6480', opacity: 1 },
  particleGlow: 'rgba(0,0,0,0)',
  accent: '#e0a060',
  ambient: 0.94,
  shade: '#1a1a34',
};
const DAY = {
  sky: { low: 'rgba(214,130,140,0)' },
  sunsetGlow: 'rgba(255,150,90,0)',
  rim: NO_RIM,
  sun: FLAT_SUN,
  moon: FLAT_MOON,
  particleGlow: 'rgba(0,0,0,0)',
  ambient: 1,
  shade: '#1a2540',
};
const THEMES = {
  clear: {
    common: { aurora: 0, light: { golden: 0.35, rim: 0, dawnFog: 0.6 } },
    day: {
      ...DAY,
      sky: { top: '#2b5a8a', mid: '#9dbdd2', bottom: '#f0e6cc', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(240,228,196,0.35)',
      hills: ['#7b9bb5', '#7c9a6b', '#2c4763'],
      skyline: '#5a7a95',
      cloud: { color: '#f4ecd8', shadow: '#b8bfb9', opacity: 1 },
      accent: '#d9b25a',
    },
    twilight: TWILIGHT,
    night: NIGHT,
  },
  clouds: {
    common: { aurora: 0, light: { golden: 0.2, rim: 0, dawnFog: 0.5 } },
    day: {
      ...DAY,
      sky: { top: '#5f7a94', mid: '#9fb2c0', bottom: '#e8dfc8', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(236,228,206,0.3)',
      hills: ['#7f93a6', '#748c6e', '#33495e'],
      skyline: '#6d8496',
      cloud: { color: '#ece4cf', shadow: '#a9b1b8', opacity: 1 },
      accent: '#cdb37a',
    },
    twilight: {
      ...TWILIGHT,
      sky: { top: '#2e3656', mid: '#6b6280', bottom: '#dcb28a', low: 'rgba(190,110,90,0.6)' },
      sunsetGlow: 'rgba(214,80,40,0.2)',
      hills: ['#5a5c78', '#3b4160', '#232a44'],
      skyline: '#474a68',
      sun: { color: '#c8412c', glow: 'rgba(200,65,44,0.15)', size: 1.4 },
      cloud: { color: '#d4b0a0', shadow: '#6a5a74', opacity: 1 },
    },
    night: {
      ...NIGHT,
      sky: { top: '#0e1630', mid: '#18254a', bottom: '#28375e', low: 'rgba(60,72,120,0)' },
      hills: ['#22305a', '#182240', '#0d142a'],
      stars: 0.2,
      cloud: { color: '#2c3858', shadow: '#161e36', opacity: 1 },
    },
  },
  rain: {
    common: { aurora: 0, cloud: { band: 0.9 } },
    // Sudden-shower sky: a near-black sumi band at the top wiped down to grey and cream.
    day: {
      ...DAY,
      sky: { top: '#2e3a4a', mid: '#8a96a4', bottom: '#d9d4c4', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(224,218,200,0.2)',
      hills: ['#5e7690', '#5e7562', '#27394e'],
      skyline: '#54697c',
      cloud: { color: '#b7bcc0', shadow: '#2a3340', opacity: 1 },
      particle: 'rgba(40,52,78,0.65)', // ruled ink lines on the light sheet
      accent: '#b8a878',
      ambient: 0.9,
    },
    twilight: {
      ...TWILIGHT,
      sky: { top: '#26304a', mid: '#5e5c74', bottom: '#c9a27e', low: 'rgba(150,100,90,0.5)' },
      sunsetGlow: 'rgba(214,80,40,0.1)',
      hills: ['#4a5068', '#333a50', '#202638'],
      skyline: '#3e4358',
      cloud: { color: '#8c8090', shadow: '#2c2c3e', opacity: 1 },
      particle: 'rgba(40,44,70,0.65)',
      accent: '#c09a70',
      shade: '#161628',
    },
    night: {
      ...NIGHT,
      sky: { top: '#0b1020', mid: '#18223e', bottom: '#2a3556', low: 'rgba(60,72,120,0)' },
      hills: ['#22304e', '#161f36', '#0b101c'],
      moon: { ...FLAT_MOON, glow: 'rgba(240,230,200,0.12)', size: 1.3, y: 0.27 },
      celestialVisibility: 0.6,
      stars: 0.1,
      cloud: { color: '#28324c', shadow: '#0e1320', cover: 0.8, opacity: 1, band: 0.55, moonBreak: 0.4 },
      particle: 'rgba(170,185,220,0.7)',
      accent: '#9aa8c8',
      ambient: 0.86,
      shade: '#080c18',
    },
  },
  snow: {
    common: { aurora: 0, light: { golden: 0.3, rim: 0, dawnFog: 0.4 } },
    // Dark indigo-grey top wiped to white; the hills are bare paper.
    day: {
      ...DAY,
      sky: { top: '#4a5670', mid: '#9aa5b2', bottom: '#eee9dc', low: 'rgba(214,130,140,0)' },
      horizonGlow: 'rgba(255,252,240,0.35)',
      hills: ['#f1ece0', '#e2ddd0', '#cfd0c8'],
      skyline: '#b9bcc0',
      cloud: { color: '#f6f2e8', shadow: '#c2c2b8', opacity: 1 },
      particle: 'rgba(255,252,240,0.95)',
      accent: '#d8c8a0',
    },
    twilight: {
      ...TWILIGHT,
      sky: { top: '#3a4262', mid: '#8a7f98', bottom: '#e8c39c', low: 'rgba(210,150,130,0.55)' },
      sunsetGlow: 'rgba(214,80,40,0.28)',
      hills: ['#e0d3c8', '#cfc3bf', '#b3adb2'],
      skyline: '#a8a2b0',
      sun: { color: '#d0402b', glow: 'rgba(208,64,43,0.2)', size: 1.4 },
      cloud: { color: '#e2cbc4', shadow: '#8c8298', opacity: 1 },
      particle: 'rgba(255,244,236,0.95)',
    },
    night: {
      ...NIGHT,
      sky: { top: '#0e1730', mid: '#1c2a4e', bottom: '#34446c', low: 'rgba(60,72,120,0)' },
      hills: ['#7d8aa6', '#66738f', '#4d5975'],
      stars: 0.3,
      particle: 'rgba(245,242,232,0.95)',
    },
  },
  wind: {
    common: { aurora: 0, light: { golden: 0.35, rim: 0, dawnFog: 0.3 } },
    day: {
      ...DAY,
      sky: { top: '#2f5f8f', mid: '#9dbdd2', bottom: '#eee4ca', low: 'rgba(214,130,140,0)' },
      hills: ['#7b9bb5', '#7c9a6b', '#2c4763'],
      skyline: '#5a7a95',
      cloud: { color: '#f4ecd8', shadow: '#b8bfb9', opacity: 1 },
      particle: 'rgba(40,52,78,0.3)',
    },
    twilight: { ...TWILIGHT, sunsetGlow: 'rgba(214,80,40,0.45)', particle: 'rgba(60,40,50,0.28)' },
    night: { ...NIGHT, stars: 0.5, particle: 'rgba(200,205,230,0.2)' },
  },
  fog: {
    common: { aurora: 0 },
    day: {
      ...DAY,
      sky: { top: '#8f9aa4', mid: '#c3c6c0', bottom: '#ece5d2', low: 'rgba(214,130,140,0)' },
      hills: ['#b5b9b0', '#98a091', '#6d7a74'],
      skyline: '#a4aaa8',
      haze: { color: 'rgba(236,230,214,1)', amount: 0.8 },
    },
    twilight: { ...TWILIGHT, hills: ['#a89ea4', '#8a8490', '#6c6c7c'], haze: { color: 'rgba(220,196,180,1)', amount: 0.8 } },
    night: { ...NIGHT, stars: 0.05, haze: { color: 'rgba(60,72,100,1)', amount: 0.8, skylineClear: 0.85 } },
  },
};

const GRAIN_SIZE = 256;
const GRAIN_ALPHA = 0.26;
const PAPER = [244, 232, 206, 1]; // washi cream
const PAPER_LIFT = 0.08; // how much the cream lifts the darkest blacks (no ink is pure black on paper)
const TOP_BOKASHI = 0.11; // sumi-ink wipe at the top edge of the sheet (fraction of h)
const SUMI = [20, 28, 50, 1];
// Flat "yokogumo" cloud bars: [y (fraction of h), width (fraction of w), drift speed (w/s)].
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const BARS = [[0.30, 0.34, 0.0032], [0.37, 0.26, 0.0026], [0.47, 0.42, 0.0021]];

/** Speckled washi tile: transparent with fine dark grain and a few fibres, multiplied over the frame. */
function buildGrain() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GRAIN_SIZE;
  const c = canvas.getContext('2d');
  const img = c.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = Math.random();
    const a = n < 0.55 ? 0 : (n - 0.55) / 0.45; // sparse grain
    d[i] = 90; d[i + 1] = 78; d[i + 2] = 60;
    d[i + 3] = a * a * 110;
  }
  c.putImageData(img, 0, 0);
  // A few long soft fibres.
  c.strokeStyle = 'rgba(90,78,60,0.10)';
  c.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * GRAIN_SIZE;
    const x = Math.random() * GRAIN_SIZE;
    const len = 20 + Math.random() * 60;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + len * 0.5, y + (Math.random() - 0.5) * 6, x + len, y + (Math.random() - 0.5) * 3);
    c.stroke();
  }
  return canvas;
}

function createInstance() {
  let grain = null;
  let pattern = null;
  return {
    init() { grain = buildGrain(); pattern = null; },
    destroy() { grain = null; pattern = null; },

    /** Sumi-ink wipe across the top edge of the sheet: darkest under a rain deck, lighter at night. */
    drawSkyBase(ctx, env, weight) {
      const { width: w, height: h, theme } = env;
      const band = theme.cloud.band ?? 0;
      const night = 1 - env.dayMix;
      const a = (0.3 + 0.25 * smoothstep(0.5, 0.9, band)) * (1 - 0.3 * night) * weight;
      const g = ctx.createLinearGradient(0, 0, 0, h * TOP_BOKASHI);
      g.addColorStop(0, rgba(SUMI, a));
      g.addColorStop(1, rgba(SUMI, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * TOP_BOKASHI);
    },

    /** Flat outlined cloud bars low in the sky; more of them the more the weather is overcast. */
    drawSkyTop(ctx, env, weight) {
      const { width: w, height: h, theme, time } = env;
      const cover = theme.cloud.cover;
      const alpha = weight * theme.cloud.opacity * (0.55 + 0.45 * cover);
      if (alpha < 0.01) return;
      const key = env.artStyle.params.keyline;
      const t = Math.max(2, h * 0.012);
      ctx.lineJoin = 'round';
      ctx.lineWidth = key.width;
      ctx.strokeStyle = rgba(key.color, key.alpha * 0.9);
      ctx.fillStyle = rgba(theme.cloud.color);
      BARS.forEach(([fy, fw, v], i) => {
        const bw = fw * w;
        let x = ((time * v + i * 0.37) % 1.3) * w * 1.3 - bw - w * 0.15;
        const y = fy * h + Math.sin(time * 0.05 + i) * h * 0.004;
        ctx.globalAlpha = alpha * (i === 2 ? 0.8 : 1);
        for (let k = 0; k < 2; k++) {
          const x0 = x + k * w * 1.3;
          ctx.beginPath();
          ctx.roundRect(x0, y, bw, t * 2, t);
          ctx.roundRect(x0 + bw * 0.28, y - t * 1.15, bw * 0.5, t * 2, t);
          ctx.fill();
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    },

    /** Washi grain (multiply) and a cream lift, so the darkest ink still reads as pigment on paper. */
    drawPost(ctx, env, weight) {
      const { width: w, height: h } = env;
      if (!pattern) pattern = ctx.createPattern(grain, 'repeat');
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = GRAIN_ALPHA * weight;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = PAPER_LIFT * weight;
      ctx.fillStyle = rgba(PAPER);
      ctx.fillRect(0, 0, w, h);
    },
  };
}

export function createJapanese() {
  return {
    id: 'japanese',
    label: 'Japanese',
    hint: 'Ukiyo-e woodblock print: flat ink, crisp lines',
    swatch: 'linear-gradient(#2b5a8a 50%, #d2452b 50%)',
    themes: THEMES,
    params: {
      sky: { bands: 7, mix: 1, feather: 0.025 },
      keyline: { color: INK, alpha: 0.85, width: 1.3 },
      hillShade: { alpha: 0.6, depth: 0.045 },
      rim: 0,
      golden: 0.2,
      horizonGlow: 0.6,
      sunsetGlow: 0.6,
      celestial: { glow: 0, size: 1, outline: 0.9 },
      sunRays: 0,
      cloud: { scale: 1.1, squash: 0.5, flat: 1, outline: 1, highlight: 0 },
      rain: { len: 1.8, width: 0.9, glow: 0, splash: 0, round: 0 },
      snow: { size: 1.3 },
      // Crisp and steady: slow even drift, no bob or boil, stiff grass, still water.
      motion: { cloudSpeed: 0.55, cloudBob: 0, cloudBoil: 0, sway: 0.45, swayRate: 0.7, ripple: 0.5 },
    },
    create: createInstance,
  };
}
