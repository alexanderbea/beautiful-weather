export const CITIES = {
  Stockholm: { lat: 59.3293, lng: 18.0686, country: 'SE', timeZone: 'Europe/Stockholm' },
  London: { lat: 51.5074, lng: -0.1278, country: 'GB', timeZone: 'Europe/London' },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: 'JP', timeZone: 'Asia/Tokyo' },
  'New York': { lat: 40.7128, lng: -74.006, country: 'US', timeZone: 'America/New_York' },
};

// A provider name alone must not turn device coordinates into a preset selection.
export function selectedCity(location) {
  return Object.entries(CITIES).find(([name, city]) => name === location?.name
    && city.lat === location.lat && city.lng === location.lng)?.[0] ?? '';
}

export function locationTimeZone(location) {
  return location?.timeZone || CITIES[selectedCity(location)]?.timeZone;
}
