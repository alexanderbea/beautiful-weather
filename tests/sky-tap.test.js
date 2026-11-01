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

async function setup({ at = NOW, animalAt = () => false, clouds = [], live = LIVE } = {}) {
  const docListeners = {}, winListeners = {};
  globalThis.document = { createElement: fakeEl, createElementNS: (_, t) => fakeEl(t), body: fakeEl('body'),
    addEventListener: (n, f) => { (docListeners[n] ??= []).push(f); } };
  globalThis.window = globalThis;
  Object.assign(globalThis, { innerWidth: W, innerHeight: H, matchMedia: () => ({ matches: false }),
    addEventListener: (n, f) => { (winListeners[n] ??= []).push(f); } });
  const { createCelestialControl } = await import('../src/app/celestialControl.js');
  let tick = null;
  const p = createPlayback({ getLive: () => live, now: () => at, reduced: () => false, onChange: () => c?.render(),
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
  const c = createCelestialControl({ engine, playback: p, getLive: () => live, hint });
  c.render();
  const svg = document.body.children.find(e => e.tag === 'svg');
  const button = document.body.children.find(e => e.tag === 'button');
  const tap = (x, y, pointerType = 'touch') => engine.tapAt(x, y, { pointerType });
  // A finger on the window: down, then (a still, quick press) the engine's tap, then up.
  let ids = 100;
  const fire = (n, e) => { for (const fn of winListeners[n] ?? []) fn(e); };
  const ev = (id, x, y, stamp = 0) => ({ pointerId: id, pointerType: 'touch', button: 0, isPrimary: true, clientX: x, clientY: y, timeStamp: stamp, target: {} });
  const down = (x, y) => { const id = ++ids; fire('pointerdown', ev(id, x, y)); return id; };
  const up = (id, x, y, { tap: isTap = true, ms = 100 } = {}) => { if (isTap) engine.tapAt(x, y, ev(id, x, y, ms)); fire('pointerup', ev(id, x, y, ms)); };
  const press = (x, y) => up(down(x, y), x, y);
  const escape = () => { for (const fn of docListeners.keydown ?? []) fn({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }); };
  return { p, c, svg, hint, hand, tap, down, up, press, routed, escape, button, arc: () => skyArc(STOCKHOLM, at, hand.body, W, H, { min: at, max: Math.max(...live.forecast.map(r => r.time)) }) };
}

const ZONE = 'Europe/Stockholm';
const sameDay = (a, b) => localDayStart(a, ZONE) === localDayStart(b, ZONE);

test('sky arc: about a day ahead, later today until the tick, the next day from the tick on; no beads', () => {
  const a = skyArc(STOCKHOLM, NOW, 'sun', W, H, RANGE);
  assert.equal(a.paths.length, 2, 'later today, then the next pass');
  assert.ok(a.paths.flat().every(q => q.t > NOW && q.t <= NOW + DAY), 'from now through about 24 h');
  assert.ok(a.paths[0].every(q => sameDay(q.t, NOW)), 'before the tick: later today');
  assert.ok(a.paths[1].every(q => !sameDay(q.t, NOW) && q.t > NOW), 'past the tick: the next day');
  assert.ok(a.hours.length >= 6 && a.hours.every(q => q.t % HOUR === 0 && q.t > NOW));
  assert.equal(a.beads, undefined, 'no beads');
  assert.ok(a.tick && Math.abs(a.tick.y - HORIZON_Y) < 1, 'one tick, on the horizon');
  assert.ok(Math.abs(a.tick.x - a.paths[0].at(-1).x) < 1, 'where the arc goes down through it');
  assert.equal(a.tick.t, a.paths[1].map(q => Math.ceil(q.t / HOUR) * HOUR)[0], 'the tick is the first hour of the next day');
  assert.ok(!sameDay(a.tick.t, NOW));
  // Stops early when the forecast ends.
  const short = skyArc(STOCKHOLM, NOW, 'sun', W, H, { min: NOW, max: NOW + 2 * HOUR });
  assert.ok(short.paths.flat().every(q => q.t <= NOW + 2 * HOUR));
  assert.equal(short.tick, null, 'the forecast ends before the horizon: no tick');
  const night = skyArc(STOCKHOLM, Date.UTC(2026, 10, 1, 21), 'moon', W, H, RANGE);
  assert.ok(night.hours.length > 10, 'the mirrored moon path, not a new one');
  assert.ok(night.tick && night.tick.t > night.paths[0].at(-1).t);
  assert.equal(cloudHit({ left: 10, right: 20, top: 5, bottom: 15 }).right - cloudHit({ left: 10, right: 20, top: 5, bottom: 15 }).left, 44);
});

test('first tap on the hand arms: ring, arc, one tick, no beads, "Tap ahead"; the live sky stays on now', async () => {
  const f = await setup();
  assert.equal(f.svg.style.display, 'none');
  f.tap(f.hand.x, f.hand.y);
  assert.deepEqual(f.c.armed, { body: 'sun' });
  assert.equal(f.svg.style.display, '');
  assert.ok(f.svg.classList.contains('is-armed'));
  assert.match(f.svg.children[0].getAttribute('d'), /^M[^M]+M[^M]+$/, 'the faint arc: later today, then the next day');
  assert.match(f.svg.children[1].getAttribute('d'), /^M[\d.]+,[\d.]+h12$/, 'one 12 px horizon tick');
  assert.ok(!f.svg.children.some(el => el.tag === 'circle' && /bead/.test(el.attrs.class ?? '')), 'no beads');
  assert.equal(f.svg.children.filter(el => el.tag === 'circle').length, 4, 'soft, ghost, ring, breath; nothing else');
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
  const q = f.arc().hours.find(h => sameDay(h.t, NOW) && Math.hypot(h.x - f.hand.x, h.y - f.hand.y) > 40);
  f.press(q.x + 6, q.y - 8);
  assert.equal(f.c.armed, null, 'ring, arc, tick and hint leave');
  assert.equal(f.p.state.mode, 'playing', 'the existing release');
  assert.equal(f.hint.textContent, '');
  assert.equal(f.svg.style.display, 'none');
});

test('touch down on the arc paints its hour on the time line only; release in the corridor plays it', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  const q = f.arc().hours.find(h => sameDay(h.t, NOW) && Math.hypot(h.x - f.hand.x, h.y - f.hand.y) > 40);
  const id = f.down(q.x, q.y);
  assert.equal(f.p.state.chosen, q.t, 'the time line shows the nearest future hour');
  assert.equal(f.p.state.mode, 'live', 'the live sky stays on now');
  assert.equal(f.p.state.at, null);
  assert.ok(f.c.armed);
  f.up(id, q.x + 3, q.y + 3);
  assert.equal(f.p.state.mode, 'playing');
  // A slide (not a tap) or a release outside the corridor plays nothing; the arm stays.
  const g = await setup();
  g.tap(g.hand.x, g.hand.y);
  const id2 = g.down(q.x, q.y);
  g.up(id2, q.x + 60, q.y + 40, { tap: false });
  assert.ok(g.c.armed, 'the arm stays');
  assert.equal(g.p.state.chosen, null);
  assert.equal(g.p.state.mode, 'live');
  const id3 = g.down(q.x, q.y);
  g.up(id3, 30, 760); // a release far from the corridor, on empty ground
  assert.ok(g.c.armed, 'released outside the corridor: the arm stays');
  assert.equal(g.p.state.mode, 'live');
  // A press held longer than 0.5 s is not a tap, even in the corridor.
  const id4 = g.down(q.x, q.y);
  g.up(id4, q.x, q.y, { tap: false, ms: 700 });
  assert.ok(g.c.armed);
  assert.equal(g.p.state.mode, 'live');
  assert.equal(g.p.state.chosen, null);
  // A quick slide that stays in the corridor plays the hour it went down on (the slide never moves it).
  const along = g.arc().paths[0].find(p => Math.hypot(p.x - q.x, p.y - q.y) > 12 && Math.hypot(p.x - q.x, p.y - q.y) < 30 && Math.hypot(p.x - g.hand.x, p.y - g.hand.y) > 40);
  const id5 = g.down(q.x, q.y);
  g.up(id5, along.x, along.y, { tap: false });
  assert.equal(g.p.state.mode, 'playing');
});

test('the horizon tick and the path past it play the next day; no extra tap, the arm does not wait', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  const a = f.arc();
  const id = f.down(a.tick.x, a.tick.y);
  assert.equal(f.p.state.chosen, a.tick.t, 'touch down on the tick paints the next day');
  assert.ok(!sameDay(f.p.state.chosen, NOW));
  f.up(id, a.tick.x + 2, a.tick.y);
  assert.equal(f.c.armed, null, 'one release: the arm is gone');
  assert.equal(f.p.state.mode, 'playing');
  // Past the tick: an hour on the next day's path.
  const g = await setup();
  g.tap(g.hand.x, g.hand.y);
  const q = a.hours.find(h => !sameDay(h.t, NOW) && Math.hypot(h.x - g.hand.x, h.y - g.hand.y) > 40);
  g.press(q.x, q.y);
  assert.equal(g.c.armed, null);
  assert.equal(g.p.state.mode, 'playing');
  const before = g.p.state.at;
  assert.ok(before >= NOW);
  // The journey heads for that hour on the next day.
  const h = await setup();
  h.tap(h.hand.x, h.hand.y);
  h.down(q.x, q.y);
  assert.equal(h.p.state.chosen, q.t);
  assert.ok(!sameDay(q.t, NOW), 'the next day');
});

test('the open horizon and a cloud off the arc leave the arm as it is: no day step, nothing plays', async () => {
  const off = { left: 20, top: 100, right: 80, bottom: 130 };
  const f = await setup({ clouds: [off] });
  f.tap(f.hand.x, f.hand.y);
  const a = f.arc();
  for (const [x, y] of [[20, HORIZON_Y], [40, HORIZON_Y - 18], [370, HORIZON_Y + 15], [50, 115], [50, 115], [20, HORIZON_Y]]) {
    f.press(x, y);
    assert.deepEqual(f.c.armed, { body: 'sun' }, `(${x}, ${y}) leaves the arm`);
    assert.equal(f.p.state.chosen, null, 'the date line stays on now');
    assert.equal(f.p.state.mode, 'live', 'does not play');
    assert.equal(f.p.state.at, null, 'the live sky does not move');
  }
  assert.ok(Math.abs(20 - a.tick.x) > 44, 'the open horizon is away from the tick');
});

test('a cloud on the arc is that point on the path; a cloud on the hand is the hand', async () => {
  const a = skyArc(STOCKHOLM, NOW, 'sun', W, H, RANGE);
  const q = a.hours.find(h => sameDay(h.t, NOW) && h.y > 250);
  const on = { left: q.x - 4, right: q.x + 80, top: q.y - 10, bottom: q.y + 10 }; // covers the arc; the tap is off it
  const f = await setup({ clouds: [on] });
  f.tap(f.hand.x, f.hand.y);
  const box = cloudHit(on), x = q.x + 70;
  assert.ok(a.paths.flat().some(p => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom), 'the cloud covers the arc');
  assert.ok(Math.min(...a.paths.flat().map(p => Math.hypot(p.x - x, p.y - q.y))) > 30, 'the tap itself is off the corridor');
  const id = f.down(x, q.y);
  assert.equal(f.p.state.chosen, q.t, 'touch down on the cloud paints that hour');
  f.up(id, x, q.y);
  assert.equal(f.c.armed, null);
  assert.equal(f.p.state.mode, 'playing', 'release there plays that hour');
  // A cloud over the hand is the hand: disarm, nothing plays.
  const g = await setup();
  const hidden = { left: g.hand.x - 60, right: g.hand.x + 60, top: g.hand.y - 30, bottom: g.hand.y + 30 };
  const k = await setup({ clouds: [hidden] });
  k.tap(k.hand.x + 50, k.hand.y + 20);
  assert.ok(k.c.armed);
  k.press(k.hand.x + 50, k.hand.y + 20);
  assert.equal(k.c.armed, null);
  assert.equal(k.p.state.mode, 'live', 'disarms, nothing plays');
});

test('a tap on the hand disarms; empty ground lets go; hours before now or past the forecast do nothing', async () => {
  const f = await setup();
  f.tap(f.hand.x, f.hand.y);
  f.press(f.hand.x, f.hand.y);
  assert.equal(f.c.armed, null, 'the hand: let go');
  assert.equal(f.p.state.mode, 'live', 'nothing plays');
  assert.equal(f.p.state.chosen, null);
  // A forecast that ends in 3 h: this morning (before now) and tomorrow morning (past the forecast) are inert.
  const live = { ...LIVE, forecast: rows.filter(r => r.time <= NOW + 3 * HOUR) };
  const g = await setup({ live });
  g.tap(g.hand.x, g.hand.y);
  const a = g.arc();
  assert.ok(a.rest.flat().length, 'the pass has a part that cannot be chosen');
  const morning = a.rest.flat().find(q => q.y < HORIZON_Y - 60 && Math.hypot(q.x - g.hand.x, q.y - g.hand.y) > 60
    && !a.paths.some(s => s.some(p => Math.hypot(p.x - q.x, p.y - q.y) < 30)));
  g.press(morning.x, morning.y);
  assert.ok(g.c.armed, 'before now / past the forecast: nothing, the arm stays');
  assert.equal(g.p.state.mode, 'live');
  assert.equal(g.p.state.chosen, null);
  g.press(200, 800);
  assert.equal(g.c.armed, null);
  assert.equal(g.p.state.mode, 'live');
  assert.equal(g.svg.style.display, 'none');
  // classifyTap: the path before now is inert.
  assert.equal(classifyTap({ x: 10, y: 10, armed: true, hand: { x: 300, y: 300, r: 10 }, horizonY: HORIZON_Y,
    arc: { paths: [], hours: [], tick: null, rest: [[{ x: 0, y: 10 }, { x: 40, y: 10 }]] } }).type, 'inert');
});

test('wildlife wins a shared tap: a bird on the hand never arms, places or cancels', async () => {
  let bird = true;
  const f = await setup({ animalAt: () => bird });
  f.tap(f.hand.x, f.hand.y);
  assert.equal(f.c.armed, null, 'does not arm');
  assert.deepEqual(f.routed, ['wildlife'], 'the bird gets the tap');
  bird = false; f.tap(f.hand.x, f.hand.y); bird = true;
  const q = f.arc().hours.find(h => Math.hypot(h.x - f.hand.x, h.y - f.hand.y) > 40);
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
  f.tap(...(q => [q.x, q.y])(f.arc().hours.find(h => sameDay(h.t, NOW) && Math.hypot(h.x - f.hand.x, h.y - f.hand.y) > 40)));
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
