import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenMeteo, createOpenMeteoSource } from '../src/data/sources/openMeteoSource.js';
import { createWeatherService } from '../src/data/weatherService.js';
import { nextHours, precipitationSummary, isStale } from '../src/app/forecast.js';
import { getDeviceLocation } from '../src/app/location.js';
import { DEFAULT_LOCATION } from '../src/data/model.js';
const now = Date.parse('2026-10-31T10:30Z');
const data = { current: { temperature_2m: 7, apparent_temperature: 4, time: '2026-10-31T10:15' }, hourly: { time: ['2026-10-31T11:00', '2026-10-31T12:00'], temperature_2m: [8, null], precipitation: [0, 1.2], precipitation_probability: [10, null] } };
test('current, feels-like and hourly nulls are preserved; single extended request', async () => {
  let calls = 0;
  const source = createOpenMeteoSource({ fetchImpl: async url => { calls++; assert.match(url, /hourly=temperature_2m,precipitation,precipitation_probability/); return { ok: true, json: async () => data }; } });
  const w = await source.fetchCurrent(DEFAULT_LOCATION);
  assert.equal(calls, 1); assert.equal(w.temperatureC, 7); assert.equal(w.feelsLikeC, 4);
  assert.equal(w.forecast[1].temperatureC, null); assert.equal(w.forecast[1].probability, null);
  assert.equal(nextHours(w.forecast, now).length, 2);
  assert.match(precipitationSummary(w.forecast, t => new Date(t).toISOString()), /11:00.*12:00/);
  assert.match(precipitationSummary([w.forecast[0]], String), /unavailable/);
});
test('24-hour window excludes past and distant rows; dry requires full coverage', () => {
  const rows = Array.from({ length: 28 }, (_, i) => ({ time: now + i * 3600000, precipitationMm: 0 }));
  assert.equal(nextHours(rows, now).length, 24);
  assert.match(precipitationSummary(nextHours(rows, now), String), /No precipitation/);
});
test('failed refresh retains data and timestamp; different city cannot inherit cache; recovers', async () => {
  let fail = false;
  const w = parseOpenMeteo(data, DEFAULT_LOCATION);
  const service = createWeatherService({ source: { id: 'test', async fetchCurrent() { if (fail) throw Error('offline'); return w; } } });
  const first = await service.getCurrent(DEFAULT_LOCATION); fail = true;
  const stale = await service.getCurrent(DEFAULT_LOCATION);
  assert.equal(stale.weather, first.weather); assert.equal(stale.updatedAt, first.updatedAt); assert.equal(stale.stale, true);
  assert.equal((await service.getCurrent({ lat: 1, lng: 2 })).weather, null);
  fail = false; assert.equal((await service.getCurrent(DEFAULT_LOCATION)).stale, undefined);
  assert.equal(isStale(w, now, now), false); assert.equal(isStale(w, now, now + 31 * 60000), true);
});
test('denied geolocation gives usable Stockholm fallback', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition(ok, error) { error({ code: 1, PERMISSION_DENIED: 1 }); } } } });
  try { const result = await getDeviceLocation(); assert.equal(result.reason, 'denied'); assert.deepEqual(result.location, DEFAULT_LOCATION); }
  finally { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; }
});
test('missing provider timestamp is rejected rather than stamped as fresh', () => {
  assert.throws(() => parseOpenMeteo({ current: { temperature_2m: 10 } }, DEFAULT_LOCATION), /timestamp/);
});
test('concurrent refreshes share one provider request', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = createWeatherService({ source: { id: 'test', async fetchCurrent() { calls++; await gate; return parseOpenMeteo(data, DEFAULT_LOCATION); } } });
  const a = service.getCurrent(DEFAULT_LOCATION), b = service.getCurrent(DEFAULT_LOCATION);
  release();
  assert.deepEqual(await a, await b); assert.equal(calls, 1);
});
test('OpenWeather reuses feels-like and adds keyless forecast; forecast failure keeps current', async () => {
  const { createOpenWeatherSource } = await import('../src/data/sources/openWeatherSource.js');
  let failForecast = false;
  const urls = [];
  const source = createOpenWeatherSource({ apiKey: 'test', fetchImpl: async url => {
    urls.push(url);
    if (url.includes('open-meteo')) { if (failForecast) throw Error('offline'); return { ok: true, json: async () => data }; }
    return { ok: true, json: async () => ({ main: { temp: 10, feels_like: 8 }, dt: now / 1000 }) };
  } });
  const weather = await source.fetchCurrent(DEFAULT_LOCATION);
  assert.equal(weather.feelsLikeC, 8); assert.equal(weather.forecast.length, 2);
  assert.equal(urls.length, 2); assert.ok(!urls[1].includes('appid'));
  failForecast = true;
  const partial = await source.fetchCurrent(DEFAULT_LOCATION);
  assert.equal(partial.temperatureC, 10); assert.deepEqual(partial.forecast, []);
});
