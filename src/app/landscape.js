import { LANDSCAPE_DEFS, DEFAULT_LANDSCAPE_ID } from '../engine/landscapes/index.js';
import { createStyleState, parseStyleParam } from './artStyle.js';

/**
 * Landscape selection state: which landscape (hills, coast, forest, mountains) the scene shows. It is a
 * separate dimension from the art style and uses the same state shape (get / set / subscribe).
 * Precedence: ?landscape=<id> > the last choice saved in localStorage > the default hills.
 * Every landscape is free to pick; nothing is gated.
 */
export const LANDSCAPES = LANDSCAPE_DEFS.map(({ id, label, hint, swatch }) => ({ id, label, hint, swatch }));
export const DEFAULT_LANDSCAPE = DEFAULT_LANDSCAPE_ID;
const STORAGE_KEY = 'bw.landscape';

/** Parses a ?landscape= override (case-insensitive). Null when missing or unknown. */
export function parseLandscapeParam(value) {
  return parseStyleParam(value, LANDSCAPES);
}

export function createLandscapeState({ initial = null, persist = true } = {}) {
  return createStyleState({ initial, styles: LANDSCAPES, persist, key: STORAGE_KEY, fallback: DEFAULT_LANDSCAPE });
}

/**
 * Overlay note for the landscape. The scenes are imagined places, never the viewer's real local
 * geography; the default hills carry no note (their town follows the location, as before).
 */
export function landscapeNote(id) {
  if (id === DEFAULT_LANDSCAPE) return '';
  const def = LANDSCAPES.find((l) => l.id === id);
  return def ? `${def.label} · imagined landscape` : '';
}
