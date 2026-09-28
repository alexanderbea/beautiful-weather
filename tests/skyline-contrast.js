// Paste into the browser console (or browser_evaluate) on the app page, e.g.
//   ?condition=night-rain&lat=59.3293&lng=18.0686
// Measures how visible the landmark skyline is: samples the skyline band (53-70% height) with the
// landmark on, fades it out, samples again, then restores it. meanDeltaL = average luminance
// difference (0-255) between sky and silhouette over the pixels the skyline covers.
// Reference values (1280x800): clear day ~50, clear twilight ~46, night-rain ~11.
async () => {
  const c = document.getElementById('scene');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const y0 = Math.floor(H * 0.53), y1 = Math.floor(H * 0.70);
  const band = () => {
    const d = ctx.getImageData(0, y0, W, y1 - y0).data;
    const L = new Float32Array(W * (y1 - y0));
    for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    return L;
  };
  const engine = window.__bw.engine;
  const landmark = engine.state.landmark;
  const on = band();
  engine.setLandmark(null);
  await new Promise((r) => setTimeout(r, 2200));
  const off = band();
  engine.setLandmark(landmark);
  let n = 0, sum = 0;
  for (let i = 0; i < on.length; i++) {
    const dd = off[i] - on[i];
    if (Math.abs(dd) > 3) { n++; sum += dd; }
  }
  return { landmark, coveredPx: n, meanDeltaL: +(sum / n).toFixed(1) };
}
