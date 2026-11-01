// QA fixture checks for city selection and timezone-aware 24-hour times (commit d4b71d3).
// Run with the Playwright MCP browser_run_code_unsafe tool (paste the function), or import
// and call with a Playwright page. Deterministic Open-Meteo responses and a fixed clock.
export default async function verifyCityTime(page, base = 'http://host.docker.internal:32768/') {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const iso = ms => new Date(ms).toISOString().slice(0, 16);
  const fixtureFrom = start => {
    const time = Array.from({ length: 48 }, (_, i) => iso(start + i * 3600000));
    return { current: { time: iso(start + 15 * 60000), temperature_2m: 6, apparent_temperature: 3, is_day: 0, weather_code: 61, wind_speed_10m: 3 }, hourly: { time, temperature_2m: time.map(() => 6), precipitation: time.map((_, i) => i === 3 ? 0.5 : 0), precipitation_probability: time.map(() => 10) } };
  };
  let fixture;
  let fail = false;
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', r => fail ? r.fulfill({ status: 503, body: 'down' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  await page.addInitScript(() => {
    const coords = localStorage.getItem('qaGeo');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(ok, error) {
      if (coords) { const [latitude, longitude] = JSON.parse(coords); ok({ coords: { latitude, longitude, accuracy: 20 } }); } else error({ code: 1, PERMISSION_DENIED: 1 });
    } } });
  });
  // City and scene controls live in the forecast menu, closed at rest.
  const openMenu = async () => { if (await page.locator('#menu-button').getAttribute('aria-expanded') !== 'true') await page.locator('#menu-button').click(); };
  const text = s => page.locator(`:is(#overlay, #forecast-menu) ${s}`).innerText();
  const rows = () => page.locator('.forecast__hour span:first-child').allInnerTexts();
  const load = async (startIso, geo = null) => {
    const start = Date.parse(startIso);
    fixture = fixtureFrom(start);
    await page.clock.setFixedTime(start + 30 * 60000);
    await page.goto(base);
    await page.evaluate(g => g ? localStorage.setItem('qaGeo', JSON.stringify(g)) : localStorage.removeItem('qaGeo'), geo);
    await page.reload();
    await page.waitForFunction(() => window.__bw?.live);
    await openMenu();
    return start;
  };
  const choose = async city => {
    await page.getByLabel('Choose a city').selectOption(city);
    await page.waitForFunction(c => window.__bw.live?.location.name === c, city);
  };

  // DST end in Stockholm, denied geolocation -> Stockholm fallback selected.
  let start = await load('2026-10-24T22:00Z');
  check(await page.getByLabel('Choose a city').inputValue() === 'Stockholm', 'Fallback selects Stockholm');
  let r = await rows();
  check(r.length === 24, '24 rows');
  check(r[1] === 'Oct 25, 02:00 GMT+2' && r[2] === 'Oct 25, 02:00 GMT+1', `Repeated DST hour: ${r.slice(0, 3)}`);
  check((await text('[data-el=rain]')).includes('02:00 GMT+2–Oct 25, 02:00 GMT+1'), 'Rain window spans DST');
  check(await page.evaluate(s => window.__bw.live.forecast.every((h, i) => h.time === s + i * 3600000), start), 'Instants unchanged');
  await choose('London');
  check((await rows())[2] === 'Oct 25, 01:00 GMT+0', 'London DST end');
  await choose('Tokyo');
  check((await rows()).includes('Oct 26, 00:00 GMT+9'), 'Tokyo crosses midnight with new date');
  check((await text('[data-el=status]')).endsWith('Asia/Tokyo'), 'Tokyo zone label');

  // Failed change to a city never loaded: unavailable, no readings from Tokyo.
  fail = true;
  await page.getByLabel('Choose a city').selectOption('New York');
  await page.waitForFunction(() => /unavailable/.test(document.querySelector('#overlay [data-el=status]').textContent));
  check(await text('[data-el=tempValue]') === '—' && await page.locator('.forecast__hour').count() === 0, 'No stale readings');
  check(await text('[data-el=place]') === 'New York', 'Failed city label');
  fail = false;

  // DST start in Stockholm (last Sunday of March 2027 is the 28th).
  await load('2027-03-27T23:00Z');
  r = await rows();
  check(r[0] === 'Mar 28, 01:00 GMT+1' && r[1] === 'Mar 28, 03:00 GMT+2', `Skipped DST hour: ${r.slice(0, 2)}`);

  // New York DST end and Tokyo New Year.
  await load('2026-11-01T04:00Z');
  await choose('New York');
  r = await rows();
  check(r[0] === 'Nov 1, 01:00 GMT-4' && r[1] === 'Nov 1, 01:00 GMT-5', 'New York DST end');
  await load('2026-12-31T13:00Z');
  await choose('Tokyo');
  check((await rows())[1] === 'Jan 1, 00:00 GMT+9', 'Tokyo New Year');

  // Device coordinates (even exactly Stockholm's) select no preset and are labelled UTC.
  for (const geo of [[59.3293, 18.0686], [57.7089, 11.9746]]) {
    await load('2026-10-24T22:00Z', geo);
    check(await page.getByLabel('Choose a city').inputValue() === '', `No preset for ${geo}`);
    check((await text('[data-el=status]')).endsWith('UTC'), 'UTC fallback label');
  }
  await page.evaluate(() => localStorage.removeItem('qaGeo'));
  await page.unroute('https://api.open-meteo.com/**');
  return 'Passed: fallback, city switching, DST end/start, midnight, failed city, device coordinates, UTC fallback';
}
