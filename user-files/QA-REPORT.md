# Beautiful Weather: independent acceptance run (2026-10-28)

**Build:** existing Vite dev preview `http://localhost:32768` (served `src/` from working tree at HEAD `b50c16b`, which includes wildlife commit `907755b`; only untracked file: `WILDLIFE-VISIBILITY.md`). No source edits, rebuilds, commits, pushes or publishing.
**Browser:** headless Chromium (Playwright, Docker). Desktop 1440×900 DPR1; emulated phone 390×844 DPR2, touch, iPhone UA.
**Physical phone:** not available (no USB iOS or Android device, no `adb`, no Xcode device tools). **Physical-device acceptance: NOT TESTED.** Emulation does not satisfy it.
**Instrumentation:** read-only rAF observers in each page that read `__bw.engine.state`. They make no input (the input counter stayed 0 in every controlled run).

## 1. Wildlife

### A. Live-time continuity (no overrides, no input)
URL `/` with no params. 2026-10-28 12:38:52–12:46:03 UTC (13:38–13:46 CET). Location denied, so Stockholm. Live weather: Cloudy, 13 °C, 2.5 m/s. Style Ghibli, desktop 1440×900. Duration 431.7 s, continuous video `video-live.webm`.

| Solar refresh (page s) | Elevation ° | Bird count before → after |
|---|---|---|
| 60.43 | 13.586 → 12.937 | 7 → 7 |
| 120.43 | → 12.869 | 4 → 4 |
| 180.43 | → 12.801 | 4 → 4 |
| 240.42 | → 12.732 | 0 → 0 (between flocks) |
| 300.42 | → 12.662 | 7 → 7, centroid x 1452 → 1455 → 1458 (smooth, no jump) |
| 360.42 | → 12.592 | 4 → 4 |
| 420.42 | → 12.522 | 7 → 7 |

- Seven minute updates were observed, and birds were present across six of them. Flocks never reset or disappeared at a refresh. They left only by flying off-screen, 36–47 s after they spawned. **PASS**
- First on-screen birds at 7.25 s; first automatic fish at 18.4 s. There were 15 automatic fish in 431 s. **PASS**
- The first live elevation tick moved 0.65° in one step (initial value about 5 minutes stale). The engine glides this, so it causes no visible snap. Info only.
- **Complete against-wind gust and recovery visible on screen: FAIL / not captured.** Three gusts fired, at 105.49, 240.60 and 390.33 s. Each started in the same frame a new flock spawned, so the flock was still off-screen. The lagging bird stayed at x −100…0 (or 1548…1440 when the flock came from the right). The whole 4 s lag and recovery ended before the last bird entered the viewport. In the state data the trajectory does hold back and then recover, but a viewer cannot see it.

### B. Automatic day birds and fish per style (live daytime, `?style=` only)
Fresh contexts with no input. Same live conditions as A (real daytime, sun about 13°). The engine was stopped *after* each fish reached its apex, only to take the stills; the timings were measured before that.

| Style | Viewport | First birds | First auto fish | Recognizable (screenshot) |
|---|---|---|---|---|
| Ghibli | desktop | 5.55 s | 18.69 s | birds ✓ / fish ✓ **PASS** |
| Ghibli | phone | 7.66 s | 19.93 s | ✓ / ✓ **PASS** |
| Japanese | desktop | 7.09 s | 22.59 s | birds weak (small far flock overlapping on a cream cloud) / fish ✓ **PASS with note** |
| Japanese | phone | 10.42 s | 13.53 s | ✓ / ✓ **PASS** |
| Van Gogh | desktop | 10.14 s | 18.61 s | birds ✓ / fish small, low contrast on blue skyline **PASS with note** |
| Van Gogh | phone | 7.70 s | 16.53 s | ✓ / ✓ **PASS** |

Every case gave its first fish in under 60 s. Files: `w-<style>-<desktop|phone>-full.png`, `-fish-zoom.png`, `-birds-zoom.png`, `video-<style>-<viewport>.webm`.
Not tested: night, rain/snow/fog, reduced motion, tap interactions.

## 2. Holidays (browser-only clock override)
Contexts used `timezoneId: Europe/Stockholm` and Playwright `clock.setFixedTime`, with no app changes. Style Ghibli, 1440×900, `?style=ghibli`.

| Local date/time (browser) | `holiday` | Visual | File |
|---|---|---|---|
| Sun 28 Mar 2027 12:00 CEST (control) | easter | eggs on hill | `h-2027-03-28-ghibli.png` |
| Mon 29 Mar 2027 12:00 CEST (control) | easter | eggs | `h-2027-03-29-ghibli.png` |
| **Tue 30 Mar 2027 12:00 CEST** | null | **no Easter props** | `h-2027-03-30-ghibli.png` **PASS** |

Note: weather and sun position came from the live API (today), not from 2027.

## Bugs
- **Medium: the gust is effectively invisible.** If the gust timer expires while no flock is on screen, it fires the moment the next flock spawns off-screen. Repro: load `/`, observe for 7 min. Expected: a visible lag and recovery. Actual: 3 of 3 gusts finished before the birds entered the viewport.
- **Low:** Japanese far flocks on desktop can be tiny and overlapping over pale clouds.
- **Low:** the Van Gogh desktop fish has low contrast against the blue skyline.

Publication remains pending verification and separate approval.
