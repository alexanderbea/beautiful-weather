/**
 * Ambient-sound control: a small frosted pill in the bottom-left corner (the art-style picker owns the
 * bottom-right). A speaker button toggles mute; hovering / focusing it reveals a volume slider.
 *
 * Browsers block autoplay, so sound starts muted and the AudioContext is only created inside a user
 * gesture. The first pointer / key gesture anywhere on the page enables and unmutes the audio, unless
 * the user explicitly muted it on an earlier visit (remembered in localStorage). A gesture on this
 * control itself is left to the button, so the first click on it turns sound on rather than off.
 */
const CSS = `
.audio-ctl {
  position: fixed;
  left: max(14px, env(safe-area-inset-left));
  bottom: max(14px, env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  color: #e8eef6;
  background: rgba(10, 16, 28, 0.38);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  opacity: 0.72;
  transition: opacity 0.25s ease, background 0.25s ease;
}
.audio-ctl:hover, .audio-ctl:focus-within { opacity: 1; background: rgba(10, 16, 28, 0.58); }
.audio-ctl__btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s ease;
}
.audio-ctl__btn:hover { background: rgba(255, 255, 255, 0.12); }
.audio-ctl__btn:focus-visible, .audio-ctl__vol:focus-visible { outline: 1px solid rgba(232, 238, 246, 0.8); outline-offset: 2px; }
.audio-ctl__vol {
  width: 0;
  margin: 0;
  opacity: 0;
  accent-color: #e8eef6;
  cursor: pointer;
  transition: width 0.25s ease, opacity 0.25s ease, margin 0.25s ease;
}
.audio-ctl:hover .audio-ctl__vol, .audio-ctl:focus-within .audio-ctl__vol { width: 84px; margin: 0 8px 0 4px; opacity: 1; }
.audio-ctl.is-muted .audio-ctl__wave, .audio-ctl:not(.is-muted) .audio-ctl__x { display: none; }
@media (hover: none) { .audio-ctl__vol { display: none; } }
@media (prefers-reduced-motion: reduce) { .audio-ctl, .audio-ctl__btn, .audio-ctl__vol { transition: none; } }
`;

const ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" fill-opacity="0.25"/>
  <path class="audio-ctl__wave" d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.3 3.8a6 6 0 0 1 0 8.4"/>
  <path class="audio-ctl__x" d="M10.5 6l3.5 4M14 6l-3.5 4"/>
</svg>`;

const STORAGE_KEY = 'bw.audio';

function readPrefs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; }
}
function writePrefs(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* blocked storage: session-only */ }
}

function injectCss() {
  if (document.getElementById('audio-ctl-css')) return;
  const el = document.createElement('style');
  el.id = 'audio-ctl-css';
  el.textContent = CSS;
  document.head.append(el);
}

export function createAudioControl(root, audio) {
  injectCss();
  const prefs = readPrefs();
  if (Number.isFinite(prefs.volume)) audio.setVolume(prefs.volume);
  const save = () => writePrefs({ volume: audio.volume, mutedByUser: audio.muted });

  root.classList.add('audio-ctl');
  root.innerHTML = `<button type="button" class="audio-ctl__btn" data-el="btn">${ICON}</button>
    <input type="range" class="audio-ctl__vol" data-el="vol" min="0" max="100" step="1" aria-label="Ambient sound volume" />`;
  const btn = root.querySelector('[data-el="btn"]');
  const vol = root.querySelector('[data-el="vol"]');
  vol.value = String(Math.round(audio.volume * 100));

  function sync() {
    const m = audio.muted;
    root.classList.toggle('is-muted', m);
    btn.setAttribute('aria-pressed', String(!m));
    btn.setAttribute('aria-label', m ? 'Turn ambient sound on' : 'Mute ambient sound');
    btn.title = m ? 'Sound off: click for ambient sound' : 'Mute ambient sound';
  }

  function setMuted(m) {
    if (!m && !audio.enable()) return; // no Web Audio: stay muted
    audio.setMuted(m);
    sync();
  }

  btn.addEventListener('click', () => {
    disarm();
    setMuted(!audio.muted);
    save();
  });
  vol.addEventListener('input', () => {
    disarm();
    audio.setVolume(+vol.value / 100);
    if (audio.muted && +vol.value > 0) setMuted(false);
    save();
  });

  // First gesture anywhere else: enable + unmute (capture phase, before any other handler).
  const GESTURES = ['pointerdown', 'keydown', 'touchend'];
  const disarm = () => { for (const g of GESTURES) window.removeEventListener(g, onFirstGesture, true); };
  function onFirstGesture(e) {
    if (root.contains(e.target)) return; // the button / slider handle their own first use
    disarm();
    if (prefs.mutedByUser) { audio.enable(); return; } // context ready, but respect the earlier mute
    setMuted(false);
  }
  for (const g of GESTURES) window.addEventListener(g, onFirstGesture, true);

  sync();
  return { sync };
}
