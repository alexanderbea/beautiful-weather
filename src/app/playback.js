import { solarElevationAt, SUNRISE_ELEVATION } from '../data/model.js';

/**
 * Forecast playback: a chosen future hour (picked on the sun or the moon) and the journey there.
 * Modes: 'live' (the sky is now), 'playing' (the playhead travels; also the ease back to now),
 * 'held' (arrived; the sky holds that moment). `chosen` is the ghost's hour while choosing; the
 * live sky never moves until a choice is committed.
 */
export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export const RETURN_MS = 2500;
export const MAX_MS = 16000;

/** Choosable range: from now to the last forecast hour (never earlier than now). */
export function bounds(hours, now) {
  return { min: now, max: Math.max(now, ...hours.map(h => h.time).filter(Number.isFinite)) };
}
export function clampTime(t, range) { return Math.max(range.min, Math.min(range.max, t)); }

/** Journey length in ms: ~6 s under 6 h, ~10 s up to a day, ~14 s beyond; 0 with reduced motion. */
export function duration(from, to, reduced = false, returning = false) {
  if (reduced) return 0;
  if (returning) return RETURN_MS;
  const span = Math.abs(to - from);
  return Math.min(MAX_MS, span < 6 * HOUR ? 6000 : span <= DAY ? 10000 : 14000);
}

/** Ease in and out. */
export const ease = p => p * p * (3 - 2 * p);

/** Snaps to a whole forecast hour, keeping `now` itself as the earliest stop. */
export function snapHour(t, range) {
  const snapped = clampTime(Math.round(t / HOUR) * HOUR, range);
  return snapped < range.min + HOUR / 2 && t < range.min + HOUR / 2 ? range.min : snapped;
}

/** Arrow keys: one hour (or one day with Shift on Left/Right) from `at`; null for other keys or out of range. */
export function keyTime(key, shift, at, range) {
  const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[key];
  if (!direction) return null;
  const step = shift && (key === 'ArrowRight' || key === 'ArrowLeft') ? DAY : HOUR;
  const base = direction > 0 ? Math.floor(at / HOUR) * HOUR : Math.ceil(at / HOUR) * HOUR;
  const t = base + direction * step;
  if (t > range.max) return at >= range.max ? null : range.max;
  if (t <= range.min) return at <= range.min ? null : range.min;
  return t;
}

const honest = row => !!row && !!row.condition && Number.isFinite(row.temperatureC);
const lerp = (a, b, k) => Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * k : (k < .5 ? a : b) ?? null;

/**
 * The weather at `at`: live at or before now; after it, interpolated between hourly samples (the live
 * reading stands as the first sample). An hour without a reading reports `missing`, its numbers stay
 * empty and the sky holds the last honest sample; it is never borrowed from a later hour. The scene
 * crossfades toward the next sample (`nextCondition`, `mix`) so nothing cuts on the hour.
 */
export function readingAt(live, at, now) {
  const elevation = solarElevationAt(live.location, at);
  const sun = { solarElevation: elevation, isDay: elevation > SUNRISE_ELEVATION };
  if (at <= now) return { weather: live, missing: false, nextCondition: null, mix: 0 };
  const rows = live.forecast.filter(h => Number.isFinite(h.time) && h.time > now).sort((a, b) => a.time - b.time);
  const samples = [{ ...live, time: now }, ...rows];
  let i = samples.findLastIndex(s => s.time <= at);
  const s0 = samples[i], s1 = samples[i + 1];
  // No reading: the hour's row lacks one, or there is no row for this hour at all.
  const missing = i > 0 && (!honest(s0) || at >= s0.time + HOUR);
  let held = s0;
  while (!honest(held) && i > 0) held = samples[--i];
  // Fade only over the last hour before the next sample, so a gap holds instead of smearing.
  const k = s1 ? Math.max(0, 1 - (s1.time - at) / Math.min(HOUR, s1.time - s0.time)) : 0;
  const next = honest(s1) ? s1 : held; // a later gap holds; a reading after a gap fades in over its last hour
  const label = k < .5 ? held : next;
  return {
    missing, nextCondition: next.condition, mix: next === held ? 0 : k,
    weather: { ...live, ...sun,
      condition: label.condition ?? live.condition,
      temperatureC: missing ? null : lerp(held.temperatureC, next.temperatureC, k),
      feelsLikeC: missing ? null : lerp(held.feelsLikeC, next.feelsLikeC, k),
      windSpeed: lerp(held.windSpeed ?? live.windSpeed, next.windSpeed ?? held.windSpeed ?? live.windSpeed, next === held ? 0 : k),
      sceneCondition: held.condition ?? live.condition },
  };
}

/**
 * Drag along the hand's path: pointer travel along the path's tangent becomes hours. Slow motion keeps
 * one hour per `minPxPerHour` or more; fast motion multiplies the distance covered.
 */
export function dragHours(alongPx, pxPerHour, speedPxPerMs, minPxPerHour = 28) {
  const gain = 1 + Math.max(0, Math.min(5, (speedPxPerMs - 0.6) * 4));
  return alongPx / Math.max(minPxPerHour, pxPerHour) * gain;
}

export function createPlayback({ getLive, onChange, now = Date.now, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches }) {
  let mode = 'live', at = null, chosen = null, progress = 0, frame = 0, returning = false;
  const notify = () => onChange(api.state);
  const range = () => bounds(getLive()?.forecast ?? [], now());

  function play(to, back = false) {
    cancelFrame(frame); chosen = null;
    const clock = now(), from = at ?? clock;
    to = back ? clock : clampTime(to, range());
    if (!back && to <= clock) {
      if (mode === 'held') return play(clock, true);
      notify(); return;
    }
    if (!back && at !== null && to === at) { notify(); return; } // released on the held hour: nothing to play
    const ms = duration(from, to, reduced(), back);
    returning = back;
    const finish = () => { mode = back ? 'live' : 'held'; at = back ? null : to; progress = 0; returning = false; notify(); };
    if (!ms) { finish(); return; }
    mode = 'playing'; progress = 0;
    let start;
    const tick = stamp => {
      start ??= stamp;
      progress = Math.min(1, (stamp - start) / ms);
      const target = back ? now() : to;
      at = from + (target - from) * ease(progress);
      if (progress === 1) finish(); else { notify(); frame = requestFrame(tick); }
    };
    at = from; notify(); frame = requestFrame(tick);
  }

  const api = {
    get state() { return { mode, at, chosen, progress, returning }; },
    /** The moment the ghost starts from: the held hour, or now. */
    get origin() { return at ?? now(); },
    range,
    /** Moves the ghost (no effect on the sky). Ignored while a journey plays. */
    select(t) {
      if (mode === 'playing') return false;
      const next = snapHour(t, range());
      if (next !== chosen) { chosen = next; notify(); }
      return true;
    },
    key(key, shift) {
      if (mode === 'playing') return false;
      const t = keyTime(key, shift, chosen ?? api.origin, range());
      if (t === null) return ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown'].includes(key);
      chosen = t; notify(); return true;
    },
    cancel() { if (chosen !== null) { chosen = null; notify(); } },
    commit() {
      if (chosen === null) return;
      const t = chosen;
      if (t <= now()) { chosen = null; if (mode === 'held') play(now(), true); else notify(); return; }
      play(t);
    },
    play,
    /** Ease back to live weather (~2.5 s, a cut with reduced motion), then Now leaves. */
    now() { if (mode !== 'live' || at !== null) play(now(), true); },
    reset() { cancelFrame(frame); mode = 'live'; at = chosen = null; progress = 0; returning = false; notify(); },
  };
  return api;
}
