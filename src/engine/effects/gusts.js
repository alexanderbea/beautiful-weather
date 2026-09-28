import { rgba } from '../color.js';
import { areaScale, rand } from './util.js';

/** Basic v1 wind: faint fast horizontal streaks. TODO: blown leaves, swaying grass. */
export function createGusts() {
  let streaks = [];
  function reset(s, env, scatter) {
    s.x = scatter ? rand(0, env.width) : -rand(50, 300);
    s.y = rand(0.1, 0.95) * env.height;
    s.len = rand(60, 220);
    s.speed = rand(0.8, 1.4);
    s.wave = rand(0, Math.PI * 2);
    return s;
  }
  return {
    init(env) {
      streaks = Array.from({ length: Math.round(28 * areaScale(env)) }, () => reset({}, env, true));
    },
    resize(env) {
      this.init(env);
    },
    update(dt, env) {
      const base = 120 + env.wind * 40;
      for (const s of streaks) {
        s.x += base * s.speed * dt;
        if (s.x - s.len > env.width) reset(s, env, false);
      }
    },
    draw(ctx, env) {
      ctx.strokeStyle = rgba(env.theme.particle);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = env.weight;
      ctx.beginPath();
      for (const s of streaks) {
        const bend = Math.sin(env.time * 2 + s.wave) * 6;
        ctx.moveTo(s.x - s.len, s.y);
        ctx.quadraticCurveTo(s.x - s.len / 2, s.y + bend, s.x, s.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  };
}
