// Älta, 1 Nov 2026: the readout said "Rain" while it was overcast. Recorded Open-Meteo data in
// tests/fixtures/open-meteo-alta-2026-11-01.json; no network access here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOpenMeteo, createOpenMeteoSource, precipitationKind } from '../src/data/sources/openMeteoSource.js';
import { CONDITION_EFFECTS } from '../src/engine/effects/index.js';
import { LABELS } from '../src/app/overlay.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/open-meteo-alta-2026-11-01.json', import.meta.url), 'utf8'));
const ALTA = { lat: 59.25, lng: 18.18 };
const word = w => LABELS[w.condition];
const rainAnimates = w => (CONDITION_EFFECTS[w.condition] ?? []).includes('rain');
const viaSource = body => createOpenMeteoSource({ fetchImpl: async () => ({ ok: true, json: async () => body }) }).fetchCurrent(ALTA);

test('recorded 15:30 overcast reading is Cloudy, without rain animation', async () => {
  const w = await viaSource(fixture.cloudy);
  assert.equal(w.condition, 'clouds');
  assert.equal(word(w), 'Cloudy');
  assert.notEqual(word(w), 'Rain');
  assert.equal(rainAnimates(w), false);
  // Temperature and wind readouts pass through unchanged.
  assert.equal(w.temperatureC, 7.4); assert.equal(w.feelsLikeC, 4.2); assert.equal(w.windSpeed, 3.7);
  // Hourly forecast rows keep their own data; a drizzle hour does not leak into the sky now.
  assert.equal(w.forecast[1].condition, 'rain'); assert.equal(w.forecast[2].probability, 10);
});

test('recorded drizzle reading (code 51) still says Rain and animates, at 2% probability', async () => {
  const w = await viaSource(fixture.drizzle);
  assert.equal(w.condition, 'rain');
  assert.equal(word(w), 'Rain');
  assert.equal(rainAnimates(w), true);
});

test('probability or a trace amount never turns an overcast code into rain', () => {
  const base = fixture.cloudy;
  for (const [precipitation, precipitation_probability] of [[0, 30], [0.1, 30], [0.3, 100]]) {
    const body = { current: { ...base.current }, hourly: { ...base.hourly, precipitation: [precipitation, precipitation, precipitation, precipitation], precipitation_probability: Array(4).fill(precipitation_probability) } };
    const w = parseOpenMeteo(body, ALTA);
    assert.equal(word(w), 'Cloudy'); assert.equal(rainAnimates(w), false);
  }
});

test('drizzle, rain, freezing rain, showers and thunder codes stay Rain whatever the probability', () => {
  for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) {
    assert.equal(precipitationKind(code), 'rain', `code ${code}`);
    const body = { current: { ...fixture.cloudy.current, weather_code: code }, hourly: { ...fixture.cloudy.hourly, precipitation_probability: [0, 0, 0, 0] } };
    const w = parseOpenMeteo(body, ALTA);
    assert.equal(word(w), 'Rain', `code ${code}`); assert.equal(rainAnimates(w), true, `code ${code}`);
  }
  for (const code of [0, 1, 2, 3, 45, 48]) assert.equal(precipitationKind(code), null, `code ${code}`);
});
