import { DEFAULT_LOCATION } from '../data/model.js';

const GEO_TIMEOUT_MS = 8000;

/** Parses "?lat=..&lng=.." so a location can be pinned from the URL. */
export function locationFromParams(params) {
  const lat = parseFloat(params.get('lat'));
  const lng = parseFloat(params.get('lng') ?? params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, name: params.get('name') || undefined };
}

/** Parses "59.33, 18.07" style input. Returns null when invalid. */
export function parseLatLng(text) {
  const m = String(text).match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Resolves the device location. Never rejects: on denial, timeout or missing API it
 * resolves to DEFAULT_LOCATION with `fallback: true`.
 */
export function getDeviceLocation() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => { if (!done) { done = true; clearTimeout(guard); resolve(result); } };
    const fallback = (reason) => finish({ location: { ...DEFAULT_LOCATION }, fallback: true, reason });
    // The API timeout only runs after permission is granted; an ignored prompt would hang forever.
    const guard = setTimeout(() => fallback('timed out'), GEO_TIMEOUT_MS + 2000);
    if (!('geolocation' in navigator)) return fallback('unsupported');
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude }, fallback: false }),
      (err) => fallback(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000, enableHighAccuracy: false },
    );
  });
}
