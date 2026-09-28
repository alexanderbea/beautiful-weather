import { rgba } from '../color.js';
import { areaScale, rand } from './util.js';

const TAU = Math.PI * 2;
const RAYS = 12;

/**
 * Calm clear sky. Day: slowly rotating sun rays and warm floating motes.
 * Night: an occasional shooting star (the moon and stars come from the scene).
 */
export function createClear() {
  let motes = [];
  let shooting = null;
  let nextShot = rand(3, 8);

  return {
    init(env) {
      const n = Math.round(36 * areaScale(env));
      motes = Array.from({ length: n }, () => ({
        x: rand(0, env.width),
        y: rand(env.height * 0.3, env.height),
        r: rand(0.8, 2.2),
        phase: rand(0, TAU),
        vy: rand(4, 12),
      }));
    },
    resize(env) {
      this.init(env);
    },
    update(dt, env) {
      for (const m of motes) {
        m.y -= m.vy * dt;
        m.x += (Math.sin(env.time * 0.4 + m.phase) * 6 + env.wind * 3) * dt;
        if (m.y < env.height * 0.25) {
          m.y = env.height + 5;
          m.x = rand(0, env.width);
        }
        if (m.x > env.width + 5) m.x = -5;
      }

      nextShot -= dt;
      if (!shooting && nextShot <= 0 && env.dayMix < 0.3) {
        shooting = { x: rand(0.1, 0.7) * env.width, y: rand(0.05, 0.3) * env.height, age: 0, life: 0.9 };
        nextShot = rand(6, 14);
      }
      if (shooting) {
        shooting.age += dt;
        if (shooting.age > shooting.life) shooting = null;
      }
    },
    drawBack(ctx, env) {
      const { sun, theme, weight, time } = env;
      const alpha = weight * sun.alpha * (0.14 + 0.06 * Math.sin(time * 0.5)) * (env.artStyle?.params.sunRays ?? 1);
      if (alpha > 0.005) {
        const R = sun.r * 9;
        const g = ctx.createRadialGradient(sun.x, sun.y, sun.r, sun.x, sun.y, R);
        g.addColorStop(0, rgba(theme.accent, alpha));
        g.addColorStop(1, rgba(theme.accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        const rot = time * 0.02;
        for (let i = 0; i < RAYS; i++) {
          const a = rot + (i / RAYS) * TAU;
          ctx.moveTo(sun.x, sun.y);
          ctx.arc(sun.x, sun.y, R, a - 0.07, a + 0.07);
        }
        ctx.fill();
      }

      if (shooting) {
        const t = shooting.age / shooting.life;
        const len = env.width * 0.12;
        const x = shooting.x + t * env.width * 0.25;
        const y = shooting.y + t * env.height * 0.12;
        const g = ctx.createLinearGradient(x, y, x - len, y - len * 0.48);
        const a = Math.sin(t * Math.PI) * weight * (1 - env.dayMix);
        g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y - len * 0.48);
        ctx.stroke();
      }
    },
    draw(ctx, env) {
      const alpha = env.weight * env.dayMix;
      if (alpha < 0.01) return;
      ctx.fillStyle = rgba(env.theme.accent);
      for (const m of motes) {
        ctx.globalAlpha = alpha * (0.25 + 0.25 * Math.sin(env.time * 1.3 + m.phase));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
