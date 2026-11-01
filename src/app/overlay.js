import { CITIES, selectedCity, locationTimeZone } from './cities.js';
import { createTimeFormatter, previewLabel } from './time.js';
import { formatCoords } from '../data/geocode.js';
import { convertTemp, unitForCountry } from './units.js';
import { nextHours, precipitationSummary, isStale } from './forecast.js';

const LABELS = { clear: 'Clear', clouds: 'Cloudy', rain: 'Rain', snow: 'Snow', wind: 'Windy', fog: 'Fog', night: 'Clear night', 'night-rain': 'Rainy night' };
/**
 * Current readout on the landscape (`root`) plus the menu's city row and hourly scrubber
 * (`controls`, `forecast`). Picking an hour reports onPreview(hour, { caption, commit });
 * commit is false while arrow keys scrub, true for a click/tap or Enter/Space.
 */
export function createOverlay(root, { unit: pinnedUnit = null, controls, forecast } = {}) {
  root.innerHTML = `
    <div class="overlay__place" data-el="place">Locating…</div>
    <div class="overlay__temp"><span data-el="tempValue">—</span><span class="overlay__unit" data-el="tempUnit"></span></div>
    <div data-el="feels"></div><div class="overlay__cond" data-el="cond"></div>
    <div class="overlay__note" data-el="status" role="status">Loading weather…</div>
    <div class="overlay__note" data-el="note"></div>`;
  controls.innerHTML = `<label>City <select data-el="city" aria-label="Choose a city"><option value="">Choose…</option>${Object.keys(CITIES).map(name => `<option>${name}</option>`).join('')}</select></label>
    <label>Units <select data-el="unit" aria-label="Temperature units"><option value="C">°C</option><option value="F">°F</option></select></label><button data-el="retry" type="button">Refresh</button>`;
  forecast.innerHTML = `<h2 class="forecast__title" id="forecast-title">Next 24 hours · hourly</h2>
    <p data-el="rain"></p><div class="forecast__hours" data-el="hours" role="radiogroup" aria-labelledby="forecast-title" aria-describedby="forecast-hint"></div>
    <div class="overlay__note" id="forecast-hint">Choose an hour to preview its weather on the landscape.</div>
    <div class="overlay__note" data-el="credit"></div>`;
  const el = Object.fromEntries([root, controls, forecast].flatMap(r => [...r.querySelectorAll('[data-el]')]).map(n => [n.dataset.el, n]));
  let unit = pinnedUnit;
  let last;
  let shown = null; // what the hour buttons were built from, so routine re-renders keep focus
  let hours = [];
  let selected = null; // epoch ms of the previewed hour
  let caption = () => '';

  function syncSelection() {
    const buttons = [...el.hours.children];
    for (const b of buttons) {
      const on = +b.dataset.time === selected;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (buttons.length && !buttons.some(b => b.tabIndex === 0)) buttons[0].tabIndex = 0;
  }
  function select(time, commit) {
    const hour = hours.find(h => h.time === time);
    if (!hour) return;
    selected = time;
    syncSelection();
    el.hours.querySelector(`[data-time="${time}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    api.onPreview?.(hour, { caption: caption(hour), commit });
  }
  function dropSelection() {
    if (selected === null) return;
    selected = null;
    syncSelection();
    // Rendering runs inside the app's apply(); report after it returns.
    queueMicrotask(() => api.onPreview?.(null, {}));
  }

  const api = {
    onLocation: null, onRefresh: null, onPreview: null,
    loading(location) { el.city.value = selectedCity(location); el.place.textContent = location?.name || (location ? formatCoords(location) : 'Locating…'); el.status.textContent = 'Loading weather…'; },
    /** Back to now: the scrubber shows no previewed hour. */
    clearSelection() { selected = null; syncSelection(); el.hours.scrollLeft = 0; },
    get selected() { return selected; },
    focusSelected() { (el.hours.querySelector('[tabindex="0"]') ?? el.city).focus(); },
    render(state) {
      last = state;
      const { weather, note = '', updatedAt, stale, source } = state;
      el.note.textContent = note;
      if (!weather) {
        el.tempValue.textContent = '—'; el.tempUnit.textContent = ''; el.feels.textContent = ''; el.cond.textContent = '';
        el.status.textContent = 'Weather unavailable. Choose a city or refresh to retry.';
        const refocus = el.hours.contains(document.activeElement);
        el.rain.textContent = 'Forecast unavailable.'; el.hours.replaceChildren(); el.credit.textContent = '';
        if (refocus) el.city.focus();
        hours = []; shown = null; dropSelection();
        return;
      }
      el.city.value = selectedCity(weather.location);
      const { zone, format: time } = createTimeFormatter(locationTimeZone(weather.location));
      el.place.textContent = weather.location.name || formatCoords(weather.location);
      const u = unit ?? unitForCountry(weather.location.country);
      el.unit.value = u;
      const temp = value => Number.isFinite(value) ? `${convertTemp(value, u)}°${u}` : '—';
      el.tempValue.textContent = convertTemp(weather.temperatureC, u); el.tempUnit.textContent = `°${u}`;
      el.feels.textContent = `Feels like ${temp(weather.feelsLikeC)}`;
      el.cond.textContent = `${LABELS[weather.condition]} · ${weather.windSpeed.toFixed(1)} m/s wind`;
      el.status.textContent = source === 'mock' ? 'Sample data · not live weather' : `${source === 'openweathermap' ? 'OpenWeather' : 'Open-Meteo'} · ${stale || isStale(weather, updatedAt) ? 'Stale reading · ' : ''}Updated ${time(updatedAt)} · data ${time(weather.observedAt)} · ${zone}`;
      hours = nextHours(weather.forecast);
      caption = h => `Preview · ${previewLabel(h.time, Date.now(), zone)}`;
      el.rain.textContent = hours.length ? `${precipitationSummary(hours, time)} (${zone})` : 'Hourly forecast unavailable.';
      const key = `${u}|${zone}|${hours.map(h => h.time).join()}`;
      if (!shown || shown.key !== key || shown.forecast !== weather.forecast) {
        const refocus = el.hours.contains(document.activeElement);
        el.hours.replaceChildren(...hours.map(h => {
          const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'forecast__hour';
          cell.setAttribute('role', 'radio'); cell.dataset.time = h.time;
          const amount = Number.isFinite(h.precipitationMm) ? `${h.precipitationMm.toFixed(1)} mm` : '— mm';
          const chance = Number.isFinite(h.probability) ? `${h.probability}%` : '—%';
          for (const text of [time(h.time), temp(h.temperatureC), `${chance} · ${amount}`, LABELS[h.condition] ?? '—']) { const line = document.createElement('span'); line.textContent = text; cell.append(line); }
          return cell;
        }));
        shown = { key, forecast: weather.forecast };
        if (!hours.some(h => h.time === selected)) dropSelection();
        syncSelection();
        if (refocus) api.focusSelected();
      }
      // Today / Tomorrow moves at local midnight: keep a surviving preview's caption current.
      const kept = hours.find(h => h.time === selected);
      if (kept) queueMicrotask(() => api.onPreview?.(kept, { caption: caption(kept), commit: false }));
      el.credit.textContent = hours.length ? `${weather.forecastSource} · ${zone} · 24-hour times · rain/snow totals for preceding hour. Chance / amount; timing is approximate. Scroll for all hours.` : '';
    },
  };
  el.unit.onchange = () => { unit = el.unit.value; if (last) api.render(last); };
  el.city.onchange = () => { const name = el.city.value; if (CITIES[name]) api.onLocation?.({ ...CITIES[name], name }); };
  el.retry.onclick = () => api.onRefresh?.();
  el.hours.addEventListener('click', e => {
    const b = e.target.closest('[data-time]');
    if (b) select(+b.dataset.time, true);
  });
  // Single tab stop; arrows / Home / End scrub (preview without lowering the phone sheet).
  el.hours.addEventListener('keydown', e => {
    const buttons = [...el.hours.children];
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const n = buttons.length;
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const b = buttons[Math.max(0, Math.min(n - 1, next))];
    b.focus();
    select(+b.dataset.time, false);
  });
  return api;
}
