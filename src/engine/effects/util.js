/** Particle-count multiplier relative to a 1440x900 viewport. */
export function areaScale(env) {
  return Math.max(0.35, Math.min(2, (env.width * env.height) / (1440 * 900)));
}

export const rand = (min, max) => min + Math.random() * (max - min);

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
