import test from 'node:test';
import assert from 'node:assert/strict';
import { drawEclipse } from '../src/engine/eclipse.js';
import { sceneWeather } from '../src/app/atmosphere.js';
import { STYLE_DEFS, STYLE_PARAMS } from '../src/engine/styles/index.js';
import { deepMerge } from '../src/engine/themes.js';

// Record actual canvas operations, including gradient stops and property writes.
function render(env) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, key) => (...args) => {
      calls.push([key, ...args]);
      if (key === 'createRadialGradient') return {
        addColorStop: (...stop) => calls.push(['addColorStop', ...stop]),
      };
    },
    set: (_, key, value) => { calls.push([key, typeof value === 'object' ? 'gradient' : value]); return true; },
  });
  drawEclipse(ctx, env);
  return calls;
}

for (const style of STYLE_DEFS) {
  test(`eclipse ${style.id}: reduced motion keeps totality and corona static`, () => {
    const env = { width: 390, height: 844, reducedMotion: true,
      artStyle: { params: deepMerge(STYLE_PARAMS, style.params) } };
    const initial = render({ ...env, time: 0 });
    assert.deepEqual(render({ ...env, time: 123 }), initial);
    assert.deepEqual(render({ ...env, reducedMotion: false, time: 123 }), initial);
    assert.equal(initial[0][0], 'save');
    assert.equal(initial.at(-1)[0], 'restore');
    assert.equal(initial.filter(([op]) => op === 'arc').length, 1);
    const arc = initial.find(([op]) => op === 'arc');
    assert.equal(arc[1], 390 * .72);
    assert.equal(arc[2], 844 * .25);
    assert.ok(arc[3] > 0);
    assert.ok(initial.some(([op, value]) => op === 'fillStyle' && value === '#080b12'));
  });
}

test('eclipse preserves frozen city/readings and restores the latest live snapshot', () => {
  const live = Object.freeze({ condition: 'rain', isDay: true, solarElevation: 30,
    temperatureC: 12, windSpeed: 4, humidity: 80, observedAt: 123,
    location: Object.freeze({ name: 'London', lat: 51.5, lng: -.12 }) });
  const eclipse = sceneWeather(live, 'eclipse');
  for (const key of ['temperatureC', 'windSpeed', 'humidity', 'observedAt', 'location']) {
    assert.deepEqual(eclipse[key], live[key]);
  }
  assert.equal(eclipse.solarElevation, -18);
  assert.equal(eclipse.sunRising, false);
  const updated = { ...live, temperatureC: 13, condition: 'clouds' };
  assert.deepEqual(sceneWeather(updated, 'live'), { ...updated, scene: 'live' });
  assert.equal(live.condition, 'rain');
});
