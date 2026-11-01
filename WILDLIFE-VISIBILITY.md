# Wildlife visibility verification — 2026-10-27

## Changes and diagnosis

Birds were deliberately twilight-only; the reset repair in `1a153a3` could not make them appear at night or in full daylight. They now fly at every solar elevation and in every weather condition (weather still reduces opacity). Wings have a minimum phone size and stronger ink, with a restrained pale night outline. Counts, pauses, reduced-motion behavior and live solar lifecycle preservation remain intact.

Fish previously occupied approximately 8.5 CSS pixels on a phone, with a 13-pixel jump over 1.15 seconds. The new fish is approximately 26 pixels long on phone, with a fin, tail, eye, contrasting edge, 48-pixel rise and 1.8-second flight. Surface ripples mark departure and return. Water tap cooldown and extra jumps remain.

Automatic placement previously tried twelve random positions and then waited another 18–42 seconds even if all missed water. It now scans the actual water contour for a usable pocket with body clearance, chooses among those sites and retries after one second when none is available. Initial wait remains 10–25 seconds. Water hit testing still uses the same interpolated hills as rendering. The read-only `__bw.engine.waterContains(x,y)` probe permits checking a landing without triggering wildlife.

## Controlled local browser evidence

Chromium, normal scale, fresh contexts, desktop 1440×900 and emulated touchscreen phone 390×844, DPR 1. URL `http://host.docker.internal:32768/?source=mock&condition=clear&time=night` or `time=day`. Default Ghibli style. No interaction before the first automatic jump; real animation time, no accelerated clock. Timing begins immediately after navigation (about 0.1 seconds after page start). A 16ms state observer records on-screen bird centers and new fish. These are onset measurements; continuous video is the motion artifact, not periodic screenshots.

| Condition | First on-screen birds | First automatic fish | Extra input |
| --- | ---: | ---: | --- |
| Desktop night | 9.572s | 11.927s | Initial click and retry rejected; diagnostic run below |
| Desktop day | 11.394s | 13.913s | (528,668.655), fish at 23.910s |
| Phone night | 7.527s | 14.515s | touch (360,633.873), fish at 23.795s |
| Phone day | 9.492s | 16.448s | touch (268,634.340), fish at 23.693s |

The desktop night click at a former automatic location (288,675.5) produced no reaction; the retry (400,666) also failed. Neither counts as successful tap evidence. A separate diagnostic recording includes failed setup clicks/reloads, then a final fresh load: geometry probe confirms (200,670) inside usable water before and after the click, with no fish before and a new fish immediately after (page time 6.365s). In that geometry, (400,680) was outside water. Hills vary by initialization and drift/parallax; stale coordinates are not reliable water targets. No input-handler defect was established.

## Artifacts

All browser files are in `/out/851728aa-fffe-47ca-9b14-5aca3b705cac/`:

- `desktop-night.webm`, `desktop-day.webm`, `phone-night.webm`, `phone-day.webm`: continuous recordings from fresh controlled page loads, covering automatic flight and later input. Night desktop input in this first recording failed as stated above.
- `desktop-night-tap-diagnostic.webm`: separate diagnostic sequence; final reload contains the geometry-confirmed successful click.
- `desktop-night-bird-fish.png`, `desktop-day-bird-fish.png`, `phone-night-bird-fish.png`, `phone-day-bird-fish.png`: full viewport screenshots. Separate runs paused at a natural automatic jump apex for inspection; these show shape/contrast, not timing or motion.
- `desktop-night-scene.png`: earlier scene overview, not jump evidence.

Clear-weather recordings precede the final weather-opacity extension (rain/snow/fog/wind); their clear-weather render and behavior are unchanged. Final unpinned runs below use the final build.

## Tests and limits

`node --test tests/*.test.js`: 20/20 passing. Includes day/night entry within 60 seconds at both widths for all six weather conditions, adverse-random narrow-pocket fish selection, passive input rejection, bounded effects, reduced motion, pause, and the real-engine solar refresh/gust regression. `npm run build` and `git diff --check` pass. Controlled page console: no errors. Initial unpinned page had external weather request errors; that is separate from wildlife rendering.

The browser review is Chromium/Ghibli, not physical devices or all art styles. Rain/snow availability has automated coverage but no separate visual sign-off. Reduced motion intentionally suppresses jumping. A disabled water/landmark scene or wholly occluded water cannot promise a fish. Independent published-site first-visit and tap evidence remains pending. Nothing is pushed or published.

This report stays in the project folder: the requested host session-share directory is outside this session's permitted writable roots. Browser captures are saved in the requested browser artifact folder.

## Final build, unpinned local first visits

Fresh contexts opened `http://host.docker.internal:32768/` without query parameters, interaction or zoom. The app used Stockholm after geolocation denial, displayed Cloudy / 11°C / 6.8 m/s, and reported solar elevation -38.4806°. This is local-preview live-weather/live-time evidence, not the independently published site.

| Viewport | Birds | Automatic fish | Verified extra jump |
| --- | ---: | ---: | --- |
| 1440×900 | 7.551s | 16.498s | click (640,669.5), 53.195s |
| 390×844, touchscreen | 8.370s | 21.189s | tap (40,628.34), 53.157s |

For both extra jumps, `waterContains` was true immediately before and after input; fish was null before and present immediately after. These final runs needed no retry. Full continuous video from load through automatic and extra jumps: `desktop-live-local.webm`, `phone-live-local.webm` in the artifact folder above. No claim of independent published-site tap verification is made.
