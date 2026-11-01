/** Settings is either open or fully dismissed; it never changes the scene's geometry. */
export function createForecastMenu({ button, panel, landscape }) {
  let state = 'closed';
  function set(next) {
    state = next;
    panel.dataset.state = next;
    document.body.dataset.menu = next;
    panel.inert = next === 'closed';
    button.setAttribute('aria-expanded', String(next === 'open'));
    button.setAttribute('aria-label', next === 'open' ? 'Close settings' : 'Open settings');
  }
  function open() { set('open'); }
  function close() {
    const hadFocus = panel.contains(document.activeElement);
    set('closed');
    if (hadFocus) button.focus({ preventScroll: true });
  }
  button.addEventListener('click', () => state === 'closed' ? open() : close());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && state === 'open') close(); });
  // The engine dispatches only after giving visible animals first refusal.
  landscape.addEventListener('landscape-tap', close);
  set('closed');
  return { open, close, get state() { return state; } };
}
