import { rgba, parseColor } from './color.js';

// The lower edge is the same piecewise-linear contour used to paint the hills.
export function waterContains(water, x, y) {
  return !!water && water.alpha > .05 && Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && x <= water.width && y >= water.shore && y < water.bottom(x);
}

// Passive observation only: no capture, preventDefault or scroll suppression.
export function bindWildlifeInput(target, canvas, enabled, react) {
  let down = null;
  const background = e => !e.defaultPrevented && !e.target.closest?.('button, input, select, label, a, nav, aside, #overlay, [role="group"], .menu');
  const start = e => { down = e.isPrimary !== false && e.button === 0 && background(e)
    ? { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp } : null; };
  const cancel = () => { down = null; };
  const end = e => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId || !enabled() || !background(e)
      || e.timeStamp - d.time > 500 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    const r = canvas.getBoundingClientRect();
    react((e.clientX - r.left) * canvas.clientWidth / r.width,
      (e.clientY - r.top) * canvas.clientHeight / r.height);
  };
  const entries = [['pointerdown', start], ['pointerup', end], ['pointercancel', cancel], ['scroll', cancel]];
  for (const [name, fn] of entries) target.addEventListener(name, fn, { passive: true });
  return () => { cancel(); for (const [name, fn] of entries) target.removeEventListener(name, fn); };
}

/**
 * Where a tap goes. Sheet open: a bird or fish under it gets it (the sheet stays), anything else is a
 * landscape tap that closes the sheet and never also throws a fish. Sheet closed: ordinary wildlife.
 */
export function routeTap(menuOpen, x, y, { interactAnimal, interact, landscapeTap }) {
  if (!menuOpen) { interact(x, y); return 'wildlife'; }
  if (interactAnimal(x, y)) return 'animal';
  landscapeTap();
  return 'landscape';
}

export function createWaterWildlife(random = Math.random) {
  let water = null, fishes = [], ripples = [], cooldown = 0, wait = 10 + random() * 15;
  let blocked = false;
  const reset = () => { water = null; fishes = []; ripples = []; cooldown = 0; wait = 10 + random() * 15; };
  function splash(x, y) {
    ripples.push({ x, y, age: 0 });
    if (ripples.length > 3) ripples.shift();
  }
  function jump(x, y) { fishes.push({ x, y, age: 0, dir: random() < .5 ? -1 : 1 }); splash(x, y); }
  return {
    reset,
    contains(x, y) { return waterContains(water, x, y); },
    setWater(value) { water = value; },
    get state() { return { fish: fishes[0] ? { ...fishes[0] } : null, fishes: fishes.map(fish => ({ ...fish })), ripples: ripples.map(r => ({ ...r })), cooldown }; },
    hit(x, y, width) {
      const scale = Math.max(1, Math.min(1.3, width / 1200));
      return fishes.some(f => waterContains(water, f.x, f.y) && Math.hypot(x - f.x, y - (f.y - Math.sin(Math.PI * f.age / 1.8) * 48 * scale)) < 22 * scale);
    },
    interact(x, y) {
      if (blocked || cooldown > 0 || !waterContains(water, x, y)) return false;
      cooldown = 1.8;
      jump(x, y);
      return true;
    },
    update(dt, env) {
      blocked = !!(env.reducedMotion || env.paused || env.hidden || env.ambient?.water === false);
      if (env.reducedMotion || env.ambient?.water === false) { fishes = []; ripples = []; }
      if (blocked || dt <= 0) return;
      cooldown = Math.max(0, cooldown - dt);
      ripples = ripples.filter(r => (r.age += dt) < 2.4);
      fishes = fishes.filter(fish => {
        fish.age += dt;
        if (fish.age >= 1.8) {
          if (waterContains(water, fish.x, fish.y)) splash(fish.x, fish.y);
          return false;
        }
        return true;
      });
      wait -= dt;
      if (wait <= 0) {
        // Scan the visible contour instead of gambling on twelve random pixels.
        // Margin protects the body/tail from the foreground hills and viewport edge.
        const sites = [];
        if (water && water.alpha > .05) {
          for (let x = 24; x < water.width - 24; x += 4) {
            const bottom = Math.min(water.bottom(x - 18), water.bottom(x), water.bottom(x + 18));
            if (bottom > water.shore + 14) sites.push({ x, y: water.shore + Math.min(14, (bottom - water.shore) / 2) });
          }
        }
        if (sites.length && !fishes.length) {
          const site = sites[Math.min(sites.length - 1, Math.floor(random() * sites.length))];
          jump(site.x, site.y);
          wait = 18 + random() * 24;
        } else wait = 1; // Retry promptly if the water is temporarily unavailable.
      }
    },
    draw(ctx, env) {
      if (!water || water.alpha <= .05 || env.ambient?.water === false) return;
      if (!fishes.length && !ripples.length && !env.reducedMotion) return;
      const scale = Math.max(1, Math.min(1.3, env.width / 1200));
      const painterly = env.artStyle.id === 'vangogh';
      ctx.save();
      ctx.strokeStyle = rgba(parseColor(env.dayMix < .5 ? '#bfdce4' : '#315d68'), .8 * water.alpha);
      ctx.lineWidth = painterly ? 2.1 : 1;
      // Clip surface effects to the actual visible water, including both hills.
      ctx.beginPath(); ctx.moveTo(0, water.shore); ctx.lineTo(water.width, water.shore);
      for (let x = water.width; x >= 0; x -= 2) ctx.lineTo(x, Math.max(water.shore, water.bottom(x)));
      ctx.closePath(); ctx.clip();
      if (env.reducedMotion) {
        // A quiet surface silhouette replaces jumping fish for motion-sensitive viewers.
        for (const u of [.68, .32, .84, .16, .5]) {
          const x = water.width * u, y = water.shore + 5;
          if (!waterContains(water, x, y + 3)) continue;
          ctx.fillStyle = rgba(env.theme.skyline, .65 * water.alpha);
          ctx.beginPath(); ctx.ellipse(x, y, 5 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
          break;
        }
      }
      for (const r of ripples) {
        ctx.globalAlpha = 1 - r.age / 2.4;
        for (let i = 0; i < 2; i++) {
          ctx.beginPath(); ctx.ellipse(r.x, r.y, (3 + r.age * 13 + i * 5) * scale, (1 + r.age * 2 + i) * scale, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
      for (const fish of fishes) {
        if (!waterContains(water, fish.x, fish.y)) continue;
        const t = fish.age / 1.8;
        ctx.save();
        ctx.translate(fish.x, fish.y - Math.sin(Math.PI * t) * 48 * scale);
        ctx.rotate(fish.dir * (t - .5) * 1.8);
        ctx.fillStyle = rgba(parseColor(env.dayMix < .5 ? '#9fbfc8' : '#264b52'), water.alpha);
        ctx.strokeStyle = rgba(parseColor('#e1e9d9'), .95 * water.alpha);
        ctx.lineWidth = painterly ? 2 : 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, 10 * scale, 4 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-8 * scale, 0); ctx.lineTo(-16 * scale, -6 * scale); ctx.lineTo(-16 * scale, 6 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
        // Dorsal fin and eye distinguish a fish from a floating dash.
        ctx.beginPath(); ctx.moveTo(-3 * scale, -3 * scale); ctx.lineTo(0, -8 * scale); ctx.lineTo(4 * scale, -3 * scale); ctx.fill();
        ctx.fillStyle = '#172d35';
        ctx.beginPath(); ctx.arc(6 * scale, -scale, 1.2 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    },
  };
}
