import { bodyAt, handBody, HORIZON } from '../engine/celestial.js';
import { solarElevationAt } from '../data/model.js';
import { HOUR, DAY, dragHours, clampTime } from './playback.js';
import { locationTimeZone } from './cities.js';
import { skyArc, classifyTap, localDayStart } from './skyTap.js';

const TAP_SLOP = 8; // px a press may travel and still be a tap
const MIN_HIT = 44; // px
const BREATH_MS = 1600;

/** A finger (or a coarse-pointer device): the tap path. A mouse always keeps the drag. */
export function isCoarse(e, media = globalThis.matchMedia) {
  if (e?.pointerType === 'touch') return true;
  if (e?.pointerType === 'mouse') return false;
  return !!media?.('(pointer: coarse)').matches;
}

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
 *
 * Coarse pointer (a finger): no drag. Choosing is taps in the sky (see skyTap.js): the first tap on
 * the hand, the horizon or a cloud arms (ring, faint future arc, three beads, a horizon tick); a tap
 * on the arc plays that hour; the horizon or a cloud off the arc steps a day and stays armed; empty
 * ground or water lets go. Wildlife, the open sheet and a playing journey never reach it.
 */
export function createCelestialControl({ engine, playback, getLive, hint = null }) {
  const hand = document.createElement('button');
  hand.className = 'celestial-hand';
  hand.type = 'button';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('celestial-selection');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="selection-arc"/><path class="selection-tick"/><circle class="selection-bead"/><circle class="selection-bead"/><circle class="selection-bead"/>'
    + '<circle class="selection-soft"/><circle class="selection-ghost"/><circle class="selection-ring"/><circle class="selection-breath"/>';
  document.body.append(svg, hand);
  const [arc, tick, bead0, bead1, bead2, soft, ghost, ring, breathRing] = svg.children;
  const beads = [bead0, bead1, bead2];
  let down = null, focused = false, touch = null;
  let armed = null; // { body, day }: coarse choosing; the live sky stays on now
  let breath = null, breathed = false;

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

  const setHint = (text, cls = '') => { if (!hint) return; if (hint.textContent !== text) hint.textContent = text; hint.className = `overlay__hint${cls ? ` ${cls}` : ''}`; };
  const armedArc = () => skyArc(getLive().location, playback.origin + armed.day * DAY, armed.body, innerWidth, innerHeight, playback.range());
  const arcD = points => points.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join('');

  /** Armed: ring on the live hand, the faint future arc, beads, horizon tick, a ghost on a later day. */
  function renderArmed(p) {
    const a = armedArc(), s = playback.state;
    svg.style.display = '';
    svg.classList.toggle('is-armed', true);
    setCircle(ring, p.x, p.y, p.r + 6);
    const g = s.chosen === null ? null : path(s.chosen, armed.body);
    setCircle(ghost, g?.x ?? 0, g?.y ?? 0, g ? radius(armed.body) : 0);
    setCircle(soft, p.x, p.y, (p.alpha ?? 1) < .35 ? p.r : 0);
    arc.setAttribute('d', arcD(a.points));
    beads.forEach((b, i) => { const q = a.beads[i]; setCircle(b, q?.x ?? 0, q?.y ?? 0, q ? 3 : 0); });
    tick.setAttribute('d', a.tick ? `M${(a.tick.x - 6).toFixed(1)},${a.tick.y.toFixed(1)}h12` : '');
    setCircle(breathRing, 0, 0, 0);
    setHint('Tap ahead');
  }

  function render() {
    const live = getLive(), s = playback.state;
    const p = live ? engine.celestial : null;
    hand.hidden = !p || !live.forecast?.length;
    if (hand.hidden) { svg.style.display = 'none'; if (!armed && !breath) setHint(''); return; }
    const hit = Math.max(MIN_HIT, p.r * 2 + 12);
    hand.style.cssText = `left:${(p.x - hit / 2).toFixed(1)}px;top:${(p.y - hit / 2).toFixed(1)}px;width:${hit}px;height:${hit}px`;
    const traveling = s.mode === 'playing';
    hand.setAttribute('aria-disabled', String(traveling));
    hand.dataset.body = p.body;
    const zone = locationTimeZone(live.location);
    const shownAt = s.chosen ?? playback.origin;
    const shownBody = s.chosen === null ? p.body : bodyFor(s.chosen);
    hand.setAttribute('aria-label', handLabel(shownAt, zone, shownBody));

    const choosing = (down && !down.animal && !down.inert && !down.cancelled) || s.chosen !== null || !!armed;
    document.body.dataset.selecting = String(!!choosing);
    svg.classList.toggle('is-instant', reducedMotion());
    if (armed) { renderArmed(p); return; }
    svg.classList.toggle('is-armed', false);
    svg.removeAttribute?.('data-step');
    beads.forEach(b => setCircle(b, 0, 0, 0));
    tick.setAttribute('d', '');
    if (breath) { setCircle(breathRing, p.x, p.y, p.r + 6); setHint(`Tap the ${breath.body}`, 'is-breathing'); }
    else { setCircle(breathRing, 0, 0, 0); setHint(''); }
    svg.classList.toggle('is-breathing', !!breath);
    if (!choosing && !focused) {
      if (breath) { svg.style.display = ''; for (const el of [ring, ghost, soft]) setCircle(el, 0, 0, 0); arc.setAttribute('d', ''); }
      else svg.style.display = 'none';
      return;
    }
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
    armed = null;
    playback.cancel();
    render();
  }

  /** Coarse choosing ends: the ring, arc, beads, tick, ghost and hint leave; then `t` plays (if any). */
  function release(t = null) {
    armed = null;
    if (t === null) playback.cancel();
    else { playback.select(t); playback.commit(); }
    render();
  }

  /** Coarse tap on the landscape (the engine asks first). True when the hand took it. */
  function coarseTap(x, y, e) {
    if (!isCoarse(e)) return false;
    const live = getLive(), p = engine.celestial;
    if (!live?.forecast?.length || !p || document.body.dataset.desk === 'on') return false;
    if (document.body.dataset.menu === 'open') return false; // the sheet closes; an arm waits underneath
    if (engine.animalContains(x, y)) return false; // a bird or a fish wins
    if (playback.state.mode === 'playing') return false; // the hand is already traveling
    const action = classifyTap({ x, y, armed: !!armed, hand: p, arc: armed ? armedArc() : null,
      clouds: engine.cloudBoxes?.() ?? [], horizonY: HORIZON * innerHeight });
    switch (action.type) {
      case 'none': return false;
      case 'arm': armed = { body: p.body, day: 0 }; breath = null; playback.cancel(); break;
      case 'hand': {
        const t = clampTime(playback.origin + armed.day * DAY, playback.range());
        release(armed.day === 0 ? null : t); // still now: disarm, nothing plays
        return true;
      }
      case 'hour': release(action.t); return true;
      case 'day': {
        const range = playback.range(), next = playback.origin + (armed.day + 1) * DAY;
        if (localDayStart(next, locationTimeZone(live.location)) > range.max) break; // the last forecast day
        armed.day++;
        svg.setAttribute('data-step', armed.day % 2 ? 'a' : 'b');
        playback.select(clampTime(next, range));
        break;
      }
      case 'clear': release(); return true;
      default: break; // 'inert': before now or past the forecast; the arm stays
    }
    render();
    return true;
  }
  engine.setTapHook?.(coarseTap);

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
    // A finger never drags time: the press is a tap in the sky, routed like any landscape tap.
    if (isCoarse(e)) { touch = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    const traveling = playback.state.mode === 'playing';
    down = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, stamp: e.timeStamp,
      at: playback.origin, moved: false, cancelled: false, inert: traveling,
      animal: engine.animalContains(e.clientX, e.clientY) };
    try { hand.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    render();
  });
  hand.addEventListener('pointermove', e => {
    if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > TAP_SLOP) touch = null; // a slide: nothing
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
  const releasePointer = (e, cancelled) => {
    if (touch && e.pointerId === touch.id) { touch = null; if (!cancelled) engine.tapAt(e.clientX, e.clientY, e); return; }
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    if (cancelled || d.cancelled) { if (!d.cancelled) playback.cancel(); }
    else if (!d.moved) { playback.cancel(); engine.tapAt(e.clientX, e.clientY); } // a tap: never chooses an hour
    else if (!d.animal && !d.inert) playback.commit();
    render();
  };
  hand.addEventListener('pointerup', e => releasePointer(e, false));
  hand.addEventListener('pointercancel', e => releasePointer(e, true));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (down || armed || playback.state.chosen !== null)) { e.preventDefault(); e.stopImmediatePropagation(); cancelChoice(); }
  }, true);
  window.addEventListener('resize', render);

  /** Once a visit, on a coarse pointer: the hand breathes and the line names it ("Tap the sun"). */
  function breathe() {
    const p = engine.celestial;
    if (breathed || !isCoarse(null) || armed || down || !p || !getLive()?.forecast?.length || playback.state.mode !== 'live') return false;
    breathed = true;
    breath = { body: p.body };
    render();
    setTimeout(() => { breath = null; render(); }, BREATH_MS);
    return true;
  }
  return { render, element: hand, breathe, disarm: () => { if (armed) release(); }, get armed() { return armed ? { ...armed } : null; } };
}
