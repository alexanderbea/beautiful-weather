# Beautiful Weather

A location-aware weather app whose full-screen background is an animated canvas landscape
reflecting the current weather. Vanilla JS + Canvas 2D; Vite is the only dependency.

## Run

```sh
npm install && npm run dev      # http://localhost:5173
npm run build                   # static bundle in dist/
```

With zero config, the app shows live weather from the keyless Open-Meteo API; set an
OpenWeather key (below) to use OpenWeather instead. Canned sample data is only shown with
`?source=mock` or when the live request fails, and the overlay says "sample data" whenever it is.
The reading refreshes every 10 minutes while the tab is visible. If geolocation is denied or
unavailable, it falls back to Stockholm.

## Dev overrides

Click the faint sliders button in the top-right corner, open `http://localhost:5173/?dev=1`, or press the
backquote key (`` ` ``) to show or hide the dev strip.
Its controls:

- **Condition**: `Live` or any of `clear, clouds, rain, snow, wind, fog, night, night-rain`
  (`night` and `night-rain` are clear / rain with night forced on). Overriding the
  condition also swaps in canned temperature and wind for that condition.
- **Time**: `Live` / `Day` / `Night`.
- **Wind**: tick the box to override wind speed (0-25 m/s). This biases rain and snow drift, cloud speed, and hill parallax.
- **Location**: enter a city (`Stockholm, London, Paris, New York, Chicago, Los Angeles, Tokyo`) or `lat, lng`.
- A status line shows fps, the active data source, and which effects are running.

The same overrides work as URL params, which is handy for screenshots:
`?dev=1&condition=rain&time=night&wind=12&lat=40.71&lng=-74.0&name=NYC&country=US`.

## Temperature units

The readout shows `°C` or `°F` by the location's country (ISO alpha-2 `country` on the resolved
location: OpenWeather `sys.country`, the dev city table, or `?country=`). Fahrenheit for the US and
its territories, Belize, Liberia, the Bahamas, Cayman Islands, Palau, Micronesia and the Marshall
Islands (`src/app/units.js`); Celsius everywhere else and whenever the country is unknown (e.g. raw
coordinates with the mock source). `?units=c` / `?units=f` pins the unit.

`condition` and `time` also work without `?dev=1` (the strip stays hidden). To preview the
rainy-night scene, the first night-mode variant, open `http://localhost:5173/?condition=night-rain`.
`?condition=rain&time=night` shows the same scene. For the built bundle, use `npm run preview` and
the same query. Its palette lives in `THEMES.rain.night` (`src/engine/themes.js`), and any rain
reported after dark by a live source uses it automatically.

In the console, `window.__bw.engine` exposes the engine,
e.g. `__bw.engine.setThemes({ rain: { day: { sky: { top: '#223' } } } })` cross-fades to a new palette.

## Art styles

The picker in the bottom-right corner switches the scene between three art styles (default `ghibli`); the choice is
remembered (localStorage) and `?style=<id>` pins it. Every style restyles the same scene for every
condition and the whole day -> twilight -> night gradient, and switching cross-fades over ~2 s.

| id | Look |
|---|---|
| `japanese` | Ukiyo-e woodblock print: flat stepped "bokashi" sky bands, sumi-ink keylines on every ridge, roof and cloud, a flat vermilion sun, ruled Hiroshige rain, flat cloud bars and washi paper grain. Motion is crisp and steady: slow even drift, stiff grass, still water. |
| `vangogh` | Post-impressionist: cobalt/ultramarine against chrome yellow, a pre-rendered field of impasto dabs swirling over the sky and following the hills, haloed stars and a ringed moon at night, a radiating sun by day, thick short rain dabs. Motion is turbulent: the brushwork "boils" (three dab fields cross-fade in turn), clouds race, bob and boil, grass and water are restless. |
| `ghibli` | Anime background painting: smooth cerulean-to-cream sky, huge cel-shaded cumulus with bright caps, lush saturated greens with a foliage texture, a warm golden-hour bloom and a big glowing moon at night. Motion is gentle: slow, softly breathing clouds and an easy sway. |

A style (`src/engine/styles/<id>.js`, registered in `src/engine/styles/index.js`) is three things: a
THEMES-shaped palette partial merged over the base palettes, a partial over `STYLE_PARAMS` (numeric
scene parameters the scene and effects read from `env.artStyle.params`: sky bands, keyline, rim/glow
multipliers, cloud shape, rain/snow shape, motion) and optional overlay passes (`drawSkyBase`, `drawSkyTop`,
`drawLand`, `drawPost`) whose textures are pre-rendered once per viewport size. The engine lerps the
palette and the parameters and fades the passes, so nothing snaps. `engine.setStyle(id)` is what the
picker's state calls; `tests/art-styles-probe.js` measures how far each style departs from the first one
per condition and checks the runtime cross-fade.

## Weather API key (OpenWeatherMap)

Key lookup order (`src/data/weatherService.js`):

1. `window.__WEATHER_API_KEY` (e.g. injected by a hosting template in `index.html`)
2. `VITE_WEATHER_API_KEY` in `.env.local` (copy `.env.example`; git-ignored)

With no key, the keyless Open-Meteo `/v1/forecast?current=...` endpoint is used
(`src/data/sources/openMeteoSource.js`). With a key, the app calls the OpenWeather
`/data/2.5/weather` endpoint and uses `main.temp` (the current reading). On any HTTP or parse error it
falls back to mock data and shows a "sample data" note in the overlay. `?source=mock` forces the
canned data for screenshots. `node tests/weather-source-smoke.js` checks the parsers, the source
selection and a real request.

## Structure

```
index.html
src/
  main.js                  entry
  styles.css
  app/                     shell: wiring, overlay UI, dev strip, geolocation, art-style state + picker
    app.js  overlay.js  devControls.js  location.js  artStyle.js  stylePicker.js
  data/                    normalized model + swappable sources
    model.js               Weather shape, CONDITIONS, normalizeWeather()
    weatherService.js      picks source, handles fallback, key lookup
    geocode.js             reverse-geocoding stub (TODO)
    sources/mockSource.js  sources/openWeatherSource.js  sources/openMeteoSource.js
  engine/                  canvas renderer
    engine.js              rAF loop, dt, DPR/resize, visibility pause, cross-fades
    scene.js               sky, stars, sun/moon, scrolling hills
    themes.js              data-driven palettes per condition x day/night
    color.js               color parsing + deep interpolation
    effects/               per-effect modules + registry (index.js)
    styles/                art styles (palette + parameters + overlay passes) + registry (index.js)
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
