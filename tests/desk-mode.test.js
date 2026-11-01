import test from 'node:test';
import assert from 'node:assert/strict';
import { readClockPref, writeClockPref, clockText } from '../src/app/deskMode.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('clock preference defaults on and round-trips through storage', () => {
  const s = memoryStorage();
  assert.equal(readClockPref(s), true);
  writeClockPref(false, s);
  assert.equal(readClockPref(s), false);
  writeClockPref(true, s);
  assert.equal(readClockPref(s), true);
});

test('blocked storage falls back to clock on without throwing', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readClockPref(blocked), true);
  assert.doesNotThrow(() => writeClockPref(false, blocked));
});

test('clock text uses the location time zone, 24-hour', () => {
  const at = Date.parse('2026-11-01T12:05:00Z');
  assert.equal(clockText(at, 'Asia/Tokyo', 'en-GB').time, '21:05');
  assert.equal(clockText(at, 'Europe/London', 'en-GB').time, '12:05');
  assert.match(clockText(at, 'Asia/Tokyo', 'en-GB').date, /Sunday 1 November/);
  assert.equal(clockText(at, 'Not/AZone', 'en-GB').time.length, 5); // invalid zone: device zone
});
