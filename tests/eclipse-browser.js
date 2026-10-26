// Run in the live page: const qa = await import('/tests/eclipse-browser.js');
// Each call is bounded to < 10 seconds. Requires the app's real weather to load.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readout = () => [...document.querySelectorAll('.overlay__place,.overlay__temp,.overlay__cond')].map(e => e.textContent);
const readings = () => {
  const { solarElevation, ...live } = window.__bw.live; // sun ticks independently
  return live;
};
function check(value, message) { if (!value) throw new Error(message); }
function select(scene) {
  const el = document.getElementById('atmosphere');
  el.value = scene;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
export async function styleSwitch(id) {
  const bw = window.__bw;
  const before = JSON.stringify({ readings: readings(), readout: readout() });
  select('eclipse');
  document.querySelector(`[data-style-id="${id}"]`).click();
  await sleep(2300);
  const state = bw.engine.state;
  check(state.scene === 'eclipse' && state.style === id, 'scene/style selection');
  check(state.solarElevation === -18 && state.effects.length === 0, 'totality / effect cleanup');
  check(document.querySelector('[data-style-id].is-active').dataset.styleId === id, 'picker synchronization');
  check(before === JSON.stringify({ readings: readings(), readout: readout() }), 'city/live readings changed');
  const rect = document.querySelector('.overlay').getBoundingClientRect();
  check(rect.left >= 0 && rect.right <= innerWidth && rect.bottom < innerHeight - 100, 'weather readout clipped');
  const { drawEclipse } = await import('../src/engine/eclipse.js');
  const c = document.createElement('canvas'); c.width = innerWidth; c.height = innerHeight;
  const ctx = c.getContext('2d');
  const draw = time => {
    ctx.clearRect(0, 0, c.width, c.height);
    drawEclipse(ctx, { width: c.width, height: c.height, artStyle: { params: state.styleParams }, reducedMotion: true, time });
    return c.toDataURL();
  };
  check(draw(0) === draw(123), 'occlusion or corona moved');
  return { pass: true, style: id, reducedMotion: state.parallax.reducedMotion,
    effects: state.effects, readout: readout(), viewport: [innerWidth, innerHeight] };
}
export async function transitions() {
  const bw = window.__bw;
  const originalStyle = bw.style.get();
  select('live'); await sleep(2200);
  const before = bw.engine.state;
  const text = readout();
  select('eclipse'); await sleep(350);
  const entering = bw.engine.state.solarElevation;
  check(entering < before.solarElevation && entering > -18, 'entry did not ease');
  bw.style.set(originalStyle === 'japanese' ? 'ghibli' : 'japanese');
  await sleep(200);
  select('live'); await sleep(200);
  bw.style.set(originalStyle); await sleep(2300);
  const after = bw.engine.state;
  check(after.scene === 'live' && after.style === originalStyle, 'interrupted transition restoration');
  check(Math.abs(after.solarElevation - bw.live.solarElevation) < .001, 'live sun restoration');
  check(JSON.stringify(after.effects.sort()) === JSON.stringify(before.effects.sort()), 'live effects restoration');
  check(JSON.stringify(readout()) === JSON.stringify(text), 'readout restoration');
  check(!document.querySelector('.overlay__note').textContent.includes('eclipse'), 'scene note cleanup');
  return { pass: true, entering, restoredElevation: after.solarElevation, restoredEffects: after.effects };
}
