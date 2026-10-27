import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/engine.js';
import { solarElevationAt } from '../src/data/model.js';

// Exercise the real engine/scene/ambient update and render path, with only the
// browser surface and frame clock replaced. No wildlife implementation is mocked.
test('successive solar minute updates preserve flocks and allow a complete gust', t => {
  t.mock.method(Math, 'random', () => .5);
  const noop = () => {};
  const ctx = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' || key === 'createRadialGradient'
    ? () => ({ addColorStop: noop }) : noop });
  const canvas = () => ({ style: {}, getContext: () => ctx });
  const events = { addEventListener: noop, removeEventListener: noop };
  const globals = {
    window: { ...events, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location: { search: '' } },
    document: { ...events, hidden: false, documentElement: events, createElement: canvas },
    Path2D: class { moveTo() {} lineTo() {} closePath() {} rect() {} },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: noop,
  };
  let frame, now = performance.now();
  const restore = [];
  let engine;
  t.after(() => { engine?.destroy(); for (const fn of restore) fn(); });
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restore.push(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  engine = createEngine(canvas());
  const location = { lat: 25, lng: 40.7 };
  const epoch = Date.parse('2026-10-27T14:27:00Z');
  const weather = seconds => ({ scene: 'live', condition: 'clear', location,
    solarElevation: solarElevationAt(location, epoch + seconds * 1000) });
  engine.setWeather(weather(0), { immediate: true });
  engine.start();
  let started = false, completed = false, occupiedRefreshes = 0;
  for (let step = 1; step <= 2400; step++) {
    now += 100; frame(now);
    const ambient = engine.state.ambient;
    if (ambient.funny > 0) started = true;
    else if (started) completed = true;
    if (step % 600 === 0) {
      const before = engine.state;
      engine.setWeather(weather(step / 10));
      assert.deepEqual(engine.state.ambient, before.ambient, 'solar retarget must preserve active flock and reactions');
      assert.deepEqual(engine.state.wildlife, before.wildlife, 'solar retarget must preserve water reactions');
      if (before.ambient.birds) occupiedRefreshes++;
    }
  }
  assert.ok(occupiedRefreshes >= 2, 'exercise minute refreshes with a flock present');
  assert.ok(started && completed, 'gust must start and finish despite successive minute refreshes');
  engine.setWeather({ ...weather(240), solarElevation: -10 });
  for (let i = 0; i < 200; i++) { now += 100; frame(now); }
  assert.ok(engine.state.ambient.birdGate < .01, 'leaving dusk fades birds');
  assert.deepEqual(engine.state.ambient.birdHits, [], 'faded birds cannot be tapped');
  engine.setWeather({ ...weather(240), scene: 'eclipse' });
  assert.equal(engine.state.ambient.birds, 0, 'real scene change resets flock');
  assert.deepEqual(engine.state.wildlife.ripples, []);
});
