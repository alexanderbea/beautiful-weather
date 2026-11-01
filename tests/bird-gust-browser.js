// Read-only, real-rAF observer. URL/weather overrides (if any) remain explicit.
// In Playwright: await page.evaluate(async () => {
//   window.gustWatch = (await import('/tests/bird-gust-browser.js')).watchGust();
// }); No clocks, random values, timers or wildlife state are overridden.
export function watchGust() {
  const evidence = { start: new Date().toISOString(), url: location.href,
    viewport: [innerWidth, innerHeight], events: [], fishAt: null, solar: [] };
  let previous = null, raf, stopped = false;
  const start = performance.now();
  function sample() {
    if (stopped) return;
    const s = window.__bw?.engine.state;
    if (s) {
      const a = s.ambient;
      const frame = { seconds: (performance.now() - start) / 1000,
        funny: a.funny, birds: a.birdHits, elevation: s.targetSolarElevation };
      if (s.wildlife.fish && evidence.fishAt === null) evidence.fishAt = frame.seconds;
      if (previous && previous.elevation !== frame.elevation)
        evidence.solar.push({ before: previous, after: frame });
      if (a.funny > 0 && !previous?.funny)
        evidence.events.push({ frames: previous ? [previous] : [] });
      if (a.funny > 0 || previous?.funny) evidence.events.at(-1).frames.push(frame);
      if (!a.funny && previous?.funny) evidence.events.at(-1).complete = true;
      previous = frame;
    }
    raf = requestAnimationFrame(sample);
  }
  sample();
  return { evidence, stop() { stopped = true; cancelAnimationFrame(raf); } };
}

// Analyse recorded positions without changing the scene. The conservative wing
// radius covers the largest bird at this viewport (including the night outline).
export function summarizeGust(evidence) {
  const [width, height] = evidence.viewport;
  const scale = Math.max(.5, Math.min(1.6, width / 1440));
  const radius = 27 * Math.max(.85, scale) / 2 + 4;
  return evidence.events.filter(e => e.complete).map(event => {
    const frames = event.frames;
    const first = frames.find(f => f.funny > 0), last = frames.at(-1);
    const direction = Math.sign(last.birds[0].x - first.birds[0].x);
    const positions = frames.map(f => f.birds.at(-1));
    let backwardPixels = 0;
    for (let i = 1; i < positions.length; i++)
      backwardPixels += Math.max(0, -(positions[i].x - positions[i - 1].x) * direction);
    const bounds = { left: Math.min(...positions.map(b => b.x)) - radius,
      right: Math.max(...positions.map(b => b.x)) + radius,
      top: Math.min(...positions.map(b => b.y)) - radius,
      bottom: Math.max(...positions.map(b => b.y)) + radius };
    const gap = f => f.birds.at(-1).x - f.birds.at(-2).x;
    const formationError = Math.abs(gap(last) - gap(first));
    const duration = last.seconds - first.seconds;
    return { startSeconds: first.seconds, endSeconds: last.seconds, duration,
      frames: frames.length, direction, bounds, backwardPixels, formationError,
      pass: duration >= 3.95 && bounds.left > 0 && bounds.right < width
        && bounds.top > 0 && bounds.bottom < height && backwardPixels > 5
        && formationError < 12 * scale };
  });
}
