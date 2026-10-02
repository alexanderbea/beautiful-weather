/** Manual artwork, never inferred from weather or an astronomical forecast. */
export const SCENES = ['live', 'eclipse', 'meteors'];
export const parseScene = (value) => SCENES.includes(value) ? value : 'live';
export const sceneForcesNight = (value) => value === 'eclipse' || value === 'meteors';
export function sceneWeather(weather, scene) {
  return sceneForcesNight(scene)
    ? { ...weather, scene, condition: 'clear', isDay: false, solarElevation: -18, sunRising: false }
    : { ...weather, scene: 'live' };
}
