/**
 * Saved ambient-sound preferences (localStorage 'bw.audio'): master volume, master mute and the rain /
 * wind mixer levels (null = follow the weather). Whether sound is ON is deliberately not stored: every
 * page load starts silent and only an explicit press of the sound button starts audio.
 */
export const STORAGE_KEY = 'bw.audio';
export const DEFAULT_PREFS = Object.freeze({ volume: 0.6, muted: false, rain: null, wind: null });

const level = (v) => (v === null || v === undefined || !Number.isFinite(+v) ? null : Math.min(1, Math.max(0, +v)));

/** Normalises anything read from storage (including the v1 shape { volume, mutedByUser }). */
export function sanitizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const vol = Number.isFinite(+p.volume) && p.volume !== null && p.volume !== '' ? Math.min(1, Math.max(0, +p.volume)) : DEFAULT_PREFS.volume;
  return {
    volume: vol,
    muted: typeof p.muted === 'boolean' ? p.muted : p.mutedByUser === true,
    rain: level(p.rain),
    wind: level(p.wind),
  };
}

export function readPrefs(storage = globalThis.localStorage) {
  try { return sanitizePrefs(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return { ...DEFAULT_PREFS }; }
}

export function writePrefs(prefs, storage = globalThis.localStorage) {
  const { volume, muted, rain, wind } = sanitizePrefs(prefs);
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, volume, muted, rain, wind })); } catch { /* blocked storage: session-only */ }
}
