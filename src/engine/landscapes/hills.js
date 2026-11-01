/**
 * Hills: the original rolling hills with the town on the water (the landmark skyline). Kept exactly as
 * the scene drew them before landscapes existed, so the default view does not change.
 */
export function createHills() {
  return {
    id: 'hills',
    label: 'Hills',
    hint: 'Rolling hills and a town on the water',
    swatch: 'linear-gradient(#83b7ea, #e2f1ff 50%, #6aa384 52%, #3f7a58)',
    town: true,
    sea: null,
    layers: [
      { base: 0.66, speed: 0.004, waves: [[0.045, 1.2, 0.3], [0.02, 2.9, 1.7], [0.008, 7.3, 4.1]] },
      { base: 0.75, speed: 0.009, waves: [[0.04, 0.9, 2.2], [0.022, 2.3, 0.4], [0.01, 5.7, 3.3]] },
      { base: 0.87, speed: 0.016, waves: [[0.035, 0.7, 5.1], [0.018, 1.9, 2.8], [0.009, 4.6, 0.9]] },
    ],
  };
}
