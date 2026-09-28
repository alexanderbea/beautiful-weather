import { CONDITIONS } from '../data/model.js';
import { parseLatLng } from './location.js';

/** Embedded dev-panel city lookup (keys are lowercase, single-spaced). */
const DEV_CITIES = {
  stockholm: { lat: 59.3293, lng: 18.0686, name: 'Stockholm' },
  london: { lat: 51.5074, lng: -0.1278, name: 'London' },
  paris: { lat: 48.8566, lng: 2.3522, name: 'Paris' },
  'new york': { lat: 40.7128, lng: -74.006, name: 'New York' },
  tokyo: { lat: 35.6762, lng: 139.6503, name: 'Tokyo' },
};

/** Parses dev Location input: a known city name (case/whitespace-insensitive) or "lat, lng". Null when invalid. */
export function parseLocationInput(text) {
  const key = String(text).trim().replace(/\s+/g, ' ').toLowerCase();
  const city = DEV_CITIES[key];
  return city ? { ...city } : parseLatLng(text);
}

/**
 * Dev/testing strip. Enabled with ?dev=1 or toggled with the "`" key (backquote).
 * Emits overrides via onChange({ condition, time, wind }) (time: 'day' | 'dawn' | 'twilight' | 'night') where null means "use live data",
 * and onLocation({ lat, lng, name? }) for a manual city name or coordinates.
 */
export function createDevControls(root, { initial = {}, onChange, onLocation, onParallax, getStats }) {
  const state = { condition: initial.condition ?? null, time: initial.time ?? null, wind: initial.wind ?? null };

  const btn = (group, value, label) =>
    `<button type="button" data-group="${group}" data-value="${value ?? ''}">${label}</button>`;

  root.innerHTML = `
    <div class="dev__row"><span class="dev__label">Condition</span>
      ${btn('condition', null, 'Live')}
      ${CONDITIONS.map((c) => btn('condition', c, c)).join('')}
    </div>
    <div class="dev__row"><span class="dev__label">Time</span>
      ${btn('time', null, 'Live')}${btn('time', 'day', 'Day')}${btn('time', 'dawn', 'Dawn')}${btn('time', 'twilight', 'Twilight')}${btn('time', 'night', 'Night')}
    </div>
    <div class="dev__row"><span class="dev__label">Wind</span>
      <input type="checkbox" data-el="windOn" title="Override wind" />
      <input type="range" min="0" max="25" step="0.5" data-el="wind" />
      <output data-el="windOut"></output>
    </div>
    <div class="dev__row"><span class="dev__label">Parallax</span>
      <input type="checkbox" data-el="parallax" title="Depth parallax (camera drift + pointer)" />
    </div>
    <form class="dev__row" data-el="locForm"><span class="dev__label">Location</span>
      <input type="text" placeholder="city or lat, lng" title="Stockholm, London, Paris, New York, Tokyo, or lat, lng" data-el="loc" size="16" />
      <button type="submit">Go</button>
    </form>
    <div class="dev__row dev__status" data-el="status"></div>`;

  const el = Object.fromEntries([...root.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]));

  function sync() {
    for (const b of root.querySelectorAll('button[data-group]')) {
      const v = b.dataset.value || null;
      b.classList.toggle('is-active', state[b.dataset.group] === v);
    }
    el.windOn.checked = state.wind !== null;
    el.wind.disabled = state.wind === null;
    if (state.wind !== null) el.wind.value = state.wind;
    el.windOut.textContent = state.wind === null ? 'live' : `${Number(state.wind).toFixed(1)} m/s`;
  }

  function emit() {
    sync();
    onChange({ ...state });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-group]');
    if (!b) return;
    state[b.dataset.group] = b.dataset.value || null;
    emit();
  });
  el.windOn.addEventListener('change', () => {
    state.wind = el.windOn.checked ? Number(el.wind.value) : null;
    emit();
  });
  el.wind.addEventListener('input', () => {
    state.wind = Number(el.wind.value);
    emit();
  });
  el.parallax.checked = initial.parallax !== false;
  el.parallax.addEventListener('change', () => onParallax?.(el.parallax.checked));
  el.locForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const loc = parseLocationInput(el.loc.value);
    el.loc.classList.toggle('is-invalid', !loc);
    if (loc) onLocation(loc);
  });

  function setVisible(v) {
    root.hidden = !v;
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' || e.target.closest?.('input, textarea')) return;
    setVisible(root.hidden);
  });

  // Status line (fps, source, sun elevation, active effects) refreshes a few times per second while visible.
  setInterval(() => {
    if (root.hidden) return;
    const s = getStats();
    const sun = Number.isFinite(s.solarElevation) ? ` · sun ${s.solarElevation.toFixed(1)}°` : '';
    el.status.textContent = `${s.fps} fps · source: ${s.source}${sun} · effects: ${s.effects.join(', ') || 'none'}`;
  }, 400);

  sync();
  return { setVisible, get state() { return { ...state }; } };
}
