import { locationTimeZone } from './cities.js';
import { createTimeFormatter } from './time.js';
import { formatCoords } from '../data/geocode.js';
import { convertTemp, unitForCountry } from './units.js';
import { isStale } from './forecast.js';
import { parseLocationInput } from './devControls.js';

/** Readout word per condition. */
export const LABELS = { clear: 'Clear', clouds: 'Cloudy', rain: 'Rain', snow: 'Snow', wind: 'Windy', fog: 'Fog', night: 'Clear night', 'night-rain': 'Rainy night' };

export function createOverlay(root, { unit: pinnedUnit = null, controls, sourceLine } = {}) {
  root.innerHTML = `
    <div class="overlay__place" data-el="place">Finding your city</div>
    <div class="overlay__temp"><span data-el="tempValue">—</span><span class="overlay__unit" data-el="tempUnit"></span></div>
    <div class="overlay__details"><span data-el="feels"></span><span data-el="cond"></span></div>
    <div class="overlay__date" data-el="date"></div>
    <span data-el="status" hidden></span><span data-el="note" hidden></span>`;
  controls.innerHTML = `<div class="settings-place">
      <div class="place-heading"><div><div class="place-name" data-el="name">Finding your city</div><div class="place-origin" data-el="origin"></div></div>
      <div class="place-actions"><button data-el="change" type="button" hidden>Change</button><button data-el="update" type="button">Update</button></div></div>
      <form data-el="form" hidden><input data-el="city" aria-label="City name" placeholder="City name" autocomplete="off" required><div class="place-actions"><button type="submit">Apply</button><button data-el="cancel" type="button">Cancel</button></div><p data-el="error" role="status" hidden></p></form>
    </div>
    <div class="settings-row"><span>Units</span><div class="units" role="group" aria-label="Temperature units"><button type="button" data-unit="C" aria-pressed="true">°C</button><button type="button" data-unit="F" aria-pressed="false">°F</button></div></div>`;
  const el = Object.fromEntries([root, controls].flatMap(r => [...r.querySelectorAll('[data-el]')]).map(n => [n.dataset.el, n]));
  let unit = pinnedUnit, last, place, origin = 'locating', editing = false;
  function syncPlace() {
    el.name.textContent = origin === 'locating' ? 'Finding your city' : origin === 'off' ? 'Location is off' : place?.name || (place ? formatCoords(place) : 'Finding your city');
    el.origin.textContent = origin === 'device' ? 'This phone' : origin === 'chosen' ? 'Chosen' : '';
    el.change.hidden = origin === 'locating' || origin === 'off' || editing;
    el.update.disabled = origin === 'locating';
    el.form.hidden = origin === 'locating' || !(editing || origin === 'off');
    el.cancel.hidden = origin === 'off';
  }
  const api = {
    onLocation: null, onRefresh: null,
    setPlace(location, kind) { place = location; origin = kind; editing = false; syncPlace(); },
    loading(location) { el.status.textContent = 'Loading weather…'; place = location; el.place.textContent = location?.name || (location ? formatCoords(location) : 'Finding your city'); syncPlace(); },
    render(state) {
      last = state;
      const { weather, source } = state;
      el.note.textContent = state.note || '';
      el.status.textContent = !weather ? 'Weather unavailable' : state.stale || isStale(weather, state.updatedAt) ? 'Stale reading' : '';
      if (!weather) {
        el.tempValue.textContent = '—'; el.tempUnit.textContent = ''; el.feels.textContent = ''; el.cond.textContent = ''; el.date.textContent = '';
        sourceLine.textContent = 'Weather unavailable · Update to retry';
        return;
      }
      place = weather.location; syncPlace();
      const { zone } = createTimeFormatter(locationTimeZone(place));
      el.place.textContent = place.name || formatCoords(place);
      const u = unit ?? unitForCountry(place.country);
      for (const b of controls.querySelectorAll('[data-unit]')) b.setAttribute('aria-pressed', String(b.dataset.unit === u));
      const temp = value => Number.isFinite(value) ? `${convertTemp(value, u)}°${u}` : '—';
      el.tempValue.textContent = convertTemp(weather.temperatureC, u); el.tempUnit.textContent = `°${u}`;
      el.feels.textContent = `Feels like ${temp(weather.feelsLikeC)} · `;
      el.cond.textContent = `${LABELS[weather.condition]} · ${weather.windSpeed.toFixed(1)} m/s wind`;
      const now = Date.now();
      const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(now).replace(',', '');
      const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(now);
      el.date.textContent = `${day} · ${time}`;
      sourceLine.textContent = `${source === 'mock' ? 'Sample data' : source === 'openweathermap' ? 'OpenWeather' : 'Open-Meteo'} · ${zone}${state.stale ? ' · Stale reading' : ''}`;
    },
  };
  el.change.onclick = () => { editing = true; syncPlace(); el.city.focus({ preventScroll: true }); };
  el.cancel.onclick = () => { editing = false; el.error.hidden = true; syncPlace(); el.change.focus({ preventScroll: true }); };
  el.form.onsubmit = e => {
    e.preventDefault();
    const location = parseLocationInput(el.city.value);
    el.error.hidden = !!location;
    el.error.textContent = 'City not found. Try Stockholm, London, Paris, New York, Chicago, Los Angeles or Tokyo.';
    if (location) { api.setPlace(location, 'chosen'); api.onLocation?.(location); }
  };
  el.update.onclick = () => api.onRefresh?.();
  for (const b of controls.querySelectorAll('[data-unit]')) b.onclick = () => { unit = b.dataset.unit; if (last) api.render(last); };
  syncPlace();
  return api;
}
