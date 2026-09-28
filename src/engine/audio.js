/**
 * Weather-reactive ambient audio, synthesised with the Web Audio API (no audio files, no network).
 *
 * Soundscapes (see soundscapeFor):
 *   rain        pink-noise hiss + low "roof" rumble + sparse bright drop ticks
 *   night-rain  the same, darker and softer (lower cutoff, fewer / duller drops)
 *   day         light wind: band-passed brown noise with slow LFO gusts, level follows windSpeed
 *   night       crickets (stereo chirp field) over a very gentle wind
 *   hush        snow / fog: near-silent muffled air
 *
 * Every soundscape feeds its own fade gain -> master gain -> analyser -> destination. A change of
 * soundscape crossfades (equal-power approximation over FADE_S); a change inside one soundscape (wind
 * speed) just glides that soundscape's level. The AudioContext is only created in enable(), which the
 * caller must invoke from a user gesture (browsers block autoplay); until then setWeather() only
 * remembers the target. Buffers are generated lazily on first use, so there is no page-load cost.
 */
const FADE_S = 1.6;
const MUTE_TAU = 0.08;
const LEVEL_TAU = 0.6;

/** Soundscape key for a (effective) Weather: condition + day/night, as the renderer sees it. */
export function soundscapeFor(w) {
  if (!w) return null;
  const night = w.isDay === false;
  switch (w.condition) {
    case 'rain':
    case 'night-rain':
      return night ? 'night-rain' : 'rain';
    case 'snow':
    case 'fog':
      return 'hush';
    default: // clear, clouds, wind, night
      return night ? 'night' : 'day';
  }
}

// ---------------------------------------------------------------------------
// Buffer synthesis (seeded, so every session sounds the same).

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Folds `fade` extra samples back over the start so the buffer loops without a click. */
function seamless(raw, n, fade) {
  const out = new Float32Array(n);
  out.set(raw.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * t + raw[n + i] * (1 - t);
  }
  return out;
}

function noiseBuffer(ctx, color, seconds, seed) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const fade = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed + ch * 7919);
    const raw = new Float32Array(n + fade);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = r() * 2 - 1;
      if (color === 'pink') { // Paul Kellet's economy pink filter
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        raw[i] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
      } else { // brown (leaky integrator keeps it centred)
        last = (last + 0.02 * white) * 0.998;
        raw[i] = last * 3.2;
      }
    }
    buf.copyToChannel(seamless(raw, n, fade), ch);
  }
  return buf;
}

/** Sparse rain drops: short decaying sine ticks at random times, pitch and pan. */
function dropsBuffer(ctx, { seconds, perSecond, fMin, fMax, seed }) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const r = rng(seed);
  const count = Math.round(seconds * perSecond);
  for (let k = 0; k < count; k++) {
    const start = Math.floor(r() * n);
    const f = fMin + (fMax - fMin) * r() ** 2;
    const amp = 0.08 + 0.3 * r() ** 3;
    const pan = r();
    const decay = 0.004 + 0.01 * r();
    const len = Math.floor(decay * 6 * sr);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const s = Math.sin(2 * Math.PI * f * t * (1 - 0.25 * t / decay / 6)) * Math.exp(-t / decay) * amp;
      const j = (start + i) % n; // wraps, so the loop point is inaudible
      L[j] += s * (1 - pan);
      R[j] += s * pan;
    }
  }
  buf.copyToChannel(L, 0);
  buf.copyToChannel(R, 1);
  return buf;
}

/** Field of crickets: each chirps 3-4 pulses of a ~4.5 kHz tone at its own rate, level and pan. */
function cricketsBuffer(ctx, seconds, seed) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const r = rng(seed);
  for (let c = 0; c < 6; c++) {
    const f = 4000 + r() * 900;
    const amp = 0.05 + 0.12 * r() ** 2;
    const pan = 0.15 + 0.7 * r();
    const period = 0.55 + r() * 0.5;
    const pulses = 3 + Math.floor(r() * 2);
    const pulseLen = 0.012 + r() * 0.006;
    const gap = 0.028 + r() * 0.01;
    // Chirp times: regular with jitter; a cricket occasionally rests for a beat.
    for (let t0 = r() * period; t0 < seconds; t0 += period * (0.9 + r() * 0.2)) {
      if (r() < 0.12) continue;
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.floor((t0 + p * (pulseLen + gap)) * sr);
        const len = Math.floor(pulseLen * sr);
        for (let i = 0; i < len; i++) {
          const env = Math.sin(Math.PI * i / len) ** 2;
          const s = Math.sin(2 * Math.PI * f * i / sr) * env * amp;
          const j = (s0 + i) % n;
          L[j] += s * (1 - pan);
          R[j] += s * pan;
        }
      }
    }
  }
  buf.copyToChannel(L, 0);
  buf.copyToChannel(R, 1);
  return buf;
}

// ---------------------------------------------------------------------------
// Graph helpers. Every started source/oscillator is pushed onto `sources` so a track can stop them all.

function loop(ctx, buffer, dest, { rate = 1, offset = 0 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = rate;
  src.connect(dest);
  src.start(ctx.currentTime, offset % buffer.duration);
  return src;
}

function chain(ctx, ...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
}

function filter(ctx, type, frequency, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function gain(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Slow sine LFO added onto `param` (depth in the param's units). */
function lfo(ctx, param, hz, depth, sources) {
  const osc = ctx.createOscillator();
  osc.frequency.value = hz;
  const d = gain(ctx, depth);
  osc.connect(d).connect(param);
  osc.start();
  sources.push(osc);
}

const windLevel = (w, base, per) => base + per * Math.min(Math.max(w?.windSpeed ?? 3, 0), 20) / 20;

function buildWind(ctx, bank, out, sources, { level, center = 380, dark = false }) {
  const bp = filter(ctx, 'bandpass', center, 0.55);
  const lp = filter(ctx, 'lowpass', dark ? 700 : 1400);
  const g = gain(ctx, level);
  sources.push(loop(ctx, bank('brown'), bp));
  chain(ctx, bp, lp, g, out);
  lfo(ctx, bp.frequency, 0.045, center * 0.4, sources); // the gust "whoosh" moves in pitch...
  lfo(ctx, g.gain, 0.07, level * 0.45, sources); // ...and swells in level
  return g;
}

export function createAmbientAudio({ volume = 0.6 } = {}) {
  let ctx = null;
  let master = null;
  let analyser = null;
  let muted = true;
  let vol = volume;
  let target = null; // last Weather seen
  let suspendTimer = 0;
  const buffers = new Map();
  /** key -> { key, out, sources, level, update, stopTimer } (includes tracks still fading out) */
  const tracks = new Map();
  let currentKey = null;

  function bank(name) {
    if (!buffers.has(name)) {
      const make = {
        pink: () => noiseBuffer(ctx, 'pink', 6, 11),
        brown: () => noiseBuffer(ctx, 'brown', 8, 23),
        drops: () => dropsBuffer(ctx, { seconds: 7, perSecond: 38, fMin: 1800, fMax: 5200, seed: 5 }),
        'drops-night': () => dropsBuffer(ctx, { seconds: 7, perSecond: 18, fMin: 900, fMax: 3000, seed: 9 }),
        crickets: () => cricketsBuffer(ctx, 11, 3),
      }[name];
      buffers.set(name, make());
    }
    return buffers.get(name);
  }

  function build(key, w) {
    const out = gain(ctx, 0);
    out.connect(master);
    const sources = [];
    let levelNode = null;
    let levelFor = () => null;
    if (key === 'rain' || key === 'night-rain') {
      // Pink hiss (high-passed so it reads as rain, not static) + low rumble + drop ticks.
      const night = key === 'night-rain';
      const hp = filter(ctx, 'highpass', 450);
      const hissLp = filter(ctx, 'lowpass', night ? 3200 : 7000);
      const hiss = gain(ctx, night ? 0.26 : 0.42);
      sources.push(loop(ctx, bank('pink'), hp));
      chain(ctx, hp, hissLp, hiss, out);
      lfo(ctx, hiss.gain, 0.09, 0.06, sources);

      const rumbleLp = filter(ctx, 'lowpass', night ? 380 : 600);
      const rumble = gain(ctx, night ? 0.18 : 0.3);
      sources.push(loop(ctx, bank('brown'), rumbleLp, { offset: 3.3 }));
      chain(ctx, rumbleLp, rumble, out);

      const dropsLp = filter(ctx, 'lowpass', night ? 2600 : 9000);
      const drops = gain(ctx, night ? 0.35 : 0.5);
      sources.push(loop(ctx, bank(night ? 'drops-night' : 'drops'), dropsLp));
      chain(ctx, dropsLp, drops, out);
    } else if (key === 'night') {
      const cr = gain(ctx, 1.4);
      const crHp = filter(ctx, 'highpass', 2500);
      sources.push(loop(ctx, bank('crickets'), crHp));
      chain(ctx, crHp, cr, out);
      lfo(ctx, cr.gain, 0.03, 0.3, sources); // the field breathes a little
      levelFor = (x) => windLevel(x, 0.05, 0.25);
      levelNode = buildWind(ctx, bank, out, sources, { level: levelFor(w), center: 300, dark: true });
    } else if (key === 'hush') {
      levelFor = (x) => windLevel(x, 0.04, 0.12);
      levelNode = buildWind(ctx, bank, out, sources, { level: levelFor(w), center: 260, dark: true });
    } else { // day: light wind, close to silence when calm
      levelFor = (x) => windLevel(x, 0.08, 0.55);
      levelNode = buildWind(ctx, bank, out, sources, { level: levelFor(w), center: 420 });
    }
    return {
      key, out, sources, stopTimer: 0,
      update(x) {
        const v = levelFor(x);
        if (levelNode && v !== null) levelNode.gain.setTargetAtTime(v, ctx.currentTime, LEVEL_TAU);
      },
    };
  }

  /** Ramps `param` from its current value to `to` over FADE_S via a -3 dB midpoint (equal-power-ish). */
  function fade(param, to) {
    const now = ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    const mid = to > from ? from + (to - from) * 0.707 : to + (from - to) * 0.707;
    param.linearRampToValueAtTime(mid, now + FADE_S / 2);
    param.linearRampToValueAtTime(to, now + FADE_S);
  }

  function fadeOut(t) {
    fade(t.out.gain, 0);
    clearTimeout(t.stopTimer);
    t.stopTimer = setTimeout(() => {
      for (const s of t.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
      t.out.disconnect();
      tracks.delete(t.key);
    }, (FADE_S + 0.2) * 1000);
  }

  function switchTo(key) {
    if (!ctx) return;
    if (key === currentKey) { tracks.get(key)?.update(target); return; }
    const prev = currentKey && tracks.get(currentKey);
    if (prev) fadeOut(prev);
    currentKey = key;
    if (!key) return;
    let t = tracks.get(key);
    if (t) clearTimeout(t.stopTimer); // coming back before it finished fading: revive it
    else { t = build(key, target); tracks.set(key, t); }
    t.update(target);
    fade(t.out.gain, 1);
  }

  function applyMaster() {
    if (!ctx) return;
    clearTimeout(suspendTimer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : vol * vol, now, MUTE_TAU); // squared: closer to perceived loudness
    if (muted || document.hidden) {
      // Let the fade finish, then stop the audio thread entirely (no CPU while silent).
      suspendTimer = setTimeout(() => { if ((muted || document.hidden) && ctx.state === 'running') ctx.suspend(); }, 400);
    } else if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }
  }

  document.addEventListener('visibilitychange', applyMaster);

  return {
    /**
     * Creates / resumes the AudioContext. Must be called from a user-gesture handler. Returns true
     * when audio is available.
     */
    enable() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = gain(ctx, 0);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        master.connect(analyser).connect(ctx.destination);
        const key = soundscapeFor(target);
        currentKey = null;
        switchTo(key);
      }
      if (ctx.state !== 'running' && !muted) ctx.resume().catch(() => {});
      return true;
    },
    /** Follows the effective weather; crossfades when the soundscape changes. */
    setWeather(w) {
      target = w;
      switchTo(soundscapeFor(w));
    },
    setMuted(m) { muted = !!m; applyMaster(); },
    setVolume(v) { vol = Math.min(1, Math.max(0, +v || 0)); applyMaster(); },
    get muted() { return muted; },
    get volume() { return vol; },
    /** Diagnostics for tests: which soundscape is playing and what is still fading out. */
    get state() {
      return {
        context: ctx ? ctx.state : 'none',
        soundscape: currentKey,
        tracks: [...tracks.keys()],
        muted,
        volume: vol,
        gains: Object.fromEntries([...tracks.values()].map((t) => [t.key, +t.out.gain.value.toFixed(3)])),
      };
    },
    /** RMS of the master output right now (0 when silent / not started). */
    level() {
      if (!analyser) return 0;
      const d = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(d);
      let s = 0;
      for (const x of d) s += x * x;
      return Math.sqrt(s / d.length);
    },
  };
}
