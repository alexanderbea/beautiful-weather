// Run through Playwright MCP: import this module in the page, then pass its default
// function source to browser_run_code_unsafe. Call separately with each viewport.
export default async function verifySettings(page) {
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const metrics = () => page.evaluate(() => ({ scale: visualViewport.scale, width: innerWidth, doc: document.documentElement.scrollWidth,
    canvas: JSON.stringify(document.querySelector('#scene').getBoundingClientRect().toJSON()) }));
  await page.waitForFunction(() => !!window.__bw);
  await page.evaluate(() => window.__bw.menu.close());
  await page.waitForTimeout(350);
  const before = await metrics();
  await page.locator('#menu-button').click();
  await page.waitForTimeout(350);
  check(JSON.stringify(await metrics()) === JSON.stringify(before), 'Opening changed page or canvas scale');
  check(await page.locator('.menu-button').count() === 1, 'One menu button');
  check(await page.locator('#forecast-menu .forecast, #forecast-menu [data-time], #back-to-now, #forecast-menu .dev-toggle').count() === 0, 'Forecast/dev markup absent');
  check(!/Next 24|Choose an hour|Back to now/.test(await page.locator('#forecast-menu').innerText()), 'No forecast copy');
  check(await page.locator('#forecast-menu').evaluate(e => [...e.querySelectorAll('button,input,select')].every(n => parseFloat(getComputedStyle(n).fontSize) >= 16)), 'Controls must prevent iOS focus zoom');
  await page.getByRole('button', {name:'Change',exact:true}).click();
  check(JSON.stringify(await metrics()) === JSON.stringify(before), 'Input focus changed page scale');
  await page.getByRole('button', {name:'Cancel',exact:true}).click();
  const date = page.locator('#overlay [data-el=date]');
  check(await date.evaluate(e => getComputedStyle(e).pointerEvents === 'none' && e.tabIndex === -1 && !e.onclick && !e.onpointerdown && !e.onpointerup), 'Date must be paint without handlers');
  const bounds = await date.boundingBox();
  check(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id === 'scene', {x:bounds.x+4,y:bounds.y+4}), 'Date must hit canvas');
  await page.mouse.click(bounds.x+4,bounds.y+4);
  await page.waitForTimeout(350);
  check(await page.locator('#forecast-menu').getAttribute('data-state') === 'closed', 'Empty sky behind date dismisses');
  const offscreen = () => page.locator('#forecast-menu').evaluate(e => { const r=e.getBoundingClientRect(); return (r.top >= innerHeight-1 || r.left >= innerWidth-1) && e.inert && getComputedStyle(e).visibility === 'hidden'; });
  check(await offscreen(), 'Closed sheet fully off-screen');
  await page.locator('#menu-button').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  check(await offscreen(), 'Escape fully dismisses');
  await page.locator('#menu-button').click();
  await page.locator('#menu-button').click();
  await page.waitForTimeout(350);
  check(await offscreen(), 'Menu toggle fully dismisses');
  check(JSON.stringify(await metrics()) === JSON.stringify(before), 'Closing changed scale');
  check(before.doc === before.width, 'No document overflow');
  return { passed: true, viewport: await page.viewportSize(), metrics: before };
}
