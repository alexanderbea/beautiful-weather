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
