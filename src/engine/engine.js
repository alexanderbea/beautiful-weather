import { rgba, lerpDeep } from './color.js';
import { THEMES, resolveTheme, deepMerge } from './themes.js';
import { createScene } from './scene.js';
import { EFFECTS, CONDITION_EFFECTS } from './effects/index.js';
import { parseAmbientParams, seasonFor, SEASONS } from './ambient.js';

const NIGHT_ALIASES = { night: 'clear', 'night-rain': 'rain' };
const TRANSITION_S = 1.8;
const MAX_DPR = 2;
const ease = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => ease(Math.min(1, Math.max(0, (x - a) / (b - a))));
const DAY_ELEVATION = 45; // synthesized when a caller only knows isDay
const NIGHT_ELEVATION = -18; // astronomical night
const ELEVATION_EPSILON = 0.05; // degrees; smaller moves do not retarget
const TAU = Math.PI * 2;
// Parallax: a horizontal camera value c (unitless, |c| <= C_MAX) moves each depth layer by
// c * PARALLAX_RANGE * w * factor px. Layers: 0 distant (far ridge + skyline + its water reflections and
// shimmer), 1 midground hill, 2 foreground hill. Sky, sun, moon, stars and precipitation stay put (f = 0).
export const PARALLAX_FACTORS = [0.25, 0.6, 1];
export const PARALLAX_RANGE = 0.024; // fraction of width at |c| = 1, near layer
const DRIFT_PERIOD_A = 90; // s
const DRIFT_PERIOD_B = 143; // s
const DRIFT_B = 0.35;
const DRIFT_NORM = 1 / (1 + DRIFT_B); // normalises the two-sine drift to +-1
const POINTER_RANGE = 0.5; // pointer / tilt add up to +-0.5 to c
const C_MAX = 1.4;
const POINTER_TAU = 0.8; // s, exponential smoothing
const TILT_DEADZONE = 2; // deg of device gamma
const TILT_RANGE = 20; // deg of gamma for the full pointer range
const PARALLAX_FADE_S = 1.2; // setParallax / reduced-motion fade time
/** Max |shift| of each layer as a fraction of width (skyline bleed must exceed the distant one). */
export const PARALLAX_MAX_SHIFT = PARALLAX_FACTORS.map((f) => C_MAX * PARALLAX_RANGE * f);

/** Sky weights from sun elevation (degrees): dayMix 0 night..1 day, twilight peaks 1 at the horizon. */
export function skyWeights(e) {
  return {
    dayMix: smoothstep(-6, 6, e),
    twilight: e <= 0 ? smoothstep(-6, 0, e) : 1 - smoothstep(0, 6, e),
  };
}

/**
 * Canvas 2D renderer. Draw order per frame:
 *   scene sky (+ golden-hour glow) -> effect.drawBack -> scene land (far ridge, skyline, dawn mist,
 *   mid/near hills) -> ambient shade -> effect.draw
 * The land is drawn in three parallax depth layers shifted by env.parallax[i] (see updateParallax).
 * Condition changes cross-fade the theme and the per-effect weights over TRANSITION_S.
 */
export function createEngine(canvas, { themes = THEMES } = {}) {
  const ctx = canvas.getContext('2d');
  const scene = createScene();
  const layers = new Map(); // effect id -> { effect, weight, target }
  const env = {
    width: 0, height: 0, dpr: 1, time: 0, dt: 0,
    theme: null, condition: 'clear', wind: 0, dayMix: 1, twilight: 0, solarElevation: DAY_ELEVATION, weight: 1,
    sun: null, moon: null, horizonY: 0,
    // Camera offset (px, near-layer shift) and per-layer horizontal shift (px, preallocated: [distant, mid, fore]).
    camX: 0, parallax: [0, 0, 0],
    rising: 0, // 0..1, eases toward the sunRising flag (dawn mist)
    light: null, // per-frame lighting weights, set by the scene (lighting.js)
    season: seasonFor(NaN), // 'spring' | 'summer' | 'autumn' | 'winter' (leaf/petal layer), from location + date
    reducedMotion: false,
    ambient: null, // ambient-life flags { clouds, birds, leaves, grass, water } (scene.ambient.flags)
  };
  // Ambient life dev flags: ?ambient=-birds,-grass / ?ambient=leaves / ?ambient=0, ?season=autumn.
  const ambientParams = parseAmbientParams();
  let seasonOverride = ambientParams.season;
  let lastLat = NaN;
  scene.ambient.setFlags(ambientParams.flags);
  env.ambient = scene.ambient.flags;
  if (seasonOverride) env.season = seasonOverride;

  let themeTable = themes;
  let target = { condition: 'clear', isDay: true, windSpeed: 0, solarElevation: DAY_ELEVATION, sunRising: false };
  let targetWeights = skyWeights(DAY_ELEVATION);
  let themeCache = new Map(); // condition -> { day, twilight, night } resolved themes
  let elevFrom = DAY_ELEVATION; // env.solarElevation glides elevFrom -> target over the blend
  let fromTheme = null;
  let toTheme = null;
  let blend = 1;
  let rafId = 0;
  let last = 0;
  let running = false;
  let fpsAcc = 0;
  let fpsFrames = 0;
  const stats = { fps: 0 };

  // Parallax state. amount fades 0..1 toward enabled && !reducedMotion; the pointer/tilt input is eased.
  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  let reducedMotion = !!reducedMotionQuery?.matches;
  let parallaxEnabled = true;
  let parallaxAmount = reducedMotion ? 0 : 1;
  let pointerTarget = 0; // -1..1
  let pointer = 0;
  let forcedC = null; // dev/test hook: pins c (see setParallaxCam)
  function onPointerMove(e) {
    if (reducedMotion || e.pointerType === 'touch') return;
    const w = window.innerWidth || 1;
    pointerTarget = Math.max(-1, Math.min(1, (e.clientX / w) * 2 - 1));
  }
  function onPointerLeave() { pointerTarget = 0; }
  function onTilt(e) {
    if (reducedMotion || !Number.isFinite(e.gamma)) return;
    const g = Math.abs(e.gamma) <= TILT_DEADZONE ? 0 : e.gamma - Math.sign(e.gamma) * TILT_DEADZONE;
    pointerTarget = Math.max(-1, Math.min(1, g / (TILT_RANGE - TILT_DEADZONE)));
  }
  function onReducedMotion(e) {
    reducedMotion = e.matches;
    if (reducedMotion) pointerTarget = 0;
  }

  function updateParallax(dt) {
    const want = parallaxEnabled && !reducedMotion ? 1 : 0;
    const step = dt / PARALLAX_FADE_S;
    parallaxAmount += Math.max(-step, Math.min(step, want - parallaxAmount));
    pointer += (pointerTarget - pointer) * (1 - Math.exp(-dt / POINTER_TAU));
    let cam = 0;
    if (parallaxAmount > 0) {
      const t = env.time;
      const drift = (Math.sin((TAU * t) / DRIFT_PERIOD_A) + DRIFT_B * Math.sin((TAU * t) / DRIFT_PERIOD_B + 1.3)) * DRIFT_NORM;
      const c = forcedC ?? Math.max(-C_MAX, Math.min(C_MAX, drift + POINTER_RANGE * pointer));
      cam = ease(parallaxAmount) * c * PARALLAX_RANGE * env.width;
    }
    env.camX = cam;
    // Camera moves right -> the world slides left, nearer layers further.
    for (let i = 0; i < 3; i++) env.parallax[i] = -cam * PARALLAX_FACTORS[i];
  }

  function resize() {
    env.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    env.width = window.innerWidth;
    env.height = window.innerHeight;
    canvas.width = Math.round(env.width * env.dpr);
    canvas.height = Math.round(env.height * env.dpr);
    canvas.style.width = `${env.width}px`;
    canvas.style.height = `${env.height}px`;
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    for (const layer of layers.values()) layer.effect.resize?.(env);
  }

  function phaseThemes(condition) {
    let entry = themeCache.get(condition);
    if (!entry) {
      // Booleans for day/night keep compatibility with resolveTheme(..., isDay); 'twilight' is the new phase.
      entry = {
        day: resolveTheme(themeTable, condition, true),
        twilight: resolveTheme(themeTable, condition, 'twilight'),
        night: resolveTheme(themeTable, condition, false),
      };
      themeCache.set(condition, entry);
    }
    return entry;
  }

  /** Static theme for the current target elevation. Only called on retarget, never per frame. */
  function composeTheme() {
    const { day, twilight, night } = phaseThemes(target.condition);
    const w = targetWeights;
    let theme = w.dayMix >= 1 ? day : w.dayMix <= 0 ? night : lerpDeep(night, day, w.dayMix);
    if (w.twilight >= 1) theme = twilight;
    else if (w.twilight > 0) theme = lerpDeep(theme, twilight, w.twilight);
    return theme;
  }

  function retarget(immediate) {
    env.condition = target.condition; // canonical condition (night aliases resolved); gates the aurora
    targetWeights = skyWeights(target.solarElevation);
    const next = composeTheme();
    if (immediate || !env.theme) {
      env.theme = next;
      fromTheme = toTheme = next;
      blend = 1;
      env.solarElevation = elevFrom = target.solarElevation;
      env.dayMix = targetWeights.dayMix;
      env.twilight = targetWeights.twilight;
    } else {
      fromTheme = env.theme; // start from whatever is on screen, even mid-transition
      toTheme = next;
      blend = 0;
      elevFrom = env.solarElevation;
    }

    const wanted = new Set(CONDITION_EFFECTS[target.condition] ?? []);
    for (const [id, layer] of layers) layer.target = wanted.has(id) ? 1 : 0;
    for (const id of wanted) {
      if (layers.has(id) || !EFFECTS[id]) continue;
      const effect = EFFECTS[id]();
      effect.init(env);
      layers.set(id, { effect, weight: immediate ? 1 : 0, target: 1 });
    }
  }

  /**
   * @param {{ condition: string, isDay?: boolean, windSpeed?: number, solarElevation?: number, sunRising?: boolean }} weather
   *   solarElevation in degrees drives the sky continuously; when missing it is synthesized from isDay.
   *   sunRising (default false) marks a sunrise, which enables the dawn mist; it eases, never snaps.
   * @param {{ immediate?: boolean }} [opts] immediate snaps instead of cross-fading.
   */
  function setWeather({ condition, isDay, windSpeed, solarElevation, sunRising, location }, { immediate = false } = {}) {
    if (Number.isFinite(location?.lat)) lastLat = location.lat;
    env.season = seasonOverride ?? seasonFor(lastLat);
    // Night-only aliases: 'night' is clear sky and 'night-rain' is rain, both with the sun forced below -18 deg.
    const alias = NIGHT_ALIASES[condition];
    let elevation = Number.isFinite(solarElevation)
      ? solarElevation
      : (isDay !== false ? DAY_ELEVATION : NIGHT_ELEVATION);
    if (alias) elevation = Math.min(elevation, NIGHT_ELEVATION);
    const next = {
      condition: alias ?? condition,
      isDay: alias ? false : isDay !== false,
      windSpeed: windSpeed ?? 0,
      solarElevation: elevation,
      sunRising: !alias && sunRising === true,
    };
    const changed = next.condition !== target.condition
      || Math.abs(next.solarElevation - target.solarElevation) > ELEVATION_EPSILON;
    target = next;
    if (immediate) {
      env.wind = target.windSpeed;
      env.rising = target.sunRising ? 1 : 0;
    }
    if (changed || immediate || !env.theme) retarget(immediate);
  }

  function update(dt) {
    env.dt = dt;
    env.time += dt;

    if (blend < 1) {
      blend = Math.min(1, blend + dt / TRANSITION_S);
      const k = ease(blend);
      env.theme = blend >= 1 ? toTheme : lerpDeep(fromTheme, toTheme, k);
      env.solarElevation = elevFrom + (target.solarElevation - elevFrom) * k;
    } else {
      env.solarElevation = target.solarElevation;
    }
    // Weights move toward their continuous targets at most 1 unit per TRANSITION_S.
    const mixStep = dt / TRANSITION_S;
    env.dayMix += Math.max(-mixStep, Math.min(mixStep, targetWeights.dayMix - env.dayMix));
    env.twilight += Math.max(-mixStep, Math.min(mixStep, targetWeights.twilight - env.twilight));
    env.wind += (target.windSpeed - env.wind) * (1 - Math.exp(-dt * 1.5));
    env.rising += Math.max(-mixStep, Math.min(mixStep, (target.sunRising ? 1 : 0) - env.rising));
    updateParallax(dt);
    env.reducedMotion = reducedMotion;

    for (const [id, layer] of layers) {
      const step = dt / TRANSITION_S;
      layer.weight += Math.max(-step, Math.min(step, layer.target - layer.weight));
      if (layer.target === 0 && layer.weight <= 0) {
        layer.effect.destroy?.();
        layers.delete(id);
      }
    }

    scene.update(dt, env);
    for (const layer of layers.values()) {
      env.weight = ease(layer.weight);
      layer.effect.update(dt, env);
    }
  }

  function draw() {
    const { width: w, height: h, theme } = env;
    ctx.globalAlpha = 1;
    scene.drawSky(ctx, env);
    for (const layer of layers.values()) {
      if (!layer.effect.drawBack) continue;
      env.weight = ease(layer.weight);
      layer.effect.drawBack(ctx, env);
    }
    scene.drawLand(ctx, env);
    if (theme.ambient < 1) {
      ctx.fillStyle = rgba(theme.shade, (1 - theme.ambient) * 0.8);
      ctx.fillRect(0, 0, w, h);
    }
    for (const layer of layers.values()) {
      if (!layer.effect.draw) continue;
      env.weight = ease(layer.weight);
      layer.effect.draw(ctx, env);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    // Clamp dt so a long stall (debugger, background) does not teleport particles.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    fpsAcc += dt;
    fpsFrames += 1;
    if (fpsAcc >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    update(dt);
    draw();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('deviceorientation', onTilt, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  reducedMotionQuery?.addEventListener?.('change', onReducedMotion);
  resize();

  let landmark = null;

  return {
    setWeather,
    /** Mid-ground landmark silhouette: 'stockholm' | 'nordic' | null (off). Cross-fades on change. */
    setLandmark(id) {
      if (id === landmark) return;
      landmark = id ?? null;
      scene.setLandmark(landmark);
    },
    /** Depth parallax on/off; the amplitude fades rather than snapping unless opts.immediate. */
    setParallax(on, { immediate = false } = {}) {
      parallaxEnabled = !!on;
      if (immediate) parallaxAmount = parallaxEnabled && !reducedMotion ? 1 : 0;
    },
    /** Dev/test hook: pin the camera value c (e.g. +-1.4 for max shift), or null to resume the drift. */
    setParallaxCam(c) {
      forcedC = Number.isFinite(c) ? c : null;
    },
    /**
     * Ambient life / micro-motion toggles (dev/test): any of { clouds, birds, leaves, grass, water } as
     * booleans, plus season: 'spring' | 'summer' | 'autumn' | 'winter' | null (null = from location/date).
     */
    setAmbient({ season, ...flags } = {}) {
      scene.ambient.setFlags(flags);
      if (season !== undefined) {
        seasonOverride = SEASONS.includes(season) ? season : null;
        env.season = seasonOverride ?? seasonFor(lastLat);
      }
    },
    start,
    stop,
    stats,
    get state() {
      return {
        ...target,
        targetSolarElevation: target.solarElevation,
        solarElevation: env.solarElevation,
        dayMix: env.dayMix,
        twilight: env.twilight,
        wind: env.wind,
        rising: env.rising,
        sky: { ...scene.sky },
        light: env.light && { g: env.light.g, golden: env.light.golden, dawn: env.light.dawn, rimAlpha: env.light.rim[3] },
        effects: [...layers.keys()],
        landmark,
        season: env.season,
        ambient: scene.ambient.state,
        parallax: {
          enabled: parallaxEnabled,
          reducedMotion,
          amount: parallaxAmount,
          camX: env.camX,
          shifts: [...env.parallax],
        },
      };
    },
    /** Merge palette overrides (same shape as THEMES) and fade to the result. */
    setThemes(overrides) {
      themeTable = deepMerge(themeTable, overrides);
      themeCache = new Map();
      retarget(false);
    },
    destroy() {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('deviceorientation', onTilt);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotion);
    },
  };
}
