import { bodyAt, HORIZON } from '../engine/celestial.js';
import { HOUR, DAY } from './playback.js';

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
 * The armed arc: where `body` travels over the next day (from `now`, about 24 h, cut short where the
 * forecast ends), above the horizon only. Returns { paths, hours, tick, rest }:
 *   paths  drawn segments of { t, x, y }: [later today until the body sets, then its next pass]
 *   hours  the whole forecast hours on those segments ({ t, x, y })
 *   tick   where the arc goes down through the horizon, { x, y, t }; `t` is the first hour of the
 *          next pass (the tick belongs to the next day), or null when there is no next pass
 *   rest   segments of the body's pass that are not choosable (before now, past the forecast)
 */
export function skyArc(location, now, body, width, height, range) {
  const at = t => ({ t, ...bodyAt(location, t, width, height, body) });
  const end = Math.min(now + DAY, range.max);
  const choosable = t => t > range.min && t <= end;
  const paths = [], rest = [];
  let seg = null, kept = null;
  for (let t = now - 12 * HOUR; t <= now + DAY + 12 * HOUR; t += STEP) {
    const q = at(t), ok = choosable(t);
    if (!q.up) { seg = null; continue; }
    const list = ok ? paths : rest;
    if (!seg || kept !== ok) { list.push(seg = []); kept = ok; }
    seg.push(q);
  }
  const hours = [];
  for (let t = Math.floor(now / HOUR) * HOUR + HOUR; t <= end; t += HOUR) {
    const q = at(t);
    if (q.up && choosable(t)) hours.push(q);
  }
  let tick = null;
  const first = paths[0];
  if (first) {
    const last = first[first.length - 1];
    const sets = !at(last.t + STEP).up && last.t + STEP <= end;
    if (sets) {
      const next = hours.find(h => h.t > last.t) ?? null;
      tick = { x: last.x, y: height * HORIZON, t: next ? next.t : null };
    }
  }
  return { paths, hours, tick, rest };
}

/** A cloud's box expanded to at least 44 px each way. */
export function cloudHit(box) {
  const grow = (a, b) => { const pad = Math.max(0, (MIN_HIT - (b - a)) / 2); return [a - pad, b + pad]; };
  const [left, right] = grow(box.left, box.right), [top, bottom] = grow(box.top, box.bottom);
  return { left, right, top, bottom };
}
const inside = (b, x, y) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;

const segmentsDistance = (segments, x, y) => Math.min(Infinity, ...segments.map(s => polylineDistance(s, x, y)));

/** The hour a point on the armed path stands for: the nearest hour, or the tick (the next day). */
function hourNear(arc, x, y, within = null) {
  const marks = [...arc.hours, ...(arc.tick?.t != null ? [arc.tick] : [])].filter(q => !within || inside(within, q.x, q.y));
  let best = null;
  for (const q of marks) if (!best || dist(x, y, q) < dist(x, y, best)) best = q;
  return best;
}

/** True when (x, y) is inside the 44 px corridor round the armed path (tick included). */
export function onCorridor(arc, x, y) {
  return !!arc && (segmentsDistance(arc.paths, x, y) <= HALF || (!!arc.tick && dist(x, y, arc.tick) <= HALF));
}

/**
 * What a coarse tap in the sky means. Wildlife, the open sheet and a playing journey are settled
 * before this (they never reach it). Not armed: the hand, the horizon band or a cloud arms ('arm');
 * anything else is an ordinary landscape tap ('none'). Armed:
 *   'hand'  the live hand (or a cloud hiding it): let go, nothing plays
 *   'hour'  the 44 px corridor round the arc (the tick included: the next day), or a cloud on it: { t }
 *   'inert' the open horizon, a cloud off the arc, the path before now or past the forecast: the arm stays
 *   'clear' empty ground, water or sky: let go
 */
export function classifyTap({ x, y, armed, hand, arc, clouds = [], horizonY }) {
  const handHit = !!hand && dist(x, y, hand) <= Math.max(HALF, (hand.r ?? 0) + 6);
  const hit = clouds.map(cloudHit).filter(b => inside(b, x, y));
  const hidesHand = !!hand && hit.some(b => inside(b, hand.x, hand.y));
  const onHorizon = Math.abs(y - horizonY) <= HALF;
  if (!armed) return { type: handHit || hidesHand || onHorizon || hit.length ? 'arm' : 'none' };
  if (handHit || hidesHand) return { type: 'hand' };
  if (onCorridor(arc, x, y)) {
    const q = hourNear(arc, x, y);
    return q ? { type: 'hour', t: q.t } : { type: 'inert' };
  }
  const onArc = arc && hit.find(b => arc.paths.some(s => s.some(q => inside(b, q.x, q.y))) || (arc.tick && inside(b, arc.tick.x, arc.tick.y)));
  if (onArc) {
    const q = hourNear(arc, x, y, onArc) ?? hourNear(arc, x, y);
    return q ? { type: 'hour', t: q.t } : { type: 'inert' };
  }
  if (onHorizon || hit.length) return { type: 'inert' };
  if (arc && segmentsDistance(arc.rest, x, y) <= HALF) return { type: 'inert' };
  return { type: 'clear' };
}
