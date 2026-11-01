// Data-path regression check, updated for settings replacing the hourly forecast UI.
// Run with Playwright MCP in the same way as settings-browser.js.
export default async function verifyForecast(page) {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const now = new Date().toISOString().slice(0,16);
  const fixture = { timezone: 'Europe/Stockholm', current: { time:now, temperature_2m:10, apparent_temperature:7, is_day:1, weather_code:3, wind_speed_10m:2 }, hourly: {time:[now],temperature_2m:[11],precipitation:[0],precipitation_probability:[0]} };
  let fail = false;
  await page.route('https://api.open-meteo.com/**', route => fail ? route.abort() : route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
  await page.addInitScript(() => Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,error){error({code:1,PERMISSION_DENIED:1});}}}));
  await page.goto('http://host.docker.internal:32768/?verify='+Date.now());
  await page.waitForFunction(()=>!!window.__bw);
  await page.locator('#menu-button').click();
  check(await page.locator('[data-el=name]').innerText() === 'Location is off','Denied location explained');
  check(await page.getByPlaceholder('City name').isVisible(),'Denied location exposes field');
  check((await page.locator('#settings-source').innerText()).includes('Europe/Stockholm'),'Real timezone');
  await page.getByRole('button',{name:'°F',exact:true}).click();
  check(await page.locator('#overlay [data-el=tempValue]').innerText() === '50','Fahrenheit');
  fail = true;
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#settings-source').textContent.includes('Stale'),{},{timeout:5000});
  check(await page.locator('#overlay [data-el=tempValue]').innerText() === '50','Failed refresh retains reading');
  await page.getByPlaceholder('City name').fill('Tokyo');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#settings-source').textContent.includes('unavailable'),{},{timeout:5000});
  check(await page.locator('#overlay [data-el=tempValue]').innerText() === '—','New city cannot retain old reading');
  check(await page.locator('[data-el=name]').innerText() === 'Tokyo','Chosen city remains after failure');
  fixture.timezone = 'Asia/Tokyo'; fail = false;
  await page.getByRole('button',{name:'Update',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#settings-source').textContent.includes('Asia/Tokyo'),{},{timeout:5000});
  check(await page.locator('[data-el=origin]').innerText() === 'Chosen','Typed city origin');
  await page.unroute('https://api.open-meteo.com/**');
  return 'Passed: denied location, existing city entry, units, timezone, stale reading, city isolation, retry';
}
