import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeteors, meteorTracks, METEOR_PERIOD } from '../src/engine/meteors.js';

test('cadence: three starts per eight seconds, at most three simultaneous, occasional 600ms pulse', () => {
  let starts = 0, previous = 0, pulseSamples = 0, maximum = 0;
  for (let n = 0; n < 24000; n++) {
    const tracks = meteorTracks(n / 1000);
    const visible = tracks.filter(t => t.alpha > 0).length;
    starts += Math.max(0, visible - previous);
    previous = visible;
    maximum = Math.max(maximum, visible);
    if (tracks.some(t => t.pulse > 0)) pulseSamples++;
  }
  assert.equal(METEOR_PERIOD, 8);
  assert.equal(starts, 9);
  assert.ok(maximum <= 3);
  assert.ok(pulseSamples >= 599 && pulseSamples <= 601);
});

test('reduced motion has three faint fixed tracks and never a fireball pulse', () => {
  assert.deepEqual(meteorTracks(0, true), meteorTracks(123, true));
  assert.ok(meteorTracks(123, true).every(t => t.alpha <= .16 && t.pulse === 0 && !t.fireball));
  const m = createMeteors();
  m.update(10, { scene: 'meteors', reducedMotion: true });
  m.drawGround(new Proxy({}, { get() { throw new Error('ground drawing is forbidden'); } }), { reducedMotion: true });
});

test('style changes restart the scheduler and scene exits discard all animation state', () => {
  const m = createMeteors();
  m.update(18, { scene: 'meteors', artStyle: { id: 'japanese' } });
  m.update(.01, { scene: 'meteors', artStyle: { id: 'vangogh' } });
  assert.equal(m.state.time, .01);
  m.update(1, { scene: 'live' });
  assert.deepEqual(m.state, { active: false, time: 0 });
});
