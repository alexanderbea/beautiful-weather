import { rgba, parseColor } from './color.js';

// Ambient life (#19) and micro-motion (#23): dusk birds, falling leaves/petals, foreground grass sway and
// water glints. Owned by the scene (scene.js), which calls the draw hooks at the right depth:
//   drawBirds   after the clouds, before the far ridge (sky depth, slight parallax)
//   drawWater   right after the skyline (distant layer; the mid hill covers the band's foot)
//   drawGrass   on the foreground ridge (near layer)
//   drawLeaves  last, in front of the land (still under the engine's ambient shade)
// Sizes are px at a 1440-wide viewport, scaled by s = w / 1440. Every oscillator is a sine with a random
// phase and periods avoid integer ratios, so nothing pulses in sync. Each element can be switched off
// (engine.setAmbient / ?ambient=, see parseAmbientParams).

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const AMBIENT_KEYS = ['clouds', 'birds', 'leaves', 'grass', 'water'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const mixRgb = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, 1];
/** Stable per-index hash in [0, 1) (grass blades are addressed by world index, not stored). */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Dev flags from the URL: ?ambient=0 (all off), ?ambient=-birds,-grass (turn some off),
 * ?ambient=birds,leaves (only these on). ?season=spring|summer|autumn|winter pins the season.
 */
export function parseAmbientParams(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const flags = Object.fromEntries(AMBIENT_KEYS.map((k) => [k, true]));
  const raw = params.get('ambient');
  if (raw !== null) {
    const tokens = raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (tokens.length === 1 && (tokens[0] === '0' || tokens[0] === 'off')) {
      for (const k of AMBIENT_KEYS) flags[k] = false;
    } else if (tokens.some((t) => AMBIENT_KEYS.includes(t))) {
      // Positive list: only the named elements.
      for (const k of AMBIENT_KEYS) flags[k] = tokens.includes(k);
    }
    for (const t of tokens) if (t[0] === '-' && AMBIENT_KEYS.includes(t.slice(1))) flags[t.slice(1)] = false;
  }
  const season = params.get('season');
  return { flags, season: SEASONS.includes(season) ? season : null };
}

/** Meteorological season for a latitude (southern hemisphere flipped); northern when lat is unknown. */
export function seasonFor(lat, date = new Date()) {
  let m = date.getMonth(); // 0 = Jan
  if (Number.isFinite(lat) && lat < 0) m = (m + 6) % 12;
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}

// ---------------------------------------------------------------------------------------------------------
// Birds: 0-1 loose flocks crossing at dusk.

const BIRD_PARALLAX = 0.15; // between the clouds (0.05-0.17) and the far ridge (0.25)
const BIRD_INK = parseColor('#1a1830');
// Condition scale: nobody flies through heavy rain or snow.
const BIRD_CONDITION = { clear: 1, clouds: 1, wind: 0.6, fog: 0.4, rain: 0, snow: 0 };

function birdGate(env) {
  const e = env.solarElevation ?? 45;
  return (1 - smoothstep(5, 8, e)) * smoothstep(-6, -4, e) * (BIRD_CONDITION[env.condition] ?? 1);
}

function makeFlock(env, s) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const n = Math.random() < 0.2 ? 1 : 3 + Math.floor(Math.random() * 5);
  const far = Math.random() < 0.4;
  const size = far ? 0.7 : 1;
  const birds = [];
  for (let i = 0; i < n; i++) {
    const rank = Math.ceil(i / 2);
    const side = i === 0 ? 0 : i % 2 ? -1 : 1;
    birds.push({
      ox: -dir * rank * rand(14, 22) * s * size + rand(-4, 4) * s,
      oy: side * rank * rand(8, 12) * s * size + rand(-4, 4) * s,
      span: rand(7, 11) * s * size,
      hz: rand(2.5, 3.5),
      flap: rand(1.2, 2),
      glide: rand(1.5, 3),
      cycle: rand(0, 5),
      phase: rand(0, TAU),
      driftP: rand(6, 9),
      driftPh: rand(0, TAU),
    });
  }
  const span = Math.max(...birds.map((b) => Math.abs(b.ox))) + 30 * s;
  return {
    dir,
    x: dir > 0 ? -span : env.width + span,
    span,
    y0: env.height * rand(0.18, 0.42),
    climb: rand(-0.1, 0.1),
    speed: rand(28, 40) * s * (far ? 0.8 : 1),
    bobA: rand(6, 10) * s,
    bobP: rand(7, 11),
    t: 0,
    far,
    birds,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Leaves / petals.

const LEAF_MAX = 40;
const LEAF_BASE = 28; // at 1440x900
const LEAF_SEASON = { autumn: 1, spring: 0.8, summer: 0.45, winter: 0.25 };
const LEAF_CONDITION = { clear: 1, clouds: 1, wind: 1.25, fog: 0.6, rain: 0.35, snow: 0 };
const PALETTES = {
  autumn: ['#c8743a', '#a8502e', '#d9a441', '#8c5a2b'],
  spring: ['#f4d3dc', '#f8e6ea', '#eab8c8', '#fff4f2'],
  summer: ['#f6eedf', '#f1d9df', '#e7e2c6', '#fbf6ee'],
  winter: ['#8a6b4a', '#a08566', '#7a6450'],
}; // compiled below
for (const k in PALETTES) PALETTES[k] = PALETTES[k].map(parseColor);

function makeLeaf(env, s, petal, scatter) {
  const near = Math.random() >= 0.3;
  const k = near ? 1 : 0.6;
  return {
    x: rand(-0.1, 1.1) * env.width,
    y: scatter ? rand(-0.05, 0.85) * env.height : -rand(10, 40) * s,
    vy: (petal ? rand(12, 22) : rand(22, 38)) * s * k,
    A: (petal ? rand(10, 24) : rand(18, 40)) * s,
    P: petal ? rand(2.5, 4) : rand(3, 5.5),
    ph: rand(0, TAU),
    T: petal ? rand(0.9, 1.6) : rand(1.2, 2.4),
    tph: rand(0, TAU),
    rot: rand(0, TAU),
    rotV: rand(25, 60) * DEG * (Math.random() < 0.5 ? -1 : 1),
    len: (petal ? rand(4, 7) : rand(6, 11)) * s * k,
    alpha: near ? 0.9 : 0.6,
    depth: k,
    color: Math.floor(Math.random() * 4),
    petal,
    t: 0,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Grass.

const GRASS_SPACING = 6; // px at 1440
const GRASS_MAX = 320;

/** Sway amplitude, lean (deg) and period (s) for wind w (m/s): calm 2.5/0/5, 10 m/s 7/6/2.2, cap at 18. */
function swayParams(w) {
  const v = Math.max(0, Math.min(18, w || 0));
  const lo = Math.min(v, 10) / 10;
  const hi = Math.max(0, v - 10) / 8;
  return {
    amp: 2.5 + 4.5 * lo + 4 * hi,
    lean: 6 * lo + 8 * hi,
    period: 5 - 2.8 * lo - 0.4 * hi,
  };
}

// ---------------------------------------------------------------------------------------------------------

export function createAmbient() {
  const flags = Object.fromEntries(AMBIENT_KEYS.map((k) => [k, true]));
  // Birds
  let flock = null;
  let flockWait = rand(3, 8); // first flock soon after dusk begins, then every 18-40 s
  let birdAlpha = 0;
  // Leaves
  const leaves = [];
  let leafClock = 0;
  let leafDrift = 0;
  let leafKick = 0;
  let kickWait = rand(4, 7);
  let leavesSeeded = false;
  let leafSeason = null;
  // Grass
  let swayPhase = rand(0, TAU);
  const gust = { x: 0, speed: 0, life: 0, age: 1, wait: rand(2, 6) };
  // Water
  const glints = [];
  let lastSize = '';

  function scaleOf(env) { return Math.max(0.5, Math.min(1.6, env.width / 1440)); }

  function updateBirds(dt, env, s) {
    const gate = flags.birds ? birdGate(env) : 0;
    birdAlpha += (gate - birdAlpha) * (1 - Math.exp(-dt / 1.5));
    if (flock) {
      flock.t += dt;
      flock.x += flock.dir * flock.speed * dt;
      flock.y0 += flock.climb * dt;
      if ((flock.dir > 0 && flock.x > env.width + flock.span) || (flock.dir < 0 && flock.x < -flock.span)) flock = null;
    } else if (gate > 0.2 && !env.reducedMotion) {
      flockWait -= dt;
      if (flockWait <= 0) {
        flock = makeFlock(env, s);
        flockWait = rand(18, 40);
      }
    }
  }

  function leafTarget(env) {
    if (!flags.leaves) return 0;
    const area = (env.width * env.height) / (1440 * 900);
    const n = Math.max(8, Math.min(LEAF_MAX, LEAF_BASE * area));
    return Math.round(n * (LEAF_SEASON[env.season] ?? 0.6) * (LEAF_CONDITION[env.condition] ?? 1) * (env.reducedMotion ? 0.4 : 1));
  }

  function updateLeaves(dt, env, s) {
    if (env.season !== leafSeason) {
      // Leaves <-> petals: start the layer over in the new season's shapes.
      leafSeason = env.season;
      leaves.length = 0;
      leavesSeeded = false;
    }
    const target = Math.min(LEAF_MAX, leafTarget(env));
    const petal = env.season === 'spring' || env.season === 'summer';
    const w = env.wind || 0;
    leafDrift += (w * 3.2 * s - leafDrift) * (1 - Math.exp(-dt / 1.5));
    // Gust kicks above 12 m/s: a sideways shove that eases out over ~2 s.
    leafKick *= Math.exp(-dt / 0.7);
    if (w > 12) {
      kickWait -= dt;
      if (kickWait <= 0) { leafKick += rand(-20, 20) * s; kickWait = rand(4, 7); }
    }
    if (!leavesSeeded && target > 0) {
      // First frame with leaves: scatter some through the frame so the layer does not start empty.
      for (let i = 0; i < Math.round(target * 0.6); i++) leaves.push(makeLeaf(env, s, petal, true));
      leavesSeeded = true;
    }
    // Staggered spawns: about one per (fall time / target) so the count stays even.
    if (leaves.length < target) {
      leafClock -= dt;
      if (leafClock <= 0) {
        leaves.push(makeLeaf(env, s, petal, false));
        leafClock = (0.9 * env.height) / (28 * s) / target;
      }
    }
    const swayK = 1 + w / 20;
    const fallK = 1 + w / 50;
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.t += dt;
      l.y += l.vy * fallK * dt;
      l.x += (leafDrift + leafKick) * l.depth * dt;
      l.rot += l.rotV * dt;
      l.swayK = swayK;
      if (l.y > env.height * 0.95 || l.x < -0.2 * env.width || l.x > 1.2 * env.width) leaves.splice(i, 1);
    }
  }

  function updateGrass(dt, env, s) {
    const { period } = swayParams(env.wind);
    swayPhase = (swayPhase + (TAU * dt) / period) % (TAU * 1000);
    gust.age += dt;
    if (gust.age >= gust.life) {
      gust.wait -= dt;
      if (gust.wait <= 0) {
        gust.speed = rand(220, 320) * s;
        gust.x = -400 * s;
        gust.life = (env.width + 800 * s) / gust.speed;
        gust.age = 0;
        gust.wait = rand(6, 12);
      }
    } else {
      gust.x += gust.speed * dt;
    }
  }

  function spawnGlint(g, env, s, lightX, scatter) {
    const nearLight = Math.random() < 0.55;
    const gx = nearLight ? lightX + (Math.random() + Math.random() + Math.random() - 1.5) * 0.08 * env.width : rand(-0.02, 1.02) * env.width;
    g.x = gx;
    g.yk = Math.random() ** 0.7;
    g.len = (6 + g.yk * 18 * Math.random()) * s;
    g.tall = Math.random() < 0.2 ? 2 : 1;
    g.life = rand(1.2, 2.8);
    g.age = scatter ? rand(0, g.life) : 0;
    g.peak = rand(0.35, 0.55) * (nearLight ? 1 : 0.7);
    g.v = rand(3, 8) * s;
    return g;
  }

  function lightX(env) {
    const k = clamp01(env.dayMix + (env.twilight ?? 0));
    return env.moon.x + (env.sun.x - env.moon.x) * k;
  }

  function updateWater(dt, env, s) {
    if (!flags.water) return;
    const n = 14;
    const lx = lightX(env);
    if (glints.length !== n) {
      glints.length = 0;
      for (let i = 0; i < n; i++) glints.push(spawnGlint({}, env, s, lx, true));
    }
    const wdir = 1 + Math.min(1, (env.wind || 0) / 8);
    for (const g of glints) {
      g.age += dt;
      g.x += g.v * wdir * dt;
      if (g.age >= g.life) spawnGlint(g, env, s, lx, false);
    }
  }

  return {
    flags,
    setFlags(next) {
      for (const k of AMBIENT_KEYS) if (typeof next?.[k] === 'boolean') flags[k] = next[k];
      if (!flags.leaves) { leaves.length = 0; leavesSeeded = false; }
      if (!flags.birds) flock = null;
    },
    get state() {
      return { flags: { ...flags }, birds: flock ? flock.birds.length : 0, birdGate: birdAlpha, leaves: leaves.length, glints: glints.length };
    },

    update(dt, env) {
      const s = scaleOf(env);
      const size = `${env.width}x${env.height}`;
      if (size !== lastSize) {
        lastSize = size;
        glints.length = 0; // respawn in the new band
      }
      updateBirds(dt, env, s);
      updateLeaves(dt, env, s);
      updateGrass(dt, env, s);
      updateWater(dt, env, s);
    },

    drawBirds(ctx, env) {
      if (!flock || birdAlpha < 0.01) return;
      const s = scaleOf(env);
      const shift = -(env.camX ?? 0) * BIRD_PARALLAX;
      const sky = env.theme.sky.mid;
      const color = mixRgb(BIRD_INK, sky, flock.far ? 0.45 : 0.25);
      const t = flock.t;
      const baseY = flock.y0 + Math.sin((TAU * t) / flock.bobP) * flock.bobA;
      ctx.strokeStyle = rgba(color, 0.75 * birdAlpha);
      ctx.lineWidth = 1.3 * Math.max(0.8, s) * (flock.far ? 0.85 : 1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const b of flock.birds) {
        const drift = Math.sin((TAU * t) / b.driftP + b.driftPh) * 3 * s;
        const x = flock.x + b.ox + shift + drift;
        const y = baseY + b.oy + Math.cos((TAU * t) / b.driftP + b.driftPh) * 2 * s;
        // Flap / glide cycle: flap strength rises and falls with a sine window, gliding holds wings up.
        const cyc = (t + b.cycle) % (b.flap + b.glide);
        const env01 = cyc < b.flap ? Math.sin((Math.PI * cyc) / b.flap) ** 0.5 : 0;
        const wing = 0.3 * (1 - env01) + Math.sin(TAU * b.hz * t + b.phase) * env01;
        const half = b.span / 2;
        const tipY = y - wing * b.span * 0.35;
        ctx.moveTo(x - half, tipY);
        ctx.quadraticCurveTo(x - half * 0.45, y - b.span * 0.12 - wing * b.span * 0.08, x, y);
        ctx.quadraticCurveTo(x + half * 0.45, y - b.span * 0.12 - wing * b.span * 0.08, x + half, tipY);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    },

    /** Glints and slow ripples on the town's water band. alpha = skyline alpha, shift = distant parallax. */
    drawWater(ctx, env, { shoreY, alpha, shift }) {
      if (!flags.water || alpha <= 0.002 || !glints.length) return;
      const { width: w, height: h, theme, time } = env;
      const s = scaleOf(env);
      const band = h * 0.03;
      const wind = env.wind || 0;
      // Day: sky light lifted toward white; twilight: the warm horizon; night: moonlight.
      const night = 1 - clamp01(env.dayMix + (env.twilight ?? 0));
      let c = mixRgb(theme.sky.bottom, [255, 250, 240], 0.55);
      if ((env.twilight ?? 0) > 0) c = mixRgb(c, env.light.horizonGlow, env.twilight * 0.6);
      if (night > 0) c = mixRgb(c, theme.moon.color, night * 0.8);
      ctx.translate(shift, 0);
      // Dark ripple lines: short dashes on three rows, wobbling on a slow sine and drifting downwind.
      const rippleA = Math.min(4, 1.5 * (1 + wind / 8)) * s;
      ctx.fillStyle = rgba(theme.skyline);
      for (let r = 0; r < 3; r++) {
        const y = shoreY + band * (0.25 + r * 0.3);
        const dashes = 12;
        for (let i = 0; i < dashes; i++) {
          const u = ((i + hash(r * 31 + i) * 0.6 + time * (0.004 + r * 0.0015)) / dashes) % 1;
          const x = u * w * 1.1 - 0.05 * w + Math.sin(y * 0.35 + time * 1.2 + i) * rippleA;
          const a = 0.1 + 0.08 * Math.sin(time * 0.7 + i * 1.7 + r);
          ctx.globalAlpha = alpha * a;
          ctx.fillRect(x, y + Math.sin(time * 0.9 + i * 2.3) * 0.6, (18 + hash(i + r * 7) * 40) * s, 1);
        }
      }
      // Glints: short bright streaks that swell and fade, clustered in the light column.
      ctx.fillStyle = rgba(c);
      for (const g of glints) {
        const life = g.age / g.life;
        const a = Math.sin(Math.PI * life) ** 1.5 * g.peak;
        if (a < 0.01) continue;
        const y = shoreY + band * (0.08 + g.yk * 0.92);
        const dx = Math.sin(y * 0.35 + time * 1.2) * rippleA;
        ctx.globalAlpha = alpha * a;
        ctx.fillRect(g.x + dx - g.len / 2, y, g.len, g.tall);
      }
      ctx.translate(-shift, 0);
      ctx.globalAlpha = 1;
    },

    /**
     * Grass tufts along the foreground ridge. ridge = { offset, shift, y(x) } where offset is the hill's
     * scroll (fraction of w) so blades stay put on the hill, y(x) the ridge height at screen x.
     */
    drawGrass(ctx, env, ridge) {
      if (!flags.grass) return;
      const { width: w, theme } = env;
      const s = scaleOf(env);
      const sp = Math.max(4, GRASS_SPACING * s) / w; // blade spacing in world units (fraction of w)
      const { amp, lean } = swayParams(env.wind);
      const ampR = amp * DEG * (env.reducedMotion ? 0.5 : 1);
      const leanR = lean * DEG;
      const k = TAU / (420 * s);
      const sigma = 180 * s;
      const gustOn = gust.age < gust.life;
      const gustEnv = gustOn ? Math.sin(Math.PI * (gust.age / gust.life)) ** 2 : 0;
      const gustAmp = (5 + 0.4 * Math.min(10, env.wind || 0)) * DEG * gustEnv;
      const hMax = 22 * s;
      // World index range visible across [-4%, 104%] of the width (the hill is sampled with this bleed).
      const q0 = ridge.offset - 0.04 - ridge.shift / w;
      let k0 = Math.floor(q0 / sp);
      let k1 = Math.ceil((q0 + 1.08) / sp);
      if (k1 - k0 > GRASS_MAX) { const mid = (k0 + k1) >> 1; k0 = mid - GRASS_MAX / 2; k1 = mid + GRASS_MAX / 2; }
      const hill = theme.hills[2];
      const tones = [
        rgba(mixRgb(hill, theme.shade, 0.18)),
        rgba(hill),
        rgba(mixRgb(hill, theme.hills[1], 0.4)),
      ];
      for (let tone = 0; tone < 3; tone++) {
        ctx.fillStyle = tones[tone];
        ctx.beginPath();
        for (let i = k0; i <= k1; i++) {
          const r = hash(i);
          if (((r * 3) | 0) !== tone) continue;
          const q = i * sp;
          // Tufts: a slow density field decides which blades exist and how tall they are.
          const clump = 0.5 + 0.3 * Math.sin(q * 23.1 + 1.3) + 0.2 * Math.sin(q * 61.7 + 4.1);
          const r2 = hash(i + 7919);
          if (r2 > clump + 0.15) continue;
          const H = (10 + 12 * clump * (0.6 + 0.4 * r2)) * s;
          const x = (q - ridge.offset) * w + ridge.shift + (hash(i + 104729) - 0.5) * sp * w;
          const y = ridge.y(x) + 2 * s;
          const own = (0.85 + 0.3 * r2) * (0.6 + 0.4 * (H / hMax));
          const gx = x - gust.x;
          const g = gustOn ? gustAmp * Math.exp(-(gx * gx) / (2 * sigma * sigma)) : 0;
          const th = leanR + ampR * own * Math.sin(swayPhase - x * k + (hash(i + 31) - 0.5) * 0.8) + g;
          const tx = x + Math.sin(th) * H;
          const ty = y - Math.cos(th) * H;
          const cx = x + Math.sin(th * 0.5) * H * 0.5;
          const cy = y - H * 0.55;
          const bw = 1 * s;
          ctx.moveTo(x - bw, y);
          ctx.quadraticCurveTo(cx - bw * 0.5, cy, tx, ty);
          ctx.quadraticCurveTo(cx + bw * 0.5, cy, x + bw, y);
        }
        ctx.fill();
      }
    },

    drawLeaves(ctx, env, shifts) {
      if (!flags.leaves || !leaves.length) return;
      const palette = PALETTES[env.season] ?? PALETTES.autumn;
      // Seat the colours in the scene: a share of the mid hill and a touch of the sky.
      const tint = env.theme.hills[1];
      const colors = palette.map((c) => rgba(mixRgb(mixRgb(c, tint, 0.22), env.theme.sky.mid, 0.08)));
      const t = env.time;
      for (const l of leaves) {
        const phase = (TAU * l.t) / l.P + l.ph;
        const sway = Math.sin(phase) * l.A * l.swayK;
        const tilt = Math.cos(phase) * 20 * DEG;
        const sx = Math.cos((TAU * t) / l.T + l.tph);
        const edge = Math.abs(sx) < 0.2 ? 0.8 : 1;
        // Fade in from the top edge and out as they reach the foreground ground.
        const fade = smoothstep(-0.02, 0.05, l.y / env.height) * (1 - smoothstep(0.86, 0.95, l.y / env.height));
        if (fade < 0.01) continue;
        const px = (l.depth < 1 ? shifts[1] : shifts[2]) ?? 0;
        ctx.save();
        ctx.translate(l.x + sway + px, l.y);
        ctx.rotate(l.rot + tilt);
        ctx.scale(Math.sign(sx || 1) * Math.max(0.1, Math.abs(sx)), 1);
        ctx.globalAlpha = l.alpha * fade * edge;
        ctx.fillStyle = colors[l.color % colors.length];
        ctx.beginPath();
        const L = l.len / 2;
        if (l.petal) {
          ctx.ellipse(0, 0, L, L * 0.62, 0, 0, TAU);
        } else {
          ctx.moveTo(-L, 0);
          ctx.quadraticCurveTo(0, -L * 0.75, L, 0);
          ctx.quadraticCurveTo(0, L * 0.75, -L, 0);
        }
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
}
