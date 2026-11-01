/**
 * The one forecast menu: a top-right button opening a single surface (city, scene, hourly
 * scrubber, Back to now). Desktop shows it as a side panel; phones as a bottom sheet that
 * lowers to its handle while an hour is previewed. The handle is that same sheet lowered,
 * never a second menu.
 *
 * States: 'closed' | 'open' | 'lowered' (phone only; desktop CSS shows it as open).
 * Dismissal (menu button, Escape, or a tap on the open landscape on phones) closes the
 * surface and reports onDismiss so the app returns the landscape to now.
 */
const PHONE = '(max-width: 600px)';

export function createForecastMenu({ button, panel, handle, caption, back, landscape, onBackToNow, onDismiss, onExpand }) {
  const isPhone = () => matchMedia(PHONE).matches;
  let state = 'closed';
  let previewing = false;

  function set(next) {
    state = next;
    panel.dataset.state = next;
    document.body.dataset.menu = next;
    panel.inert = next === 'closed';
    button.setAttribute('aria-expanded', String(next !== 'closed'));
    button.setAttribute('aria-label', next === 'closed' ? 'Open forecast menu' : 'Close forecast menu');
    handle.setAttribute('aria-expanded', String(next === 'open'));
    handle.setAttribute('aria-label', next === 'lowered' ? 'Show forecast' : 'Lower forecast');
  }
  function open() {
    set('open');
    // First control of the surface (the city), skipping the handle hidden on desktop.
    [...panel.querySelectorAll('.menu__body select, .menu__body button')].find(n => n.checkVisibility?.() ?? true)?.focus();
  }
  function close() {
    if (state === 'closed') return;
    const hadFocus = panel.contains(document.activeElement);
    set('closed');
    if (hadFocus) button.focus();
    onDismiss?.();
  }

  button.addEventListener('click', () => (state === 'closed' ? open() : close()));
  handle.addEventListener('click', () => {
    if (state === 'lowered') { set('open'); onExpand?.(); } else if (state === 'open') { set('lowered'); handle.focus(); }
  });
  back.addEventListener('click', () => { if (previewing) onBackToNow?.(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state !== 'closed') close(); });
  // A tap on the landscape above the phone sheet dismisses it; the desktop panel sits beside it.
  landscape.addEventListener('click', () => { if (isPhone()) close(); });

  set('closed');
  return {
    open, close,
    get state() { return state; },
    /** Shows (text) or clears (null) the preview caption; a committed phone pick lowers the sheet. */
    setPreview(text, { commit = false } = {}) {
      previewing = !!text;
      caption.textContent = text ?? '';
      back.setAttribute('aria-disabled', String(!previewing));
      panel.classList.toggle('is-previewing', previewing);
      if (previewing && commit && isPhone() && state === 'open') { set('lowered'); handle.focus(); }
    },
  };
}
