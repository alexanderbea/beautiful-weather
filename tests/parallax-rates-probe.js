// Paste into browser_evaluate on e.g. ?dev=1&condition=rain&time=night
// Pins the parallax camera at c = +1.4 then c = -1.4 (two frames apart) and, per canvas row in the land
// band, finds the horizontal shift that best aligns the two frames. The three depth layers should cluster
// at ~0.25 / 0.6 / 1.0 x the near-layer shift (2 * 1.4 * PARALLAX_RANGE * width px).
async () => {
  const e = window.__bw.engine; const c = document.getElementById('scene'); const ctx = c.getContext('2d');
  const W = c.width, H = c.height; const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const lumRows = () => { const d = ctx.getImageData(0, 0, W, H).data; const L = new Float32Array(W * H); for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; return L; };
  e.setParallaxCam(1.4); await raf(); const A = lumRows(); e.setParallaxCam(-1.4); await raf(); const B = lumRows(); e.setParallaxCam(null);
  const expectedNear = 2 * 1.4 * 0.024 * W;
  const rows = [];
  for (let y = Math.floor(H * 0.55); y < Math.floor(H * 0.97); y += 4) {
    let best = 0, bestErr = Infinity, zeroErr = 0, varA = 0;
    const o = y * W; const m = 140;
    for (let x = m; x < W - m; x++) varA += Math.abs(A[o + x] - A[o + x - 1]);
    if (varA < 40) continue; // flat row, no edge to track
    for (let s = -130; s <= 130; s++) {
      let err = 0; for (let x = m; x < W - m; x++) err += Math.abs(A[o + x] - B[o + x + s]);
      if (s === 0) zeroErr = err; if (err < bestErr) { bestErr = err; best = s; }
    }
    rows.push({ yf: +(y / H).toFixed(3), shift: best, ratio: +(Math.abs(best) / expectedNear).toFixed(2) });
  }
  const buckets = { far: 0, mid: 0, near: 0, zero: 0, other: 0 };
  for (const r of rows) {
    if (r.ratio < 0.08) buckets.zero++; else if (Math.abs(r.ratio - 0.25) < 0.08) buckets.far++;
    else if (Math.abs(r.ratio - 0.6) < 0.1) buckets.mid++; else if (Math.abs(r.ratio - 1) < 0.1) buckets.near++; else buckets.other++;
  }
  return { W, H, expectedNear: +expectedNear.toFixed(1), buckets, rows: rows.map((r) => `${r.yf}:${r.shift}`).join(' ') };
}
