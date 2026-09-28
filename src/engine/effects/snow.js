import { rgba } from '../color.js';
import { areaScale, rand } from './util.js';

const TAU = Math.PI * 2;
const BUCKETS = [
  [0, 0.4, 0.55],
  [0.4, 0.75, 0.8],
  [0.75, 1.01, 1],
];

/** Snowflakes with depth-based size/speed, sinusoidal sway and wind drift. */
export function createSnow() {
  let flakes = [];

  function reset(f, env, scatter) {
    f.z = Math.random();
    f.r = 0.8 + f.z * 2.8 + rand(0, 0.6);
    f.vy = 22 + f.z * 55 + rand(0, 12);
    f.x = rand(0, env.width);
    f.y = scatter ? rand(0, env.height) : -f.r - rand(0, 40);
    f.phase = rand(0, TAU);
    f.sway = rand(0.4, 1.3);
    return f;
  }

  return {
    init(env) {
      const n = Math.round(300 * areaScale(env));
      flakes = Array.from({ length: n }, () => reset({}, env, true));
    },
    resize(env) {
      this.init(env);
    },
    update(dt, env) {
      const { width: w, height: h, time } = env;
      for (const f of flakes) {
        const vx = env.wind * 10 * (0.4 + f.z) + Math.sin(time * f.sway + f.phase) * (6 + f.z * 16);
        f.x += vx * dt;
        f.y += f.vy * dt;
        if (f.y > h + f.r) reset(f, env, false);
        if (f.x > w + f.r) f.x -= w + f.r * 2;
        else if (f.x < -f.r) f.x += w + f.r * 2;
      }
    },
    draw(ctx, env) {
      ctx.fillStyle = rgba(env.theme.particle);
      const sizeK = env.artStyle?.params.snow.size ?? 1;
      for (const [min, max, alpha] of BUCKETS) {
        ctx.globalAlpha = alpha * env.weight;
        ctx.beginPath();
        for (const f of flakes) {
          if (f.z < min || f.z >= max) continue;
          const r = f.r * sizeK;
          ctx.moveTo(f.x + r, f.y);
          ctx.arc(f.x, f.y, r, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
