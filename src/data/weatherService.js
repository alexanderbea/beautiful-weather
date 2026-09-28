import { createMockSource } from './sources/mockSource.js';
import { createOpenWeatherSource } from './sources/openWeatherSource.js';
import { reverseGeocode } from './geocode.js';

/** Key lookup order: runtime global, then Vite env (.env.local). Never hardcoded. */
export function resolveApiKey() {
  if (typeof window !== 'undefined' && window.__WEATHER_API_KEY) return window.__WEATHER_API_KEY;
  // import.meta.env only exists under Vite; plain static servers leave it undefined.
  return import.meta.env?.VITE_WEATHER_API_KEY || null;
}

/**
 * Single entry point for weather data. Picks the live source when a key is present and
 * falls back to the mock source on missing key or any fetch/parse error.
 */
export function createWeatherService({ apiKey = resolveApiKey(), source } = {}) {
  const mock = createMockSource();
  const primary = source ?? (apiKey ? createOpenWeatherSource({ apiKey }) : mock);

  async function withName(weather) {
    if (!weather.location.name) {
      const name = await reverseGeocode(weather.location).catch(() => null);
      if (name) weather.location.name = name;
    }
    return weather;
  }

  return {
    primaryId: primary.id,
    async getCurrent(location) {
      try {
        return { weather: await withName(await primary.fetchCurrent(location)), source: primary.id };
      } catch (error) {
        if (primary === mock) throw error;
        console.warn('[weather] live source failed, using mock:', error);
        return { weather: await withName(await mock.fetchCurrent(location)), source: 'mock', error };
      }
    },
  };
}
