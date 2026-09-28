import { rgba } from '../color.js';
import { areaScale, rand, smoothstep } from './util.js';

const TAU = Math.PI * 2;
const MAX_CLOUDS = 22;
const CLOUD_PARALLAX = 0.1;

/**
 * Drifting puff clouds. Visible count follows theme.cloud.cover: every cloud has a random
 * threshold and fades in once cover passes it, so cover changes cross-fade smoothly.
 */
export function createClouds() {
  let clouds = [];

  function makeCloud(env, scatter) {
    const depth = Math.random(); // 0 = far, 1 = near
    const scale = (0.55 + depth * 0.8) * Math.max(0.6, Math.min(1.4, env.width / 1200));
    const width = rand(140, 260) * scale;
    const count = 5 + Math.floor(Math.random() * 4);
    const puffs = Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      return {
        dx: (t - 0.5) * width,
        dy: -Math.sin(t * Math.PI) * rand(10, 30) * scale,
        r: (22 + Math.sin(t * Math.PI) * rand(18, 34)) * scale,
      };
    });
    return {
      x: scatter ? rand(-width, env.width + width) : -width,
      y: env.height * rand(0.06, 0.42) * (0.7 + depth * 0.5),
      width,
      depth,
      puffs,
      threshold: Math.random() * 0.9,
      speed: 5 + depth * 12,
    };
  }

  function drawCloud(ctx, c, color, shadow, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shadow;
    ctx.beginPath();
    for (const p of c.puffs) {
      ctx.moveTo(c.x + p.dx + p.r, c.y + p.dy + p.r * 0.22);
      ctx.arc(c.x + p.dx, c.y + p.dy + p.r * 0.22, p.r, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of c.puffs) {
      const r = p.r * 0.9;
      ctx.moveTo(c.x + p.dx + r, c.y + p.dy - p.r * 0.08);
      ctx.arc(c.x + p.dx, c.y + p.dy - p.r * 0.08, r, 0, TAU);
    }
    ctx.fill();
  }

  return {
    init(env) {
      const n = Math.round(MAX_CLOUDS * Math.min(1.3, 0.6 + areaScale(env) * 0.4));
      clouds = Array.from({ length: n }, () => makeCloud(env, true)).sort((a, b) => a.depth - b.depth);
    },
    resize(env) {
      this.init(env);
    },
    update(dt, env) {
      for (const c of clouds) {
        c.x += (c.speed + env.wind * (2 + c.depth * 4)) * dt;
        if (c.x - c.width > env.width + 60) {
          Object.assign(c, makeCloud(env, false), { depth: c.depth, threshold: c.threshold });
          c.x = -c.width - 60;
        }
      }
    },
    drawBack(ctx, env) {
      const { cloud } = env.theme;
      const weight = env.weight;

      // Overcast band: a soft sheet across the top of the sky.
      if (cloud.band > 0.01) {
        const g = ctx.createLinearGradient(0, 0, 0, env.height * 0.55);
        g.addColorStop(0, rgba(cloud.shadow, cloud.band * weight));
        g.addColorStop(0.6, rgba(cloud.color, cloud.band * 0.5 * weight));
        g.addColorStop(1, rgba(cloud.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, env.width, env.height * 0.55);
      }

      const color = rgba(cloud.color);
      const shadow = rgba(cloud.shadow);
      // Clouds sit just in front of the sky: a slight parallax (factor CLOUD_PARALLAX of the camera).
      const shift = -(env.camX ?? 0) * CLOUD_PARALLAX;
      ctx.translate(shift, 0);
      for (const c of clouds) {
        const vis = smoothstep(c.threshold, c.threshold + 0.12, cloud.cover);
        const alpha = vis * cloud.opacity * weight * (0.75 + c.depth * 0.25);
        if (alpha > 0.005) drawCloud(ctx, c, color, shadow, alpha);
      }
      ctx.translate(-shift, 0);
      ctx.globalAlpha = 1;

      // Moon break: a thin patch in the overcast where the moon shines through the veil.
      const moon = env.moon;
      const a = cloud.moonBreak * weight * (1 - env.dayMix);
      if (moon && a > 0.005) {
        const { moon: style } = env.theme;
        const R = moon.r * 4;
        const halo = ctx.createRadialGradient(moon.x, moon.y, moon.r, moon.x, moon.y, R);
        halo.addColorStop(0, rgba(style.glow, a * 0.7));
        halo.addColorStop(1, rgba(style.glow, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(moon.x - R, moon.y - R, R * 2, R * 2);
        ctx.fillStyle = rgba(style.color, a);
        ctx.beginPath();
        ctx.arc(moon.x, moon.y, moon.r, 0, TAU);
        ctx.fill();
      }
    },
  };
}
