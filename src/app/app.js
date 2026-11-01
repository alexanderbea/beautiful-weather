import { parseScene, sceneForcesNight, sceneWeather } from './atmosphere.js';
import { createEngine } from '../engine/engine.js';
import { createWeatherService } from '../data/weatherService.js';
import { cannedWeather } from '../data/sources/mockSource.js';
import { CONDITIONS, NIGHT_ONLY, SUNRISE_ELEVATION, DEFAULT_LOCATION, isDaylight, solarElevationAt } from '../data/model.js';
import { createOverlay } from './overlay.js';
import { createForecastMenu } from './forecastMenu.js';
import { createDevControls } from './devControls.js';
import { getDeviceLocation, locationFromParams } from './location.js';
import { parseUnitParam } from './units.js';
import { ART_STYLES, createStyleState, parseStyleParam } from './artStyle.js';
import { createStylePicker } from './stylePicker.js';
import { createAmbientAudio } from '../engine/audio.js';
import { createAudioControl } from './audioControl.js';

const REFRESH_MS = 10 * 60 * 1000;
const SUN_TICK_MS = 60 * 1000;
const TIME_ELEVATION = { day: 30, dawn: 3, twilight: 0, night: -18 }; // dev time override -> sun elevation (deg)
const TIME_RISING = { dawn: true }; // dev time overrides that are a sunrise (others: setting / n/a)
const RISING_LOOKAHEAD_MS = 10 * 60 * 1000;
const NIGHT_ELEVATION = -18;
const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };
const STOCKHOLM_RADIUS_KM = 40;
const SKYLINE_OVERRIDES = { stockholm: 'stockholm', nordic: 'nordic', off: null };

/** Great-circle distance in km. */
function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Stockholm's skyline near Stockholm, a generic Nordic town elsewhere. */
function landmarkFor(loc) {
  const lat = Number.isFinite(loc?.lat) ? loc.lat : DEFAULT_LOCATION.lat;
  const lng = Number.isFinite(loc?.lng) ? loc.lng : DEFAULT_LOCATION.lng;
  return distanceKm({ lat, lng }, STOCKHOLM) <= STOCKHOLM_RADIUS_KM ? 'stockholm' : 'nordic';
}

/**
 * Wires data -> engine -> UI. The engine only ever sees the "effective" weather:
 * live data with any dev overrides applied on top.
 */
export async function startApp() {
  const params = new URLSearchParams(location.search);
  const engine = createEngine(document.getElementById('scene'));
  // ?units=c|f pins the temperature unit; otherwise it follows the location's country.
  const overlay = createOverlay(document.getElementById('overlay'), { unit: parseUnitParam(params.get('units')),
    controls: document.getElementById('forecast-controls'), forecast: document.getElementById('forecast') });
  // ?source=mock swaps in canned sample data (dev/screenshots only); the default is always live.
  const service = createWeatherService({ useMock: params.get('source') === 'mock' });

  let live = null;
  let source = service.primaryId;
  let locationNote = '';
  let dataNote = '';
  let updatedAt = null; // epoch ms of the last successful refresh
  let place = null;
  let stale = false;
  let refreshId = 0;
  let previewTime = null; // epoch ms of the forecast hour shown on the landscape; null is now

  const initialOverrides = {
    condition: CONDITIONS.includes(params.get('condition')) ? params.get('condition') : null,
    time: Object.hasOwn(TIME_ELEVATION, params.get('time')) ? params.get('time') : null,
    wind: params.has('wind') && Number.isFinite(+params.get('wind')) ? +params.get('wind') : null,
  };
  let overrides = initialOverrides;
  let atmosphere = parseScene(params.get('scene'));
  const sceneSelect = document.getElementById('atmosphere');
  sceneSelect.value = atmosphere;
  sceneSelect.addEventListener('change', () => { atmosphere = parseScene(sceneSelect.value); apply(); });
  // ?elev=<degrees> pins the sun elevation (beats ?time= and the dev time buttons, not night-only conditions).
  const elevParam = params.get('elev');
  const elevOverride = elevParam !== null && elevParam.trim() !== '' && Number.isFinite(+elevParam) ? +elevParam : null;
  // ?rising=1 marks a pinned ?elev= as a sunrise (dawn mist).
  const risingParam = params.get('rising') === '1';

  /** True while the sun is climbing (sunrise side of the day) at the given location. */
  function sunRisingAt(loc, now = Date.now()) {
    if (!loc) return false;
    return solarElevationAt(loc, now + RISING_LOOKAHEAD_MS) > solarElevationAt(loc, now);
  }
  // ?skyline=stockholm|nordic|off pins the landmark silhouette.
  const skylineParam = params.get('skyline');
  const skylineOverride = Object.hasOwn(SKYLINE_OVERRIDES, skylineParam) ? SKYLINE_OVERRIDES[skylineParam] : undefined;
  // ?parallax=0 disables the depth parallax (the dev strip checkbox toggles it live).
  const parallaxOn = params.get('parallax') !== '0';
  engine.setParallax(parallaxOn, { immediate: true });
  // Ambient sound follows the effective weather; muted until the first user gesture (no autoplay).
  const audio = createAmbientAudio();
  createAudioControl(document.getElementById('audio-ctl'), audio);

  /** Live weather, or the previewed forecast hour's sky, wind and sun on the same location. */
  function current() {
    const hour = previewTime === null ? null : live?.forecast.find(h => h.time === previewTime);
    if (!hour) return { weather: live, at: Date.now() };
    const solarElevation = solarElevationAt(live.location, hour.time);
    return { at: hour.time, weather: { ...live,
      condition: hour.condition ?? live.condition, // no hourly code: keep the current sky, the sun still moves
      windSpeed: hour.windSpeed ?? live.windSpeed,
      isDay: hour.isDay ?? solarElevation > SUNRISE_ELEVATION, solarElevation } };
  }

  function effective() {
    if (!live) return null;
    const { weather: now, at } = current();
    // A condition override swaps in canned numbers so the readout stays plausible.
    const base = overrides.condition
      ? { ...cannedWeather(overrides.condition, now.location), isDay: now.isDay, solarElevation: now.solarElevation, location: now.location }
      : now;
    let isDay = base.isDay;
    let solarElevation = base.solarElevation;
    let sunRising = sunRisingAt(base.location, at);
    const pinned = elevOverride ?? (overrides.time ? TIME_ELEVATION[overrides.time] : null);
    if (pinned !== null) {
      solarElevation = pinned;
      isDay = pinned > SUNRISE_ELEVATION;
      sunRising = elevOverride !== null ? risingParam : TIME_RISING[overrides.time] === true;
    }
    if (NIGHT_ONLY.includes(base.condition)) {
      isDay = false;
      solarElevation = Math.min(Number.isFinite(solarElevation) ? solarElevation : NIGHT_ELEVATION, NIGHT_ELEVATION);
    }
    const windSpeed = overrides.wind ?? base.windSpeed;
    return { ...base, isDay, solarElevation, windSpeed, sunRising };
  }

  function apply({ immediate = false } = {}) {
    const w = effective();
    if (!w) {
      // No reading for this city: clear the previous city's weather, even while paused.
      const neutral = { condition: 'clear', windSpeed: 0, location: place,
        solarElevation: place ? solarElevationAt(place, Date.now()) : 30 };
      engine.setLandmark(skylineOverride !== undefined ? skylineOverride : landmarkFor(place));
      engine.setWeather(neutral, { immediate: true });
      audio.setWeather(neutral);
      overlay.render({ weather: null, note: [locationNote, dataNote].filter(Boolean).join(' · ') });
      return;
    }
    engine.setWeather(sceneWeather(w, atmosphere), { immediate });
    audio.setWeather(w);
    engine.setLandmark(skylineOverride !== undefined ? skylineOverride : landmarkFor(w.location));
    const overridden = overrides.condition || overrides.time || overrides.wind !== null || elevOverride !== null;
    const sceneNote = atmosphere === 'meteors' ? 'Meteor shower · night demo'
      : atmosphere === 'eclipse' ? 'eclipse · imagined scene' : '';
    dev.sync();
    overlay.render({ weather: live, source, updatedAt, stale, isDay: atmosphere === 'meteors' ? false : w.isDay, note: [locationNote, dataNote, sceneNote, overridden ? 'dev override' : ''].filter(Boolean).join(' · ') });
  }

  /** Fetches the current weather for `place`. Never throws: a failed refresh keeps the last data. */
  async function refresh() {
    const id = ++refreshId;
    overlay.loading(place);
    const result = await service.getCurrent(place);
    if (id !== refreshId) return;
    live = result.weather;
    source = result.source;
    updatedAt = result.updatedAt;
    stale = !!result.stale;
    dataNote = result.error ? (live ? 'Update failed · showing last reading' : 'Live weather unavailable') : '';
    apply();
  }
  overlay.onRefresh = () => { if (place) refresh(); };
  // Previewing an hour eases the landscape to it; Back to now (or dismissing the menu) eases back.
  const menu = createForecastMenu({
    button: document.getElementById('menu-button'),
    panel: document.getElementById('forecast-menu'),
    handle: document.querySelector('#forecast-menu [data-el="handle"]'),
    caption: document.getElementById('preview-caption'),
    back: document.getElementById('back-to-now'),
    landscape: document.getElementById('scene'),
    onBackToNow: () => setPreview(null),
    onDismiss: () => setPreview(null),
    onExpand: () => overlay.focusSelected(),
  });
  function setPreview(hour, { caption = null, commit = false } = {}) {
    if (!hour) overlay.clearSelection();
    menu.setPreview(hour ? caption : null, { commit });
    const time = hour?.time ?? null;
    if (time === previewTime) return;
    previewTime = time;
    // While a new city loads there is nothing to ease back to; refresh() applies its result.
    if (live) apply();
  }
  overlay.onPreview = setPreview;
  overlay.onLocation = loc => {
    place = loc;
    live = null;
    locationNote = '';
    overlay.render({ weather: null });
    refresh();
  };

  const dev = createDevControls(document.getElementById('dev'), {
    initial: { ...initialOverrides, parallax: parallaxOn },
    onParallax: (on) => engine.setParallax(on),
    forcesNight: (s) => sceneForcesNight(atmosphere) || NIGHT_ONLY.includes(s.condition ?? live?.condition),
    onChange(next) {
      overrides = next;
      apply();
    },
    onLocation(loc) {
      overlay.onLocation(loc);
    },
    toggleParent: document.getElementById('menu-foot'),
    getStats: () => {
      const st = engine.state;
      return { fps: engine.stats.fps, source, updatedAt, observedAt: live?.observedAt, effects: st.effects, solarElevation: st.solarElevation, twilight: st.twilight };
    },
  });
  if (params.get('dev') === '1') dev.setVisible(true);

  // Art style: ?style=<id> > saved choice > default. The picker is the user-facing control; the state
  // is the single selection source, so setting it from anywhere (URL, console) updates the picker too.
  const styleState = createStyleState({ initial: parseStyleParam(params.get('style')) });
  const picker = createStylePicker(document.getElementById('style-picker'), {
    styles: ART_STYLES,
    active: styleState.get(),
    onChange: (id) => styleState.set(id),
  });
  let firstStyle = true;
  styleState.subscribe((id) => {
    // The renderer restyles the scene (palette, parameters, overlay passes; see src/engine/styles/).
    // The first call is the initial choice, so it snaps instead of cross-fading from the default.
    engine.setStyle(id, { immediate: firstStyle });
    firstStyle = false;
    document.documentElement.dataset.style = id; // CSS hook only
    picker.setActive(id);
  });

  /** Cheap, network-free sun update: live data keeps its source but the sun keeps moving. */
  function tickSun() {
    if (!live) return;
    const now = Date.now();
    const solarElevation = solarElevationAt(live.location, now);
    // Mock data has no sunrise info, so day/night follows the sun. OpenWeather keeps its sunrise/sunset isDay.
    const isDay = source === 'mock' && !NIGHT_ONLY.includes(live.condition) ? isDaylight(live.location, now) : live.isDay;
    live = { ...live, solarElevation, isDay };
    apply();
  }

  // Show a scene immediately while geolocation resolves (defaults to Stockholm's real sun position).
  // Routed through effective() so ?time= / ?elev= apply from the first frame.
  live = cannedWeather('clear', {});
  engine.setWeather(sceneWeather(effective(), atmosphere), { immediate: true });
  audio.setWeather(effective());
  // The placeholder has no real location yet: only show a landmark if pinned via ?skyline=.
  if (skylineOverride) engine.setLandmark(skylineOverride);
  live = null;
  engine.start();

  const pinned = locationFromParams(params);
  if (pinned) {
    place = pinned;
  } else {
    const result = await getDeviceLocation();
    if (!place) {
      place = result.location;
      if (result.fallback) locationNote = `location ${result.reason}, using ${place.name}`;
    }
  }

  await refresh();
  // First real data: snap wind/day state instead of fading from the placeholder.
  apply({ immediate: true });
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  setInterval(() => { if (!document.hidden) tickSun(); }, SUN_TICK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickSun(); if (!updatedAt || Date.now() - updatedAt >= REFRESH_MS) refresh(); } });

  // Handy for console experiments, e.g. __bw.engine.setThemes({ rain: { day: { sky: { top: '#000' } } } })
  window.__bw = { engine, audio, service, refresh, style: styleState, menu, get live() { return live; }, get updatedAt() { return updatedAt; }, get previewTime() { return previewTime; } };
}
