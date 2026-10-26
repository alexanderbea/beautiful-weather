# Eclipse recovery and verification — 2026-10-24

## Initial execution evidence

- `pwd`: `/Users/alexanderbea/dev/private/beautiful-weather`.
- Initial `git status --short`: empty; no saved working-tree changes to move or overwrite.
- Checked-out branch: `ui/dev-toggle-and-temp-units`, initially `518aedc`.
- `git branch -avv`: also showed `main` at `ace172f` and the existing art-style worktree branch at `17268a3`. Neither was checked out or modified.
- `a718c7cb623a5cd7d4ae7bf85f4df9cd9b3d5298` is present and is an ancestor of HEAD (`git merge-base --is-ancestor` exit 0). Its existing eclipse renderer and application wiring were reused. Recovery required no reset, cherry-pick, or branch change.
- Supplied preview opened successfully with Playwright at `http://host.docker.internal:32768`. Initial real-source readout: Stockholm, 9°C (8.5°C raw), Cloudy, 2.4 m/s wind. Geolocation was denied, so the app used its documented Stockholm fallback.
- Earlier claims of 10/10 tests and 19/19 live checks were not accepted as evidence. Initial repository test discovery ran four tests; two concerned unrelated existing meteor behavior. Subsequent tests were filtered to eclipse/manual selection only. No meteor code was changed.

## Defect and fix

**FAIL before / PASS after:** ordinary clear-weather effect clouds could drift over and obscure the eclipse disk, visibly reproduced at 320×568. Clear-weather effects also include sun rays during entry. `src/engine/engine.js` now fades weather-effect layers out for the explicitly selected eclipse, using the existing transition mechanism. Returning to live restores the correct condition effects. Art-style passes, selected location, weather values, and audio weather input remain intact.

The first post-edit check caught cached JavaScript still running the original effects. A full reload loaded the fix; all final captures/checks below use the corrected renderer.

## Final findings

| Check | Result / evidence |
| --- | --- |
| Automated eclipse/manual tests | PASS, 6/6: selection, immutable weather/restoration, all three styles' static drawing operations and balanced canvas save/restore |
| Production build | PASS, `npm run build`, 42 modules |
| Japanese / Van Gogh / Ghibli desktop | PASS at 1280×800: explicit eclipse, -18° target, no weather-effect layers, synchronized picker, live readings retained |
| Selected city | PASS: selected London through the location UI, then retained it across styles/scenes. Final captures use URL-pinned London with actual weather: 8°C, Cloudy, 3.0 m/s wind |
| Mobile | PASS: 390×844 across all three styles; 320×568 Ghibli also checked. Weather text remains inside viewport and readable; screenshot review confirmed visible totality |
| Reduced motion | PASS across all three styles: isolated eclipse pixels match at times 0 and 123; drawing-operation tests also match. No moving occlusion or corona pulse. Camera settles to zero |
| Entry/exit and interruption | PASS: sampled intermediate solar elevations; interrupted entry with style and scene changes; restored live solar elevation, cloud effects, readings, style, and removed eclipse note. Repeated with Ghibli/Japanese and Van Gogh, including reduced motion |
| Existing `styleSwitch()` | NOT AVAILABLE: no repository or page-global implementation. Added a new exported `styleSwitch(id)` in the eclipse browser probe; it is not the previously claimed check |
| Browser errors | Final reload session: zero console errors. Initial root preview logged five icon 404s; no application exception was observed |
| Weather-source smoke | FAIL (environment): parser and mocked-service wiring passed, but the shell live API assertion failed with `ENOTFOUND api.open-meteo.com`. Browser live weather succeeded |

## Reproduce

```sh
node --test --test-name-pattern='eclipse|manual selection' tests/atmosphere.test.js tests/eclipse.test.js
npm run build
npm run dev -- --host 0.0.0.0
```

On the served page, wait for `window.__bw`, then run each browser probe separately:

```js
const qa = await import('/tests/eclipse-browser.js');
await qa.styleSwitch('japanese'); // repeat with vangogh and ghibli
await qa.transitions();
```

Repeat style checks at 390×844 with Playwright reduced-motion emulation. Each probe call takes under ten seconds. `transitions()` ends in live weather; `styleSwitch()` intentionally leaves the chosen eclipse demo visible. Tests compare weather readings but exclude the independently ticking solar elevation. Avoid a scheduled weather refresh during comparisons.

## Screenshot paths

All paths are inside `/out/350cc912-7891-459e-83af-916abbd347c1/` in the browser container:

- `eclipse-japanese-desktop.png` — final
- `eclipse-vangogh-desktop.png` — final
- `eclipse-ghibli-desktop.png` — final
- `eclipse-japanese-mobile-reduced.png` — final
- `eclipse-vangogh-mobile-reduced.png` — final
- `eclipse-ghibli-mobile-reduced.png` — final
- `eclipse-london-mobile-320-fixed.png` — final
- `eclipse-london-mobile-320.png` — original cloud occlusion evidence
- `eclipse-mobile-before.png` — original 390px Stockholm capture

## Limits

Commit was attempted on the original branch but blocked by the filesystem sandbox: `fatal: Unable to create '.git/index.lock': Operation not permitted`. The four changed/new files remain saved and unstaged. The branch and existing commits are unchanged.

This retains the recovered fixed-totality composition; it does not simulate astronomical contact stages. Sky/style transitions still ease under reduced motion; the eclipse disk/corona stay static once style sizing settles. Ambient landscape effects are not claimed to freeze globally. Verification used Chromium, not physical mobile hardware or other browser engines. General engine destruction/listener cleanup was not instrumented; scene exit/effect cleanup was verified. The weather smoke network failure remains unresolved. This report stays in the project because the requested external session-share folder is outside the permitted write roots. Nothing was pushed or published.
