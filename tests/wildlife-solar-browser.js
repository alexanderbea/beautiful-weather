// Run in the served app at a currently dusk location, WITHOUT ?elev or ?time:
//   const probe = await import('/tests/wildlife-solar-browser.js');
//   const watch = probe.watchSolar();
// After >= 3 real minute refreshes and a completed gust: watch.verify();
// Keeps the actual app tickSun -> apply -> engine.setWeather path and real clock.
export function watchSolar() {
  const params = new URLSearchParams(location.search);
  if (params.has('elev') || params.has('time')) throw new Error('Use live solar time');
  const engine = window.__bw.engine;
  const original = engine.setWeather;
  const evidence = { start: Date.now(), refreshes: [], samples: [], gusts: [] };
  const wrapper = function (...args) {
    const before = engine.state;
    const result = original.apply(this, args);
    evidence.refreshes.push({ at: Date.now(), before, after: engine.state });
    return result;
  };
  engine.setWeather = wrapper;
  let active = false;
  const timer = setInterval(() => {
    const s = engine.state;
    evidence.samples.push({ at: Date.now(), elev: s.solarElevation,
      birds: s.ambient.birds, hits: s.ambient.birdHits, funny: s.ambient.funny });
    if (s.ambient.funny > 0 && !active) evidence.gusts.push({ start: Date.now() });
    if (!s.ambient.funny && active) evidence.gusts.at(-1).end = Date.now();
    active = s.ambient.funny > 0;
  }, 100);
  return {
    evidence,
    verify() { return verifySolar(evidence); },
    stop() {
      clearInterval(timer);
      if (engine.setWeather === wrapper) engine.setWeather = original;
    },
  };
}

export function verifySolar(evidence) {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const refreshes = evidence.refreshes.filter(r =>
    Math.abs(r.after.targetSolarElevation - r.before.targetSolarElevation) > .05);
  check(refreshes.length >= 3, 'Observe at least three changing solar refreshes');
  let occupied = 0;
  for (const r of refreshes) {
    check(r.before.scene === 'live' && r.after.scene === 'live', 'Stay in live scene');
    check(JSON.stringify(r.before.ambient) === JSON.stringify(r.after.ambient), 'Solar refresh reset flock/reaction state');
    check(JSON.stringify(r.before.wildlife) === JSON.stringify(r.after.wildlife), 'Solar refresh reset water state');
    if (r.before.ambient.birdHits.some(b => b.x > 0 && b.x < innerWidth)) occupied++;
  }
  check(occupied > 0, 'Observe a minute boundary with birds on screen');
  check(evidence.gusts.some(g => g.end - g.start >= 3500), 'Observe a complete four-second gust');
  check(evidence.samples.every(s => s.birds <= 7), 'Bird count must stay bounded');
  return { pass: true, elapsed: (Date.now() - evidence.start) / 1000,
    refreshes: refreshes.length, occupied, gusts: evidence.gusts };
}
