// Smoke test for the live temperature path: node tests/weather-source-smoke.js
// 1. Parsers pick the *current* temperature (OpenWeather main.temp / Open-Meteo current.temperature_2m),
//    never a daily max and never a canned number.
// 2. With no API key the service uses the keyless Open-Meteo live source, and a real request for
//    Stockholm returns a fresh, plausible reading (not the mock's canned 21 C).
import assert from 'node:assert/strict';
import { parseOpenWeather } from '../src/data/sources/openWeatherSource.js';
import { parseOpenMeteo, mapWmoCondition } from '../src/data/sources/openMeteoSource.js';
import { createWeatherService } from '../src/data/weatherService.js';
import { DEFAULT_LOCATION } from '../src/data/model.js';

const stockholm = { lat: 59.3293, lng: 18.0686, name: 'Stockholm', country: 'SE' };

// --- parsers -----------------------------------------------------------------
const ow = parseOpenWeather({
  weather: [{ id: 801, icon: '02d' }], main: { temp: 9.4, temp_max: 19.4, temp_min: 7.1, humidity: 80 },
  wind: { speed: 3 }, dt: 1790579460, sys: { country: 'SE', sunrise: 1790570000, sunset: 1790612000 },
}, stockholm);
assert.equal(ow.temperatureC, 9.4, 'OpenWeather must use main.temp, not temp_max');

const om = parseOpenMeteo({
  current: { time: '2026-09-28T05:00', temperature_2m: 8.7, relative_humidity_2m: 90, is_day: 1, weather_code: 3, wind_speed_10m: 2.2 },
}, stockholm);
assert.equal(om.temperatureC, 8.7);
assert.equal(om.condition, 'clouds');
assert.equal(om.observedAt, Date.parse('2026-09-28T05:00Z'));
assert.equal(mapWmoCondition(0, 1), 'clear');
assert.equal(mapWmoCondition(61, 1), 'rain');
assert.equal(mapWmoCondition(71, 1), 'snow');
assert.equal(mapWmoCondition(45, 1), 'fog');
assert.equal(mapWmoCondition(2, 12), 'wind');
assert.throws(() => parseOpenMeteo({ current: {} }, stockholm), /no current temperature/);
console.log('parsers: ok');

// --- service wiring ------------------------------------------------------------
assert.equal(createWeatherService({ apiKey: null }).primaryId, 'open-meteo', 'no key -> keyless live source');
assert.equal(createWeatherService({ apiKey: null, useMock: true }).primaryId, 'mock', '?source=mock -> mock');
assert.equal(createWeatherService({ apiKey: 'k' }).primaryId, 'openweathermap', 'key -> OpenWeather');

// Failure of the live source falls back to mock and *says so* via source/error.
const failing = createWeatherService({ source: { id: 'boom', async fetchCurrent() { throw new Error('down'); } } });
const fb = await failing.getCurrent(stockholm);
assert.equal(fb.source, 'mock');
assert.ok(fb.error);
console.log('wiring: ok');

// --- live request --------------------------------------------------------------
const service = createWeatherService({ apiKey: null });
const a = await service.getCurrent(DEFAULT_LOCATION);
assert.equal(a.source, 'open-meteo', 'live reading must come from the real API');
assert.ok(Number.isFinite(a.weather.temperatureC));
assert.ok(a.weather.temperatureC > -40 && a.weather.temperatureC < 45, 'plausible');
assert.ok(Date.now() - a.weather.observedAt < 2 * 3600 * 1000, 'observation is fresh (< 2 h old)');
console.log(`live Stockholm: ${a.weather.temperatureC} C, ${a.weather.condition}, ${a.weather.windSpeed} m/s, observed ${new Date(a.weather.observedAt).toISOString()}`);

// A different location gives its own reading (not a single hardcoded value).
const b = await service.getCurrent({ lat: 35.6762, lng: 139.6503, name: 'Tokyo', country: 'JP' });
console.log(`live Tokyo: ${b.weather.temperatureC} C, ${b.weather.condition}`);
assert.ok(a.weather.temperatureC !== 21 || b.weather.temperatureC !== 21, 'not the canned mock value');
console.log('smoke test passed');
