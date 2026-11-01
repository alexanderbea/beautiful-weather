import { solarElevationAt, SUNRISE_ELEVATION } from '../data/model.js';

/**
 * Celestial paths shared by the scene (where the sun and moon are drawn) and the forecast hand
 * (where a drag can move them). Height comes from the scene's own elevation mapping, so the sun sets
 * behind the far hills exactly where it always has; the horizontal position follows local solar time,
 * so one day is one circuit across the sky. The moon is the scene's night moon: it keeps the sun's
 * opposite (half a day round, mirrored elevation), so every night has a moon for the hand.
 */
export const HORIZON = 0.66;
export const SUN_Y_TOP = 0.2;
export const SUN_Y_PER_DEG = (HORIZON - SUN_Y_TOP) / 12;
const DAY = 86400000;
const NOON_X = 0.62; // fraction of width at local solar noon (the sun used to rest at 0.72)
const SPAN_X = 0.36; // half a circuit: noon -> midnight

/** Screen-height fraction for an elevation in degrees (the scene's sun mapping). */
export function elevationY(elevation) {
  return Math.min(0.95, Math.max(SUN_Y_TOP, HORIZON - elevation * SUN_Y_PER_DEG));
}

/** Local solar hour angle in degrees, -180..180, 0 at solar noon. */
export function hourAngle(location, at) {
  const f = (((at / DAY + location.lng / 360) % 1) + 1) % 1;
  return f * 360 - 180;
}

const wrap = deg => ((deg + 540) % 360) - 180;

/** Elevation in degrees of 'sun' or 'moon' at `at`. */
export function elevationOf(location, at, body) {
  const solar = solarElevationAt(location, at);
  return body === 'moon' ? -solar : solar;
}

/** The hand: the sun while it is above the horizon (it wins when both are up), otherwise the moon. */
export function handBody(solarElevation) {
  return solarElevation > SUNRISE_ELEVATION ? 'sun' : 'moon';
}

/** Path position (CSS px) of `body` (default: the hand at that moment) at epoch ms `at`. */
export function bodyAt(location, at, width, height, body) {
  const solar = solarElevationAt(location, at);
  body ??= handBody(solar);
  const elevation = body === 'moon' ? -solar : solar;
  const angle = body === 'moon' ? wrap(hourAngle(location, at) + 180) : hourAngle(location, at);
  return { body, elevation, up: elevation > SUNRISE_ELEVATION,
    x: width * (NOON_X + SPAN_X * angle / 180), y: height * elevationY(elevation) };
}
