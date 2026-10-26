import { rgba } from './color.js';

// The lower edge is the same piecewise-linear contour used to paint the hills.
export function waterContains(water, x, y) {
  return !!water && water.alpha > .05 && Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && x <= water.width && y >= water.shore && y < water.bottom(x);
}

// Passive observation only: no capture, preventDefault or scroll suppression.
export function bindWildlifeInput(target, canvas, enabled, react) {
  let down = null;
  const background = e => !e.defaultPrevented && !e.target.closest?.('button, input, select, label, a, nav, aside, #overlay, [role="group"]');
  const start = e => { down = e.isPrimary !== false && e.button === 0 && background(e)
    ? { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp } : null; };
  const cancel = () => { down = null; };
  const end = e => {
    const d = down; down = null;
    if (!d || d.id !== e.pointerId || !enabled() || !background(e)
      || e.timeStamp - d.time > 500 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    // The readout has pointer-events:none, so protect its bounds explicitly.
    const readout = canvas.ownerDocument?.getElementById('overlay')?.getBoundingClientRect();
    if (readout && e.clientX >= readout.left && e.clientX <= readout.right
      && e.clientY >= readout.top && e.clientY <= readout.bottom) return;
    const r = canvas.getBoundingClientRect();
    react((e.clientX - r.left) * canvas.clientWidth / r.width,
      (e.clientY - r.top) * canvas.clientHeight / r.height);
  };
  const entries = [['pointerdown', start], ['pointerup', end], ['pointercancel', cancel], ['scroll', cancel]];
  for (const [name, fn] of entries) target.addEventListener(name, fn, { passive: true });
  return () => { cancel(); for (const [name, fn] of entries) target.removeEventListener(name, fn); };
}

export function createWaterWildlife(random = Math.random) {
  let water = null, fish = null, ripples = [], cooldown = 0, wait = 10 + random() * 15;
  let blocked = false;
  const reset = () => { water = null; fish = null; ripples = []; cooldown = 0; wait = 10 + random() * 15; };
  function splash(x, y) {
    ripples.push({ x, y, age: 0 });
    if (ripples.length > 3) ripples.shift();
  }
  function jump(x, y) { fish = { x, y, age: 0, dir: random() < .5 ? -1 : 1 }; splash(x, y); }
  return {
    reset,
    setWater(value) { water = value; },
    get state() { return { fish: fish && { ...fish }, ripples: ripples.map(r => ({ ...r })), cooldown }; },
    interact(x, y) {
      if (blocked || cooldown > 0 || !waterContains(water, x, y)) return false;
      cooldown = 1.8;
      if (!fish) jump(x, y);
      else splash(x, y);
      return true;
    },
    update(dt, env) {
      blocked = !!(env.reducedMotion || env.paused || env.hidden || env.ambient?.water === false);
      if (env.reducedMotion || env.ambient?.water === false) { fish = null; ripples = []; }
      if (blocked || dt <= 0) return;
      cooldown = Math.max(0, cooldown - dt);
      ripples = ripples.filter(r => (r.age += dt) < 2.4);
      if (fish) {
        fish.age += dt;
        if (fish.age >= 1.15) {
          if (waterContains(water, fish.x, fish.y)) splash(fish.x, fish.y);
          fish = null;
        }
      }
      wait -= dt;
      if (wait <= 0) {
        wait = 18 + random() * 24;
        for (let i = 0; i < 12 && !fish; i++) {
          const x = random() * (water?.width ?? 0);
          const y = water ? water.shore + 3 + random() * Math.max(0, water.bottom(x) - water.shore - 6) : 0;
          if (waterContains(water, x, y)) jump(x, y);
        }
      }
    },
    draw(ctx, env) {
      if (!water || water.alpha <= .05 || env.ambient?.water === false) return;
      if (!fish && !ripples.length && !env.reducedMotion) return;
      const scale = Math.max(.65, Math.min(1.3, env.width / 1200));
      const painterly = env.artStyle.id === 'vangogh';
      ctx.save();
      ctx.strokeStyle = rgba(env.theme.sky.bottom, .65 * water.alpha);
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
      if (!fish || !waterContains(water, fish.x, fish.y)) return;
      const t = fish.age / 1.15;
      ctx.save();
      ctx.translate(fish.x, fish.y - Math.sin(Math.PI * t) * 20 * scale);
      ctx.rotate(fish.dir * (t - .5) * 1.8);
      ctx.fillStyle = rgba(env.theme.skyline, .85 * water.alpha);
      ctx.strokeStyle = rgba(env.theme.sky.bottom, .7 * water.alpha);
      ctx.lineWidth = painterly ? 2 : .8;
      ctx.beginPath(); ctx.ellipse(0, 0, 5 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4 * scale, 0); ctx.lineTo(-8 * scale, -3 * scale); ctx.lineTo(-8 * scale, 3 * scale); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  };
}
