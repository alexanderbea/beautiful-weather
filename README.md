# Beautiful Weather

A location-aware weather app whose full-screen background is an animated canvas landscape
reflecting the current weather. Vanilla JS + Canvas 2D; Vite is the only dependency.

## Run

```sh
npm install && npm run dev      # http://localhost:5173
npm run build                   # static bundle in dist/
```

With zero config, the app uses the mock weather source. If geolocation is denied or
unavailable, it falls back to Stockholm.

## Dev overrides

Open `http://localhost:5173/?dev=1`, or press the backquote key (`` ` ``) to show or hide the dev strip.
Its controls:

- **Condition**: `Live` or any of `clear, clouds, rain, snow, wind, fog, night, night-rain`
  (`night` and `night-rain` are clear / rain with night forced on). Overriding the
  condition also swaps in canned temperature and wind for that condition.
- **Time**: `Live` / `Day` / `Night`.
- **Wind**: tick the box to override wind speed (0-25 m/s). This biases rain and snow drift, cloud speed, and hill parallax.
- **Location**: enter `lat, lng` to fetch weather for other coordinates.
- A status line shows fps, the active data source, and which effects are running.

The same overrides work as URL params, which is handy for screenshots:
`?dev=1&condition=rain&time=night&wind=12&lat=40.71&lng=-74.0&name=NYC`.

`condition` and `time` also work without `?dev=1` (the strip stays hidden). To preview the
rainy-night scene, the first night-mode variant, open `http://localhost:5173/?condition=night-rain`.
`?condition=rain&time=night` shows the same scene. For the built bundle, use `npm run preview` and
the same query. Its palette lives in `THEMES.rain.night` (`src/engine/themes.js`), and any rain
reported after dark by a live source uses it automatically.

In the console, `window.__bw.engine` exposes the engine,
e.g. `__bw.engine.setThemes({ rain: { day: { sky: { top: '#223' } } } })` cross-fades to a new palette.

## Weather API key (OpenWeatherMap)

Key lookup order (`src/data/weatherService.js`):

1. `window.__WEATHER_API_KEY` (e.g. injected by a hosting template in `index.html`)
2. `VITE_WEATHER_API_KEY` in `.env.local` (copy `.env.example`; git-ignored)

With no key, the mock source is used. With a key, the app calls the OpenWeather
`/data/2.5/weather` endpoint and normalizes the response. On any HTTP or parse error it falls back to
mock data and shows a small note in the overlay.

## Structure

```
index.html
src/
  main.js                  entry
  styles.css
  app/                     shell: wiring, overlay UI, dev strip, geolocation
    app.js  overlay.js  devControls.js  location.js
  data/                    normalized model + swappable sources
    model.js               Weather shape, CONDITIONS, normalizeWeather()
    weatherService.js      picks source, handles fallback, key lookup
    geocode.js             reverse-geocoding stub (TODO)
    sources/mockSource.js  sources/openWeatherSource.js
  engine/                  canvas renderer
    engine.js              rAF loop, dt, DPR/resize, visibility pause, cross-fades
    scene.js               sky, stars, sun/moon, scrolling hills
    themes.js              data-driven palettes per condition x day/night
    color.js               color parsing + deep interpolation
    effects/               per-effect modules + registry (index.js)
```

A source is any object `{ id, fetchCurrent(location) => Promise<Weather> }`. Pass one via
`createWeatherService({ source })` to swap providers.

## Adding a new condition

1. Add the id to `CONDITIONS` in `src/data/model.js`, and map it in any live source (e.g. `mapCondition`).
2. Add a palette to `THEMES` in `src/engine/themes.js` (`common` / `day` / `night` partials; the
   keys are documented at the top of the file). Any key you omit inherits from `BASE_THEME`.
3. Optionally, write an effect in `src/engine/effects/` exposing `init(env)`, `update(dt, env)`,
   and `drawBack?` (behind the hills) and/or `draw?` (in front). Multiply alpha by `env.weight` so it cross-fades.
4. Register it in `EFFECTS` and list the effects for the condition in `CONDITION_EFFECTS`
   (`src/engine/effects/index.js`). Effects shared between conditions (e.g. `clouds`) persist
   across a switch and only their theme values fade.

## Status / TODO

- v1 conditions: `clear`, `clouds`, `rain`, `snow`. `wind` (streaks), `fog` (haze bands) and
  `night` (clear sky + moon/stars/shooting star) have basic versions only.
  `night-rain` (rain at night: veiled moon, layered night hills, glowing streaks) is fully styled.
- Reverse geocoding is a stub. OpenWeather provides a city name; the mock source shows the fallback
  name or coordinates.
- Day/night is a binary flag; there's no sunrise/sunset gradient or sun arc by time yet.
- No thunderstorm/lightning (currently mapped to rain), and no precipitation intensity.
- White overlay text has low contrast on the pale snow-day sky.
