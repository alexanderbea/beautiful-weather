# Live solar wildlife lifecycle verification

2026-10-27. Starting revision: `9cf8e20f8468efbc26141d857868fe51cc7eff4a`, clean tree.

## Cause and fix

`setWeather` used the palette-retarget flag (including solar elevation changes over
0.05 degrees) to reset all wildlife. Each real minute tick discarded the flock and
restarted the 65–110-second gust wait. The fix separates scene/condition changes
from lighting changes. Solar updates preserve bird, gust, fish and ripple state;
ambient's existing elevation gate fades birds when dusk ends. Style, condition,
scene, landmark, resize and destruction reset paths remain intact. Eclipse and
meteor production code is unchanged.

## Tests

- `node --test tests/*.test.js`: 18/18 pass.
- `npm run build`: pass (43 modules).
- `git diff --check`: pass.
- New `tests/wildlife-solar.test.js` drives the actual engine frame/update/render
  path over four solar minute updates using computed sun positions, deterministic
  random input and stubbed browser drawing APIs. It checks unchanged wildlife at
  refreshes, multiple occupied refreshes, gust start/completion, dusk fade and
  scene cleanup. Restoring the old reset condition makes this test fail.
- New `tests/wildlife-solar-browser.js` watches the actual application's
  `tickSun -> apply -> setWeather` path without clock acceleration. Import it in
  the served page, call `watchSolar()`, then `verify()` after at least three minute
  refreshes and a complete gust. Use a currently dusk location and no elevation
  or time override. `stop()` removes instrumentation.

## Timed live browser evidence

Chromium, 1280x720. Actual UTC clock, lat 25 / lng 40.7 (currently dusk).
URL: `/?source=mock&lat=25&lng=40.7&name=Dusk-QA&skyline=stockholm&condition=clear&style=ghibli`.
Weather numbers are explicitly sample data; solar time is live, not pinned.
Final uninterrupted watch: 14:30:41.076 UTC, 194.287 seconds, PASS.

| Refresh time | Elevation before -> after | Birds | State preserved |
| --- | --- | --- | --- |
| 59.850 s | 1.26738 -> 1.04821 | 0 | yes |
| 119.840 s | 1.04821 -> 0.82900 | 5, on screen | yes |
| 179.850 s | 0.82900 -> 0.60961 | 4, on screen | yes |

All ambient and water state snapshots were identical immediately before/after
all three retargets. Gust: 87.304–91.304 seconds, full four-second completion.
Sampled lead/last bird x gap grows from 25.1 px to 46.1 px, then falls to 22.6 px;
the lead continues moving from x=215.7 to x=295.6. This captures lag and recovery,
not just a timer value. Raw sampled positions and refresh snapshots are in
`tests/wildlife-solar-evidence.json`.

## Interaction and integration checks

- All three styles: actual desktop mouse clicks and emulated phone touchscreen
  taps scatter birds (~2.9–3.0 s remaining immediately after input), regroup to 0
  after 3.2 s. Style switching clears flock state immediately.
- Phone context: 390x844, DPR 2, isMobile and hasTouch. Water tap (100,624)
  produced one fish and one ripple; ten rapid taps remained at one ripple.
  Land (200,800) and sky (200,420) did not trigger fish. Desktop water (400,532)
  reacted; land (640,690) did not. Unit tests additionally cover occluding hills,
  out-of-bounds points, cooldown expiry, maximum three ripples, controls and drags.
- Pause: canvas unchanged during 500 ms desktop / 700 ms phone pause; phone tap
  ignored while paused. Desktop canvas changes after resume.
- Reduced motion: bird positions unchanged across samples; water taps leave fish
  null and ripples empty on both viewports. Phone had a visible five-bird flock.
- Eclipse and meteors smoke-tested in all three styles on both viewports:
  eclipse reaches -18 degrees and zero weather effects, meteor clock advances,
  returning to live restores live elevation and resets meteor time/active state.
- Leaving dusk is covered by the engine regression: elevation -10 fades bird gate
  below .01 and clears bird hit targets. No new wildlife cleanup code was needed.

## Artifacts and limitations

Screenshots: `/out/3e617d56-c275-4e62-8b46-6d409672ada2/` in the browser artifact
store. Useful files: `live-ghibli-before-boundary.png`, `live-ghibli-gust.png`,
`live-ghibli-after-gust.png`, `live-ghibli-minute2-motion.png`,
`live-ghibli-minute3.png`, `desktop-japanese-regroup.png`,
`desktop-vangogh-regroup.png`, `phone-japanese.png`, `phone-vangogh.png`,
`phone-ghibli.png`. Screenshot names mark capture stages; precise gust motion
comes from the timestamped JSON samples. `live-ghibli-minute1.png` is from an
aborted capture and must not be used as passing evidence.

An initial cached browser load still used the old code; cache was cleared and
patched code verified before the successful run. A MediaRecorder attempt crashed
one page; tools remained responsive. No successful video is claimed. Final
uninterrupted evidence uses screenshots and 100 ms state sampling instead.

No physical phone or real background-tab suspension was tested. The three-minute
live watch is Ghibli desktop; the other style/device combinations received the
interaction/smoke checks above, not separate multi-minute gust watches. The prior
QA cosmetic notes (Van Gogh eclipse moon rings and phone meteor/readout placement)
remain outside this focused fix and need independent review. Nothing was pushed
or published.
