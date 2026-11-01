// Run with a Playwright page against the existing preview. Requests are fixture-controlled.
export default async function verifyFailedCity(page) {
  const origin = 'http://host.docker.internal:32768';
  const results = [];
  let failNewYork = true;
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  await page.route('https://api.open-meteo.com/**', route => {
    const tokyo = route.request().url().includes('latitude=35.6762');
    if (!tokyo && failNewYork) return route.fulfill({ status: 503, body: 'unavailable' });
    return route.fulfill({ json: { current: {
      time: new Date().toISOString().slice(0, 19), temperature_2m: tokyo ? 14 : -2,
      is_day: 1, weather_code: tokyo ? 61 : 71, wind_speed_10m: 5,
    } } });
  });
  const loadTokyo = async () => {
    await page.goto(`${origin}/?lat=35.6762&lng=139.6503&name=Tokyo&country=JP`);
    await page.waitForFunction(() => window.__bw?.live?.condition === 'rain');
  };
  try {
    for (const paused of [false, true]) {
      await loadTokyo();
      const before = await page.evaluate(paused => {
        if (paused) __bw.engine.stop();
        return document.querySelector('canvas').toDataURL();
      }, paused);
      await page.getByLabel('Choose a city').selectOption('New York');
      await page.waitForFunction(() => document.querySelector('[data-el="note"]').textContent.includes('Live weather unavailable'));
      const state = await page.evaluate(() => ({ live: __bw.live, ...__bw.engine.state,
        canvas: document.querySelector('canvas').toDataURL() }));
      check(state.live === null && state.condition === 'clear' && !state.effects.includes('rain'), 'Uncached city must clear Tokyo rain');
      check(state.canvas !== before, 'Canvas must repaint, including while paused');
      results.push(`Uncached New York, loop ${paused ? 'paused' : 'running'}: neutral canvas, no rain`);
    }
    failNewYork = false;
    await loadTokyo();
    await page.getByLabel('Choose a city').selectOption('New York');
    await page.waitForFunction(() => __bw.live?.condition === 'snow');
    await page.getByLabel('Choose a city').selectOption('Tokyo');
    await page.waitForFunction(() => __bw.live?.condition === 'rain');
    failNewYork = true;
    await page.getByLabel('Choose a city').selectOption('New York');
    await page.waitForFunction(() => __bw.live?.condition === 'snow' && !__bw.engine.state.effects.includes('rain'));
    const cached = await page.evaluate(() => ({ city: __bw.live.location.name, condition: __bw.engine.state.condition,
      status: document.querySelector('[data-el="status"]').textContent, note: document.querySelector('[data-el="note"]').textContent }));
    check(cached.city === 'New York' && cached.condition === 'snow', 'Cached city must retain its own scene');
    check(cached.status.includes('Stale reading') && cached.note.includes('Update failed'), 'Cached failure must retain stale/update-failed labels');
    await page.evaluate(() => __bw.engine.stop());
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-el="status"]').textContent.includes('Stale reading'));
    check(await page.evaluate(() => __bw.engine.state.condition === 'snow'), 'Paused cached refresh must retain snow');
    results.push('Cached New York: own snow scene and stale/update-failed labels, including paused refresh');
    return results;
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}
