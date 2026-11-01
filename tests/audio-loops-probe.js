// Measures the looped ambient buffers ("assets"): length, level, and the jump at the loop seam.
// Run: node tests/audio-loops-probe.js  (synthesises every buffer at 48 kHz; nothing is played)
import { BANK } from '../src/engine/audio.js';

const SR = 48000;
const ctx = {
  sampleRate: SR,
  createBuffer(ch, n, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(n));
    return { length: n, sampleRate: sr, duration: n / sr, numberOfChannels: ch, copyToChannel(a, c) { data[c].set(a); }, getChannelData: c => data[c] };
  },
};
const USE = { pink: 'rain hiss', brown: 'wind (all skies) + rain rumble', drops: 'rain drops (day)', 'drops-night': 'rain drops (night)', crickets: 'night crickets' };
const rows = [];
for (const [name, spec] of Object.entries(BANK)) {
  const b = spec.make(ctx);
  let peak = 0, sq = 0, step = 0, seam = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      peak = Math.max(peak, Math.abs(d[i])); sq += d[i] * d[i];
      if (i) step = Math.max(step, Math.abs(d[i] - d[i - 1]));
    }
    seam = Math.max(seam, Math.abs(d[0] - d[d.length - 1]));
  }
  const rms = Math.sqrt(sq / (b.length * b.numberOfChannels));
  rows.push({ buffer: name, used_for: USE[name], seconds: +(b.length / SR).toFixed(3), samples: b.length,
    in_6_to_11s: b.duration >= 6 && b.duration <= 11, peak: +peak.toFixed(3), rms: +rms.toFixed(4),
    seam_jump: +seam.toFixed(4), max_inner_step: +step.toFixed(4) });
}
console.table(rows);
