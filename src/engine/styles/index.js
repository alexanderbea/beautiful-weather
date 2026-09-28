import { createJapanese } from './japanese.js';
import { createVanGogh } from './vangogh.js';
import { createGhibli } from './ghibli.js';

/**
 * Art-style registry (#25). A style restyles the same scene three ways, all cheap per frame:
 *   themes   THEMES-shaped palette overrides (deep-merged over the base palettes, so they cross-fade
 *            with condition and day/twilight/night exactly like the classic palette does)
 *   params   numeric scene parameters (partial over STYLE_PARAMS); the engine lerps them between the
 *            outgoing and incoming style, so a switch never pops
 *   passes   optional overlay passes on a style instance, drawn with the style's cross-fade weight:
 *              drawSkyBase(ctx, env, weight)  right after the sky gradient, under stars / glow / sun
 *              drawSkyTop(ctx, env, weight)   after the sun and moon, under the clouds
 *              drawLand(ctx, env, weight)     after the hills, under the ambient shade and precipitation
 *              drawPost(ctx, env, weight)     last: full-frame textures (brush strokes, paper grain)
 *            plus init(env) / resize(env) / update(dt, env) / destroy() like an effect. Anything that
 *            costs real work (stroke fields, grain tiles) is pre-rendered in init/resize and drawn
 *            with a drawImage or pattern fill per frame; nothing per-pixel per frame.
 * Each def is { id, label, hint, swatch, themes, params, create }. The picker (via src/app/artStyle.js)
 * reads { id, label, hint, swatch } from STYLE_DEFS, so this is the one
 * place a style is registered.
 */

/** Scene parameters the styles tweak; these defaults are the neutral base look each style starts from. */
export const STYLE_PARAMS = {
  // Stepped "bokashi" sky: `bands` tonal steps drawn over the smooth gradient at `mix` opacity (0 = off),
  // each boundary feathered over `feather` of the sky height.
  sky: { bands: 6, mix: 0, feather: 0.025 },
  // Ink keyline along the hill tops, the skyline roofs, cloud edges and the sun/moon (alpha 0 = off).
  keyline: { color: [24, 30, 52, 1], alpha: 0, width: 1.2 }, // colours are [r, g, b, a] like compiled theme colours
  // Bokashi under each hill's top edge: a darker wipe `depth` of the viewport deep at `alpha` (0 = off).
  hillShade: { alpha: 0, depth: 0.05 },
  // Multipliers on the lighting pass: hill/skyline rim light, golden-hour glow, horizon band, sunset glow.
  rim: 1,
  golden: 1,
  horizonGlow: 1,
  sunsetGlow: 1,
  // Sun/moon: glow strength, disc size multiplier, outline (keyline alpha) for flat print discs.
  celestial: { glow: 1, size: 1, outline: 0 },
  // Puff clouds: size, squash (vertical spread of the puffs; < 1 = long low bars), flat (0 = shaded puffs,
  // 1 = one flat colour with the keyline), outline (keyline round the cloud), highlight cap (0-1).
  cloud: { scale: 1, squash: 1, flat: 0, outline: 0, highlight: 0 },
  // Rotating sun rays of the clear-sky effect (0 = off).
  sunRays: 1,
  // Rain: streak length / width multipliers, how much of the night halo and of the ground splashes to
  // keep, round (1) or butt (0) stroke caps; snowflake size.
  rain: { len: 1, width: 1, glow: 1, splash: 1, round: 1 },
  snow: { size: 1 },
  // Motion: cloud drift speed multiplier, vertical cloud bob (fraction of ~1% of h) at bobRate rad/s,
  // puff boil (radius wobble share) at boilRate rad/s, grass sway amplitude / rate and water ripple
  // amplitude multipliers. Reduced motion zeroes bob and boil.
  motion: { cloudSpeed: 1, cloudBob: 0, bobRate: 0.3, cloudBoil: 0, boilRate: 1, sway: 1, swayRate: 1, ripple: 1 },
};

export const STYLE_DEFS = [
  createJapanese(),
  createVanGogh(),
  createGhibli(),
];

export const DEFAULT_STYLE_ID = 'ghibli';

/** Style definition by id (undefined for unknown ids). */
export function styleDef(id) {
  return STYLE_DEFS.find((s) => s.id === id);
}
