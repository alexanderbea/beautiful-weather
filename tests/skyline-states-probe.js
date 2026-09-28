// Paste into browser_evaluate on e.g. ?condition=rain&time=twilight&lat=59.3293&lng=18.0686
// Reports: skyline contrast (landmark on vs off, as tests/skyline-contrast.js), weather motion inside the
// skyline band (fraction of pixels changing between two frames 250 ms apart: rain/snow drawn on top move),
// lit-window count (warm pixels in the band) and sky colour samples.
async () => {
  const c = document.getElementById('scene'); const ctx = c.getContext('2d'); const W = c.width, H = c.height;
  const y0 = Math.floor(H * 0.53), y1 = Math.floor(H * 0.70);
  const grab = () => ctx.getImageData(0, y0, W, y1 - y0).data;
  const lum = (d) => { const L = new Float32Array(d.length / 4); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; return L; };
  const e = window.__bw.engine; const st = e.state; const lm = st.landmark;
  const a = grab(); await new Promise((r) => setTimeout(r, 250)); const b = grab();
  let moving = 0, warm = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) moving++;
    if (a[i] > 200 && a[i + 1] > 150 && a[i + 2] < 150 && a[i] - a[i + 2] > 80) warm++;
  }
  const on = lum(a); e.setLandmark(null); await new Promise((r) => setTimeout(r, 2200)); const off = lum(grab()); e.setLandmark(lm);
  let n = 0, s = 0; for (let i = 0; i < on.length; i++) { const dd = off[i] - on[i]; if (Math.abs(dd) > 3) { n++; s += dd; } }
  const d = ctx.getImageData(0, 0, W, H).data; const at = (fx, fy) => { const i = (Math.floor(fy * H) * W + Math.floor(fx * W)) * 4; return [d[i], d[i + 1], d[i + 2]].join(','); };
  return { landmark: lm, solar: st.solarElevation, twilight: +(st.twilight ?? 0).toFixed(2), effects: st.effects,
    skylineCoveredPx: n, meanDeltaL: n ? +(s / n).toFixed(1) : 0, movingPctInBand: +(100 * moving / (a.length / 4)).toFixed(2), warmPx: warm,
    sky: [0.02, 0.2, 0.4, 0.55].map((f) => at(0.5, f)) };
}
