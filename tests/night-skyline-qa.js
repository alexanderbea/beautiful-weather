// QA probe for #17 (night skyline contrast). Paste into browser_evaluate on e.g.
//   ?condition=rain&time=night&lat=59.3293&lng=18.0686
// Grabs the skyline band (45-74% height) with the landmark on, fades it out, grabs again, restores it.
// Pixels that change by > 6 luminance are "skyline" pixels. Reports:
//   silhouetteL / skyL   mean luminance (0-255) of those pixels with landmark on / off
//   wcagRatio            contrast ratio (relative luminance) sky vs silhouette median colour
//   nearBlackPct         % of skyline pixels within 14 RGB distance of #070a14 (as drawn, after fog/rain)
//   brighterPx           skyline pixels brighter than the sky behind them (rim light + lit windows)
//   rimPx                of those, pale/cool ones (rim light, not warm windows)
async () => {
  const c = document.getElementById('scene'); const ctx = c.getContext('2d'); const W = c.width, H = c.height;
  const y0 = Math.floor(H * 0.45), y1 = Math.floor(H * 0.74);
  const grab = () => ctx.getImageData(0, y0, W, y1 - y0).data;
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const relL = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const e = window.__bw.engine; const lm = e.state.landmark;
  const on = grab(); e.setLandmark(null); await new Promise((r) => setTimeout(r, 2200)); const off = grab(); e.setLandmark(lm);
  let n = 0, sOn = 0, sOff = 0, near = 0, brighter = 0, rim = 0; const rs = [], gs = [], bs = [], ro = [], go = [], bo = [];
  for (let i = 0; i < on.length; i += 4) {
    const a = L(on, i), b = L(off, i);
    if (Math.abs(a - b) <= 6) continue;
    n++; sOn += a; sOff += b;
    if (a > b) { brighter++; if (on[i + 2] >= on[i] && on[i + 2] > 120) rim++; continue; }
    rs.push(on[i]); gs.push(on[i + 1]); bs.push(on[i + 2]); ro.push(off[i]); go.push(off[i + 1]); bo.push(off[i + 2]);
    if (Math.hypot(on[i] - 7, on[i + 1] - 10, on[i + 2] - 20) < 14) near++;
  }
  const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1] ?? 0; };
  const sil = [med(rs), med(gs), med(bs)], sky = [med(ro), med(go), med(bo)];
  const l1 = relL(...sky), l2 = relL(...sil);
  const dark = rs.length || 1;
  return { landmark: lm, twilight: +(e.state.twilight ?? 0).toFixed(2), dayMix: +(e.state.dayMix ?? 0).toFixed(2),
    skylinePx: n, silhouetteL: +(sOn / n).toFixed(1), skyL: +(sOff / n).toFixed(1),
    silhouetteMedianRGB: sil.join(','), skyMedianRGB: sky.join(','),
    wcagRatio: +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2),
    nearBlackPct: +(100 * near / dark).toFixed(1), brighterPx: brighter, rimPx: rim };
}
