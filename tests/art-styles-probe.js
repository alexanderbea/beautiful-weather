// QA probe for #25 (art styles). Paste into browser_evaluate on e.g. ?source=mock&condition=clear&time=day.
// Steps through style x condition x sun elevation, snapping each state, and reports per combo:
//   diff   mean per-channel RGB distance (0-255) of the frame vs. the first registered style (japanese) in the same state,
//          so a style that only tinted would score low (a CSS-filter tint scores ~10-20; a restyle 30+)
//   dark   mean luminance of the top-left readout area (should stay below ~170 so white text reads)
//   fps    after settling
// Also times a runtime cross-fade ghibli -> vangogh -> japanese -> ghibli and checks that
// the lerped params reach their targets and that no console error fires.
async () => {
  const e = window.__bw.engine; const st = window.__bw.style;
  const c = document.getElementById('scene'); const ctx = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const errors = []; const onErr = (ev) => errors.push(String(ev.message || ev.reason)); window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr);
  const grab = () => ctx.getImageData(0, 0, W, H).data;
  const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 16) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; } return +(s / n).toFixed(1); };
  const readout = (d) => { let s = 0, n = 0; for (let y = 0; y < H * 0.28; y += 3) for (let x = 0; x < W * 0.32; x += 3) { const i = (y * W + x) * 4; s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; } return +(s / n).toFixed(0); };
  const styles = st.styles.map((s) => s.id);
  const states = [['clear', 45], ['clear', 0], ['clear', -18], ['clouds', 45], ['clouds', 0], ['clouds', -18], ['rain', 45], ['rain', 0], ['rain', -18], ['snow', 45], ['snow', 0], ['snow', -18]];
  const out = {}; const frames = {};
  e.setParallaxCam(0);
  for (const id of styles) {
    e.setStyle(id, { immediate: true }); await raf();
    for (const [condition, elev] of states) {
      e.setWeather({ condition, solarElevation: elev, isDay: elev > 0 }, { immediate: true });
      await sleep(150); await raf();
      const d = grab(); const key = `${condition}@${elev}`;
      if (id === styles[0]) frames[key] = d;
      out[`${id}:${key}`] = { diff: id === styles[0] ? 0 : diff(d, frames[key]), dark: readout(d) };
    }
  }
  e.setParallaxCam(null);
  // Runtime cross-fade (through the app's style state, so the picker follows too).
  const fade = {};
  for (const id of ['vangogh', 'japanese', 'ghibli']) {
    const t0 = performance.now(); st.set(id); await sleep(2000);
    const p = e.state.styleParams; fade[id] = { state: e.state.style, ms: Math.round(performance.now() - t0), rim: p.rim, skyMix: p.sky.mix, active: document.querySelector('[data-style-id].is-active')?.dataset.styleId };
  }
  const fps = []; for (let i = 0; i < 4; i++) { await sleep(550); fps.push(e.stats.fps); }
  window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
  return { fps, errors, fade, combos: out };
}
