import { createHills } from './hills.js';
import { createCoast } from './coast.js';
import { createForest } from './forest.js';
import { createMountains } from './mountains.js';

/**
 * Landscape registry: the shape of the land, a dimension separate from the art style (styles/). Any
 * landscape combines with any art style, and the weather, sun and moon light both the same way.
 * Every landscape is free; there is no gating.
 *
 * Landscapes are imagined places. They never stand for the viewer's real surroundings: only the
 * default hills show the location-based town (landmark skyline), and the app labels the others as
 * imagined.
 *
 * Each def is { id, label, hint, swatch, town, sea, layers, drawBehind?, drawOver? }:
 *   layers[3]  far, mid, near depth layers (they keep the scene's parallax factors 0.25 / 0.6 / 1).
 *              Each is a profile ({ base, waves?, bumps?, peaks? }, see profile.js) plus
 *                speed  scroll speed (fraction of the width per second, scaled by the wind)
 *                tint   [r, g, b] multipliers on the theme's hills[i] colour (sand, rock, spruce green)
 *                grey   0-1 desaturation of that colour, before the tint
 *                paint  [r, g, b, amount, light?] recolour toward a material at the colour's own lightness
 *                haze   0-1 mix toward the sky's horizon colour (aerial perspective)
 *              Colours always derive from the live theme, so condition and day / twilight / night
 *              still drive them, and every art style's palette carries through.
 *   town       true when the location's landmark skyline (and its water) may show
 *   sea        { top } open water from `top` (fraction of h) to the bottom, behind the mid layer; null = none
 *   drawBehind(i, ctx, env, api) / drawOver(i, ctx, env, api)
 *              optional detail passes right before / after layer i is filled. api = { w, h, shift,
 *              offset, y(x), path, color, alpha, time, layer }: y(x) is the layer's screen contour,
 *              path its filled Path2D, color its resolved colour, alpha the landscape's cross-fade
 *              weight and time a motion clock that stops under reduced motion. Work is a few paths
 *              per layer per frame; nothing per pixel.
 * Landscape switches cross-fade: contours morph, colours and details blend over TRANSITION_S.
 */
export const LANDSCAPE_DEFS = [
  createHills(),
  createCoast(),
  createForest(),
  createMountains(),
];

export const DEFAULT_LANDSCAPE_ID = 'hills';

/** Landscape definition by id (undefined for unknown ids). */
export function landscapeDef(id) {
  return LANDSCAPE_DEFS.find((l) => l.id === id);
}
