// Run with the Playwright MCP browser_run_code_unsafe tool (function body), or import
// and call with a Playwright page. Uses deterministic API responses, no paid API.
export default async function verifyForecast(page) {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString().slice(0, 16);
  const time = Array.from({ length: 48 }, (_, i) => iso(Math.floor(now / 3600000) * 3600000 + i * 3600000));
  const fixture = { current: { time: iso(now), temperature_2m: 10, apparent_temperature: 7, is_day: 1, weather_code: 3, wind_speed_10m: 2 }, hourly: { time, temperature_2m: time.map(() => 11), precipitation: time.map((_, i) => i === 2 ? 1.2 : 0), precipitation_probability: time.map((_, i) => i === 2 ? 80 : 0) } };
  let fail = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', async route => {
    requested = true;
    await gate;
    if (fail) return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, error) { error({ code: 1, PERMISSION_DENIED: 1 }); } } });
  });
  await page.goto('http://host.docker.internal:32768/');
  await page.waitForFunction(() => document.querySelector('#overlay [data-el=status]')?.textContent.includes('Loading'));
  check(await page.locator('[data-el=tempValue]').innerText() === '—', 'Loading must not invent a temperature');
  release();
  await page.waitForFunction(() => window.__bw?.live);
  check(requested, 'Existing provider request used');
  check((await page.locator('[data-el=note]').innerText()).includes('denied'), 'Denied location explained');
  check((await page.locator('[data-el=place]').innerText()) === 'Stockholm', 'City fallback');
  check(await page.getByLabel('Choose a city').inputValue() === 'Stockholm', 'Fallback selector');
  const status = await page.locator('#overlay [data-el=status]').innerText();
  check(status.includes('Europe/Stockholm') && !/\b(AM|PM)\b/.test(status), '24-hour local status');
  check((await page.locator('[data-el=rain]').textContent()).includes('Europe/Stockholm'), 'Local precipitation zone');
  check(!/\b(AM|PM)\b/.test(await page.locator('[data-el=hours]').textContent()), '24-hour rows');
  check(await page.locator('.forecast__hour').count() === 24, '24 hourly rows');
  check((await page.locator('[data-el=rain]').textContent()).includes('Precipitation forecast in the hour'), 'Hourly precipitation window');
  await page.getByLabel('Temperature units').selectOption('F');
  check(await page.locator('[data-el=tempValue]').innerText() === '50', 'Unit conversion');
  if (!await page.locator('details').evaluate(e => e.open)) await page.locator('summary').click();
  await page.locator('.forecast__hours').evaluate(e => { e.scrollLeft = e.scrollWidth; });
  check(await page.locator('.forecast__hours').evaluate(e => e.scrollLeft > 0), 'Scrollable hourly list');
  fail = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#overlay [data-el=status]')?.textContent.includes('Stale'));
  check(await page.locator('[data-el=tempValue]').innerText() === '50', 'Failed refresh retains last reading');
  await page.getByLabel('Choose a city').selectOption('Tokyo');
  await page.waitForFunction(() => document.querySelector('#overlay [data-el=status]')?.textContent.includes('unavailable'));
  check(await page.locator('[data-el=tempValue]').innerText() === '—', 'New city cannot display old city reading');
  check(await page.getByLabel('Choose a city').inputValue() === 'Tokyo', 'Failed city remains selected with unavailable weather');
  check(await page.locator('[data-el=place]').innerText() === 'Tokyo', 'Failed city label');
  fail = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#overlay [data-el=status]')?.textContent.includes('Open-Meteo · Updated'));
  check(await page.locator('[data-el=place]').innerText() === 'Tokyo', 'Retry recovers selected city');
  check((await page.locator('#overlay [data-el=status]').innerText()).includes('Asia/Tokyo'), 'Successful city changes timezone');
  check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'No page overflow');
  await page.evaluate(async () => {
    const { createOverlay } = await import('/src/app/overlay.js');
    const root = document.createElement('div');
    const overlay = createOverlay(root);
    const weather = { ...window.__bw.live, location: { lat: 59.3293, lng: 18.0686 } };
    overlay.loading(weather.location);
    overlay.render({ weather, source: 'open-meteo', updatedAt: Date.now() });
    if (root.querySelector('[data-el=city]').value !== '') throw Error('Device coordinates must not imply a preset');
    if (!root.querySelector('[data-el=status]').textContent.includes('UTC')) throw Error('Unknown timezone must label UTC');
  });
  await page.unroute('https://api.open-meteo.com/**');
  return 'Passed: loading, denied geolocation, 24 hours, precipitation, Fahrenheit, horizontal scroll, stale cache, city isolation, retry, overflow';
}
