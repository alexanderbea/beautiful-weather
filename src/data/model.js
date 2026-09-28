/**
 * Normalized weather model. Everything outside data/ depends only on this shape.
 *
 * @typedef {'rain'|'clear'|'clouds'|'snow'|'wind'|'fog'|'night'|'night-rain'} Condition
 * @typedef {{ lat: number, lng: number, name?: string }} GeoLocation
 * @typedef {{
 *   condition: Condition,
 *   temperatureC: number,
 *   windSpeed: number,      // m/s
 *   humidity?: number,      // 0-100
 *   isDay: boolean,
 *   solarElevation?: number, // degrees, geometric elevation of the sun centre
 *   location: GeoLocation,
 *   observedAt?: number,    // epoch ms
 * }} Weather
 *
 * A source implements: { id: string, fetchCurrent(location: GeoLocation): Promise<Weather> }
 */

// 'night' and 'night-rain' are night-only aliases (clear / rain with isDay forced off).
export const CONDITIONS = ['clear', 'clouds', 'rain', 'snow', 'wind', 'fog', 'night', 'night-rain'];
export const NIGHT_ONLY = ['night', 'night-rain'];

export const DEFAULT_LOCATION = { lat: 59.3293, lng: 18.0686, name: 'Stockholm' };

/** Validates and fills defaults so consumers never see a partial object. */
export function normalizeWeather(input) {
  const condition = CONDITIONS.includes(input.condition) ? input.condition : 'clear';
  return {
    condition,
    temperatureC: Number.isFinite(input.temperatureC) ? input.temperatureC : 0,
    windSpeed: Math.max(0, Number.isFinite(input.windSpeed) ? input.windSpeed : 0),
    humidity: Number.isFinite(input.humidity) ? input.humidity : undefined,
    isDay: NIGHT_ONLY.includes(condition) ? false : input.isDay !== false,
    solarElevation: Number.isFinite(input.solarElevation) ? input.solarElevation : undefined,
    location: { ...DEFAULT_LOCATION, name: undefined, ...input.location },
    observedAt: input.observedAt ?? Date.now(),
  };
}

/**
 * Rough local day/night guess for sources without sunrise data.
 * @deprecated Use isDaylight(location, date) instead; kept for backwards compatibility.
 */
export function guessIsDay(date = new Date()) {
  const h = date.getHours();
  return h >= 6 && h < 20;
}

// ---------------------------------------------------------------------------
// Solar position (NOAA / Meeus low-precision algorithm, accurate to ~0.01 deg).
// Everything is UTC-based, so no timezone information is needed.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
/** Apparent elevation of the upper limb at official sunrise/sunset: refraction (34') + radius (16'). */
export const SUNRISE_ELEVATION = -0.833;

/**
 * Geometric (unrefracted) elevation of the sun centre in degrees.
 * @param {number} lat degrees north
 * @param {number} lng degrees east
 * @param {Date|number} [date]
 */
export function solarElevation(lat, lng, date = new Date()) {
  const ms = typeof date === 'number' ? date : date.getTime();
  const jd = ms / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000.0

  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360; // mean longitude
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t); // mean anomaly
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t); // orbit eccentricity
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * Mr) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * Mr) * 0.000289; // equation of centre
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD); // corrected obliquity
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));

  // Equation of time (minutes).
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const L0r = L0 * RAD;
  const eqTime = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr)
    + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));

  const utcMinutes = ((ms % 86400000) + 86400000) % 86400000 / 60000;
  const trueSolarTime = (((utcMinutes + eqTime + 4 * lng) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolarTime / 4 - 180) * RAD;

  const latR = lat * RAD;
  const cosZenith = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) * DEG;
}

function coords(location) {
  const lat = Number.isFinite(location?.lat) ? location.lat : DEFAULT_LOCATION.lat;
  const lng = Number.isFinite(location?.lng) ? location.lng : DEFAULT_LOCATION.lng;
  return { lat, lng };
}

/** Solar elevation for a (possibly partial) location, defaulting to DEFAULT_LOCATION. */
export function solarElevationAt(location, date = new Date()) {
  const { lat, lng } = coords(location);
  return solarElevation(lat, lng, date);
}

/** True between standard sunrise and sunset (sun centre above -0.833 deg). */
export function isDaylight(location, date = new Date()) {
  return solarElevationAt(location, date) > SUNRISE_ELEVATION;
}

/**
 * Sunrise/sunset around the UTC day containing `date`, found by sampling the elevation curve
 * and bisecting crossings. Returns null fields for polar day/night. Mainly for verification.
 */
export function sunTimes(lat, lng, date = new Date()) {
  const ms = typeof date === 'number' ? date : date.getTime();
  // Search the local solar day: centred on approximate local noon for this longitude.
  const dayStart = Math.floor(ms / 86400000) * 86400000 + 43200000 - (lng / 15) * 3600000 - 43200000;
  const f = (tt) => solarElevation(lat, lng, tt) - SUNRISE_ELEVATION;
  const step = 10 * 60000;
  let sunrise = null;
  let sunset = null;
  let prev = f(dayStart);
  for (let tt = dayStart + step; tt <= dayStart + 86400000; tt += step) {
    const cur = f(tt);
    if ((prev <= 0) !== (cur <= 0)) {
      let a = tt - step;
      let b = tt;
      for (let i = 0; i < 30; i++) {
        const m = (a + b) / 2;
        if ((f(a) <= 0) === (f(m) <= 0)) a = m; else b = m;
      }
      if (cur > 0 && !sunrise) sunrise = new Date(b);
      else if (cur <= 0 && !sunset) sunset = new Date(b);
    }
    prev = cur;
  }
  return { sunrise, sunset };
}
