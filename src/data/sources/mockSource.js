import { normalizeWeather, isDaylight, solarElevationAt, DEFAULT_LOCATION } from '../model.js';

const CANNED = {
  clear: { temperatureC: 21, windSpeed: 2.5, humidity: 40 },
  clouds: { temperatureC: 14, windSpeed: 4, humidity: 65 },
  rain: { temperatureC: 11, windSpeed: 6, humidity: 88 },
  snow: { temperatureC: -3, windSpeed: 3, humidity: 80 },
  wind: { temperatureC: 9, windSpeed: 14, humidity: 55 },
  fog: { temperatureC: 6, windSpeed: 1, humidity: 97 },
  night: { temperatureC: 8, windSpeed: 2, humidity: 70 },
  'night-rain': { temperatureC: 9, windSpeed: 5, humidity: 92 },
};

/** Zero-config source returning canned data. Also used as the fallback for live sources. */
export function createMockSource({ condition = 'clear' } = {}) {
  return {
    id: 'mock',
    async fetchCurrent(location) {
      return cannedWeather(condition, location);
    },
  };
}

/** Canned numbers for `condition`; day/night and sun elevation come from the real sun position. */
export function cannedWeather(condition, location, date = new Date()) {
  const loc = location ?? {};
  const sunLoc = Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? loc : DEFAULT_LOCATION;
  return normalizeWeather({
    condition,
    ...CANNED[condition],
    isDay: isDaylight(sunLoc, date),
    solarElevation: solarElevationAt(sunLoc, date),
    location: loc,
  });
}
