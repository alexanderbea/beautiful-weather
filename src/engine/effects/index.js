import { createClouds } from './clouds.js';
import { createRain } from './rain.js';
import { createSnow } from './snow.js';
import { createClear } from './clear.js';
import { createFog } from './fog.js';
import { createGusts } from './gusts.js';

/**
 * Effect registry. A factory returns an object with:
 *   init(env)            allocate particles for the current viewport
 *   update(dt, env)      advance by dt seconds
 *   drawBack?(ctx, env)  drawn behind the landscape (sky elements)
 *   draw?(ctx, env)      drawn in front of the landscape (precipitation)
 *   resize?(env), destroy?()
 * env.weight (0-1) is the effect's cross-fade weight; multiply it into alpha.
 */
export const EFFECTS = {
  clouds: createClouds,
  rain: createRain,
  snow: createSnow,
  clear: createClear,
  fog: createFog,
  gusts: createGusts,
};

/** Which effects are active per condition. Shared ids (e.g. clouds) persist across a switch. */
export const CONDITION_EFFECTS = {
  clear: ['clear', 'clouds'],
  clouds: ['clouds'],
  rain: ['clouds', 'rain'],
  snow: ['clouds', 'snow'],
  wind: ['clouds', 'gusts'],
  fog: ['clouds', 'fog'],
};

export function registerEffect(id, factory) {
  EFFECTS[id] = factory;
}
