import { rgba } from './color.js';

// Mid-ground town silhouette, drawn between the far ridge and the mid hill (see scene.drawLand).
// Horizontal anchors are fractions of the width, detail sizes use a clamped unit U (px) and heights
// are fractions of the viewport height. The contour is filled down to the bottom of the screen; the
// mid/near hills cover the foot. Geometry is built once per (landmark, width, height).

const TAU = Math.PI * 2;
const FADE_S = 1.5;
const WINDOW_COLOR = [255, 204, 128, 1];
const MAX_WINDOWS = 360;
const SHORE = 0.735; // waterline (fraction of h); buildings stand on it, water fills below
// Horizontal bleed (fraction of w + px) the contour extends past each screen edge, so the distant
// parallax layer (max shift 1.4 * 0.024 * 0.25 = 0.0084w) never exposes an edge.
const BLEED = 0.02;
const BLEED_PX = 4;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Deterministic PRNG (mulberry32) so layouts and windows are stable across frames and resizes. */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pen tracing the top contour left to right. `fill` gets the closed silhouette plus openwork holes
 * (filled evenodd), `rim` only the open top edge, `orn` detached ornaments (filled nonzero).
 */
function createPen(w, h, U, pad) {
  const fill = new Path2D();
  const rim = new Path2D();
  const orn = new Path2D();
  const holes = [];
  const boxes = []; // window areas: { x0, x1, y0, y1, density, cols }
  let x = -1;
  let started = false;
  const Y = (f) => f * h;

  const pen = {
    U, Y, boxes, pad, rnd: null,
    get x() { return x; },
    to(px, py) {
      if (!started) {
        fill.moveTo(px, Y(SHORE));
        fill.lineTo(px, py);
        rim.moveTo(px, py);
        started = true;
      } else {
        fill.lineTo(px, py);
        rim.lineTo(px, py);
      }
      x = px;
    },
    /** Symmetric tower profile: pts = [[halfWidth in U, y fraction], ...] from bottom to tip. */
    sym(cx, pts) {
      for (const [dx, fy] of pts) pen.to(cx - dx * U, Y(fy));
      for (let i = pts.length - 1; i >= 0; i--) {
        const [dx, fy] = pts[i];
        if (dx > 0) pen.to(cx + dx * U, Y(fy));
      }
    },
    hole(pts) { holes.push(pts); },
    ornament(fn) { fn(orn); },
    box(x0, x1, y0, y1, density, cols = 0) { if (x1 > x0 && y1 > y0) boxes.push({ x0, x1, y0, y1, density, cols }); },
    finish() {
      pen.to(Math.max(x, w + pad), Y(0.72));
      fill.lineTo(x, Y(SHORE));
      fill.closePath();
      for (const pts of holes) {
        fill.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) fill.lineTo(pts[i][0], pts[i][1]);
        fill.closePath();
      }
      return { fill, rim, orn };
    },
  };
  return pen;
}

/** Row of narrow gabled / stepped-gable / hipped houses from the pen's x to x1. */
function houses(pen, x1, { eave = 0.668, spread = 0.016, windows = 0.5 } = {}) {
  const { U, Y, rnd } = pen;
  let x = pen.x;
  while (x1 - x > U * 0.8) {
    let bw = U * (2.2 + rnd() * 2);
    if (x1 - x - bw < U * 1.6) bw = x1 - x; // absorb a sliver into the last house
    const ey = Y(eave + (rnd() - 0.5) * spread);
    const kind = rnd();
    pen.to(x, ey);
    if (kind < 0.38) {
      // Steep gable facing the water.
      pen.to(x + bw / 2, ey - bw * 0.62);
    } else if (kind < 0.62) {
      // Stepped gable, Gamla Stan style.
      const steps = 3;
      const rise = bw * 0.7;
      for (let s = 0; s < steps; s++) {
        const inset = (bw / 2) * (s / steps) * 0.9;
        pen.to(x + inset, ey - (rise * s) / steps - rise / steps);
        pen.to(x + inset + (bw / 2) * 0.3, ey - (rise * s) / steps - rise / steps);
      }
      for (let s = steps - 1; s >= 0; s--) {
        const inset = (bw / 2) * (s / steps) * 0.9;
        pen.to(x + bw - inset - (bw / 2) * 0.3, ey - (rise * s) / steps - rise / steps);
        pen.to(x + bw - inset, ey - (rise * s) / steps - rise / steps);
      }
    } else {
      // Hipped roof seen side-on, sometimes with a chimney.
      const ry = ey - bw * 0.32;
      pen.to(x + bw * 0.22, ry);
      if (kind > 0.8 && bw > 2 * U) {
        const cx = x + bw * (0.3 + rnd() * 0.2);
        pen.to(cx, ry);
        pen.to(cx, ry - U * 0.8);
        pen.to(cx + U * 0.45, ry - U * 0.8);
        pen.to(cx + U * 0.45, ry);
      }
      pen.to(x + bw * 0.78, ry);
    }
    pen.to(x + bw, ey);
    pen.box(x + bw * 0.15, x + bw * 0.85, ey + U * 0.5, Y(SHORE - 0.006), windows);
    x += bw;
  }
}

function strip(pen, x1, fy) {
  pen.to(pen.x, pen.Y(fy));
  pen.to(x1, pen.Y(fy));
}

/** Stadshuset: long brick body, square tower with corner turrets, slim lantern and the Three Crowns. */
function cityHall(pen, cx) {
  const { U, Y } = pen;
  pen.to(cx - 24 * U, Y(0.694));
  pen.to(cx - 24 * U, Y(0.676));
  pen.to(cx - 22.6 * U, Y(0.668));
  pen.box(cx - 22 * U, cx - 5 * U, Y(0.674), Y(0.74), 0.25);
  pen.sym(cx, [
    [3.6, 0.668], [3.6, 0.580], [3.9, 0.580], [3.9, 0.576], [3.9, 0.567], [3.65, 0.561], [3.4, 0.567],
    [3.4, 0.572], [2.6, 0.572], [2.6, 0.552], [2.9, 0.552], [2.9, 0.548], [2.2, 0.548],
    [1.2, 0.537], [0.6, 0.533], [0.6, 0.530], [0.22, 0.527], [0.1, 0.521], [0, 0.521],
  ]);
  pen.box(cx - 2.6 * U, cx + 2.6 * U, Y(0.585), Y(0.66), 0.12, 2);
  pen.to(cx + 3.6 * U, Y(0.682));
  pen.to(cx + 8 * U, Y(0.682));
  pen.to(cx + 8 * U, Y(0.700));
  // Tre Kronor: two crowns side by side with the third above.
  const c = Math.max(3, U * 0.95);
  const tip = Y(0.521);
  pen.ornament((p) => {
    for (const [ox, oy] of [[-0.55, 0], [0.55, 0], [0, -0.7]]) crown(p, cx + ox * c, tip + oy * c, c);
  });
}

function crown(p, x, yBase, c) {
  const hw = c * 0.5;
  p.moveTo(x - hw, yBase);
  p.lineTo(x - hw, yBase - c * 0.5);
  p.lineTo(x - hw * 0.5, yBase - c * 0.28);
  p.lineTo(x, yBase - c * 0.62);
  p.lineTo(x + hw * 0.5, yBase - c * 0.28);
  p.lineTo(x + hw, yBase - c * 0.5);
  p.lineTo(x + hw, yBase);
  p.closePath();
}

/** Riddarholmskyrkan: nave, square tower with pinnacles and the openwork cast-iron spire. */
function riddarholmen(pen, cx) {
  const { U, Y } = pen;
  pen.to(cx - 12 * U, Y(0.690));
  pen.to(cx - 12 * U, Y(0.668));
  pen.to(cx - 10.4 * U, Y(0.657));
  pen.to(cx - 2.8 * U, Y(0.657));
  const base = 0.603;
  const tip = 0.535;
  const spireHW = 2.2;
  pen.sym(cx, [
    [2.8, 0.657], [2.8, 0.608], [3.1, 0.608], [3.1, 0.603], [3.1, 0.595], [2.9, 0.589], [2.7, 0.595],
    [2.7, base], [spireHW, base], [1.45, 0.576], [0.85, 0.557], [0.4, 0.544], [0.14, 0.538], [0, tip],
  ]);
  pen.to(cx + 2.8 * U, Y(0.668));
  pen.to(cx + 6.5 * U, Y(0.668));
  pen.to(cx + 6.5 * U, Y(0.690));
  // Openwork: stacked lancet-shaped gaps up the spire.
  const hwAt = (fy) => spireHW * U * clamp((fy - tip) / (base - tip), 0, 1);
  for (const [a, b] of [[0.598, 0.584], [0.580, 0.568], [0.564, 0.555], [0.551, 0.545]]) {
    const hw = hwAt((a + b) / 2) * 0.38;
    if (hw < 0.6) continue;
    pen.hole([[cx, Y(b)], [cx + hw, Y(b + (a - b) * 0.35)], [cx + hw, Y(a)], [cx - hw, Y(a)], [cx - hw, Y(b + (a - b) * 0.35)]]);
  }
}

/** Storkyrkan: broad square tower crowned by a baroque bell-shaped cupola, lantern and short spire. */
function storkyrkan(pen, cx) {
  const { U, Y } = pen;
  pen.sym(cx, [
    [3.4, 0.690], [3.4, 0.628], [3.7, 0.628], [3.7, 0.624],
    [3.2, 0.624], [3.35, 0.619], [3.2, 0.614], [2.7, 0.609], [1.9, 0.605], [1.1, 0.602],
    [1.0, 0.602], [1.0, 0.595], [1.2, 0.595], [1.2, 0.593], [0.55, 0.593], [0.3, 0.587], [0.1, 0.581], [0, 0.581],
  ]);
  pen.box(cx - 2.6 * U, cx + 2.6 * U, Y(0.634), Y(0.70), 0.15, 2);
}

/** Kungliga slottet: long flat balustraded block with slightly raised end pavilions. */
function palace(pen, cx) {
  const { U, Y } = pen;
  pen.sym(cx, [
    [13, 0.700], [13, 0.640], [12.6, 0.640], [12.6, 0.636], [9, 0.636], [9, 0.642], [3.2, 0.642],
    [3.2, 0.639], [0, 0.639],
  ]);
  pen.box(cx - 12.4 * U, cx + 12.4 * U, Y(0.648), Y(0.74), 0.55, 0);
}

/** Tyska kyrkan: slender tower, small clock gables and a tall needle spire. */
function tyska(pen, cx) {
  const { U, Y } = pen;
  pen.sym(cx, [
    [2.5, 0.690], [2.5, 0.612], [2.8, 0.612], [2.8, 0.608], [2.4, 0.608], [2.4, 0.600], [2.15, 0.594],
    [1.9, 0.600], [1.55, 0.600], [1.45, 0.596], [0.9, 0.571], [0.5, 0.551], [0.22, 0.536], [0.08, 0.528], [0, 0.524],
  ]);
  pen.box(cx - 1.8 * U, cx + 1.8 * U, Y(0.618), Y(0.68), 0.1, 1);
}

/** Generic Nordic church: nave with pitched roof, tower and a pointed spire. */
function church(pen, cx) {
  const { U, Y } = pen;
  pen.to(cx - 10 * U, Y(0.690));
  pen.to(cx - 10 * U, Y(0.668));
  pen.to(cx - 8 * U, Y(0.652));
  pen.to(cx - 2.6 * U, Y(0.652));
  pen.sym(cx, [
    [2.6, 0.652], [2.6, 0.612], [2.9, 0.612], [2.9, 0.607], [2.2, 0.607], [1.2, 0.585], [0.5, 0.568], [0.12, 0.558], [0, 0.556],
  ]);
  pen.to(cx + 2.6 * U, Y(0.690));
}

// Each layout places landmarks left to right; anchors never overlap the previous element.
const LANDMARKS = {
  stockholm: {
    seed: 0x5701,
    build(pen, w) {
      const { U, pad } = pen;
      const at = (frac, left) => Math.max(w * frac, pen.x + left * U);
      const hall = Math.max(w * 0.17, 20 * U);
      pen.to(Math.min(-pad, hall - 26 * U), pen.Y(0.712));
      strip(pen, hall - 24 * U, 0.712);
      cityHall(pen, hall);
      const rid = at(0.36, 13);
      strip(pen, rid - 12 * U, 0.708);
      riddarholmen(pen, rid);
      const pal = at(0.60, 20);
      houses(pen, pal - 19.8 * U, { eave: 0.672 });
      storkyrkan(pen, pal - 16.4 * U);
      palace(pen, pal);
      const ty = at(0.79, 3);
      houses(pen, ty - 2.5 * U, { eave: 0.664 });
      tyska(pen, ty);
      houses(pen, w + pad, { eave: 0.670 });
    },
  },
  nordic: {
    seed: 0x0a0d,
    build(pen, w) {
      const { U, pad } = pen;
      pen.to(-pad, pen.Y(0.700));
      const ch = Math.max(w * 0.63, pen.x + 10 * U);
      houses(pen, ch - 10 * U, { eave: 0.670, spread: 0.02, windows: 0.45 });
      church(pen, ch);
      houses(pen, w + pad, { eave: 0.672, spread: 0.02, windows: 0.45 });
    },
  },
};

function build(id, w, h) {
  const def = LANDMARKS[id];
  const U = clamp(w / 110, 3.2, h / 80);
  const pen = createPen(w, h, U, Math.ceil(w * BLEED + BLEED_PX));
  pen.rnd = prng(def.seed);
  def.build(pen, w);
  const paths = pen.finish();

  // Lit windows, generated once: each has a switch-on threshold so they appear gradually at dusk.
  const rnd = prng(def.seed ^ 0x9e37);
  const ww = Math.max(1.2, U * 0.36);
  const wh = ww * 1.4;
  const windows = [];
  for (const b of pen.boxes) {
    const sx = Math.max(ww * 2.4, U * 1.1);
    const sy = Math.max(wh * 2, U * 1.3);
    const cols = b.cols || Math.max(1, Math.floor((b.x1 - b.x0) / sx));
    const gx = (b.x1 - b.x0) / cols;
    for (let y = b.y0; y + wh <= b.y1; y += sy) {
      for (let c = 0; c < cols; c++) {
        if (rnd() > b.density) continue;
        windows.push({
          x: b.x0 + gx * (c + 0.5) - ww / 2,
          y,
          on: rnd() * 0.7,
          flicker: rnd() < 0.18 ? 0.35 : 0,
          rate: 0.4 + rnd() * 1.4,
          phase: rnd() * TAU,
        });
      }
    }
  }
  // Keep a deterministic, evenly spread subset if the viewport is huge.
  const step = Math.max(1, windows.length / MAX_WINDOWS);
  const kept = [];
  for (let i = 0; i < windows.length && kept.length < MAX_WINDOWS; i += step) kept.push(windows[Math.floor(i)]);
  const shimmer = Array.from({ length: 28 }, () => ({
    x: rnd(), y: 0.8 + rnd() ** 2 * 9, len: 1.5 + rnd() * 5, a: 0.2 + rnd() * 0.35,
    v: 0.002 + rnd() * 0.004, rate: 0.3 + rnd(), phase: rnd() * TAU,
  }));
  return { ...paths, windows: kept, shimmer, ww, wh, U };
}

const shoreY = (h) => SHORE * h;

/** Landmark silhouette layer with a cross-fade between landmarks. */
export function createSkyline() {
  const layers = []; // { id, alpha, target, geo, key }

  function geometry(layer, w, h) {
    const key = `${w}x${h}`;
    if (layer.key !== key) {
      layer.geo = build(layer.id, w, h);
      layer.key = key;
    }
    return layer.geo;
  }

  /** `shift` = distant-layer parallax (px): silhouette, rims, windows, reflections and shimmer move with
   * it via ctx.translate (cached Path2D, no rebuild); the water band itself stays full width. */
  function drawLayer(ctx, env, geo, alpha, rimGrad, shift, rimScale) {
    const { theme, time } = env;
    const shore = shoreY(env.height);
    ctx.translate(shift, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgba(theme.skyline);
    ctx.fill(geo.fill, 'evenodd');
    ctx.fill(geo.orn);
    ctx.translate(-shift, 0);
    drawWater(ctx, env, geo, alpha);
    ctx.translate(shift, 0);
    drawShimmer(ctx, env, geo, alpha);
    // Print keyline (art styles) along the rooftops.
    const key = env.artStyle?.params.keyline;
    if (key && key.alpha > 0.004) {
      ctx.strokeStyle = rgba(key.color, key.alpha);
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = key.width;
      ctx.stroke(geo.rim);
    }
    if (rimGrad) {
      ctx.strokeStyle = rimGrad;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha * 0.3 * rimScale;
      ctx.lineWidth = 3;
      ctx.stroke(geo.rim);
      ctx.globalAlpha = alpha * 0.8 * rimScale;
      ctx.lineWidth = 1.1;
      ctx.stroke(geo.rim);
    }
    // Night rim light: a thin crisp line along the rooftops in the sky's warmest hue.
    const sr = theme.skylineRim;
    if (sr[3] > 0.004) {
      ctx.strokeStyle = rgba(sr);
      ctx.lineJoin = 'round';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.stroke(geo.rim);
    }
    // Windows begin to show around sunset (dayMix 0.5) and are fully on by night.
    const lit = smoothstep(0.3, 0.95, 1 - env.dayMix);
    if (lit <= 0.002) { ctx.translate(-shift, 0); return; }
    ctx.fillStyle = rgba(WINDOW_COLOR);
    for (const win of geo.windows) {
      let a = smoothstep(win.on, win.on + 0.3, lit);
      if (a <= 0.002) continue;
      if (win.flicker) a *= 1 - win.flicker * (0.5 + 0.5 * Math.sin(time * win.rate + win.phase));
      ctx.globalAlpha = alpha * a * 0.9;
      ctx.fillRect(win.x, win.y, geo.ww, geo.wh);
      // Broken reflection streak mirrored under the waterline.
      const ry = 2 * shore - win.y - geo.wh;
      ctx.globalAlpha = alpha * a * 0.28;
      ctx.fillRect(win.x, ry, geo.ww, geo.wh * 0.5);
      ctx.fillRect(win.x + geo.ww * 0.2, ry + geo.wh * 0.9, geo.ww * 0.6, geo.wh * 0.4);
    }
    ctx.translate(-shift, 0);
  }

  /** Riddarfjärden: a band of water from the shore down, tinted by the sky and darkening with depth. */
  function drawWater(ctx, env, geo, alpha) {
    const { width: w, height: h, theme, time } = env;
    const y0 = shoreY(h);
    const sky = theme.sky.bottom;
    const land = theme.skyline;
    const mix = (k) => [0, 1, 2].map((i) => sky[i] + (land[i] - sky[i]) * k).concat(1);
    const g = ctx.createLinearGradient(0, y0, 0, h);
    g.addColorStop(0, rgba(mix(0.35)));
    g.addColorStop(0.35, rgba(mix(0.7)));
    g.addColorStop(1, rgba(land));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, w, h - y0);
    // Shore shadow line (full width; the shimmer dashes are drawn separately in the shifted layer).
    ctx.fillStyle = rgba(land);
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillRect(0, y0, w, Math.max(1, geo.U * 0.18));
  }

  /** Slow shimmer dashes catching the sky light (drawn in the distant layer's shifted space). */
  function drawShimmer(ctx, env, geo, alpha) {
    const { width: w, height: h, theme, time } = env;
    const y0 = shoreY(h);
    ctx.fillStyle = rgba(theme.sky.bottom);
    for (const s of geo.shimmer) {
      const x = ((s.x + time * s.v) % 1.1 - 0.05) * w;
      ctx.globalAlpha = alpha * s.a * (0.6 + 0.4 * Math.sin(time * s.rate + s.phase));
      ctx.fillRect(x, y0 + s.y * geo.U, s.len * geo.U, Math.max(1, geo.U * 0.12));
    }
  }

  return {
    /** Waterline as a fraction of h (the water band starts here). */
    shore: SHORE,
    /** Visible strength of the water band (0 when no landmark is shown). */
    get waterAlpha() {
      let a = 0;
      for (const l of layers) a = Math.max(a, l.alpha);
      return a;
    },
    /** id: 'stockholm' | 'nordic' | null. Fades in/out over FADE_S. */
    setLandmark(id) {
      const next = LANDMARKS[id] ? id : null;
      const current = layers.find((l) => l.target === 1);
      if ((current?.id ?? null) === next) return;
      for (const l of layers) l.target = 0;
      if (!next) return;
      const existing = layers.find((l) => l.id === next);
      if (existing) existing.target = 1;
      else layers.push({ id: next, alpha: 0, target: 1, geo: null, key: '' });
    },

    /** rimScale scales the rimGrad strokes (1 at night/twilight, lower in day; see lighting.js). */
    draw(ctx, env, rimGrad, shift = 0, rimScale = 1) {
      const { width: w, height: h, dt = 0 } = env;
      const step = dt / FADE_S;
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        l.alpha += Math.max(-step, Math.min(step, l.target - l.alpha));
        if (l.target === 0 && l.alpha <= 0) layers.splice(i, 1);
      }
      for (const l of layers) {
        if (l.alpha <= 0.002) continue;
        drawLayer(ctx, env, geometry(l, w, h), l.alpha, rimGrad, shift, rimScale);
      }
      ctx.globalAlpha = 1;
    },
  };
}
