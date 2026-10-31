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

export function createWeatherService({ apiKey = resolveApiKey(), source, useMock = false } = {}) {
  const mock = createMockSource();
  const primary = source ?? (useMock ? mock : apiKey ? createOpenWeatherSource({ apiKey }) : createOpenMeteoSource());

  const cache = new Map();
  const pending = new Map();
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
      const key = `${location.lat},${location.lng}`;
      if (pending.has(key)) return pending.get(key);
      const request = (async () => {
        try {
          const result = { weather: await withName(await primary.fetchCurrent(location)), source: primary.id, updatedAt: Date.now() };
          cache.set(key, result);
          return result;
        } catch (error) {
          const previous = cache.get(key);
          if (previous) return { ...previous, stale: true, error };
          return { weather: null, source: primary.id, error };
        } finally { pending.delete(key); }
      })();
      pending.set(key, request);
      return request;
    },
  };
}
