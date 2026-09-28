import { rgba } from '../color.js';
import { areaScale, rand, smoothstep } from './util.js';

const TAU = Math.PI * 2;
const MAX_CLOUDS = 22;
// Clouds sit just in front of the sky: far clouds barely move with the camera, near ones a little more
// (still well behind the far ridge's 0.25), so the deck reads as layered depth.
const CLOUD_PARALLAX_FAR = 0.04;
const CLOUD_PARALLAX_NEAR = 0.17;
const NO_MOTION = { cloudSpeed: 1, cloudBob: 0, bobRate: 0.3, cloudBoil: 0, boilRate: 1 };

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
        phase: i * 1.7 + rand(0, TAU),
      };
    });
    for (const p of puffs) p.rb = p.r; // drawn radius: r with the art style's boil applied (update)
    return {
      x: scatter ? rand(-width, env.width + width) : -width,
      y: env.height * rand(0.06, 0.42) * (0.7 + depth * 0.5),
      width,
      depth,
      puffs,
      threshold: Math.random() * 0.9,
      phase: rand(0, TAU),
      by: 0, // vertical bob offset (px), from the art style's motion params
      speed: (4 + depth * 11) * Math.max(0.6, Math.min(1.4, env.width / 1440)), // px/s: far slow, near faster
    };
  }

  /**
   * One cloud: shaded puffs (shadow disc under a lighter disc). Art-style params (art = params.cloud):
   * scale grows the puffs, flat fades the shadow out toward a single flat print colour, outline strokes
   * an ink keyline round the lit puffs, highlight adds a bright cap on top (cel-shaded cumulus).
   */
  function drawCloud(ctx, c, color, shadow, alpha, shift, art, key, highlight) {
    const s = art.scale;
    const q = art.squash;
    ctx.globalAlpha = alpha;
    ctx.translate(shift, c.by);
    if (art.flat < 0.996) {
      ctx.globalAlpha = alpha * (1 - art.flat);
      ctx.fillStyle = shadow;
      ctx.beginPath();
      for (const p of c.puffs) {
        ctx.moveTo(c.x + p.dx * s + p.rb * s, c.y + p.dy * s * q + p.rb * s * 0.22);
        ctx.arc(c.x + p.dx * s, c.y + p.dy * s * q + p.rb * s * 0.22, p.rb * s, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    // Keyline round the cloud's outline (not each puff): an ink fill slightly larger than the lit puffs,
    // which the lit fill then covers except for a rim.
    if (art.outline > 0.004) {
      const grow = key.width;
      ctx.globalAlpha = alpha * art.outline * key.alpha;
      ctx.fillStyle = rgba(key.color);
      ctx.beginPath();
      for (const p of c.puffs) {
        const r = p.rb * s * 0.9 + grow;
        ctx.moveTo(c.x + p.dx * s + r, c.y + p.dy * s * q - p.rb * s * 0.08);
        ctx.arc(c.x + p.dx * s, c.y + p.dy * s * q - p.rb * s * 0.08, r, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of c.puffs) {
      const r = p.rb * s * 0.9;
      ctx.moveTo(c.x + p.dx * s + r, c.y + p.dy * s * q - p.rb * s * 0.08);
      ctx.arc(c.x + p.dx * s, c.y + p.dy * s * q - p.rb * s * 0.08, r, 0, TAU);
    }
    ctx.fill();
    if (art.highlight > 0.004) {
      ctx.globalAlpha = alpha * art.highlight;
      ctx.fillStyle = highlight;
      ctx.beginPath();
      for (const p of c.puffs) {
        const r = p.rb * s * 0.62;
        ctx.moveTo(c.x + p.dx * s + r, c.y + p.dy * s * q - p.rb * s * 0.34);
        ctx.arc(c.x + p.dx * s, c.y + p.dy * s * q - p.rb * s * 0.34, r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.translate(-shift, -c.by);
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
      // Art-style motion (styles/index.js STYLE_PARAMS.motion): drift speed, vertical bob and puff boil.
      const m = env.artStyle?.params.motion ?? NO_MOTION;
      const t = env.time;
      const still = env.reducedMotion ? 0 : 1;
      for (const c of clouds) {
        c.x += (c.speed + env.wind * (2 + c.depth * 4)) * m.cloudSpeed * dt;
        c.by = Math.sin(t * m.bobRate + c.phase) * m.cloudBob * env.height * 0.012 * still;
        for (const p of c.puffs) p.rb = p.r * (1 + m.cloudBoil * still * Math.sin(t * m.boilRate + p.phase));
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
      const art = env.artStyle?.params.cloud ?? { scale: 1, squash: 1, flat: 0, outline: 0, highlight: 0 };
      const key = env.artStyle?.params.keyline ?? { color: [0, 0, 0], alpha: 0, width: 1 };
      const highlight = art.highlight > 0.004
        ? rgba([cloud.color[0] + (255 - cloud.color[0]) * 0.55, cloud.color[1] + (255 - cloud.color[1]) * 0.55, cloud.color[2] + (255 - cloud.color[2]) * 0.5, 1])
        : null;
      // Drifting puffs (dev toggle: env.ambient.clouds); the overcast band and moon break stay.
      const cam = -(env.camX ?? 0);
      const puffsOn = env.ambient?.clouds !== false;
      for (const c of puffsOn ? clouds : []) {
        const vis = smoothstep(c.threshold, c.threshold + 0.12, cloud.cover);
        const alpha = vis * cloud.opacity * weight * (0.75 + c.depth * 0.25);
        const shift = cam * (CLOUD_PARALLAX_FAR + (CLOUD_PARALLAX_NEAR - CLOUD_PARALLAX_FAR) * c.depth);
        if (alpha > 0.005) drawCloud(ctx, c, color, shadow, alpha, shift, art, key, highlight);
      }
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
