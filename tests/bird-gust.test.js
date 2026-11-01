import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbient } from '../src/engine/ambient.js';

// Exercise actual scheduling AND rendered wing geometry, with an overdue timer
// across flock gaps/entry/exit. Seeded randomness gives both directions and depths.
for (const width of [390, 1440]) for (const style of ['japanese', 'vangogh', 'ghibli']) {
  test(`complete gust is visible and smooth: ${style}, ${width}px`, t => {
    let seed = 1;
    t.mock.method(Math, 'random', () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32));
    const directions = new Set();
    let events = 0;
    for (let run = 0; run < 8; run++) {
      const life = createAmbient();
      const env = { width, height: width === 390 ? 844 : 900, condition: 'clear',
        season: 'summer', wind: 2, dayMix: run % 2, ambient: {}, sun: { x: 200 }, moon: { x: 100 },
        theme: { sky: { mid: [120, 140, 160, 1] } }, artStyle: { id: style, params: { motion: { swayRate: 1 } } } };
      let wings = [], previous, active = null;
      const ctx = new Proxy({}, { get: (_, key) => key === 'moveTo' ? (x, y) => wings.push([x, y])
        : key === 'quadraticCurveTo' ? (_, __, x, y) => wings.push([x, y]) : () => {} });
      const dt = 1 / 30;
      for (let i = 0; (i < 300 / dt || active) && i < 310 / dt; i++) {
        // Sweep the actual allowed camera range, including during a gust.
        env.camX = Math.sin(i * dt / 4) * .024 * 1.4 * width;
        life.update(dt, env); wings = []; life.drawBirds(ctx, env);
        const state = life.state, b = state.birdHits.at(-1);
        if (state.funny && !previous?.funny) {
          active = { start: i, backwards: false, recovered: false,
            dir: Math.sign(b.x - previous.b.x), frames: 0, backwardPixels: 0,
            separation: b.x - state.birdHits.at(-2).x };
          directions.add(active.dir); events++;
          assert.ok(previous.b.x > 0 && previous.b.x < width, 'entry must precede event');
        }
        if (active) {
          assert.ok(b, 'flock cannot exit during recovery');
          for (const [x, y] of wings.slice(-3)) {
            assert.ok(x > 0 && x < width && y > 0 && y < env.height,
              `entire affected silhouette must fit: ${x}, ${y}`);
          }
          const velocity = (b.x - previous.b.x) / dt * active.dir;
          active.backwards ||= velocity < -1;
          active.backwardPixels += Math.max(0, -velocity * dt);
          active.recovered ||= state.funny < 1 && velocity > 10;
          assert.ok(Math.abs(b.x - previous.b.x) < 4, 'no teleport or abrupt positional clamp');
          if (previous.velocity !== undefined)
            assert.ok(Math.abs(velocity - previous.velocity) < 5, 'smooth onset, recovery and release velocity');
          active.frames++;
          if (!state.funny) {
            assert.ok(active.backwards && active.backwardPixels > 5, 'must visibly move against the flight direction');
            assert.ok(Math.abs(b.x - state.birdHits.at(-2).x - active.separation) < 12 * Math.max(.5, width / 1440),
              'must return to formation, allowing only normal individual drift');
            assert.ok(active.recovered, 'must catch up before release');
            assert.ok((i - active.start) * dt >= 3.99, 'full four seconds must remain visible');
            active = null;
          }
          previous = { funny: state.funny, b, velocity };
        } else previous = { funny: state.funny, b };
      }
      assert.equal(active, null, 'last event must finish');
    }
    assert.ok(events >= 8, 'pending events must eventually find visible space');
    assert.equal(directions.size, 2, 'cover both flight directions');
  });
}
