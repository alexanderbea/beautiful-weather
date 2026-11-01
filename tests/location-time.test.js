import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, selectedCity, locationTimeZone } from '../src/app/cities.js';
import { createTimeFormatter } from '../src/app/time.js';
import { DEFAULT_LOCATION } from '../src/data/model.js';
import { nextHours, precipitationSummary } from '../src/app/forecast.js';

test('fallback and preset cities match; device coordinates and misleading names do not', () => {
  assert.equal(selectedCity(DEFAULT_LOCATION), 'Stockholm');
  for (const [name, city] of Object.entries(CITIES)) {
    assert.equal(selectedCity({ ...city, name }), name);
    assert.equal(locationTimeZone({ ...city, name }), city.timeZone);
  }
  assert.equal(selectedCity({ lat: 59.3293, lng: 18.0686 }), '');
  assert.equal(selectedCity({ name: 'Stockholm', lat: 1, lng: 2 }), '');
  assert.equal(selectedCity(null), '');
});

test('24-hour output even in US locale, local date boundary and explicit UTC fallback', () => {
  const instant = Date.parse('2026-12-31T23:00Z');
  const stockholm = createTimeFormatter('Europe/Stockholm', 'en-US');
  assert.match(stockholm.format(instant), /Jan 1, 00:00 GMT\+1/);
  assert.match(createTimeFormatter('America/New_York', 'en-US').format(instant), /Dec 31, 18:00 GMT-5/);
  for (const zone of [undefined, 'invalid']) {
    const f = createTimeFormatter(zone, 'en-US');
    assert.equal(f.zone, 'UTC');
    assert.match(f.format(instant), /23:00 GMT/);
  }
});

test('DST repeats and skips local hours without changing forecast instants or durations', () => {
  for (const [zone, start, before, after] of [
    ['Europe/Stockholm', '2026-10-25T00:00Z', '02:00 GMT+2', '02:00 GMT+1'],
    ['Europe/Stockholm', '2026-03-29T00:00Z', '01:00 GMT+1', '03:00 GMT+2'],
    ['America/New_York', '2026-11-01T05:00Z', '01:00 GMT-4', '01:00 GMT-5'],
  ]) {
    const first = Date.parse(start);
    const f = createTimeFormatter(zone, 'en-US');
    const rows = Array.from({ length: 24 }, (_, i) => ({ time: first + i * 3600000, precipitationMm: i === 1 ? 1 : 0 }));
    const original = structuredClone(rows);
    assert.equal(nextHours(rows, first - 1).length, 24);
    assert.ok(f.format(first).endsWith(before));
    assert.ok(f.format(first + 3600000).endsWith(after));
    const rain = precipitationSummary(rows, f.format);
    assert.ok(rain.includes(before)); assert.ok(rain.includes(after));
    assert.deepEqual(rows, original);
  }
});

test('precipitation across midnight labels both dates', () => {
  const f = createTimeFormatter('Asia/Tokyo', 'en-US');
  const summary = precipitationSummary([{ time: Date.parse('2026-12-31T15:00Z'), precipitationMm: 1 }], f.format);
  assert.match(summary, /Dec 31, 23:00 GMT\+9–Jan 1, 00:00 GMT\+9/);
});

test('preview caption names today / tomorrow by the location calendar, 24-hour', async () => {
  const { previewLabel } = await import('../src/app/time.js');
  const now = Date.parse('2026-11-01T22:30Z'); // Nov 1 23:30 in Stockholm, Nov 2 07:30 in Tokyo
  assert.equal(previewLabel(Date.parse('2026-11-02T13:00Z'), now, 'Europe/Stockholm', 'en-US'), 'Tomorrow 14:00');
  assert.equal(previewLabel(Date.parse('2026-11-02T05:00Z'), now, 'Asia/Tokyo', 'en-US'), 'Today 14:00');
  assert.equal(previewLabel(Date.parse('2026-11-01T23:00Z'), now, 'Europe/Stockholm', 'en-US'), 'Tomorrow 00:00');
});
