const HOUR = 3600000;
export const STALE_MS = 30 * 60000;
export function nextHours(forecast = [], now = Date.now()) {
  return forecast.filter(h => h.time > now && h.time <= now + 24 * HOUR).sort((a, b) => a.time - b.time);
}
export function precipitationSummary(hours, formatTime) {
  const wet = hours.find(h => Number.isFinite(h.precipitationMm) && h.precipitationMm > 0);
  if (wet) return `Precipitation forecast in the hour ${formatTime(wet.time - HOUR)}–${formatTime(wet.time)}.`;
  if (hours.length < 24 || hours.some(h => !Number.isFinite(h.precipitationMm))) return 'Precipitation timing unavailable for part of the next 24 hours.';
  return 'No precipitation forecast in the next 24 hours.';
}
export function isStale(weather, updatedAt, now = Date.now()) {
  return !updatedAt || now - updatedAt > STALE_MS || now - weather.observedAt > 2 * HOUR;
}
