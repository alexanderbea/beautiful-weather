// Paste into the browser console (or browser_evaluate) on the app page.
// Samples the canvas: sky gradient down the centre, and the skyline's top contour
// (first pixel per column matching the colour at 50%/70% height).
() => {
  const c = document.getElementById('scene');
  const W = c.width, H = c.height;
  const d = c.getContext('2d').getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const ref = at(Math.floor(W * 0.5), Math.floor(H * 0.7));
  const tops = [];
  for (let x = 0; x < W; x += 16) {
    let top = -1;
    for (let y = Math.floor(H * 0.3); y < Math.floor(H * 0.72); y++) {
      const p = at(x, y);
      if (Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) < 18) { top = y; break; }
    }
    tops.push(top);
  }
  const v = tops.filter((t) => t > 0);
  const st = window.__bw?.engine?.state ?? {};
  return {
    state: { solar: st.solarElevation, twilight: st.twilight, landmark: st.landmark, effects: st.effects },
    skylineColour: ref.join(','),
    columnsFound: `${v.length}/${tops.length}`,
    tallestTopFrac: (Math.min(...v) / H).toFixed(3),
    sky: [0.02, 0.15, 0.3, 0.45, 0.55].map((f) => at(Math.floor(W * 0.5), Math.floor(H * f)).join(',')),
  };
}
