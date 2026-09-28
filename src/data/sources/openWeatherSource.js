import { normalizeWeather, solarElevation } from '../model.js';

const ENDPOINT = 'https://api.openweathermap.org/data/2.5/weather';
const WINDY_MS = 10.8; // Beaufort 6 ("strong breeze")

/** Maps OpenWeather condition codes (https://openweathermap.org/weather-conditions). */
export function mapCondition(code, windSpeed) {
  let condition;
  if (code >= 200 && code < 600) condition = 'rain'; // thunderstorm, drizzle, rain
  else if (code >= 600 && code < 700) condition = 'snow';
  else if (code === 771 || code === 781) condition = 'wind'; // squalls, tornado
  else if (code >= 700 && code < 800) condition = 'fog';
  else if (code === 800) condition = 'clear';
  else condition = 'clouds';

  if ((condition === 'clear' || condition === 'clouds') && windSpeed >= WINDY_MS) condition = 'wind';
  return condition;
}

export function parseOpenWeather(data, location) {
  const code = data.weather?.[0]?.id ?? 800;
  const windSpeed = data.wind?.speed ?? 0;
  const now = (data.dt ?? Date.now() / 1000);
  const isDay = data.sys?.sunrise && data.sys?.sunset
    ? now >= data.sys.sunrise && now < data.sys.sunset
    : !String(data.weather?.[0]?.icon ?? '').endsWith('n');

  return normalizeWeather({
    condition: mapCondition(code, windSpeed),
    temperatureC: data.main?.temp,
    windSpeed,
    humidity: data.main?.humidity,
    isDay,
    solarElevation: solarElevation(location.lat, location.lng, new Date(now * 1000)),
    location: { lat: location.lat, lng: location.lng, name: location.name || data.name || undefined, country: location.country || data.sys?.country || undefined },
    observedAt: now * 1000,
  });
}

export function createOpenWeatherSource({ apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('OpenWeather source requires an apiKey');
  return {
    id: 'openweathermap',
    async fetchCurrent(location) {
      const url = `${ENDPOINT}?lat=${location.lat}&lon=${location.lng}&units=metric&appid=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`OpenWeather HTTP ${res.status}`);
      return parseOpenWeather(await res.json(), location);
    },
  };
}
