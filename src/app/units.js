/**
 * Temperature units by country convention. Countries are ISO 3166-1 alpha-2 codes, as
 * returned by the geocoder (OpenWeather `sys.country`, the dev city table, ?country=).
 */

/** Countries that use Fahrenheit day to day: the US (and territories), Belize, Liberia and a few US-aligned islands. */
const FAHRENHEIT_COUNTRIES = new Set(['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'BZ', 'LR', 'BS', 'KY', 'PW', 'FM', 'MH']);

/** 'F' for imperial countries, 'C' otherwise, including when the country is unknown (global default). */
export function unitForCountry(country) {
  return FAHRENHEIT_COUNTRIES.has(String(country ?? '').trim().toUpperCase()) ? 'F' : 'C';
}

/** Parses a ?units= override: 'c' / 'f' (also 'metric' / 'imperial'). Null means "follow the country". */
export function parseUnitParam(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'c' || v === 'metric' || v === 'celsius') return 'C';
  if (v === 'f' || v === 'imperial' || v === 'fahrenheit') return 'F';
  return null;
}

/** Rounded temperature in `unit`, from Celsius. */
export function convertTemp(celsius, unit) {
  return Math.round(unit === 'F' ? celsius * 9 / 5 + 32 : celsius);
}
