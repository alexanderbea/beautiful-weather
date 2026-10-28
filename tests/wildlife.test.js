import test from 'node:test';
import assert from 'node:assert/strict';
import { waterContains, createWaterWildlife, bindWildlifeInput } from '../src/engine/wildlife.js';
import { createAmbient } from '../src/engine/ambient.js';
const water = { width: 800, shore: 500, alpha: 1, bottom: x => x < 400 ? 540 : 490 };
const env = { width: 800, height: 600, reducedMotion: false, ambient: {}, solarElevation: 0,
  condition: 'clear', season: 'summer', wind: 2, sun: { x: 500 }, moon: { x: 200 }, dayMix: .5 };

test('water rejects sky, occluding hills, missing/faded water and out-of-viewport coordinates', () => {
  assert.ok(waterContains(water, 100, 520));
  for (const [x, y] of [[100, 499], [100, 540], [500, 510], [-1, 520], [801, 520], [NaN, 520]]) assert.equal(waterContains(water, x, y), false);
  assert.equal(waterContains(null, 100, 520), false);
  assert.equal(waterContains({ ...water, alpha: .01 }, 100, 520), false);
});

test('fish reactions have a cooldown, bounded effects, expire and reset fully', () => {
  const life = createWaterWildlife(() => .2); life.setWater(water); life.update(.01, env);
  assert.equal(life.interact(500, 510), false);
  assert.equal(life.interact(100, 520), true);
  for (let i = 0; i < 100; i++) assert.equal(life.interact(100, 520), false);
  for (let i = 0; i < 60; i++) { life.update(.1, env); life.interact(100, 520); assert.ok(life.state.ripples.length <= 3); }
  life.update(3, env); assert.equal(life.state.fish, null);
  life.reset(); assert.deepEqual(life.state, { fish: null, fishes: [], ripples: [], cooldown: 0 });
  assert.equal(life.interact(100, 520), false);
});

test('pause and hidden freeze clocks; reduced motion removes reactions', () => {
  for (const flag of ['paused', 'hidden']) {
    const life = createWaterWildlife(); life.setWater(water); life.update(.01, env); life.interact(100, 520);
    const before = life.state; life.update(10, { ...env, [flag]: true });
    assert.deepEqual(life.state, before); assert.equal(life.interact(100, 520), false);
  }
  const life = createWaterWildlife(); life.setWater(water); life.interact(100, 520);
  life.update(1, { ...env, reducedMotion: true }); assert.equal(life.state.fish, null);
  assert.equal(life.state.ripples.length, 0); assert.equal(life.interact(100, 520), false);
});

test('reduced-motion dusk has static birds and no tap reaction; reset discards flock', () => {
  const birds = createAmbient(); const e = { ...env, reducedMotion: true };
  birds.update(.1, e); const before = birds.state; assert.ok(before.birds > 0);
  birds.update(100, e); assert.equal(birds.state.birds, before.birds);
  assert.equal(birds.interact(100, 100, e), false);
  birds.resetBirds(); assert.equal(birds.state.birds, 0); assert.deepEqual(birds.state.birdHits, []);
});

test('passive input rejects controls, drags, cancelled gestures and cleans every listener', () => {
  const listeners = new Map(); let calls = 0;
  const target = { addEventListener(n, fn, opts) { assert.equal(opts.passive, true); listeners.set(n, fn); }, removeEventListener(n, fn) { assert.equal(listeners.get(n), fn); listeners.delete(n); } };
  const canvas = { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const dispose = bindWildlifeInput(target, canvas, () => true, () => calls++);
  const event = { pointerId: 1, button: 0, clientX: 100, clientY: 520, timeStamp: 0, target: { closest: () => null } };
  const tap = (end = {}, start = {}) => { listeners.get('pointerdown')({ ...event, ...start }); listeners.get('pointerup')({ ...event, timeStamp: 100, ...end }); };
  tap(); assert.equal(calls, 1);
  tap({ clientY: 550 }); tap({}, { target: { closest: () => ({}) } }); tap({ timeStamp: 900 });
  listeners.get('pointerdown')(event); listeners.get('pointercancel')(); listeners.get('pointerup')(event);
  assert.equal(calls, 1); dispose(); assert.equal(listeners.size, 0);
});

test('bird tap scatters then regroups, rejects rapid taps, and gust comedy is rare', (t) => {
  t.mock.method(Math, 'random', () => .5);
  const birds = createAmbient();
  const e = { ...env, theme: { sky: { mid: [120, 120, 140, 1] } }, artStyle: { id: 'japanese', params: { motion: { swayRate: 1 } } } };
  const ctx = new Proxy({}, { get: () => () => {} });
  for (let i = 0; i < 100; i++) birds.update(.1, e);
  birds.drawBirds(ctx, e);
  const b = birds.state.birdHits[0]; assert.ok(b);
  assert.equal(birds.interact(b.x, b.y, e), true);
  assert.equal(birds.interact(b.x, b.y, e), false);
  for (let i = 0; i < 41; i++) birds.update(.1, e);
  assert.equal(birds.state.scatter, 0); assert.equal(birds.state.funny, 0);
  let events = 0, wasActive = false;
  for (let i = 0; i < 2500; i++) {
    birds.update(.1, e); const active = birds.state.funny > 0;
    if (active && !wasActive) events++;
    wasActive = active;
    assert.ok(birds.state.birds <= 7);
  }
  assert.ok(events >= 1 && events <= 3);
});

test('automatic fish finds narrow usable water within 26 seconds even with adverse random input', () => {
  for (const width of [390, 1440]) {
    const life = createWaterWildlife(() => .999);
    const pocket = { width, shore: 500, alpha: 1, bottom: x => x > 40 && x < 100 ? 530 : 490 };
    life.setWater(pocket);
    let jumped = false;
    for (let i = 0; i < 260; i++) {
      life.update(.1, env);
      if (life.state.fish) { jumped = true; assert.ok(waterContains(pocket, life.state.fish.x, life.state.fish.y)); }
    }
    assert.ok(jumped);
  }
});

test('day and night flocks enter phone and desktop view within 60 seconds', t => {
  t.mock.method(Math, 'random', () => .5);
  const ctx = new Proxy({}, { get: () => () => {} });
  for (const width of [390, 1440]) for (const solarElevation of [-18, 30]) for (const condition of ['clear', 'clouds', 'wind', 'fog', 'rain', 'snow']) {
    const birds = createAmbient();
    const e = { ...env, width, solarElevation, condition, dayMix: solarElevation > 0 ? 1 : 0,
      theme: { sky: { mid: [100, 100, 100, 1] } }, artStyle: { id: 'ghibli', params: { motion: { swayRate: 1 } } } };
    let visible = false;
    for (let i = 0; i < 600; i++) {
      birds.update(.1, e); birds.drawBirds(ctx, e);
      visible ||= birds.state.birdHits.some(b => b.x > 25 && b.x < width - 25);
    }
    assert.ok(visible);
  }
});


test('water tap overlaps an automatic fish without restarting its arc; both bodies draw and land independently', () => {
  const life = createWaterWildlife(() => .2);
  life.setWater(water);
  life.update(13, env);
  life.update(.4, env);
  const automatic = life.state.fish;
  assert.ok(automatic);
  assert.equal(life.interact(300, 520), true);
  assert.deepEqual(life.state.fishes, [automatic, { x: 300, y: 520, age: 0, dir: -1 }]);
  assert.ok(life.state.ripples.some(r => r.x === 300 && r.age === 0));
  assert.equal(life.interact(200, 520), false);
  life.update(.5, env);
  const bodies = [];
  const ctx = new Proxy({}, { get: (_, key) => key === 'translate' ? (x, y) => bodies.push({ x, y }) : () => {} });
  life.draw(ctx, { ...env, artStyle: { id: 'ghibli' } });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].x, automatic.x);
  assert.ok(bodies[0].y < automatic.y - 40);
  assert.equal(bodies[1].x, 300);
  assert.ok(bodies[1].y < 520 - 30);
  life.update(.91, env);
  assert.equal(life.state.fishes.length, 1);
  assert.equal(life.state.fish.x, 300);
  assert.ok(life.state.ripples.some(r => r.x === automatic.x && r.age === 0));
  life.update(.4, env);
  assert.equal(life.state.fishes.length, 0);
  assert.equal(life.interact(100, 520), true);
  assert.equal(life.state.fishes.length, 1);
});

test('overlapping fish freeze together and clear on reset, reduced motion or disabled water', () => {
  for (const mode of ['reset', 'reducedMotion', 'water']) {
    const life = createWaterWildlife(() => .2);
    life.setWater(water); life.update(13, env); life.interact(300, 520);
    const before = life.state;
    assert.equal(before.fishes.length, 2);
    life.update(10, { ...env, paused: true });
    assert.deepEqual(life.state, before);
    if (mode === 'reset') life.reset();
    else life.update(.1, { ...env, reducedMotion: mode === 'reducedMotion', ambient: { water: mode !== 'water' } });
    assert.deepEqual(life.state.fishes, []);
    assert.deepEqual(life.state.ripples, []);
  }
});
