# Paused cached-city canvas regression

Verified 2026-11-01 in Chromium through Playwright against the existing nginx preview,
http://localhost:32768 (browser container: http://host.docker.internal:32768).
Starting branch and revision matched the requested checkout. The only pre-existing
untracked file, `user-files/acceptance-report.md`, was left untouched.

## Cause and repair

`setWeather()` changed target weather and queued a cross-fade, but a manually stopped
RAF loop never painted it. Cache/labels correctly selected New York while the canvas
still showed Tokyo. Manually paused weather updates now use the existing immediate
path: snap the target, update with dt=0, and draw once. No animation restart.
The production change is three lines in `src/engine/engine.js`.

## Reproduction and regression

`cached-city.browser.js` exports an async Playwright check. Use a fresh page/context
for each combination. It intercepts Open-Meteo only, with WMO 73 snow at -3 C for
New York and WMO 63 rain at 16 C for Tokyo. Final New York requests return HTTP 503.
No fixture changes are made to application source or the weather cache.

1. Load New York with pinned daylight, ambient/parallax disabled and skyline off.
2. Capture the actual snow canvas pixels; select Tokyo through the city picker.
3. Allow 2.6 seconds for the normal cross-fade, then call `__bw.engine.stop()`.
4. Fail New York's next request and select New York through the picker.
5. Check labels, stale/error indicators, changed full-canvas pixel hash, and sky
   pixels closer to the snow reference than the rain reference. Check the whole
   canvas remains pixel-identical after 250 ms to establish that it stays paused.
6. Repeat without pausing; repeat both modes starting at Tokyo without a New York cache.
   Uncached cases require unavailable labels, no live reading, a clear target, and
   a visible sky-color difference from Tokyo rain.

Example runner in a Node environment with Playwright and Chromium installed:

```js
import { chromium } from 'playwright';
import check from './tests/cached-city.browser.js';
const browser = await chromium.launch({ headless: true });
try {
  for (const cached of [true, false]) for (const paused of [true, false]) {
    const context = await browser.newContext();
    try {
      console.log(await check(await context.newPage(), {
        baseURL: 'http://localhost:32768', cached, paused,
      }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
```

The supplied browser tools ran the same exported function against the container URL.
Page navigation reset the in-memory cache and routes were removed between runs.
Playwright is not added as a project dependency. Existing checks:
`node --test tests/*.test.js` and `npm run build`.

## Results

| Case | Before repair | After repair |
| --- | --- | --- |
| Cached New York, paused | FAIL: canvas unchanged; snow palette absent | PASS |
| Cached New York, running | Previously verified by independent QA | PASS |
| Uncached New York, paused | Previously verified by independent QA | PASS |
| Uncached New York, running | Previously verified by independent QA | PASS |

Before: rain/after/later pixel hashes all 4077592263. Sky mean RGB stayed
(97.52, 116.20, 143.86), despite New York/Snow/stale labels.
Final repaired paused run: rain hash 2811340661; after/later both 4066677501.
Snow reference RGB (169.07, 195.89, 219.23); actual result (169.12, 195.92, 219.26).
All eight assertions passed in each final case. Random particles mean hashes vary
between runs; comparisons are within a run. All 43 existing Node tests passed;
production build and `git diff --check` passed.

Screenshots in `/out/0163f600-3bb9-4ae2-94a2-c021a11f8f25/`:
`paused-cached-before.png`, `paused-cached-after.png`, `running-cached-after.png`,
`paused-uncached-after.png`, `running-uncached-after.png`.

Console: expected fixture HTTP 503 errors and Canvas2D readback performance warnings.
Initial unmodified preview also reported favicon 404s (left out of scope).
One reload immediately after editing reported `Invalid or unexpected token` and
failed to initialize; a no-cache reload resolved it. All completed repaired cases
had zero page errors. The regression explicitly sends Cache-Control: no-cache.

## Preview identity and handoff

All 47 tracked `src/` and `index.html` files plus the regression script were fetched
from nginx and matched local byte lengths and FNV-1a content checksums: 48 checked,
zero mismatches. Repaired engine: 23440 bytes, FNV-1a 3596022858;
local SHA-256 `561e063b3e98d507a966e17d0c7698478518e9d83757bb090dece2df77f405d4`.
The preview serves these source files directly; no preview process was started or
reconfigured. Browser fixture routes are removed at cleanup.

The repair and regression are ready for one post-session commit. Git writes are
disabled here, so its eventual hash and post-commit status cannot be verified inside
this session. Pre-handoff status: modified `src/engine/engine.js`; new
`tests/cached-city.browser.js` and this report; preserved untracked user acceptance
report. No push, publication, PR, branch operation, or unrelated source change.
