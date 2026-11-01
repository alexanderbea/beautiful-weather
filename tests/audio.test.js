import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLevels, mixLevels, soundscapeFor, createAmbientAudio, BANK } from '../src/engine/audio.js';
import { sanitizePrefs, readPrefs, writePrefs, DEFAULT_PREFS, STORAGE_KEY } from '../src/app/audioPrefs.js';

// --- Minimal fake Web Audio + document, enough to exercise the engine's gating logic. ---------------
class Param {
  constructor(v) { this.value = v; this.events = []; }
  cancelScheduledValues() { this.events = []; }
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.events.push(['ramp', v]); this.target = v; }
  setTargetAtTime(v) { this.events.push(['target', v]); this.target = v; }
}
class Node { constructor() { this.connections = []; } connect(n) { this.connections.push(n); return n; } disconnect() {} }
class FakeCtx {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; FakeCtx.last = this; }
  createGain() { const n = new Node(); n.gain = new Param(1); this.__master ??= n; return n; }
  createBiquadFilter() { const n = new Node(); n.frequency = new Param(0); n.Q = new Param(0); return n; }
  createOscillator() { const n = new Node(); n.frequency = new Param(0); n.start = () => {}; n.stop = () => {}; return n; }
  createBufferSource() { const n = new Node(); n.playbackRate = new Param(1); n.start = () => {}; n.stop = () => {}; return n; }
  createDynamicsCompressor() { const n = new Node(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; }
  createAnalyser() { const n = new Node(); n.getFloatTimeDomainData = () => {}; return n; }
  createBuffer(ch, n, sr) { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { duration: n / sr, length: n, sampleRate: sr, data, copyToChannel(a, c) { data[c].set(a); }, getChannelData: c => data[c] }; }
  get destination() { return new Node(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
const listeners = {};
globalThis.document = { hidden: false, addEventListener: (t, f) => { listeners[t] = f; } };
globalThis.window = { AudioContext: FakeCtx };
const setHidden = (h) => { document.hidden = h; listeners.visibilitychange?.(); };

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('auto levels follow the weather: rain only in rain, wind grows with windSpeed', () => {
  assert.equal(autoLevels('day', { windSpeed: 0 }).rain, 0);
  assert.ok(autoLevels('rain', { windSpeed: 0 }).rain > 0.5);
  assert.equal(autoLevels('rain', { windSpeed: 0 }).wind, 0);
  assert.ok(autoLevels('day', { windSpeed: 15 }).wind > autoLevels('day', { windSpeed: 2 }).wind);
  assert.equal(autoLevels('day', { windSpeed: 99 }).wind, 1);
  assert.equal(soundscapeFor({ condition: 'rain', isDay: false }), 'night-rain');
});

test('explicit mixer levels override, null follows the weather, values are clamped', () => {
  const w = { condition: 'clear', windSpeed: 4 };
  assert.deepEqual(mixLevels('day', w, { rain: null, wind: null }), autoLevels('day', w));
  assert.deepEqual(mixLevels('day', w, { rain: 0.5, wind: 0 }), { rain: 0.5, wind: 0 });
  assert.deepEqual(mixLevels('day', w, { rain: 7, wind: -1 }), { rain: 1, wind: 0 });
});

test('prefs: defaults, v1 migration, sanitising, and the on state is never stored', () => {
  assert.deepEqual(sanitizePrefs(null), { ...DEFAULT_PREFS });
  assert.deepEqual(sanitizePrefs({ volume: 0.3, mutedByUser: true }), { volume: 0.3, muted: true, rain: null, wind: null });
  assert.deepEqual(sanitizePrefs({ volume: 'x', muted: 'yes', rain: 2, wind: 'nope' }), { volume: 0.6, muted: false, rain: 1, wind: null });
  const s = memStorage();
  writePrefs({ volume: 0.4, muted: true, rain: 0.25, wind: null, on: true }, s);
  const saved = JSON.parse(s.getItem(STORAGE_KEY));
  assert.equal('on' in saved, false);
  assert.deepEqual(readPrefs(s), { volume: 0.4, muted: true, rain: 0.25, wind: null });
  assert.deepEqual(readPrefs(memStorage({ [STORAGE_KEY]: '{bad json' })), { ...DEFAULT_PREFS });
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readPrefs(throwing), { ...DEFAULT_PREFS });
  writePrefs({ volume: 1 }, throwing); // must not throw
});

test('engine: restoring prefs and setting weather creates no AudioContext; only setOn(true) does', () => {
  FakeCtx.last = null;
  const a = createAmbientAudio();
  a.setVolume(0.8); a.setMuted(true); a.setMix({ rain: 0.5, wind: 0.2 });
  a.setWeather({ condition: 'rain', windSpeed: 8, isDay: true });
  assert.equal(FakeCtx.last, null);
  assert.equal(a.state.context, 'none');
  assert.equal(a.on, false);
  assert.equal(a.setOn(true), true);
  assert.ok(FakeCtx.last);
  assert.equal(a.state.soundscape, 'rain');
});

test('engine: master goes silent when off, muted or hidden, and resumes only when allowed', async () => {
  const a = createAmbientAudio({ volume: 0.5 });
  a.setWeather({ condition: 'clear', windSpeed: 5, isDay: true });
  a.setOn(true);
  const ctx = FakeCtx.last;
  const master = () => ctx.__master.gain.target;
  assert.equal(master(), 0.25, 'on: volume squared');
  assert.equal(a.state.on, true);

  setHidden(true);
  assert.equal(master(), 0, 'hidden: glides to silence first');
  assert.equal(ctx.state, 'running', 'not cut mid-sound');
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(ctx.state, 'suspended', 'hidden tab suspends the context');
  setHidden(false);
  assert.equal(ctx.state, 'running', 'visible again + on + unmuted resumes');

  a.setMuted(true);
  setHidden(true); setHidden(false);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(ctx.state, 'suspended', 'muted: becoming visible does not resume');
  assert.equal(master(), 0);
  a.setMuted(false);
  assert.equal(ctx.state, 'running');
  assert.equal(master(), 0.25);

  a.setOn(false);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(ctx.state, 'suspended', 'off: suspended after the fade');
  setHidden(true); setHidden(false);
  assert.equal(ctx.state, 'suspended', 'off: visibility does not resume');
});

test('loop assets: lengths as declared (measure with tests/audio-loops-probe.js)', () => {
  for (const [name, spec] of Object.entries(BANK)) {
    const buf = spec.make(new FakeCtx());
    assert.equal(buf.duration, spec.seconds, name);
  }
});
