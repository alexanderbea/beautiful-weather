import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOUR, DAY, bounds, clampTime, duration, keyTime, readingAt, createPlayback, snapHour, dragHours } from '../src/app/playback.js';
import { bodyAt, handBody, elevationY } from '../src/engine/celestial.js';
import { routeTap } from '../src/engine/wildlife.js';
import { solarElevationAt } from '../src/data/model.js';

const STOCKHOLM = { lat: 59.3293, lng: 18.0686, name: 'Stockholm', country: 'SE' };
const NOW = Date.UTC(2026, 10, 1, 11, 15); // 12:15 in Stockholm, sun up (~ +11 deg)
const START = Date.UTC(2026, 10, 1, 0);
const CONDITIONS = ['clear', 'clouds', 'rain', 'snow'];
const rows = (patch = {}) => Array.from({ length: 72 }, (_, i) => ({
  time: START + i * HOUR, condition: CONDITIONS[i % 4], temperatureC: i, feelsLikeC: i - 2, windSpeed: 1 + i / 10, ...patch[i],
}));
const liveWith = forecast => ({ condition: 'clear', temperatureC: 9, feelsLikeC: 7, windSpeed: 2, location: STOCKHOLM, forecast });
const LIVE = liveWith(rows());
const LAST = START + 71 * HOUR;

function setup({ reduced = false, live = LIVE, now = () => NOW } = {}) {
  let tick = null, frames = 0;
  const states = [];
  const p = createPlayback({ getLive: () => live, now, reduced: () => reduced,
    onChange: s => states.push(s), requestFrame: f => { tick = f; frames++; return frames; }, cancelFrame: () => { tick = null; } });
  return { p, states, get frames() { return frames; }, tick: t => { const f = tick; tick = null; f?.(t); },
    get state() { return p.state; } };
}

test('range: never earlier than now, never past the last forecast hour', () => {
  const b = bounds(LIVE.forecast, NOW);
  assert.deepEqual(b, { min: NOW, max: LAST });
  assert.equal(clampTime(NOW - DAY, b), NOW);
  assert.equal(clampTime(LAST + DAY, b), LAST);
  assert.deepEqual(bounds([], NOW), { min: NOW, max: NOW });
  assert.equal(snapHour(NOW + 10 * 60000, b), NOW, 'near now snaps to now itself');
  assert.equal(snapHour(NOW + 50 * 60000, b), Date.UTC(2026, 10, 1, 12));
});

test('keyboard: hour and day steps; before now and after the last hour do nothing', () => {
  const b = { min: NOW, max: LAST };
  assert.equal(keyTime('ArrowRight', false, NOW, b), Date.UTC(2026, 10, 1, 12));
  assert.equal(keyTime('ArrowUp', false, NOW, b), Date.UTC(2026, 10, 1, 12));
  assert.equal(keyTime('ArrowLeft', false, NOW, b), null);
  assert.equal(keyTime('ArrowDown', false, NOW, b), null);
  assert.equal(keyTime('ArrowRight', true, NOW, b), Date.UTC(2026, 10, 2, 11));
  assert.equal(keyTime('ArrowLeft', true, Date.UTC(2026, 10, 2, 11), b), NOW, 'a day back stops at now');
  assert.equal(keyTime('ArrowRight', false, LAST, b), null);
  assert.equal(keyTime('Enter', false, NOW, b), null);
  const f = setup();
  assert.equal(f.p.key('ArrowLeft', false), true, 'handled but inert');
  assert.equal(f.state.chosen, null);
  f.p.key('ArrowRight', false); f.p.key('ArrowRight', false);
  assert.equal(f.state.chosen, Date.UTC(2026, 10, 1, 13));
  assert.equal(f.state.at, null, 'arrows move the ghost; the live sky stays');
  f.p.key('ArrowLeft', false); f.p.key('ArrowLeft', false);
  assert.equal(f.state.chosen, NOW);
  f.p.commit();
  assert.equal(f.state.mode, 'live', 'Enter on now plays nothing');
});

test('pace: about 6 s, 10 s, 14 s, never over 16 s; reduced motion and return', () => {
  assert.equal(duration(0, 5 * HOUR), 6000);
  assert.equal(duration(0, 24 * HOUR), 10000);
  assert.equal(duration(0, 70 * HOUR), 14000);
  for (const h of [1, 6, 23, 48, 71, 500]) assert.ok(duration(0, h * HOUR) <= 16000);
  assert.equal(duration(0, 40 * HOUR, true), 0);
  assert.equal(duration(0, 40 * HOUR, false, true), 2500);
});

test('readings crossfade between hourly samples instead of cutting on the hour', () => {
  const t = Date.UTC(2026, 10, 1, 13, 30); // between 13:00 (clouds) and 14:00 (rain)
  const r = readingAt(LIVE, t, NOW);
  assert.equal(r.missing, false);
  assert.equal(r.weather.sceneCondition, 'clouds');
  assert.equal(r.nextCondition, 'rain');
  assert.ok(Math.abs(r.mix - 0.5) < 1e-9);
  assert.ok(Math.abs(r.weather.temperatureC - 13.5) < 1e-9);
  assert.equal(readingAt(LIVE, Date.UTC(2026, 10, 1, 14), NOW).weather.condition, 'rain');
  assert.equal(readingAt(LIVE, NOW, NOW).weather, LIVE, 'now is the live reading');
  // From now, the first leg fades from the live reading into the next hour.
  const first = readingAt(LIVE, NOW + 15 * 60000, NOW);
  assert.equal(first.weather.sceneCondition, 'clear');
  assert.ok(first.mix > 0 && first.mix < 1);
  assert.notEqual(readingAt(LIVE, t, NOW).weather.solarElevation, readingAt(LIVE, t + HOUR, NOW).weather.solarElevation);
});

test('a missing hour keeps time moving, holds the last honest sky and reads "No reading"', () => {
  const live = liveWith(rows({ 14: { condition: null, temperatureC: null }, 15: { condition: null, temperatureC: null } }));
  const gap = readingAt(live, Date.UTC(2026, 10, 1, 14, 20), NOW);
  assert.equal(gap.missing, true);
  assert.equal(gap.weather.temperatureC, null, 'no invented temperature');
  assert.equal(gap.weather.sceneCondition, 'clouds', 'holds 13:00');
  assert.equal(gap.mix, 0);
  const later = readingAt(live, Date.UTC(2026, 10, 1, 15, 30), NOW);
  assert.equal(later.missing, true);
  assert.equal(later.weather.sceneCondition, 'clouds');
  assert.equal(later.nextCondition, 'clear', 'fades into 16:00 over its last hour');
  assert.ok(later.mix > 0);
  assert.notEqual(gap.weather.solarElevation, later.weather.solarElevation, 'daylight still advances');
  const hole = liveWith(rows().filter((_, i) => i !== 14));
  assert.equal(readingAt(hole, Date.UTC(2026, 10, 1, 14, 10), NOW).missing, true, 'an absent row is missing too');
  // The sequence does not freeze across the gap.
  const f = setup({ live });
  f.p.select(Date.UTC(2026, 10, 1, 17)); f.p.commit();
  const seen = [];
  for (let ms = 0; ms <= 6000; ms += 250) { f.tick(ms); if (f.state.at) seen.push(f.state.at); }
  assert.ok(seen.some(t => readingAt(live, t, NOW).missing), 'passes through the gap');
  assert.ok(seen.every((t, i) => i === 0 || t >= seen[i - 1]), 'playhead never stalls backwards');
  assert.equal(f.state.mode, 'held');
  assert.equal(f.state.at, Date.UTC(2026, 10, 1, 17));
});

test('choosing never moves the sky; release plays through every intermediate hour and holds', () => {
  const f = setup();
  const target = Date.UTC(2026, 10, 1, 16);
  f.p.select(target);
  assert.equal(f.state.chosen, target);
  assert.equal(f.state.at, null);
  assert.equal(f.state.mode, 'live');
  f.p.commit();
  assert.equal(f.state.mode, 'playing');
  assert.equal(f.state.chosen, null, 'the ghost leaves on release');
  const ats = [];
  for (let ms = 0; ms <= 6000; ms += 100) { f.tick(ms); ats.push(f.state.at); }
  const hours = new Set(ats.filter(Boolean).map(t => Math.floor(t / HOUR)));
  for (let h = Math.floor(NOW / HOUR); h < target / HOUR; h++) assert.ok(hours.has(h), `visits hour ${h}`);
  const conds = ats.filter(t => t && t < target).map(t => readingAt(LIVE, t, NOW).weather.sceneCondition);
  assert.ok(['clouds', 'rain', 'snow'].every(c => conds.includes(c)), 'intermediate weather plays');
  // Ease in and out: slow at both ends.
  assert.ok(ats[1] - ats[0] < ats[31] - ats[30]);
  assert.equal(f.state.mode, 'held');
  assert.equal(f.state.at, target);
  assert.equal(f.state.progress, 0);
  assert.equal(f.p.select(target + HOUR), true, 'a drag may start again while holding');
});

test('during the journey a new choice does not take', () => {
  const f = setup();
  f.p.select(NOW + 5 * HOUR); f.p.commit(); f.tick(0); f.tick(1000);
  assert.equal(f.p.select(NOW + 9 * HOUR), false);
  assert.equal(f.p.key('ArrowRight', false), false);
  assert.equal(f.state.chosen, null);
});

test('Escape cancels: the ghost leaves and nothing plays', () => {
  const f = setup();
  f.p.select(NOW + 3 * HOUR); f.p.cancel(); f.p.commit();
  assert.equal(f.state.mode, 'live');
  assert.equal(f.frames, 0);
});

test('reduced motion lands at once and cuts back to now', () => {
  const f = setup({ reduced: true });
  f.p.select(Date.UTC(2026, 10, 2, 9)); f.p.commit();
  assert.equal(f.state.mode, 'held');
  assert.equal(f.state.at, Date.UTC(2026, 10, 2, 9));
  assert.equal(f.frames, 0, 'no travel frames');
  f.p.now();
  assert.equal(f.state.mode, 'live');
  assert.equal(f.state.at, null);
});

test('Now eases back to live over about 2.5 s, then leaves', () => {
  const f = setup();
  f.p.select(NOW + 3 * HOUR); f.p.commit();
  for (let ms = 0; ms <= 6000; ms += 500) f.tick(ms);
  assert.equal(f.state.mode, 'held');
  f.p.now();
  assert.equal(f.state.mode, 'playing');
  assert.equal(f.state.returning, true);
  f.tick(10000); f.tick(11250);
  assert.ok(f.state.at < NOW + 3 * HOUR && f.state.at > NOW);
  f.tick(12500);
  assert.equal(f.state.mode, 'live');
  assert.equal(f.state.at, null);
  // Choosing now while holding is the same return.
  const g = setup({ reduced: true });
  g.p.select(NOW + 2 * HOUR); g.p.commit(); g.p.select(NOW); g.p.commit();
  assert.equal(g.state.mode, 'live');
});

test('drag: slow steps one hour at a time, fast covers more', () => {
  assert.equal(Math.round(dragHours(28, 10, 0.2)), 1);
  assert.ok(dragHours(28, 10, 3) > 3);
  assert.ok(dragHours(-28, 10, 0.2) < 0);
});

test('celestial path: the scene height mapping, latitude matters, the sun wins when up', () => {
  const at = Date.UTC(2026, 5, 21, 10);
  const p = bodyAt(STOCKHOLM, at, 390, 844);
  assert.equal(p.body, 'sun');
  assert.equal(p.y, 844 * elevationY(solarElevationAt(STOCKHOLM, at)));
  assert.notEqual(bodyAt({ lat: 0, lng: 18 }, Date.UTC(2026, 5, 21, 5), 390, 844).y, bodyAt(STOCKHOLM, Date.UTC(2026, 5, 21, 5), 390, 844).y);
  assert.equal(bodyAt(STOCKHOLM, Date.UTC(2026, 10, 1, 22), 390, 844).body, 'moon');
  // Right at sunset both bodies are just up: the sun is the hand.
  assert.equal(handBody(-0.5), 'sun');
  assert.equal(handBody(-1), 'moon');
  // One circuit a day: same place 24 h later (the date advances on the same path).
  const a = bodyAt(STOCKHOLM, NOW, 390, 844), b = bodyAt(STOCKHOLM, NOW + DAY, 390, 844);
  assert.ok(Math.abs(a.x - b.x) < 1);
});

test('settings sheet tap rules: animals win, landscape closes, closed sheet keeps wildlife', () => {
  const log = [];
  const handlers = hit => ({ interactAnimal: () => { log.push('animal?'); return hit; }, interact: () => log.push('wildlife'), landscapeTap: () => log.push('close') });
  assert.equal(routeTap(true, 1, 1, handlers(true)), 'animal');
  assert.deepEqual(log.splice(0), ['animal?'], 'bird/fish tap leaves the sheet open');
  assert.equal(routeTap(true, 1, 1, handlers(false)), 'landscape');
  assert.deepEqual(log.splice(0), ['animal?', 'close'], 'empty water closes the sheet and throws no fish');
  assert.equal(routeTap(false, 1, 1, handlers(false)), 'wildlife');
  assert.deepEqual(log.splice(0), ['wildlife'], 'sheet closed: open water still throws a fish');
});

// --- The hand in a minimal DOM: the gesture split -----------------------------------------------
function fakeEl(tag) {
  const listeners = {};
  const el = { tag, style: {}, dataset: {}, attrs: {}, hidden: false, children: [],
    classList: { set: new Set(), add(c) { this.set.add(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); } },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute(k) { return el.attrs[k]; },
    addEventListener(n, f) { (listeners[n] ??= []).push(f); },
    fire(n, e = {}) { for (const f of listeners[n] ?? []) f({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...e }); },
    append(...c) { el.children.push(...c); }, setPointerCapture() {},
    set innerHTML(v) { el.children = [...v.matchAll(/<(\w+)/g)].map(m => fakeEl(m[1])); } };
  return el;
}
async function handSetup({ animalAt = () => false, live = LIVE } = {}) {
  const docListeners = {};
  globalThis.document = { createElement: fakeEl, createElementNS: (_, t) => fakeEl(t), body: fakeEl('body'),
    addEventListener: (n, f) => { (docListeners[n] ??= []).push(f); } };
  globalThis.window = globalThis;
  Object.assign(globalThis, { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: false }), addEventListener() {} });
  const { createCelestialControl } = await import('../src/app/celestialControl.js');
  const f = setup({ live });
  const p = bodyAt(STOCKHOLM, NOW, 390, 844);
  const taps = [];
  const engine = { celestial: { ...p, r: 19.5, alpha: 1 }, animalContains: animalAt, tapAt: (x, y) => taps.push([x, y]) };
  const c = createCelestialControl({ engine, playback: f.p, getLive: () => live });
  c.render();
  const hand = document.body.children.find(e => e.tag === 'button');
  const svg = document.body.children.find(e => e.tag === 'svg');
  const q = bodyAt(STOCKHOLM, NOW + HOUR / 4, 390, 844);
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  let stamp = 0;
  const ev = (x, y) => ({ pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, timeStamp: (stamp += 120) });
  const drag = (steps, px = 14) => {
    hand.fire('pointerdown', ev(p.x, p.y));
    for (let i = 1; i <= steps; i++) hand.fire('pointermove', ev(p.x + dir.x * px * i, p.y + dir.y * px * i));
    return ev(p.x + dir.x * px * steps, p.y + dir.y * px * steps);
  };
  const escape = () => { for (const fn of docListeners.keydown ?? []) fn({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} }); };
  return { f, hand, svg, taps, drag, ev, p, escape };
}

test('hand: at rest no ring or arc; a hit target of at least 44 px with a real accessible name', async () => {
  const { hand, svg } = await handSetup();
  assert.equal(svg.style.display, 'none');
  assert.match(hand.style.cssText, /width:(4[4-9]|[5-9]\d)/);
  assert.equal(hand.getAttribute('aria-label'), 'Forecast. Sunday 1 November, 12:15. Drag the sun to a later hour.');
});

test('hand: a drag chooses, the sky waits for release, release plays', async () => {
  const { f, hand, svg, taps, drag } = await handSetup();
  const end = drag(6);
  assert.equal(svg.style.display, '', 'ring and arc while the pointer is down');
  assert.equal(document.body.dataset.selecting, 'true', 'readout drops to the quieter tone');
  assert.ok(f.state.chosen > NOW, 'the ghost moved to a later hour');
  assert.equal(f.state.chosen % HOUR, 0, 'snaps to forecast hours');
  assert.equal(f.state.at, null, 'the live sky stays on now');
  assert.match(hand.getAttribute('aria-label'), /:00\. Drag the (sun|moon)/);
  hand.fire('pointerup', end);
  assert.equal(f.state.mode, 'playing');
  assert.equal(taps.length, 0);
  assert.equal(svg.style.display, 'none', 'ring, arc and ghost clear on release');
  assert.equal(hand.getAttribute('aria-disabled'), 'true', 'no new drag during the journey');
});

test('hand: a press that does not travel is a tap and never chooses an hour', async () => {
  const { f, hand, taps, ev, p } = await handSetup();
  hand.fire('pointerdown', ev(p.x, p.y));
  hand.fire('pointermove', ev(p.x + 3, p.y + 2));
  hand.fire('pointerup', ev(p.x + 3, p.y + 2));
  assert.equal(taps.length, 1, 'routed like a landscape tap (closes an open sheet)');
  assert.equal(f.state.chosen, null);
  assert.equal(f.state.mode, 'live');
});

test('hand: a drag that starts on a bird or fish does not move time', async () => {
  const { f, hand, taps, drag } = await handSetup({ animalAt: () => true });
  hand.fire('pointerup', drag(6));
  assert.equal(f.state.chosen, null);
  assert.equal(f.state.mode, 'live');
  assert.equal(taps.length, 0);
});

test('hand: Escape while the pointer is down clears everything and nothing plays', async () => {
  const { f, hand, svg, drag, escape } = await handSetup();
  const end = drag(6);
  escape();
  assert.equal(f.state.chosen, null);
  hand.fire('pointerup', end);
  assert.equal(f.state.mode, 'live');
  assert.equal(svg.style.display, 'none');
});

test('hand: dragging earlier than now does nothing; releasing on now plays nothing', async () => {
  const { f, hand, drag } = await handSetup();
  hand.fire('pointerup', drag(6, -14));
  assert.equal(f.state.mode, 'live');
  assert.ok(f.state.chosen === null);
});

test('hand: keyboard moves the ghost, Enter plays, Escape cancels', async () => {
  const { f, hand } = await handSetup();
  const key = (k, shiftKey = false) => hand.fire('keydown', { key: k, shiftKey });
  hand.fire('focus');
  key('ArrowRight'); key('ArrowRight', true);
  assert.equal(f.state.chosen, Date.UTC(2026, 10, 2, 12));
  assert.equal(hand.getAttribute('aria-label'), 'Forecast. Monday 2 November, 13:00. Drag the sun to a later hour.');
  key('Escape');
  assert.equal(f.state.chosen, null);
  key('ArrowUp'); key('Enter');
  assert.equal(f.state.mode, 'playing');
});

test('no forbidden forecast UI', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const html = read('../index.html'), app = read('../src/app/app.js'), overlay = read('../src/app/overlay.js');
  for (const src of [html, app, overlay, read('../src/app/celestialControl.js')]) {
    assert.doesNotMatch(src, /Play ahead|Back to now|hour-card|scrubber|day-row|>Play</i);
  }
  assert.doesNotMatch(overlay, /el\.date\.(?:on\w+|addEventListener|tabIndex)/, 'the time line is paint');
});
