// Playwright browser regression. Import and call once per fresh page:
// await checkCachedCity(page, { baseURL, cached: true, paused: true });
// Run all four combinations of cached/paused. No live weather or credentials needed.
export default async function checkCachedCity(page, {
  baseURL = 'http://host.docker.internal:32768', cached = true, paused = true,
} = {}) {
  page.setDefaultTimeout(8000);
  await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failNewYork = !cached;
  const requests = [];
  await page.route('https://api.open-meteo.com/**', async route => {
    const ny = /[?&]latitude=40\.7128(?:&|$)/.test(route.request().url());
    requests.push({ city: ny ? 'New York' : 'Tokyo', failed: ny && failNewYork });
    await route.fulfill(ny && failNewYork ? { status: 503, body: 'Isolated test failure' } : {
      json: { current: { time: '2026-11-01T12:00', temperature_2m: ny ? -3 : 16,
        apparent_temperature: ny ? -6 : 15, weather_code: ny ? 73 : 63,
        wind_speed_10m: 3, relative_humidity_2m: 80, is_day: 1 } },
    });
  });
  await page.setViewportSize({ width: 1000, height: 700 });
  const city = cached ? 'lat=40.7128&lng=-74.006&name=New%20York&country=US'
    : 'lat=35.6762&lng=139.6503&name=Tokyo&country=JP';
  await page.goto(`${baseURL}/?${city}&elev=30&parallax=0&ambient=0&skyline=off&style=default`);
  await page.waitForFunction(() => !!window.__bw);
  // City and scene controls live in the forecast menu, closed at rest.
  const openMenu = async () => { if (await page.locator('#menu-button').getAttribute('aria-expanded') !== 'true') await page.locator('#menu-button').click(); };
  await openMenu();
  // Read actual painted pixels, not the engine's target condition/effect names.
  const pixels = () => page.evaluate(() => {
    const canvas = document.querySelector('#scene');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
    const sky = ctx.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.2)).data;
    const rgb = [0, 0, 0];
    for (let i = 0; i < sky.length; i += 4) for (let c = 0; c < 3; c++) rgb[c] += sky[i + c];
    return { hash: hash >>> 0, rgb: rgb.map(v => v / (sky.length / 4)) };
  });
  const snow = cached ? await pixels() : null;
  if (cached) {
    await page.getByLabel('Choose a city').selectOption('Tokyo');
    await page.waitForFunction(() => window.__bw.live?.condition === 'rain');
  }
  await page.waitForTimeout(2600); // allow the normal 1.8s cross-fade to complete
  if (paused) await page.evaluate(() => window.__bw.engine.stop());
  const rain = await pixels();
  failNewYork = true;
  await page.getByLabel('Choose a city').selectOption('New York');
  await page.waitForFunction(() => document.querySelector('[data-el="note"]').textContent.includes('failed')
    || document.querySelector('[data-el="note"]').textContent.includes('unavailable'));
  if (!paused) await page.waitForTimeout(2600);
  const after = await pixels();
  await page.waitForTimeout(250);
  const later = await pixels();
  const ui = await page.locator('#overlay').innerText();
  const state = await page.evaluate(() => ({ condition: window.__bw.engine.state.condition,
    live: window.__bw.live?.condition ?? null }));
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const checks = {
    selectedCity: await page.getByLabel('Choose a city').inputValue() === 'New York',
    correctReading: cached ? state.live === 'snow' && ui.includes('Snow') : state.live === null && ui.includes('Weather unavailable'),
    correctFailure: cached ? ui.includes('Stale reading') && ui.includes('Update failed') : ui.includes('Live weather unavailable'),
    canvasChanged: rain.hash !== after.hash,
    visibleWeather: cached ? distance(after.rgb, snow.rgb) < distance(after.rgb, rain.rgb) : state.condition === 'clear' && distance(after.rgb, rain.rgb) > 10,
    staysPaused: !paused || after.hash === later.hash,
    noPageErrors: errors.length === 0,
    failedRequest: requests.at(-1)?.failed === true,
  };
  const result = { cached, paused, checks, rain, snow, after, later, errors, requests };
  if (Object.values(checks).some(ok => !ok)) {
    throw new Error(`Visible canvas regression: ${JSON.stringify(result)}`);
  }
  return result;
}
