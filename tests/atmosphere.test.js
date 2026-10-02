import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScene, sceneWeather, sceneForcesNight } from '../src/app/atmosphere.js';
const live = { condition: 'rain', isDay: true, solarElevation: 30, temperatureC: 12, location: { name: 'London' } };
test('manual selection validates and defaults to live', () => {
  assert.equal(parseScene('eclipse'), 'eclipse');
  assert.equal(parseScene('unknown'), 'live');
});
test('eclipse dims artwork without mutating live weather; reset restores it', () => {
  const scene = sceneWeather(live, 'eclipse');
  assert.equal(scene.isDay, false);
  assert.equal(scene.solarElevation, -18);
  assert.equal(sceneForcesNight('eclipse'), true);
  assert.equal(live.condition, 'rain');
  assert.equal(live.isDay, true);
  assert.deepEqual(sceneWeather(live, 'live'), { ...live, scene: 'live' });
});

import { createMeteors } from '../src/engine/meteors.js';
test('meteor selection forces night even with a daylight override, and switching restores the override', () => {
  assert.equal(parseScene('meteors'), 'meteors');
  assert.equal(sceneForcesNight('meteors'), true);
  assert.equal(sceneWeather(live, 'meteors').solarElevation, -18);
  assert.equal(sceneWeather(live, 'live').solarElevation, 30);
  assert.equal(sceneForcesNight('live'), false);
});
test('meteor clock freezes for reduced motion and resets on scene exit', () => {
  const m = createMeteors();
  m.update(1, { scene: 'meteors' });
  assert.equal(m.state.time, 1);
  m.update(1, { scene: 'meteors', reducedMotion: true });
  assert.equal(m.state.time, 1);
  m.update(1, { scene: 'eclipse' });
  assert.deepEqual(m.state, { active: false, time: 0 });
  m.update(.1, { scene: 'meteors' });
  assert.equal(m.state.time, .1);
});
