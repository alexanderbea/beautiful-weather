import test from 'node:test';
import assert from 'node:assert/strict';
import { readoutLift, READOUT_GAP } from '../src/engine/readoutClearance.js';
import { meteorOrigin } from '../src/engine/meteors.js';
import { drawEclipse } from '../src/engine/eclipse.js';
import { STYLE_DEFS, STYLE_PARAMS } from '../src/engine/styles/index.js';
import { deepMerge } from '../src/engine/themes.js';

// Readout text box measured on the 390x844 phone preview (meteor scene note, two lines).
const PHONE = { left: 12, top: 14, right: 300, bottom: 187 };

test('readoutLift: no readout or no overlap leaves things in place; overlap drops below the last line', () => {
  assert.equal(readoutLift(null, 0, 0, 10, 10), 0);
  assert.equal(readoutLift(PHONE, 320, 0, 380, 60), 0);
  assert.equal(readoutLift(PHONE, 0, 300, 50, 340), 0);
  assert.equal(readoutLift(PHONE, 80, 120, 140, 180), PHONE.bottom + READOUT_GAP - 120);
});

test('meteor tracks keep their whole path and longest trail below the phone readout', () => {
  const m = 390;
  for (let i = 0; i < 3; i++) {
    const free = meteorOrigin(i, 390, 844, null);
    assert.deepEqual(free, { x: 390 * (.32 + i * .21), y: 844 * (.18 + (i % 2) * .17) });
    const o = meteorOrigin(i, 390, 844, PHONE);
    const tailTop = o.y - .23 * m * .5, tailLeft = o.x - .23 * m;
    const clear = tailTop >= PHONE.bottom + READOUT_GAP - 1e-9 || tailLeft > PHONE.right || o.x + .17 * m < PHONE.left;
    assert.ok(clear, `track ${i} crosses the readout`);
    assert.ok(o.y + .085 * m < 844 * .45, `track ${i} stays in the upper sky`);
  }
});

test('eclipse disk and visible corona sit below the phone readout for every style', () => {
  for (const style of STYLE_DEFS) {
    const calls = [];
    const ctx = new Proxy({}, { get: (_, key) => (...args) => { calls.push([key, ...args]); return { addColorStop() {} }; }, set: () => true });
    drawEclipse(ctx, { width: 390, height: 844, readout: PHONE, artStyle: { params: deepMerge(STYLE_PARAMS, style.params) } });
    const [, x, y, r] = calls.find(([op]) => op === 'arc');
    assert.ok(y - r * 1.6 >= PHONE.bottom + READOUT_GAP - 1e-9, style.id);
    assert.equal(x, 390 * .72);
  }
});

test('readoutShift: the moon moves right on a wide screen, down on a phone', async () => {
  const { readoutShift } = await import('../src/engine/readoutClearance.js');
  const desk = { left: 24, top: 24, right: 354, bottom: 232 };
  assert.deepEqual(readoutShift(desk, 266, 30, 450, 214, 1280 * .55), { dx: 354 + READOUT_GAP - 266, dy: 0 });
  assert.deepEqual(readoutShift(PHONE, 73, 107, 145, 179, 390 * .55), { dx: 0, dy: PHONE.bottom + READOUT_GAP - 107 });
  assert.deepEqual(readoutShift(PHONE, 320, 0, 380, 60, 999), { dx: 0, dy: 0 });
});
