// Import in the served application; calls finish within eight seconds.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (v, label) => { if (!v) throw new Error(label); };
const select = scene => {
  const el = document.querySelector('#atmosphere');
  el.value = scene; el.dispatchEvent(new Event('change', { bubbles: true }));
};
const reading = () => JSON.stringify(window.__bw.live);
export async function transitions() {
  const bw = window.__bw;
  select('live');
  document.querySelector('[data-group="time"][data-value="day"]').click();
  await sleep(2000);
  const before = reading();
  const readout = document.querySelector('.overlay__cond').textContent;
  const effects = bw.engine.state.effects.sort().join();
  select('meteors');
  check(document.querySelector('[data-group="time"].is-active').dataset.value === 'night', 'immediate Night control');
  check(document.querySelector('.overlay__note').textContent.includes('night demo'), 'night label');
  await sleep(2000);
  check(bw.engine.state.solarElevation === -18 && bw.engine.state.effects.length === 0, 'night and effect cleanup');
  for (const style of ['japanese', 'vangogh', 'ghibli', 'japanese', 'ghibli']) {
    bw.style.set(style); select('live'); select('meteors'); await sleep(60);
    check(bw.engine.state.meteors.time < .15, 'switch scheduler cleanup');
  }
  check(reading() === before, 'live readings / selected city preservation');
  select('live');
  check(document.querySelector('[data-group="time"].is-active').dataset.value === 'day', 'time selection restoration');
  await sleep(2000);
  check(bw.engine.state.solarElevation === 30, 'day restoration');
  check(bw.engine.state.effects.sort().join() === effects, 'weather effect restoration');
  check(document.querySelector('.overlay__cond').textContent === readout, 'weather label restoration');
  check(!bw.engine.state.meteors.active && bw.engine.state.meteors.time === 0, 'scene exit cleanup');
  return { pass: true, city: bw.live.location.name, effects, preserved: JSON.parse(before) };
}
export async function reduced() {
  select('meteors'); await sleep(2300);
  check(window.__bw.engine.state.parallax.reducedMotion, 'reduced-motion preference');
  const canvas = document.querySelector('#scene');
  const before = canvas.toDataURL(); const time = window.__bw.engine.state.meteors.time;
  await sleep(700);
  check(canvas.toDataURL() === before, 'whole canvas must be static');
  check(window.__bw.engine.state.meteors.time === time, 'meteor clock must freeze');
  return { pass: true, style: window.__bw.style.get(), staticCanvas: true };
}
export function layout() {
  for (const selector of ['.overlay', '.scene-picker', '.style-picker']) {
    const r = document.querySelector(selector).getBoundingClientRect();
    check(r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, selector + ' viewport bounds');
  }
  return { pass: true, viewport: [innerWidth, innerHeight], text: document.querySelector('#overlay').innerText };
}
