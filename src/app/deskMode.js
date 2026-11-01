/**
 * Ambient desk mode: the existing landscape full screen with an optional clock and a compact
 * weather line. Everything else (readout, menu, corner pills) is hidden and inert.
 *
 * - Entering asks for fullscreen; if the browser refuses (or has no Fullscreen API, e.g. iPhone
 *   Safari) the mode runs inside the page instead.
 * - Controls (clock toggle, exit) stay hidden until a pointer move / tap or keyboard use, and fade
 *   out again after a few idle seconds unless they hold keyboard focus.
 * - Escape leaves the mode: the browser's own Escape exits fullscreen (we follow fullscreenchange),
 *   and in-page mode handles the key directly.
 * - The weather line mirrors the main readout (#overlay), so it follows every refresh, the unit
 *   choice and the city without a second data path. The clock ticks on minute boundaries and stops
 *   while the document is hidden; the scene's own animation already pauses then (engine.js).
 * - The clock on/off choice is saved in localStorage.
 */
const STORAGE_KEY = 'bw.desk.clock';
const IDLE_MS = 3000;

const CSS = `
.desk-enter {
  position: fixed;
  top: calc(max(14px, env(safe-area-inset-top)) + 52px);
  right: max(14px, env(safe-area-inset-right));
  z-index: 8;
  width: 44px; height: 44px;
  display: grid; place-items: center;
  padding: 0;
  color: #e8eef6;
  background: rgba(10, 16, 28, 0.5);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  cursor: pointer;
}
.desk-enter:hover { background: rgba(10, 16, 28, 0.72); }
.desk-enter:focus-visible, .desk :focus-visible { outline: 2px solid white; outline-offset: 2px; }
body[data-menu='open'] .desk-enter, body[data-menu='lowered'] .desk-enter { visibility: hidden; }

/* While the desk is up, the rest of the UI steps aside (it is also made inert). */
body[data-desk='on'] #overlay, body[data-desk='on'] .menu-button, body[data-desk='on'] .menu,
body[data-desk='on'] .audio-ctl, body[data-desk='on'] .style-picker, body[data-desk='on'] .dev,
body[data-desk='on'] .desk-enter { visibility: hidden; }

.desk {
  position: fixed;
  inset: 0;
  z-index: 20;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45), 0 2px 18px rgba(0, 0, 0, 0.4);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  outline: none;
}
.desk.is-idle { cursor: none; }
/* Scrim under the readout so it stays legible on bright snow or cloud. */
.desk::before {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 55%;
  background: linear-gradient(to top, rgba(8, 16, 32, 0.55), rgba(8, 16, 32, 0));
  pointer-events: none;
}
.desk__readout {
  position: absolute;
  left: max(32px, env(safe-area-inset-left));
  right: max(32px, env(safe-area-inset-right));
  bottom: max(32px, env(safe-area-inset-bottom));
}
.desk__time {
  display: block;
  font-size: clamp(64px, 16vw, 168px);
  font-weight: 200;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.desk__date { font-size: clamp(15px, 2.2vw, 22px); color: rgba(255, 255, 255, 0.86); margin: 8px 0 14px; }
.desk__zone { opacity: 0.8; }
.desk__weather { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; font-size: clamp(16px, 2.4vw, 24px); }
.desk__temp { font-weight: 300; font-size: 1.6em; }
.desk__place { color: rgba(255, 255, 255, 0.86); }
.desk__status { width: 100%; font-size: 13px; color: rgba(255, 255, 255, 0.8); }
.desk[data-clock='off'] .desk__clock { display: none; }
.desk[data-clock='off'] .desk__weather { font-size: clamp(20px, 3.4vw, 34px); }

.desk__controls {
  position: absolute;
  top: max(14px, env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  display: flex;
  gap: 8px;
  transition: opacity 0.35s ease;
}
.desk.is-idle .desk__controls { opacity: 0; pointer-events: none; }
.desk__btn {
  min-height: 44px;
  padding: 0 16px;
  display: inline-flex; align-items: center; gap: 8px;
  font: 500 14px/1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #e8eef6;
  text-shadow: none;
  background: rgba(10, 16, 28, 0.6);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  cursor: pointer;
}
.desk__btn:hover { background: rgba(10, 16, 28, 0.8); }
.desk__btn[aria-pressed='true'] { border-color: rgba(255, 255, 255, 0.55); }
@media (max-width: 600px) {
  .desk__readout { left: max(20px, env(safe-area-inset-left)); bottom: max(28px, env(safe-area-inset-bottom)); }
  .desk__btn { padding: 0 12px; }
}
@media (prefers-reduced-motion: reduce) { .desk__controls { transition: none; } }
`;

const ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5V2.5h3M11 2.5h3v3M14 10.5v3h-3M5 13.5H2v-3"/></svg>`;

function injectCss() {
  if (document.getElementById('desk-css')) return;
  const style = document.createElement('style');
  style.id = 'desk-css';
  style.textContent = CSS;
  document.head.append(style);
}

export function readClockPref(storage = globalThis.localStorage) {
  try { return storage?.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function writeClockPref(on, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* blocked storage: session-only */ }
}

/** "14:05" plus a long date in `timeZone` (falls back to the device zone). */
export function clockText(ms, timeZone, locale = undefined) {
  let zone = timeZone;
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }); } catch { zone = undefined; }
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(ms);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(ms);
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = (z) => new Intl.DateTimeFormat('en', { timeZone: z, timeZoneName: 'shortOffset' }).formatToParts(ms).find(p => p.type === 'timeZoneName')?.value;
  const zoneLabel = zone && offset(zone) !== offset(device) ? offset(zone) : '';
  return { time, date, zoneLabel };
}

/**
 * @param {object} o
 * @param {HTMLElement} o.readout   the main weather readout to mirror (#overlay)
 * @param {() => {updatedAt?: number, timeZone?: string}} o.getState
 * @param {() => void} [o.onEnter]  e.g. close the forecast menu, refresh stale data
 */
export function createDeskMode({ readout, getState, onEnter }) {
  injectCss();
  const enterBtn = document.createElement('button');
  enterBtn.type = 'button';
  enterBtn.className = 'desk-enter';
  enterBtn.id = 'desk-enter';
  enterBtn.setAttribute('aria-label', 'Enter desk mode');
  enterBtn.title = 'Desk mode';
  enterBtn.innerHTML = ICON;

  const root = document.createElement('div');
  root.className = 'desk';
  root.id = 'desk';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Desk mode');
  root.innerHTML = `
    <div class="desk__controls" role="toolbar" aria-label="Desk mode controls">
      <button type="button" class="desk__btn" data-el="clockBtn">Clock</button>
      <button type="button" class="desk__btn" data-el="exit">Exit desk mode</button>
    </div>
    <div class="desk__readout">
      <div class="desk__clock" data-el="clock"><time class="desk__time" data-el="time"></time>
        <div class="desk__date"><span data-el="date"></span> <span class="desk__zone" data-el="zone"></span></div></div>
      <div class="desk__weather" aria-live="polite"><span class="desk__temp" data-el="temp"></span><span data-el="cond"></span><span class="desk__place" data-el="place"></span>
        <span class="desk__status" data-el="status"></span></div>
    </div>`;
  document.body.append(enterBtn, root);
  const el = Object.fromEntries([...root.querySelectorAll('[data-el]')].map(n => [n.dataset.el, n]));
  const src = (name) => readout.querySelector(`[data-el="${name}"]`)?.textContent.trim() ?? '';

  let active = false;
  let viaFullscreen = false;
  let clockOn = readClockPref();
  let clockTimer = 0;
  let idleTimer = 0;
  let wakeLock = null;
  const inerted = [];

  function renderWeather() {
    const value = src('tempValue');
    const has = value && value !== '—';
    el.temp.textContent = has ? `${value}${src('tempUnit')}` : '—';
    el.cond.textContent = src('cond');
    el.place.textContent = src('place');
    const status = src('status');
    const note = src('note');
    const { updatedAt, timeZone } = getState() ?? {};
    let line = '';
    if (!has) line = /loading/i.test(status) ? 'Loading weather…' : 'Weather unavailable';
    else if (/stale/i.test(status) || /failed/i.test(note)) line = 'Showing last reading';
    if (has && Number.isFinite(updatedAt)) {
      const at = clockText(updatedAt, timeZone).time;
      line = line ? `${line} · updated ${at}` : `Updated ${at}`;
    }
    el.status.textContent = line;
  }

  function renderClock() {
    const { time, date, zoneLabel } = clockText(Date.now(), getState()?.timeZone);
    el.time.textContent = time;
    el.time.dateTime = new Date().toISOString();
    el.date.textContent = date;
    el.zone.textContent = zoneLabel;
  }
  function scheduleClock() {
    clearTimeout(clockTimer);
    if (!active || !clockOn || document.hidden) return;
    renderClock();
    clockTimer = setTimeout(scheduleClock, 60000 - (Date.now() % 60000) + 50);
  }

  function syncClockUi() {
    root.dataset.clock = clockOn ? 'on' : 'off';
    el.clockBtn.setAttribute('aria-pressed', String(clockOn));
    el.clockBtn.textContent = clockOn ? 'Clock on' : 'Clock off';
  }
  function setClock(on) {
    clockOn = on;
    writeClockPref(on);
    syncClockUi();
    scheduleClock();
  }

  // Controls: shown on interaction, hidden after IDLE_MS unless keyboard focus sits in them.
  function idle() {
    if (root.querySelector('.desk__controls :focus-visible')) return;
    root.classList.add('is-idle');
  }
  function wake() {
    if (!active) return;
    root.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idle, IDLE_MS);
  }

  async function lockScreen() {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (active) wakeLock = lock; else lock?.release?.().catch(() => {});
    } catch { wakeLock = null; }
  }

  async function enter() {
    if (active) return;
    onEnter?.();
    active = true;
    document.body.dataset.desk = 'on';
    for (const n of document.body.children) {
      if (n === root || n.tagName === 'SCRIPT' || n.inert) continue;
      n.inert = true;
      inerted.push(n);
    }
    root.hidden = false;
    root.classList.add('is-idle');
    syncClockUi();
    renderWeather();
    scheduleClock();
    root.focus({ preventScroll: true });
    lockScreen();
    viaFullscreen = false;
    if (document.fullscreenElement) return;
    try {
      if (!document.documentElement.requestFullscreen) throw new Error('no fullscreen');
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      viaFullscreen = active && !!document.fullscreenElement;
    } catch { /* denied or unsupported: stay in-page */ }
  }

  function leave() {
    if (!active) return;
    active = false;
    clearTimeout(clockTimer);
    clearTimeout(idleTimer);
    root.hidden = true;
    delete document.body.dataset.desk;
    for (const n of inerted.splice(0)) n.inert = false;
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    if (viaFullscreen && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    viaFullscreen = false;
    enterBtn.focus({ preventScroll: true });
  }

  enterBtn.addEventListener('click', enter);
  el.exit.addEventListener('click', leave);
  el.clockBtn.addEventListener('click', () => setClock(!clockOn));

  for (const type of ['pointermove', 'pointerdown']) root.addEventListener(type, wake);
  root.addEventListener('focusin', (e) => { if (e.target !== root) wake(); });
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
    wake();
  });
  // The browser's Escape (or F11 / swipe) leaves fullscreen without a keydown: follow it.
  document.addEventListener('fullscreenchange', () => {
    if (active && viaFullscreen && !document.fullscreenElement) { viaFullscreen = false; leave(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) { clearTimeout(clockTimer); return; }
    renderWeather();
    scheduleClock();
    if (!wakeLock || wakeLock.released) lockScreen();
  });
  new MutationObserver(() => { if (active) renderWeather(); })
    .observe(readout, { subtree: true, childList: true, characterData: true });

  syncClockUi();
  return {
    enter, leave,
    get active() { return active; },
    get fullscreen() { return viaFullscreen; },
    get clock() { return clockOn; },
    setClock,
    /** Re-read the weather (e.g. after a refresh that changed only updatedAt). */
    update() { if (active) renderWeather(); },
  };
}
