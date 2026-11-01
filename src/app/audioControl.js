/**
 * Ambient-sound control: a small frosted pill in the bottom-left corner (the art-style picker owns the
 * bottom-right) with
 *   - a "Sound" toggle (aria-pressed): the only thing that starts audio,
 *   - a mixer button that opens a panel with Mute, master Volume, Rain and Wind levels and
 *     "Follow weather" (rain and wind back to their weather-following defaults).
 *
 * Browsers block autoplay, and sound must never start by surprise: no click elsewhere on the page, no
 * slider move and no restored preference turns it on. Volume, mute and the rain / wind levels are
 * saved in localStorage (audioPrefs.js); the on state is not, so a reload is always silent until the
 * Sound button is pressed again. Everything is a native button or range input, so touch and keyboard
 * work (Escape closes the panel and returns focus to the mixer button).
 */
import { readPrefs, writePrefs } from './audioPrefs.js';

const CSS = `
.audio-ctl {
  position: fixed;
  left: max(14px, env(safe-area-inset-left));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 5;
  color: #e8eef6;
  font: 500 12px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.audio-ctl__bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: rgba(10, 16, 28, 0.38);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  opacity: 0.72;
  transition: opacity 0.25s ease, background 0.25s ease;
}
.audio-ctl:hover .audio-ctl__bar, .audio-ctl:focus-within .audio-ctl__bar, .audio-ctl.is-open .audio-ctl__bar,
.audio-ctl.is-on .audio-ctl__bar { opacity: 1; background: rgba(10, 16, 28, 0.58); }
.audio-ctl button { font: inherit; color: inherit; cursor: pointer; }
.audio-ctl__power, .audio-ctl__more {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 7px;
  background: transparent;
  border: 0;
  border-radius: 999px;
  transition: background 0.2s ease;
}
.audio-ctl__more { width: 30px; padding: 0; justify-content: center; }
.audio-ctl__power:hover, .audio-ctl__more:hover { background: rgba(255, 255, 255, 0.12); }
.audio-ctl__power[aria-pressed='true'] { background: rgba(232, 238, 246, 0.16); }
.audio-ctl__more[aria-expanded='true'] { background: rgba(232, 238, 246, 0.2); }
.audio-ctl__state { opacity: 0.7; font-weight: 400; }
.audio-ctl button:focus-visible, .audio-ctl input:focus-visible { outline: 2px solid rgba(232, 238, 246, 0.9); outline-offset: 2px; }
.audio-ctl:not(.is-audible) .audio-ctl__wave, .audio-ctl.is-audible .audio-ctl__x { display: none; }
.audio-ctl__panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  width: min(270px, calc(100vw - 28px - env(safe-area-inset-left) - env(safe-area-inset-right)));
  box-sizing: border-box;
  display: grid;
  gap: 10px;
  padding: 12px;
  background: rgba(10, 16, 28, 0.82);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.audio-ctl__panel[hidden] { display: none; }
.audio-ctl__row { display: grid; grid-template-columns: 52px 1fr 64px; align-items: center; gap: 8px; }
.audio-ctl__row label { font-weight: 600; }
.audio-ctl__row output { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
.audio-ctl__row input { width: 100%; min-width: 0; height: 28px; margin: 0; accent-color: #e8eef6; cursor: pointer; }
.audio-ctl__row.is-auto output { opacity: 0.6; }
.audio-ctl__actions { display: flex; gap: 8px; }
.audio-ctl__chip {
  flex: 1;
  min-height: 32px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
}
.audio-ctl__chip:hover { background: rgba(255, 255, 255, 0.16); }
.audio-ctl__chip[aria-pressed='true'] { background: rgba(232, 238, 246, 0.85); color: #0b1428; }
.audio-ctl__chip:disabled { opacity: 0.45; cursor: default; }
.audio-ctl__note { margin: 0; font-weight: 400; opacity: 0.7; }
@media (pointer: coarse) {
  .audio-ctl__power, .audio-ctl__more { min-height: 44px; }
  .audio-ctl__more { width: 44px; }
  .audio-ctl__row input { height: 44px; }
  .audio-ctl__chip { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .audio-ctl__bar, .audio-ctl button { transition: none; } }
`;

const SPEAKER = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" fill-opacity="0.25"/>
  <path class="audio-ctl__wave" d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.8a6 6 0 0 1 0 8.4"/>
  <path class="audio-ctl__x" d="M10.5 6l3.5 4M14 6l-3.5 4"/>
</svg>`;
const SLIDERS = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
  <path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.6" fill="currentColor"/><circle cx="10.5" cy="8" r="1.6" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/>
</svg>`;

function injectCss() {
  if (document.getElementById('audio-ctl-css')) return;
  const el = document.createElement('style');
  el.id = 'audio-ctl-css';
  el.textContent = CSS;
  document.head.append(el);
}

const pct = (v) => `${Math.round(v * 100)}%`;

export function createAudioControl(root, audio, { storage } = {}) {
  injectCss();
  // Restoring preferences never starts sound: they only set targets on the (still off) engine.
  const prefs = readPrefs(storage);
  audio.setVolume(prefs.volume);
  audio.setMuted(prefs.muted);
  audio.setMix({ rain: prefs.rain, wind: prefs.wind });
  const save = () => writePrefs({ volume: audio.volume, muted: audio.muted, ...audio.mix }, storage);

  root.classList.add('audio-ctl');
  root.innerHTML = `
    <div class="audio-ctl__panel" id="audio-mixer" data-el="panel" role="group" aria-label="Sound mixer" hidden>
      <div class="audio-ctl__actions">
        <button type="button" class="audio-ctl__chip" data-el="mute" aria-pressed="false">Mute</button>
        <button type="button" class="audio-ctl__chip" data-el="reset">Follow weather</button>
      </div>
      <div class="audio-ctl__row"><label for="audio-vol">Volume</label><input id="audio-vol" type="range" min="0" max="100" step="1" data-el="vol" /><output for="audio-vol" data-el="vol-out"></output></div>
      <div class="audio-ctl__row" data-el="rain-row"><label for="audio-rain">Rain</label><input id="audio-rain" type="range" min="0" max="100" step="1" data-el="rain" /><output for="audio-rain" data-el="rain-out"></output></div>
      <div class="audio-ctl__row" data-el="wind-row"><label for="audio-wind">Wind</label><input id="audio-wind" type="range" min="0" max="100" step="1" data-el="wind" /><output for="audio-wind" data-el="wind-out"></output></div>
      <p class="audio-ctl__note" data-el="note" aria-live="polite"></p>
    </div>
    <div class="audio-ctl__bar">
      <button type="button" class="audio-ctl__power" data-el="power" aria-pressed="false">${SPEAKER}<span>Sound</span><span class="audio-ctl__state" data-el="state" aria-hidden="true"></span></button>
      <button type="button" class="audio-ctl__more" data-el="more" aria-expanded="false" aria-controls="audio-mixer" aria-label="Sound mixer" title="Sound mixer">${SLIDERS}</button>
    </div>`;
  const $ = (name) => root.querySelector(`[data-el="${name}"]`);
  const power = $('power'), more = $('more'), panel = $('panel'), mute = $('mute'), reset = $('reset'), note = $('note');
  const vol = $('vol'), rain = $('rain'), wind = $('wind');

  function sync() {
    const { on, muted, volume, mix } = audio;
    const auto = audio.autoLevels;
    root.classList.toggle('is-on', on);
    root.classList.toggle('is-audible', on && !muted);
    power.setAttribute('aria-pressed', String(on));
    $('state').textContent = !on ? 'off' : muted ? 'muted' : 'on';
    power.title = on ? 'Turn ambient sound off' : 'Turn ambient sound on';
    mute.setAttribute('aria-pressed', String(muted));
    mute.textContent = muted ? 'Muted' : 'Mute';
    vol.value = String(Math.round(volume * 100));
    $('vol-out').textContent = pct(volume);
    for (const [name, input] of [['rain', rain], ['wind', wind]]) {
      const isAuto = mix[name] == null;
      const v = isAuto ? auto[name] : mix[name];
      if (document.activeElement !== input || isAuto) input.value = String(Math.round(v * 100));
      $(`${name}-out`).textContent = isAuto ? `Auto ${pct(v)}` : pct(v);
      $(`${name}-row`).classList.toggle('is-auto', isAuto);
      input.setAttribute('aria-valuetext', isAuto ? `${pct(v)}, following the weather` : pct(v));
    }
    reset.disabled = mix.rain == null && mix.wind == null;
    note.textContent = !on ? 'Sound is off. Press Sound to listen.' : muted ? 'Muted. Press Muted to listen again.' : '';
  }

  power.addEventListener('click', () => { audio.setOn(!audio.on); sync(); });
  mute.addEventListener('click', () => { audio.setMuted(!audio.muted); save(); sync(); });
  reset.addEventListener('click', () => { audio.setMix({ rain: null, wind: null }); save(); sync(); });
  vol.addEventListener('input', () => { audio.setVolume(+vol.value / 100); save(); sync(); });
  for (const [name, input] of [['rain', rain], ['wind', wind]]) {
    input.addEventListener('input', () => { audio.setMix({ [name]: +input.value / 100 }); save(); sync(); });
  }

  // Mixer panel: opens from the button (click / Enter / Space / tap), closes on Escape, the button or
  // a press outside. None of these start sound.
  let poll = 0;
  function setOpen(open, { focusButton = false } = {}) {
    panel.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    root.classList.toggle('is-open', open);
    clearInterval(poll);
    if (open) { sync(); poll = setInterval(sync, 1000); } // auto levels follow the weather
    if (!open && focusButton) more.focus();
  }
  more.addEventListener('click', () => setOpen(panel.hidden));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); setOpen(false, { focusButton: true }); } });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !root.contains(e.target)) setOpen(false); });

  sync();
  return { sync, setOpen };
}
