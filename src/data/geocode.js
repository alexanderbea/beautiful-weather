/**
 * Reverse geocoding stub. The OpenWeather source already fills location.name from its
 * response, so this only matters for the mock source / custom coordinates.
 * TODO: plug in a real provider (e.g. OpenWeather Geocoding API /geo/1.0/reverse).
 */
export async function reverseGeocode(/* { lat, lng } */) {
  return null;
}

export function formatCoords({ lat, lng }) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}
