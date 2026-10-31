import { formatCoords } from '../data/geocode.js';
import { convertTemp, unitForCountry } from './units.js';
import { nextHours, precipitationSummary, isStale } from './forecast.js';

const LABELS = { clear: 'Clear', clouds: 'Cloudy', rain: 'Rain', snow: 'Snow', wind: 'Windy', fog: 'Fog', night: 'Clear night', 'night-rain': 'Rainy night' };
const CITIES = {
  Stockholm: { lat: 59.3293, lng: 18.0686, country: 'SE' },
  London: { lat: 51.5074, lng: -0.1278, country: 'GB' },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: 'JP' },
  'New York': { lat: 40.7128, lng: -74.006, country: 'US' },
};
export function createOverlay(root, { unit: pinnedUnit = null } = {}) {
  root.innerHTML = `
    <div class="overlay__place" data-el="place">Locating…</div>
    <div class="overlay__temp"><span data-el="tempValue">—</span><span class="overlay__unit" data-el="tempUnit"></span></div>
    <div data-el="feels"></div><div class="overlay__cond" data-el="cond"></div>
    <div class="overlay__note" data-el="status" role="status">Loading weather…</div>
    <div class="overlay__note" data-el="note"></div>
    <div class="forecast-controls"><label>City <select data-el="city" aria-label="Choose a city"><option value="">Choose…</option>${Object.keys(CITIES).map(name => `<option>${name}</option>`).join('')}</select></label>
    <label>Units <select data-el="unit" aria-label="Temperature units"><option value="C">°C</option><option value="F">°F</option></select></label><button data-el="retry" type="button">Refresh</button></div>
    <details class="forecast" ${matchMedia('(min-width: 601px)').matches ? 'open' : ''}><summary>Next 24 hours · hourly</summary>
      <p data-el="rain"></p><div class="forecast__hours" data-el="hours" tabindex="0" role="region" aria-label="Hourly forecast, scroll horizontally"></div>
      <div class="overlay__note" data-el="credit"></div>
    </details>`;
  const el = Object.fromEntries([...root.querySelectorAll('[data-el]')].map(n => [n.dataset.el, n]));
  let unit = pinnedUnit;
  let last;
  const time = ms => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hourCycle: 'h23' }).format(ms);
  const stamp = ms => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(ms);
  const api = {
    onLocation: null, onRefresh: null,
    loading(location) { el.place.textContent = location?.name || (location ? formatCoords(location) : 'Locating…'); el.status.textContent = 'Loading weather…'; },
    render(state) {
      last = state;
      const { weather, note = '', updatedAt, stale, source } = state;
      el.note.textContent = note;
      if (!weather) {
        el.tempValue.textContent = '—'; el.tempUnit.textContent = ''; el.feels.textContent = ''; el.cond.textContent = '';
        el.status.textContent = 'Weather unavailable. Choose a city or refresh to retry.';
        el.rain.textContent = 'Forecast unavailable.'; el.hours.replaceChildren(); el.credit.textContent = '';
        return;
      }
      el.place.textContent = weather.location.name || formatCoords(weather.location);
      const u = unit ?? unitForCountry(weather.location.country);
      el.unit.value = u;
      const temp = value => Number.isFinite(value) ? `${convertTemp(value, u)}°${u}` : '—';
      el.tempValue.textContent = convertTemp(weather.temperatureC, u); el.tempUnit.textContent = `°${u}`;
      el.feels.textContent = `Feels like ${temp(weather.feelsLikeC)}`;
      el.cond.textContent = `${LABELS[weather.condition]} · ${weather.windSpeed.toFixed(1)} m/s wind`;
      el.status.textContent = source === 'mock' ? 'Sample data · not live weather' : `${source === 'openweathermap' ? 'OpenWeather' : 'Open-Meteo'} · ${stale || isStale(weather, updatedAt) ? 'Stale reading · ' : ''}Updated ${stamp(updatedAt)} UTC · data ${stamp(weather.observedAt)} UTC`;
      const hours = nextHours(weather.forecast);
      el.rain.textContent = hours.length ? precipitationSummary(hours, time) : 'Hourly forecast unavailable.';
      el.hours.replaceChildren(...hours.map(h => {
        const cell = document.createElement('div'); cell.className = 'forecast__hour';
        const amount = Number.isFinite(h.precipitationMm) ? `${h.precipitationMm.toFixed(1)} mm` : '— mm';
        const chance = Number.isFinite(h.probability) ? `${h.probability}%` : '—%';
        for (const text of [time(h.time), temp(h.temperatureC), `${chance} · ${amount}`]) { const line = document.createElement('span'); line.textContent = text; cell.append(line); }
        return cell;
      }));
      el.credit.textContent = hours.length ? `${weather.forecastSource} · UTC times · rain/snow totals for preceding hour. Chance / amount; timing is approximate. Scroll for all hours.` : '';
    },
  };
  el.unit.onchange = () => { unit = el.unit.value; if (last) api.render(last); };
  el.city.onchange = () => { const name = el.city.value; if (CITIES[name]) api.onLocation?.({ ...CITIES[name], name }); };
  el.retry.onclick = () => api.onRefresh?.();
  return api;
}
