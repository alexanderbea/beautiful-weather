// QA probe for #18 (stars + aurora). Paste into browser_evaluate on e.g. ?condition=clear&time=night
// Steps through condition x sun elevation and reports engine.state.sky:
//   darkness  0 (e >= -1) .. 1 (e <= -12)       stars   theme.stars x darkness (per-star fade on top)
//   aurora    effective peak alpha, > 0 only for condition 'clear' (incl. the 'night' alias) at e < -10
async () => {
  const e = window.__bw.engine; const out = {};
  const cases = [['clear', 30], ['clear', 0], ['clear', -4], ['clear', -8], ['clear', -12], ['clear', -18],
    ['clouds', -18], ['rain', -18], ['snow', -18], ['fog', -18], ['wind', -18], ['night-rain', undefined]];
  for (const [condition, solarElevation] of cases) {
    e.setWeather({ condition, solarElevation, isDay: solarElevation > 0 }, { immediate: true });
    await new Promise((r) => setTimeout(r, 2000)); // let the condition gate settle
    const s = e.state.sky;
    out[`${condition}@${solarElevation ?? 'night'}`] = { stars: +s.stars.toFixed(2), aurora: +s.aurora.toFixed(3), darkness: +s.darkness.toFixed(2) };
  }
  return { fps: e.stats.fps, cases: out };
}
