// Three staggered streaks per eight seconds; no timers, emitters or retained particles.
export const METEOR_PERIOD = 8;
const STARTS = [.25, 2.65, 5.35];
const LIFE = 1.65;
export function meteorTracks(time, reducedMotion = false) {
  const cycle = Math.floor(time / METEOR_PERIOD);
  return STARTS.map((start, i) => {
    const age = time % METEOR_PERIOD - start;
    const phase = reducedMotion ? .5 : age / LIFE;
    const alpha = reducedMotion ? .16 : phase > 0 && phase < 1 ? Math.sin(Math.PI * phase) ** 2 : 0;
    const fireball = !reducedMotion && i === 1 && cycle % 3 === 2;
    // A 600ms smooth lift once per 24 seconds, wholly inside the fireball's life.
    const pulsePhase = (age - .55) / .6;
    const pulse = fireball && pulsePhase > 0 && pulsePhase < 1 ? Math.sin(Math.PI * pulsePhase) ** 2 : 0;
    return { i, phase, alpha, fireball, pulse };
  });
}

export function createMeteors() {
  let time = 0;
  let active = false;
  let style;
  return {
    reset() { time = 0; active = false; style = undefined; },
    update(dt, env) {
      active = env.scene === 'meteors';
      if (!active) { time = 0; style = undefined; return; }
      if (style !== env.artStyle?.id) time = 0;
      style = env.artStyle?.id;
      if (!env.reducedMotion) time += dt;
    },
    drawSky(ctx, env) {
      if (!active) return;
      const { width: w, height: h } = env;
      const glow = env.artStyle.params.celestial.glow;
      ctx.save();
      ctx.lineCap = 'round';
      for (const { i, phase, alpha, fireball } of meteorTracks(time, env.reducedMotion)) {
        if (alpha < .001) continue;
        const x = w * (.32 + i * .21) + phase * Math.min(w, h) * .17;
        const y = h * (.18 + (i % 2) * .17) + phase * Math.min(w, h) * .085;
        const dx = Math.min(w, h) * (fireball ? .23 : .16), dy = dx * .5;
        const trail = ctx.createLinearGradient(x-dx, y-dy, x, y);
        trail.addColorStop(0, 'rgba(255,244,220,0)');
        trail.addColorStop(.75, `rgba(255,244,220,${alpha * .6})`);
        trail.addColorStop(1, `rgba(255,234,195,${alpha})`);
        ctx.fillStyle = trail;
        // Taper the silhouette as well as its opacity toward the tail.
        const radius = fireball ? 1.4 : .9;
        ctx.beginPath(); ctx.moveTo(x-dx, y-dy);
        ctx.lineTo(x-.45*radius, y+.9*radius);
        ctx.lineTo(x+.45*radius, y-.9*radius); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = trail;
        ctx.globalAlpha = .12 * glow;
        ctx.lineWidth = fireball ? 5 : 3;
        ctx.beginPath(); ctx.moveTo(x-dx,y-dy); ctx.lineTo(x,y); ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff0d5'; ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    drawGround(ctx, env) {
      if (!active || env.reducedMotion) return;
      const alpha = meteorTracks(time).reduce((max, track) => Math.max(max, track.pulse), 0) * .035;
      if (alpha === 0) return;
      const { width: w, height: h } = env;
      ctx.save();
      const light = ctx.createRadialGradient(w*.65,h,0,w*.65,h,w*.6);
      light.addColorStop(0, `rgba(255,205,151,${alpha})`);
      light.addColorStop(1, 'rgba(255,205,151,0)');
      ctx.fillStyle = light; ctx.fillRect(0,h*.78,w,h*.22); ctx.restore();
    },
    get state() { return { active, time }; },
  };
}
