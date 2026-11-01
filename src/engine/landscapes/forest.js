import { drawTreeRow } from './trees.js';

/**
 * Forest: spruce-covered ridges in three depths (dense small crowns far away, a fuller treeline in the
 * middle) and a few tall spruces in the foreground that frame the view.
 */
export function createForest() {
  return {
    id: 'forest',
    label: 'Forest',
    hint: 'Spruce ridges and tall foreground trees',
    swatch: 'linear-gradient(#83b7ea, #e2f1ff 45%, #5e8a6c 47%, #2c5a3c)',
    town: false,
    sea: null,
    layers: [
      { base: 0.66, speed: 0.003, haze: 0.22, tint: [0.82, 0.98, 0.9],
        waves: [[0.03, 1, 0.4], [0.014, 3, 1.2], [0.005, 7, 2.6]] },
      { base: 0.77, speed: 0.006, tint: [0.72, 0.94, 0.8],
        waves: [[0.035, 2, 2.2], [0.015, 5, 0.4]] },
      { base: 0.91, speed: 0.01, tint: [0.68, 0.88, 0.74],
        waves: [[0.02, 1, 5.1], [0.01, 4, 2.8]] },
    ],
    drawOver(i, ctx, env, api) {
      if (i === 0) drawTreeRow(ctx, env, api, { du: 1 / 150, height: [0.016, 0.03], width: 0.42, salt: 11, tiers: 3 });
      else if (i === 1) drawTreeRow(ctx, env, api, { du: 1 / 95, height: [0.035, 0.075], width: 0.46, salt: 23 });
      else drawTreeRow(ctx, env, api, { du: 1 / 7, keep: 0.5, height: [0.3, 0.46], width: 0.3, salt: 37, tiers: 6 });
    },
  };
}
