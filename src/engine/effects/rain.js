import { rgba } from '../color.js';
import { areaScale, rand } from './util.js';

const SPLASH_LIFE = 0.42;
const DROPS_BASE = 680; // per 1440x900; areaScale caps total at 2x
const SPLASHES_BASE = 520; // pool size per 1440x900
const SPLASH_MIN_Z = 0.25; // far drops land without a visible ripple
const SPLASH_BUCKETS = 4; // splashes are batched into this many alpha steps

/** Wind-slanted rain streaks with small ground ripples. Pairs with the clouds effect. */
export function createRain() {
  let drops = [];
  // Fixed pool of splashes; live ones are packed in [0, splashCount). No per-frame allocation.
  let splashes = [];
  let splashCount = 0;

  function reset(d, env, scatter) {
    d.z = Math.random(); // depth: 0 far, 1 near
    d.len = 10 + d.z * 20;
    d.speed = 840 + d.z * 740 + rand(0, 170);
    d.x = rand(-0.2, 1.2) * env.width;
    d.y = scatter ? rand(0, env.height) : -d.len - rand(0, env.height * 0.25);
    d.groundY = env.height * (0.7 + d.z * 0.3); // nearer drops land lower on screen
    d.vx = 0;
    return d;
  }

  function strokeDrops(ctx, env, minZ, maxZ, alpha, width) {
    ctx.globalAlpha = alpha * env.weight;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const d of drops) {
      if (d.z < minZ || d.z >= maxZ) continue;
      const k = d.len / d.speed;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * k, d.y - d.len);
    }
    ctx.stroke();
  }

  return {
    init(env) {
      const scale = areaScale(env);
      drops = Array.from({ length: Math.round(DROPS_BASE * scale) }, () => reset({}, env, true));
      splashes = Array.from({ length: Math.round(SPLASHES_BASE * scale) }, () => ({ x: 0, y: 0, z: 0, age: 0 }));
      splashCount = 0;
    },
    resize(env) {
      this.init(env);
    },
    update(dt, env) {
      const w = env.width;
      const windPx = env.wind * 24;
      for (const d of drops) {
        d.vx = windPx * (0.6 + d.z * 0.7);
        d.x += d.vx * dt;
        d.y += d.speed * dt;
        if (d.y > d.groundY) {
          if (d.z > SPLASH_MIN_Z && splashCount < splashes.length) {
            const s = splashes[splashCount++];
            s.x = d.x;
            s.y = d.groundY;
            s.z = d.z;
            s.age = 0;
          }
          reset(d, env, false);
        }
        if (d.x > w * 1.2) d.x -= w * 1.4;
        else if (d.x < -w * 0.2) d.x += w * 1.4;
      }
      // Age and compact in place (swap dead with last live).
      for (let i = 0; i < splashCount; ) {
        const s = splashes[i];
        s.age += dt;
        if (s.age >= SPLASH_LIFE) {
          splashCount--;
          splashes[i] = splashes[splashCount];
          splashes[splashCount] = s;
        } else i++;
      }
    },
    draw(ctx, env) {
      // Night palettes set a halo so streaks read against a dark sky; one extra path, near drops only.
      if (env.theme.particleGlow[3] > 0.005) {
        ctx.strokeStyle = rgba(env.theme.particleGlow);
        ctx.lineCap = 'round';
        strokeDrops(ctx, env, 0.5, 1.01, 1, 4.5);
      }
      ctx.strokeStyle = rgba(env.theme.particle);
      ctx.lineCap = 'round';
      strokeDrops(ctx, env, 0, 0.5, 0.5, 1);
      strokeDrops(ctx, env, 0.5, 1.01, 0.9, 1.7);

      // Splashes: expanding ground ripple plus a short upward spray tick in the first third of life.
      // Batched into SPLASH_BUCKETS alpha steps by age, so it is a handful of strokes, not one per splash.
      ctx.lineWidth = 1.1;
      for (let b = 0; b < SPLASH_BUCKETS; b++) {
        const t0 = b / SPLASH_BUCKETS;
        const t1 = (b + 1) / SPLASH_BUCKETS;
        ctx.globalAlpha = (1 - (t0 + t1) / 2) * 0.75 * env.weight;
        ctx.beginPath();
        for (let i = 0; i < splashCount; i++) {
          const s = splashes[i];
          const t = s.age / SPLASH_LIFE;
          if (t < t0 || t >= t1) continue;
          const r = 1.5 + t * 14 * s.z;
          ctx.moveTo(s.x + r, s.y);
          ctx.ellipse(s.x, s.y, r, r * 0.28, 0, 0, Math.PI * 2);
          if (t < 0.33 && s.z > 0.55) {
            const h = (1 - t * 3) * 7 * s.z;
            ctx.moveTo(s.x - r * 0.5, s.y);
            ctx.lineTo(s.x - r * 0.9, s.y - h);
            ctx.moveTo(s.x + r * 0.5, s.y);
            ctx.lineTo(s.x + r * 0.9, s.y - h);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  };
}
