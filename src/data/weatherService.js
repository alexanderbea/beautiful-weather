import { createMockSource } from './sources/mockSource.js';
import { createOpenWeatherSource } from './sources/openWeatherSource.js';
import { createOpenMeteoSource } from './sources/openMeteoSource.js';
import { reverseGeocode } from './geocode.js';

/** Key lookup order: runtime global, then Vite env (.env.local). Never hardcoded. */
export function resolveApiKey() {
  if (typeof window !== 'undefined' && window.__WEATHER_API_KEY) return window.__WEATHER_API_KEY;
  // import.meta.env only exists under Vite; plain static servers leave it undefined.
  return import.meta.env?.VITE_WEATHER_API_KEY || null;
}

/**
 * Single entry point for weather data. Live by default: OpenWeather when a key is present,
 * otherwise the keyless Open-Meteo source. Canned mock data is only used when explicitly asked
 * for (`useMock`, i.e. ?source=mock) or as a last resort when the live request fails, and the
 * result's `source` says so, so the UI can label it as sample data.
 */
export function createWeatherService({ apiKey = resolveApiKey(), source, useMock = false } = {}) {
  const mock = createMockSource();
  const primary = source ?? (useMock ? mock : apiKey ? createOpenWeatherSource({ apiKey }) : createOpenMeteoSource());

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
