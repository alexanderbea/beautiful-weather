/**
 * Art-style selection state: the single source of truth for which scene style is active.
 *
 * PLACEHOLDER REGISTRY. The real art-style definitions are a separate ticket (#25); until they land,
 * ART_STYLES is a small list of ids + labels and the scene treatment for each is a CSS filter on the
 * canvas (`[data-style="…"] #scene` in styles.css). Replacing the registry with the real one keeps the
 * state API (get / set / subscribe) and the picker unchanged: the picker only reads { id, label, hint }.
 *
 * Precedence for the initial style: ?style=<id> > the last choice saved in localStorage > DEFAULT_STYLE.
 */
export const ART_STYLES = [
  { id: 'classic', label: 'Classic', hint: 'The default painterly palette' },
  { id: 'ink', label: 'Ink', hint: 'Monochrome, high contrast' },
  { id: 'dusk', label: 'Dusk', hint: 'Warm, faded film tones' },
  { id: 'pastel', label: 'Pastel', hint: 'Soft, lifted colours' },
];
export const DEFAULT_STYLE = 'classic';
const STORAGE_KEY = 'bw.style';

/** True when `id` names a registered style. */
export function isStyleId(id, styles = ART_STYLES) {
  return styles.some((s) => s.id === id);
}

/** Parses a ?style= override (case-insensitive). Null when missing or unknown. */
export function parseStyleParam(value, styles = ART_STYLES) {
  const id = String(value ?? '').trim().toLowerCase();
  return isStyleId(id, styles) ? id : null;
}

function readStored(styles) {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return isStyleId(id, styles) ? id : null;
  } catch { return null; }
}

function writeStored(id) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode / blocked storage: selection is session-only */ }
}

/**
 * Creates the style state. `initial` (e.g. from ?style=) wins over the stored choice; `persist: false`
 * (tests) skips localStorage. Listeners run on every change and once on subscribe with the current id.
 */
export function createStyleState({ initial = null, styles = ART_STYLES, persist = true } = {}) {
  let current = (isStyleId(initial, styles) && initial) || (persist && readStored(styles)) || DEFAULT_STYLE;
  const listeners = new Set();

  return {
    styles,
    get() { return current; },
    /** Switches style; unknown ids and no-ops are ignored. */
    set(id) {
      if (id === current || !isStyleId(id, styles)) return;
      current = id;
      if (persist) writeStored(id);
      for (const fn of listeners) fn(current);
    },
    /** Registers a listener (called immediately with the current id) and returns an unsubscribe function. */
    subscribe(fn) {
      listeners.add(fn);
      fn(current);
      return () => listeners.delete(fn);
    },
  };
}
