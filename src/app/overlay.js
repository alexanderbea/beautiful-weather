import { formatCoords } from '../data/geocode.js';
import { convertTemp, unitForCountry } from './units.js';

const LABELS = {
  clear: 'Clear', clouds: 'Cloudy', rain: 'Rain', snow: 'Snow', wind: 'Windy', fog: 'Fog', night: 'Clear night',
  'night-rain': 'Rainy night',
};

/**
 * Minimal, unobtrusive readout: place, temperature, condition. The unit follows the location's
 * country (°F for imperial countries, °C otherwise); `unit` ('C' | 'F') pins it instead.
 */
export function createOverlay(root, { unit: pinnedUnit = null } = {}) {
  root.innerHTML = `
    <div class="overlay__place" data-el="place">Locating...</div>
    <div class="overlay__temp" data-el="temp"><span data-el="tempValue">--</span><span class="overlay__unit" data-el="tempUnit"></span></div>
    <div class="overlay__cond" data-el="cond"></div>
    <div class="overlay__note" data-el="note"></div>`;
  const el = Object.fromEntries([...root.querySelectorAll('[data-el]')].map((n) => [n.dataset.el, n]));

  return {
    render({ weather, isDay, note }) {
      const { location } = weather;
      el.place.textContent = location.name || formatCoords(location);
      const unit = pinnedUnit ?? unitForCountry(location.country);
      el.tempValue.textContent = String(convertTemp(weather.temperatureC, unit));
      el.tempUnit.textContent = `°${unit}`;
      el.temp.dataset.unit = unit;
      let label = LABELS[weather.condition];
      if (!isDay && weather.condition === 'clear') label = LABELS.night;
      if (!isDay && weather.condition === 'rain') label = LABELS['night-rain'];
      el.cond.textContent = `${label} · ${weather.windSpeed.toFixed(1)} m/s wind`;
      el.note.textContent = note || '';
      root.classList.toggle('overlay--night', !isDay);
    },
  };
}
