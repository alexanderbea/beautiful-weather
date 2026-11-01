import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUR, DAY, createPlayback } from '../src/app/playback.js';
import { bodyAt, handBody, elevationOf, HORIZON } from '../src/engine/celestial.js';
import { skyArc, classifyTap, cloudHit, localDayStart } from '../src/app/skyTap.js';
import { routeTap } from '../src/engine/wildlife.js';
import { solarElevationAt, SUNRISE_ELEVATION } from '../src/data/model.js';

// Coarse pointer (a finger): choosing is taps in the sky, never a drag.
const STOCKHOLM = { lat: 59.3293, lng: 18.0686, name: 'Stockholm', country: 'SE' };
const NOW = Date.UTC(2026, 10, 1, 11, 15); // 12:15 in Stockholm, sun up
const START = Date.UTC(2026, 10, 1, 0);
const W = 390, H = 844, HORIZON_Y = HORIZON * H;
const rows = Array.from({ length: 72 }, (_, i) => ({ time: START + i * HOUR, condition: 'clear', temperatureC: i, feelsLikeC: i, windSpeed: 2 }));
const LIVE = { condition: 'clear', temperatureC: 9, feelsLikeC: 7, windSpeed: 2, location: STOCKHOLM, forecast: rows };
const LAST = START + 71 * HOUR;
const RANGE = { min: NOW, max: LAST };

function fakeEl(tag) {
  const listeners = {};
  const el = { tag, style: {}, dataset: {}, attrs: {}, hidden: false, children: [], textContent: '', className: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return el.attrs[k]; }, removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(n, f) { (listeners[n] ??= []).push(f); },
    fire(n, e = {}) { for (const f of listeners[n] ?? []) f({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...e }); },
    append(...c) { el.children.push(...c); }, setPointerCapture() {},
    set innerHTML(v) { el.children = [...v.matchAll(/<(\w+)/g)].map(m => fakeEl(m[1])); } };
  return el;
}

async function setup({ at = NOW, animalAt = () => false, clouds = [] } = {}) {
  const docListeners = {};
  globalThis.document = { createElement: fakeEl, createElementNS: (_, t) => fakeEl(t), body: fakeEl('body'),
    addEventListener: (n, f) => { (docListeners[n] ??= []).push(f); } };
  globalThis.window = globalThis;
  Object.assign(globalThis, { innerWidth: W, innerHeight: H, matchMedia: () => ({ matches: false }), addEventListener() {} });
  const { createCelestialControl } = await import('../src/app/celestialControl.js');
  let tick = null;
  const p = createPlayback({ getLive: () => LIVE, now: () => at, reduced: () => false, onChange: () => c?.render(),
    requestFrame: f => { tick = f; return 1; }, cancelFrame: () => { tick = null; } });
  const hand = bodyAt(STOCKHOLM, at, W, H);
  let hook = null;
  const routed = [];
  const engine = { celestial: { ...hand, r: 19.5, alpha: 1 }, animalContains: animalAt, cloudBoxes: () => clouds,
    setTapHook: fn => { hook = fn; },
    // The engine's own router after the hand declines (routeTap: sheet open closes it, animals first).
    tapAt: (x, y, e) => { if (hook(x, y, e)) return; routed.push(routeTap(document.body.dataset.menu === 'open', x, y,
      { interactAnimal: animalAt, interact: () => {}, landscapeTap: () => { document.body.dataset.menu = 'closed'; } })); } };
  const hint = fakeEl('div');
  const c = createCelestialControl({ engine, playback: p, getLive: () => LIVE, hint });
  c.render();
  const svg = document.body.children.find(e => e.tag === 'svg');
  const button = document.body.children.find(e => e.tag === 'button');
  const tap = (x, y, pointerType = 'touch') => engine.tapAt(x, y, { pointerType });
  const escape = () => { for (const fn of docListeners.keydown ?? []) fn({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }); };
  return { p, c, svg, hint, hand, tap, routed, escape, button, arc: day => skyArc(STOCKHOLM, at + day * DAY, hand.body, W, H, { min: at, max: LAST }) };
}

test('sky arc: future hours only, three day beads, a horizon tick where the pass ends', () => {
  const a = skyArc(STOCKHOLM, NOW, 'sun', W, H, RANGE);
  assert.ok(a.points.length > 2 && a.points.every(q => q.t > NOW));
  assert.ok(a.hours.length >= 2 && a.hours.every(q => q.t % HOUR === 0 && q.t > NOW));
  assert.equal(a.beads.length, 1, 'today: dawn and midday are behind; dusk is ahead');
  assert.ok(a.tick && Math.abs(a.tick.y - HORIZON_Y) < 12, 'the tick sits where the arc meets the horizon');
  const tomorrow = skyArc(STOCKHOLM, NOW + DAY, 'sun', W, H, RANGE);
  assert.equal(tomorrow.beads.length, 3, 'dawn, midday, dusk');
  const night = skyArc(STOCKHOLM, Date.UTC(2026, 10, 1, 21), 'moon', W, H, RANGE);
  assert.equal(night.beads.length, 3, 'moon: dusk, midnight, dawn');
  assert.ok(night.hours.length > 10, 'the mirrored moon path, not a new one');
  assert.equal(cloudHit({ left: 10, right: 20, top: 5, bottom: 15 }).right - cloudHit({ left: 10, right: 20, top: 5, bottom: 15 }).left, 44);
});

test('first tap on the hand arms: ring, arc, beads, tick, "Tap ahead"; the live sky stays on now', async () => {
  const f = await setup();
  assert.equal(f.svg.style.display, 'none');
  f.tap(f.hand.x, f.hand.y);
  assert.deepEqual(f.c.armed, { body: 'sun', day: 0 });
  assert.equal(f.svg.style.display, '');
  assert.ok(f.svg.classList.contains('is-armed'));
  assert.match(f.svg.children[0].getAttribute('d'), /^M/, 'the faint arc is drawn');
  assert.match(f.svg.children[1].getAttribute('d'), /h12$/, 'the horizon tick');
  assert.equal(f.hint.textContent, 'Tap ahead');
  assert.equal(document.body.dataset.selecting, 'true', 'readout drops to the quieter tone');
  assert.equal(f.p.state.mode, 'live');
  assert.equal(f.p.state.at, null);
  assert.equal(f.p.state.chosen, null, 'nothing chosen, nothing plays');
});

test('the horizon band and a cloud also arm; empty ground does not', async () => {
  const f = await setup({ clouds: [{ left: 20, top: 100, right: 80, bottom: 130 }] });
  f.tap(200, 800);
  assert.equal(f.c.armed, null);
  assert.deepEqual(f.routed, ['wildlife'], 'an ordinary landscape tap');
  f.tap(40, HORIZON_Y + 20);
  assert.ok(f.c.armed, 'horizon band (44 px) arms');
  f.escape();
  assert.equal(f.c.armed, null, 'Escape lets go');
  f.tap(50, 115);
  assert.ok(f.c.armed, 'a cloud arms');
});

test('second tap on the arc plays that hour', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  const q = f.arc(0).hours.at(-1);
  f.tap(q.x + 6, q.y - 8);
  assert.equal(f.c.armed, null, 'ring, arc, beads, tick and hint leave');
  assert.equal(f.p.state.mode, 'playing', 'the existing release');
  assert.equal(f.hint.textContent, '');
  assert.equal(f.svg.style.display, 'none');
});

test('horizon or a cloud off the arc steps one local day and stays armed; stops at the last forecast day', async () => {
  const f = await setup({ clouds: [{ left: 20, top: 100, right: 80, bottom: 130 }] });
  f.tap(f.hand.x, f.hand.y);
  f.tap(40, HORIZON_Y);
  assert.equal(f.c.armed.day, 1);
  assert.equal(f.p.state.chosen, Date.UTC(2026, 10, 2, 11), 'a ghost at the same clock hour tomorrow');
  assert.equal(f.p.state.mode, 'live', 'does not play');
  assert.equal(f.p.state.at, null, 'the live sky does not move');
  f.tap(50, 115);
  assert.equal(f.c.armed.day, 2, 'an off-arc cloud steps too');
  f.tap(40, HORIZON_Y); f.tap(40, HORIZON_Y); f.tap(40, HORIZON_Y);
  assert.ok(localDayStart(NOW + f.c.armed.day * DAY, 'Europe/Stockholm') <= LAST);
  assert.ok(localDayStart(NOW + (f.c.armed.day + 1) * DAY, 'Europe/Stockholm') > LAST, 'stops at the last forecast day');
  assert.ok(f.p.state.chosen <= LAST);
  // Then an arc tap on that day plays an hour on it.
  const f2 = await setup();
  f2.tap(f2.hand.x, f2.hand.y); f2.tap(40, HORIZON_Y);
  const q = f2.arc(1).hours[2];
  f2.tap(q.x, q.y);
  assert.equal(f2.p.state.mode, 'playing');
});

test('a cloud hiding the hand is the hand: day 0 disarms and nothing plays; a later day plays its clock hour', async () => {
  const f = await setup({ clouds: [] });
  const hidden = { left: f.hand.x - 60, right: f.hand.x + 60, top: f.hand.y - 30, bottom: f.hand.y + 30 };
  f.tap(f.hand.x, f.hand.y);
  f.tap(40, HORIZON_Y);
  const g = await setup({ clouds: [hidden] });
  g.tap(g.hand.x + 50, g.hand.y + 20); // the cloud, not the disc
  assert.ok(g.c.armed);
  g.tap(g.hand.x + 50, g.hand.y + 20);
  assert.equal(g.c.armed, null);
  assert.equal(g.p.state.mode, 'live', 'still now: disarms, nothing plays');
  // Day 1 then the hand: the same clock hour tomorrow plays.
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.p.state.mode, 'playing');
});

test('empty ground lets go; hours before now do nothing and the arm stays', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  const past = f.arc(0);
  assert.ok(past.rest.length, 'this morning is behind');
  const morning = past.rest.find(q => q.y < HORIZON_Y - 60 && Math.hypot(q.x - f.hand.x, q.y - f.hand.y) > 60);
  f.tap(morning.x, morning.y);
  assert.ok(f.c.armed, 'an hour before now: nothing, the arm stays');
  f.tap(200, 800);
  assert.equal(f.c.armed, null);
  assert.equal(f.p.state.mode, 'live');
  assert.equal(f.svg.style.display, 'none');
});

test('wildlife wins a shared tap: a bird on the hand never arms, places or cancels', async () => {
  let bird = true;
  const f = await setup({ animalAt: () => bird });
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.c.armed, null, 'does not arm');
  assert.deepEqual(f.routed, ['wildlife'], 'the bird gets the tap');
  bird = false; f.tap(f.hand.x, f.hand.y); bird = true;
  const q = f.arc(0).hours[0];
  f.tap(q.x, q.y);
  assert.ok(f.c.armed, 'does not place');
  assert.equal(f.p.state.mode, 'live');
  f.tap(200, 800);
  assert.ok(f.c.armed, 'does not cancel');
});

test('sheet open: a press on the hand, horizon or cloud only closes the sheet; the arm waits underneath', async () => {
  const f = await setup();
  document.body.dataset.menu = 'open';
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.c.armed, null, 'never arms with the sheet open');
  assert.deepEqual(f.routed.splice(0), ['landscape']);
  assert.equal(document.body.dataset.menu, 'closed');
  f.tap(f.hand.x, f.hand.y);
  assert.ok(f.c.armed);
  document.body.dataset.menu = 'open'; // opening settings does not disarm
  f.tap(200, 800);
  assert.ok(f.c.armed, 'the empty-ground tap only closed the sheet');
  assert.equal(document.body.dataset.menu, 'closed');
  f.tap(200, 800);
  assert.equal(f.c.armed, null, 'the next one lets go');
});

test('during a journey a tap does not arm; a fine pointer never takes the tap path; a finger slide never scrubs', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  f.tap(...(q => [q.x, q.y])(f.arc(0).hours.at(-1)));
  assert.equal(f.p.state.mode, 'playing');
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.c.armed, null);
  const g = await setup();
  g.tap(g.hand.x, g.hand.y, 'mouse');
  assert.equal(g.c.armed, null, 'a click is not the phone tap path');
  // A finger pressing the hand and sliding along the path: no time moves.
  let stamp = 0;
  const ev = (x, y) => ({ pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true, clientX: x, clientY: y, timeStamp: (stamp += 50) });
  g.button.fire('pointerdown', ev(g.hand.x, g.hand.y));
  for (let i = 1; i < 8; i++) g.button.fire('pointermove', ev(g.hand.x + i * 15, g.hand.y + i * 4));
  g.button.fire('pointerup', ev(g.hand.x + 105, g.hand.y + 28));
  assert.equal(g.p.state.chosen, null);
  assert.equal(g.p.state.mode, 'live');
  assert.equal(g.c.armed, null);
  // A finger tap on the hand button itself is the same tap path.
  g.button.fire('pointerdown', ev(g.hand.x, g.hand.y));
  g.button.fire('pointerup', ev(g.hand.x + 2, g.hand.y));
  assert.ok(g.c.armed);
});

test('both bodies up: the sun is the hand and its own path is the arc', async () => {
  let t = Date.UTC(2026, 10, 1, 14, 0);
  while (!(solarElevationAt(STOCKHOLM, t) <= 0 && solarElevationAt(STOCKHOLM, t) > SUNRISE_ELEVATION)) t += 60000;
  assert.ok(elevationOf(STOCKHOLM, t, 'moon') > SUNRISE_ELEVATION && elevationOf(STOCKHOLM, t, 'sun') > SUNRISE_ELEVATION, 'both up');
  assert.equal(handBody(solarElevationAt(STOCKHOLM, t)), 'sun');
  const f = await setup({ at: t });
  assert.equal(f.hand.body, 'sun');
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.c.armed.body, 'sun');
  assert.equal(classifyTap({ x: f.hand.x, y: f.hand.y, armed: false, hand: f.hand, horizonY: HORIZON_Y }).type, 'arm');
});

test('the landscape layer refuses text selection; the settings sheet is left alone', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/#scene\s*\{([^}]*)\}/g).join(' ');
  for (const decl of ['user-select: none', '-webkit-user-select: none', '-webkit-touch-callout: none', 'touch-action: none']) assert.ok(rule.includes(decl), decl);
  const menu = css.match(/\.menu\s*\{[^}]*\}/g).join(' ');
  assert.doesNotMatch(menu, /touch-action: none|user-select: none/);
  assert.match(css, /@media \(pointer: coarse\) \{ \.celestial-hand \{ pointer-events: none; \} \}/);
});

test('the hint is paint and names only the hand', () => {
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  assert.match(app, /hintEl\.setAttribute\('aria-hidden', 'true'\)/);
  const src = readFileSync(new URL('../src/app/celestialControl.js', import.meta.url), 'utf8');
  assert.match(src, /`Tap the \$\{breath\.body\}`/);
  assert.doesNotMatch(src, /Tap the (horizon|cloud)/);
});
