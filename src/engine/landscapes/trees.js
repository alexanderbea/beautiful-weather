import { rgba } from '../color.js';
import { eachSlot } from './profile.js';

/** Adds a tiered spruce (apex up, `tiers` notched skirts, short trunk) standing at (x, yb) to `p`. */
export function spruce(p, x, yb, H, W, tiers = 4) {
  const hw = W / 2;
  const outer = (j) => yb - H * (1 - j / tiers) * 0.9 - H * 0.06;
  p.moveTo(x, yb - H);
  for (let j = 1; j <= tiers; j++) {
    p.lineTo(x + (hw * j) / tiers, outer(j));
    if (j < tiers) p.lineTo(x + ((hw * j) / tiers) * 0.45, outer(j) - H * 0.03);
  }
  const tw = Math.max(0.6, hw * 0.12);
  p.lineTo(x + tw, outer(tiers));
  p.lineTo(x + tw, yb + H * 0.25);
  p.lineTo(x - tw, yb + H * 0.25);
  p.lineTo(x - tw, outer(tiers));
  for (let j = tiers; j >= 1; j--) {
    p.lineTo(x - (hw * j) / tiers, outer(j));
    if (j > 1) p.lineTo(x - ((hw * (j - 1)) / tiers) * 0.45, outer(j - 1) - H * 0.03);
  }
  p.closePath();
}

/**
 * A row of spruces rooted on the layer's contour, filled in the layer colour so they read as part of
 * its silhouette. opts: du (slot spacing, fraction of w), keep (share of slots with a tree), height
 * [min, max] and width (x height) as fractions of h, salt (layout seed), tiers.
 */
export function drawTreeRow(ctx, env, api, { du, keep = 1, height, width = 0.32, salt = 1, tiers = 4 }) {
  const { h } = api;
  const p = new Path2D();
  eachSlot(api, du, (x, id, r) => {
    if (r > keep) return;
    const H = h * (height[0] + (height[1] - height[0]) * ((r * 7.31) % 1));
    if (x < -H || x > api.w + H) return;
    spruce(p, x, api.y(x) + H * 0.08, H, H * width * (0.85 + ((r * 3.7) % 1) * 0.3), tiers);
  }, salt);
  ctx.globalAlpha = api.alpha;
  ctx.fillStyle = rgba(api.color);
  ctx.fill(p);
  // Print styles: the same ink keyline the hills get.
  const key = env.artStyle.params.keyline;
  if (key.alpha > 0.004) {
    // Only above the layer's own ground, so the trunks' feet do not show through the hill.
    const above = new Path2D();
    above.rect(-api.w, -api.h, api.w * 3, api.h * 3);
    above.addPath(api.path);
    ctx.save();
    ctx.clip(above, 'evenodd');
    ctx.strokeStyle = rgba(key.color, key.alpha);
    ctx.lineWidth = key.width;
    ctx.lineJoin = 'round';
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
