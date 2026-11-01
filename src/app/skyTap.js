import { bodyAt } from '../engine/celestial.js';
import { HOUR } from './playback.js';

/**
 * Coarse-pointer forecast choosing: taps in the sky instead of a drag. Pure geometry, shared by the
 * hand (celestialControl.js) and the tests. Every target is at least 44 px.
 */
export const MIN_HIT = 44;
const HALF = MIN_HIT / 2;
const STEP = HOUR / 6;

const dist = (x, y, p) => Math.hypot(x - p.x, y - p.y);

/** Distance from (x, y) to a polyline of { x, y } points (a lone point is a dot). */
export function polylineDistance(points, x, y) {
  if (!points.length) return Infinity;
  let best = dist(x, y, points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * k), y - (a.y + dy * k)));
  }
  return best;
}

/** Start of the local calendar day containing `t` in `timeZone`. */
export function localDayStart(t, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(t).map(p => [p.type, p.value]));
  return t - ((+parts.hour * 60 + +parts.minute) * 60 + +parts.second) * 1000 - (((t % 1000) + 1000) % 1000);
}

/**
 * The armed arc: the above-horizon circuit `body` already travels around `center` (one day's pass),
 * split into the choosable part (after now, up to the last forecast hour) and the rest.
 * Returns { points, rest, hours, beads, tick }: `points` is the drawn future arc, `hours` the whole
 * forecast hours on it, `beads` the day marks (sun: dawn, midday, dusk; moon: dusk, midnight, dawn)
 * that fall on the future arc, `tick` where that arc meets the horizon (the next day), or null.
 */
export function skyArc(location, center, body, width, height, range) {
  const at = t => ({ t, ...bodyAt(location, t, width, height, body) });
  // Up segments over the circuit centred on `center`; keep the one that holds (or is nearest) it.
  const segments = [];
  let seg = null;
  for (let t = center - 12 * HOUR; t <= center + 12 * HOUR; t += STEP) {
    const q = at(t);
    if (q.up) { if (!seg) segments.push(seg = []); seg.push(q); } else seg = null;
  }
  const near = s => Math.min(...s.map(q => Math.abs(q.t - center)));
  const pass = segments.sort((a, b) => near(a) - near(b))[0] ?? [];
  if (!pass.length) return { points: [], rest: [], hours: [], beads: [], tick: null };
  const choosable = t => t > range.min && t <= range.max;
  const points = pass.filter(q => choosable(q.t));
  const rest = pass.filter(q => !choosable(q.t));
  const hours = [];
  for (let t = Math.ceil(pass[0].t / HOUR) * HOUR; t <= pass[pass.length - 1].t; t += HOUR) {
    const q = at(t);
    if (q.up && choosable(t)) hours.push(q);
  }
  const peak = pass.reduce((a, b) => (b.y < a.y ? b : a));
  const beads = [pass[0], peak, pass[pass.length - 1]].filter(q => choosable(q.t));
  const end = pass[pass.length - 1];
  const tick = points.length && points[points.length - 1] === end ? { x: end.x, y: end.y } : null;
  return { points, rest, hours, beads, tick };
}

/** A cloud's box expanded to at least 44 px each way. */
export function cloudHit(box) {
  const grow = (a, b) => { const pad = Math.max(0, (MIN_HIT - (b - a)) / 2); return [a - pad, b + pad]; };
  const [left, right] = grow(box.left, box.right), [top, bottom] = grow(box.top, box.bottom);
  return { left, right, top, bottom };
}
const inside = (b, x, y) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

/**
 * What a coarse tap in the sky means. Wildlife, the open sheet and a playing journey are settled
 * before this (they never reach it). Not armed: the hand, the horizon band or a cloud arms ('arm');
 * anything else is an ordinary landscape tap ('none'). Armed:
 *   'hand'  the live hand (or a cloud hiding it): the armed day at the current clock hour
 *   'hour'  the 44 px corridor round the future arc (beads and tick included), or a cloud on the arc: { t }
 *   'inert' the arc before now or past the last forecast hour: nothing happens, the arm stays
 *   'day'   the horizon band or a cloud off the arc: one local day forward
 *   'clear' empty ground, water or sky: let go
 */
export function classifyTap({ x, y, armed, hand, arc, clouds = [], horizonY }) {
  const handHit = !!hand && dist(x, y, hand) <= Math.max(HALF, (hand.r ?? 0) + 6);
  const hit = clouds.map(cloudHit).filter(b => inside(b, x, y));
  const hidesHand = !!hand && hit.some(b => inside(b, hand.x, hand.y));
  const onHorizon = Math.abs(y - horizonY) <= HALF;
  if (!armed) return { type: handHit || hidesHand || onHorizon || hit.length ? 'arm' : 'none' };
  if (handHit || hidesHand) return { type: 'hand' };
  const nearest = (from, px, py) => from.reduce((a, q) => (!a || dist(px, py, q) < dist(px, py, a) ? q : a), null);
  if (arc && polylineDistance(arc.points, x, y) <= HALF) {
    const q = nearest(arc.hours, x, y);
    return q ? { type: 'hour', t: q.t } : { type: 'inert' };
  }
  const onArc = arc && hit.find(b => arc.points.some(q => inside(b, q.x, q.y)));
  if (onArc) {
    const q = nearest(arc.hours.filter(h => inside(onArc, h.x, h.y)), x, y) ?? nearest(arc.hours, x, y);
    return q ? { type: 'hour', t: q.t } : { type: 'inert' };
  }
  if (onHorizon || hit.length) return { type: 'day' };
  if (arc && polylineDistance(arc.rest, x, y) <= HALF) return { type: 'inert' };
  return { type: 'clear' };
}
