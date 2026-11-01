# Beautiful Weather — independent acceptance, 2026-10-31

Tested revision: `9e850b7` (HEAD, branch `ui/dev-toggle-and-temp-units`), which matches the expected commit. Untracked files from earlier work were left untouched: WILDLIFE-VISIBILITY.md, tests/bird-gust-*, user-files/. No code was changed and nothing was committed.

Browser: Playwright headless Chromium 154.0.8037.0 (Docker). Desktop 1440×900 DPR 1. Mobile **emulation**: 390×844, DPR 3, isMobile, hasTouch, iPhone iOS 17 UA. No physical device was available.

## Results
| Area | Result |
|---|---|
| Revision | PASS (9e850b7) |
| Next-24-hour forecast (live Open-Meteo plus fixtures) | PASS: 24 hourly rows, horizontal scroll, labelled UTC |
| Feels-like | PASS: −1.6 → "−2°C"; null → "—" |
| Precipitation timing (fixture: rain in the 12:00 UTC slot) | PASS: "hour 11:00–12:00"; nulls → "timing unavailable for part…" |
| City/unit controls | PASS: New York → °F, Stockholm → °C; a manual unit choice persists; hourly rows convert |
| Loading / unavailable / stale / retry | PASS: "—" while loading; unavailable on first-load failure; stale is kept on refresh failure; data over 2 h old is marked stale; Refresh recovers; no stale data carried across cities |
| Desktop / mobile layout | PASS (emulated): forecast collapsed on phone, no page overflow |
| Wildlife continuity and daytime | PASS: birds in daytime (sun 6.5–8.5°); flock size stayed constant through gusts; 34,281 rAF samples, never hidden |
| Natural gust overlapping a minute update | **NOT OBSERVED** (see below) |
| Halloween at night 31 Oct, desktop and mobile | PASS (fixture) |
| Absent on 1 Nov, desktop and mobile | PASS (fixture) |
| Easter 26/27/28/29 Mar 2027 present; 25 and 30 Mar absent (also 29 Mar 23:30 and 30 Mar 00:30, across DST) | PASS (fixture) |
| Seasonal wildlife | PASS: autumn/spring leaves and birds present in every fixture |
| Phone-reachable preview | PARTIAL: :32768 is localhost-only; a LAN Vite on 192.168.1.96:5188 served the Docker VM, but the macOS firewall is on and no phone was tried |
| Physical device | **NOT TESTED**: no iPhone/Android over USB, no adb, no Xcode device list |

Date fixtures: Playwright `clock.setFixedTime`, timezone Europe/Stockholm, `?source=mock` (labelled "Sample data"). Files are named `FIXTURE-*`.

## Gust observation (live, unpinned, desktop)
Start 07:26:48.6 UTC, 610 s. Minute ticks at 53.3 s, then every 60.0 s (…593.3 s). Ten-minute refresh at 593.6 s.
Gusts (4.0 s each, flock unchanged):
- 143.48–147.52 s (07:29:12)
- 300.92–304.93 s (07:31:49): 7.6 s after the tick
- 556.74–560.75 s (07:36:05)

None overlapped a tick.

## Issues
- Low: the sun elevation saw-tooths. Each 10-minute refresh recomputes elevation from the provider's `observedAt` (up to 15 min old) rather than from now, and the next minute tick jumps it forward again. Observed: 6.54→7.71 at the first tick, and 8.50→7.91 at the refresh (`app.js` refresh vs `tickSun`).
- Low: the City select reads "Choose…" while Stockholm (the fallback) is shown.
- Low: the status line uses "07:26 AM UTC" while the hour rows use 24-hour "08:00". All times are UTC, which is less readable for a CET user (this is documented).
- Cosmetic: the overlay covers the moon and sun on desktop night and on mobile.
- Cosmetic: favicon 404s.
