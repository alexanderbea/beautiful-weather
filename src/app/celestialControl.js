import { bodyAt, handBody } from '../engine/celestial.js';
import { solarElevationAt } from '../data/model.js';
import { HOUR, dragHours } from './playback.js';
import { locationTimeZone } from './cities.js';

const TAP_SLOP = 8; // px a press may travel and still be a tap
const MIN_HIT = 44; // px

/** "Sunday 1 November, 16:05" in the place's own time zone. */
export function handTime(at, timeZone) {
  const part = opts => new Intl.DateTimeFormat('en-GB', { ...opts, timeZone }).format(at);
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric' })} ${part({ month: 'long' })}, ${part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}
export function handLabel(at, timeZone, body) {
  return `Forecast. ${handTime(at, timeZone)}. Drag the ${body} to a later hour.`;
}

/**
 * The forecast hand: the sun (the moon after sunset) is the one control that moves time. At rest it
 * is an invisible hit target over the drawn body; pressing it draws a paper-white ring and a faint
 * arc of the body's path; dragging moves a ghost along that path (the live sky stays on now);
 * releasing on a later hour plays the journey. A press that does not travel is an ordinary landscape
 * tap, routed exactly like one (animals first; closes the sheet when it is open).
 */
export function createCelestialControl({ engine, playback, getLive }) {
  const hand = document.createElement('button');
  hand.className = 'celestial-hand';
  hand.type = 'button';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('celestial-selection');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="selection-arc"/><circle class="selection-soft"/><circle class="selection-ghost"/><circle class="selection-ring"/>';
  document.body.append(svg, hand);
  const [arc, soft, ghost, ring] = svg.children;
  let down = null, focused = false;

  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const path = (at, body) => bodyAt(getLive().location, at, innerWidth, innerHeight, body);
  const bodyFor = at => handBody(solarElevationAt(getLive().location, at));
  const radius = body => engine.bodies?.[body]?.r ?? Math.min(innerWidth, innerHeight) * (body === 'sun' ? .05 : .035);
  const setCircle = (el, x, y, r) => { el.setAttribute('cx', x.toFixed(1)); el.setAttribute('cy', y.toFixed(1)); el.setAttribute('r', Math.max(0, r).toFixed(1)); };

  /** Above-horizon path of `body` over the one circuit centred on `at`, as an SVG path. */
  function arcPath(at, body) {
    let d = '', pen = false;
    for (let t = at - 12 * HOUR; t <= at + 12 * HOUR; t += HOUR / 6) {
      const q = path(t, body);
      if (q.up) { d += `${pen ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; pen = true; } else pen = false;
    }
    return d;
  }

  function render() {
    const live = getLive(), s = playback.state;
    const p = live ? engine.celestial : null;
    hand.hidden = !p || !live.forecast?.length;
    if (hand.hidden) { svg.style.display = 'none'; return; }
    const hit = Math.max(MIN_HIT, p.r * 2 + 12);
    hand.style.cssText = `left:${(p.x - hit / 2).toFixed(1)}px;top:${(p.y - hit / 2).toFixed(1)}px;width:${hit}px;height:${hit}px`;
    const traveling = s.mode === 'playing';
    hand.setAttribute('aria-disabled', String(traveling));
    hand.dataset.body = p.body;
    const zone = locationTimeZone(live.location);
    const shownAt = s.chosen ?? playback.origin;
    const shownBody = s.chosen === null ? p.body : bodyFor(s.chosen);
    hand.setAttribute('aria-label', handLabel(shownAt, zone, shownBody));

    const choosing = (down && !down.animal && !down.inert && !down.cancelled) || s.chosen !== null;
    document.body.dataset.selecting = String(!!choosing);
    if (!choosing && !focused) { svg.style.display = 'none'; return; }
    svg.style.display = '';
    svg.classList.toggle('is-instant', reducedMotion());
    // The ring sits on the ghost: the live body until the ghost leaves it.
    const g = s.chosen === null ? { ...p, body: p.body } : { ...path(s.chosen, shownBody), r: radius(shownBody) };
    setCircle(ring, g.x, g.y, g.r + 6);
    setCircle(ghost, g.x, g.y, s.chosen === null ? 0 : g.r);
    // Cloud (or a faint day moon) can hide the disc; a soft disc keeps the hand visible at its true place.
    setCircle(soft, p.x, p.y, choosing && (p.alpha ?? 1) < .35 ? p.r : 0);
    arc.setAttribute('d', choosing ? arcPath(s.chosen ?? playback.origin, shownBody) : '');
  }

  function cancelChoice() {
    if (down) down.cancelled = true;
    playback.cancel();
    render();
  }

  hand.addEventListener('focus', () => { focused = true; render(); });
  hand.addEventListener('blur', () => { focused = false; render(); });
  hand.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (playback.state.chosen !== null) playback.commit();
    } else if (e.key === 'Escape') {
      if (playback.state.chosen !== null || down) { e.preventDefault(); e.stopPropagation(); cancelChoice(); }
    } else if (playback.key(e.key, e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
    }
    render();
  });
  // Keyboard activation (Enter/Space) arrives as click; the gesture lives on pointer events.
  hand.addEventListener('click', e => e.preventDefault());

  hand.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault(); // no focus steal, no text selection, no scroll on touch
    const traveling = playback.state.mode === 'playing';
    down = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, stamp: e.timeStamp,
      at: playback.origin, moved: false, cancelled: false, inert: traveling,
      animal: engine.animalContains(e.clientX, e.clientY) };
    try { hand.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    render();
  });
  hand.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && Math.hypot(e.clientX - down.x0, e.clientY - down.y0) < TAP_SLOP) return;
    down.moved = true;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, dt = Math.max(1, e.timeStamp - down.stamp);
    down.x = e.clientX; down.y = e.clientY; down.stamp = e.timeStamp;
    if (down.animal || down.inert || down.cancelled || !getLive()) return;
    // Pointer travel along the path's local tangent moves the ghost; speed covers more hours.
    const body = bodyFor(down.at);
    const a = path(down.at, body), b = path(down.at + HOUR / 4, body);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const along = (dx * (b.x - a.x) + dy * (b.y - a.y)) / len;
    const range = playback.range();
    down.at = Math.max(range.min, Math.min(range.max, down.at + dragHours(along, len * 4, Math.hypot(dx, dy) / dt) * HOUR));
    playback.select(down.at);
    render();
  });
  const release = (e, cancelled) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    if (cancelled || d.cancelled) { if (!d.cancelled) playback.cancel(); }
    else if (!d.moved) { playback.cancel(); engine.tapAt(e.clientX, e.clientY); } // a tap: never chooses an hour
    else if (!d.animal && !d.inert) playback.commit();
    render();
  };
  hand.addEventListener('pointerup', e => release(e, false));
  hand.addEventListener('pointercancel', e => release(e, true));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (down || playback.state.chosen !== null)) { e.preventDefault(); e.stopImmediatePropagation(); cancelChoice(); }
  }, true);
  window.addEventListener('resize', render);
  return { render, element: hand };
}
