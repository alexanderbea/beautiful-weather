import { normalizeWeather, solarElevation } from '../model.js';

/**
 * Open-Meteo weather (https://open-meteo.com/en/docs). Keyless, so it is the live source
 * whenever no OpenWeather key is configured. `current` is model-based weather for the
 * requested coordinates, updated every 15 minutes; never a daily max.
 */
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m';
const finite = value => Number.isFinite(value) ? value : null;
const WINDY_MS = 10.8; // Beaufort 6 ("strong breeze")

/** Maps WMO weather interpretation codes (as used by Open-Meteo) onto our conditions. */
export function mapWmoCondition(code, windSpeed) {
  let condition;
  if (code === 0 || code === 1) condition = 'clear'; // clear / mainly clear
  else if (code === 2 || code === 3) condition = 'clouds'; // partly cloudy / overcast
  else if (code === 45 || code === 48) condition = 'fog';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) condition = 'rain'; // drizzle, rain, showers, thunder
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) condition = 'snow';
  else condition = 'clouds';

  if ((condition === 'clear' || condition === 'clouds') && windSpeed >= WINDY_MS) condition = 'wind';
  return condition;
}

export function parseOpenMeteo(data, location) {
  const cur = data.current ?? {};
  if (!Number.isFinite(cur.temperature_2m)) throw new Error('Open-Meteo response has no current temperature');
  const windSpeed = cur.wind_speed_10m ?? 0;
  // `time` is ISO without zone; we request timezone=UTC so append Z.
  const observed = cur.time ? Date.parse(`${cur.time}Z`) : NaN;
  if (!Number.isFinite(observed)) throw new Error('Open-Meteo response has no valid current timestamp');
  const observedAt = observed;

  return normalizeWeather({
    condition: mapWmoCondition(cur.weather_code ?? 0, windSpeed),
    temperatureC: cur.temperature_2m,
    feelsLikeC: cur.apparent_temperature,
    forecastSource: 'Open-Meteo',
    forecast: (data.hourly?.time ?? []).map((time, i) => ({
      time: Date.parse(`${time}Z`),
      temperatureC: finite(data.hourly.temperature_2m?.[i]),
      precipitationMm: finite(data.hourly.precipitation?.[i]),
      probability: finite(data.hourly.precipitation_probability?.[i]),
    })).filter(hour => Number.isFinite(hour.time)),
    windSpeed,
    humidity: cur.relative_humidity_2m,
    isDay: cur.is_day === undefined ? undefined : cur.is_day === 1,
    solarElevation: solarElevation(location.lat, location.lng, new Date(observedAt)),
    location: { lat: location.lat, lng: location.lng, name: location.name || undefined, country: location.country || undefined },
    observedAt,
  });
}

export function createOpenMeteoSource({ fetchImpl = fetch } = {}) {
  return {
    id: 'open-meteo',
    async fetchCurrent(location) {
      const url = `${ENDPOINT}?latitude=${location.lat}&longitude=${location.lng}&current=${CURRENT_FIELDS}&hourly=temperature_2m,precipitation,precipitation_probability&forecast_days=3&wind_speed_unit=ms&timezone=UTC`;
      const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      return parseOpenMeteo(await res.json(), location);
    },
  };
}
