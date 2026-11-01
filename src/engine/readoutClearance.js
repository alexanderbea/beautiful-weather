/**
 * Readout clearance: the app reports the on-screen weather readout's text box (CSS px,
 * { left, top, right, bottom } or null) via engine.setReadout(); sky details whose extent would sit
 * behind it are moved straight down until they clear it. Nothing moves when there is no overlap.
 */
export const READOUT_GAP = 12; // px between the readout's last line and a sky detail

/**
 * Downward shift (px, >= 0) so the box [x0, x1] x [y0, y1] clears `readout` by READOUT_GAP.
 * 0 when there is no readout or the box does not overlap it.
 */
export function readoutLift(readout, x0, y0, x1, y1) {
  if (!readout) return 0;
  const g = READOUT_GAP;
  if (x1 < readout.left - g || x0 > readout.right + g || y1 < readout.top - g || y0 > readout.bottom + g) return 0;
  return Math.max(0, readout.bottom + g - y0);
}

/**
 * Smallest move { dx, dy } that clears `readout`: straight down, or right when that is shorter and the
 * box still ends left of `maxRight` (e.g. a wide desktop where the readout is short).
 */
export function readoutShift(readout, x0, y0, x1, y1, maxRight = -Infinity) {
  const dy = readoutLift(readout, x0, y0, x1, y1);
  if (!dy) return { dx: 0, dy: 0 };
  const dx = readout.right + READOUT_GAP - x0;
  return dx < dy && x1 + dx <= maxRight ? { dx, dy: 0 } : { dx: 0, dy };
}
