// Paste into browser_evaluate after loading a state URL (e.g. ?dev=1&condition=clear&time=dawn).
// Waits for cross-fades, then reports: per-layer parallax shift (see parallax-rates-probe.js, compact),
// lighting state, luminance of the whole frame / sky / land, horizon warmth (R - B), the sky-vs-skyline
// luminance step at the far ridge, the dawn-mist band profile, and fps sampled over ~2 s of drift.
async () => {
  const e = window.__bw.engine; const c = document.getElementById('scene'); const ctx = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await sleep(2500);
  const lumOf = (d) => { const L = new Float32Array(d.length / 4); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; return L; };
  e.setParallaxCam(1.4); await raf(); const A = lumOf(ctx.getImageData(0, 0, W, H).data);
  e.setParallaxCam(-1.4); await raf(); const B = lumOf(ctx.getImageData(0, 0, W, H).data);
  e.setParallaxCam(0); await raf(); const raw = ctx.getImageData(0, 0, W, H).data; const L = lumOf(raw); e.setParallaxCam(null);
  const shifts = {};
  for (const [name, y0, y1] of [['far', 0.6, 0.7], ['mid', 0.72, 0.8], ['near', 0.83, 0.88]]) {
    const votes = {};
    for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y += 4) {
      const o = y * W, m = 140; let best = 0, bestErr = Infinity;
      for (let s = -130; s <= 130; s++) { let err = 0; for (let x = m; x < W - m; x += 2) err += Math.abs(A[o + x] - B[o + x + s]); if (err < bestErr) { bestErr = err; best = s; } }
      votes[best] = (votes[best] || 0) + 1;
    }
    shifts[name] = Object.entries(votes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s, n]) => `${s}px x${n}`).join(', ');
  }
  const band = (y0, y1) => { let s = 0, n = 0; for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = 0; x < W; x += 3) { s += L[y * W + x]; n++; } return +(s / n).toFixed(1); };
  const warm = (y0, y1) => { let s = 0, n = 0; for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = 0; x < W; x += 3) { const i = (y * W + x) * 4; s += raw[i] - raw[i + 2]; n++; } return +(s / n).toFixed(1); };
  // Sky-vs-land step at the far silhouette: per column, first row from 0.45h where lum drops/rises by >4 over 3 px.
  let edgeN = 0, edgeSum = 0;
  for (let x = 20; x < W - 20; x += 10) {
    for (let y = Math.floor(H * 0.45); y < Math.floor(H * 0.72); y++) {
      const d = L[(y + 3) * W + x] - L[(y - 3) * W + x];
      if (Math.abs(d) > 4) { edgeSum += Math.abs(L[(y + 6) * W + x] - L[(y - 6) * W + x]); edgeN++; break; }
    }
  }
  // Mist band (0.68-0.80h): row means + horizontal std (lumpy/layered vs flat).
  const mist = [];
  for (const f of [0.69, 0.71, 0.73, 0.745, 0.76, 0.78, 0.8]) {
    const y = Math.floor(H * f); let s = 0, s2 = 0, n = 0; for (let x = 0; x < W; x += 2) { const v = L[y * W + x]; s += v; s2 += v * v; n++; }
    const m = s / n; mist.push(`${f}:${m.toFixed(0)}±${Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(0)}`);
  }
  const fps = []; for (let i = 0; i < 4; i++) { await sleep(550); fps.push(e.stats.fps); }
  const st = e.state;
  return { cond: st.condition, isDay: st.isDay, solar: +st.solarElevation.toFixed(1), rising: st.rising, twilight: +(st.twilight ?? 0).toFixed(2),
    light: st.light && Object.fromEntries(Object.entries(st.light).map(([k, v]) => [k, +v.toFixed(3)])), effects: st.effects.join(','),
    shifts, lum: { frame: band(0, 1), sky: band(0.05, 0.4), horizonSky: band(0.5, 0.57), land: band(0.8, 0.98) },
    warmHorizon: warm(0.5, 0.64), silhouetteStep: edgeN ? +(edgeSum / edgeN).toFixed(1) : null, edgeCols: edgeN, mist: mist.join(' '), fps: fps.join(',') };
}
