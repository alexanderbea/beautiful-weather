import { STYLE_DEFS, DEFAULT_STYLE_ID } from '../engine/styles/index.js';

/**
 * Art-style selection state: the single source of truth for which scene style is active.
 *
 * The registry is the renderer's (src/engine/styles/index.js): each style is defined once there with
 * its palette, scene parameters and overlay passes, and the picker only reads { id, label, hint, swatch }.
 * The state API (get / set / subscribe) is what app.js binds to engine.setStyle and the picker.
 *
 * Precedence for the initial style: ?style=<id> > the last choice saved in localStorage > DEFAULT_STYLE.
 */
export const ART_STYLES = STYLE_DEFS.map(({ id, label, hint, swatch }) => ({ id, label, hint, swatch }));
export const DEFAULT_STYLE = DEFAULT_STYLE_ID;
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
