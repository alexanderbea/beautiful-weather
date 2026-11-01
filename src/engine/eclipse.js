import { readoutLift } from './readoutClearance.js';

// Visible corona radius (x disc r) kept clear of the weather readout.
const CORONA_CLEAR = 1.6;

/** Fixed totality composition; palette dimming uses the engine's existing eased transition. */
export function drawEclipse(ctx, env) {
  const { width: w, height: h, artStyle } = env;
  const x = w * .72;
  const r = Math.min(w, h) * .055 * artStyle.params.celestial.size;
  const c = r * CORONA_CLEAR;
  const y = h * .25 + readoutLift(env.readout, x - c, h * .25 - c, x + c, h * .25 + c);
  const glow = artStyle.params.celestial.glow;
  ctx.save();
  const corona = ctx.createRadialGradient(x, y, r * .95, x, y, r * 3.8);
  corona.addColorStop(0, 'rgba(255,223,151,.95)');
  corona.addColorStop(.12, 'rgba(255,181,91,.5)');
  corona.addColorStop(.4, `rgba(231,126,66,${.12 + glow * .1})`);
  corona.addColorStop(1, 'rgba(231,126,66,0)');
  ctx.fillStyle = corona;
  ctx.fillRect(x-r*4, y-r*4, r*8, r*8);
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = '#080b12'; ctx.fill();
  ctx.strokeStyle = '#f8ca83'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
