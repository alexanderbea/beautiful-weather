// Five deterministic, staggered tracks: bounded work, no timers or particle allocation.
export function createMeteors() {
  let time = 0;
  let active = false;
  function tracks(env) {
    return Array.from({ length: 5 }, (_, i) => {
      const phase = env.reducedMotion ? .32 + i * .08 : ((time + i * 1.37) % 7) / 3.4;
      return { i, phase, alpha: phase < 1 ? Math.sin(Math.PI * phase) ** 2 : 0 };
    });
  }
  return {
    update(dt, env) {
      active = env.scene === 'meteors';
      if (!active) { time = 0; return; }
      if (!env.reducedMotion) time += dt;
    },
    drawSky(ctx, env) {
      if (!active) return;
      const { width: w, height: h } = env;
      const glow = env.artStyle.params.celestial.glow;
      ctx.save();
      ctx.lineCap = 'round';
      for (const { i, phase, alpha } of tracks(env)) {
        if (alpha < .001) continue;
        const x = w * (.13 + i * .15 + phase * .16);
        const y = h * (.08 + (i % 3) * .07 + phase * .21);
        const dx = Math.min(w, h) * (i === 2 ? .18 : .1), dy = dx * .5;
        const trail = ctx.createLinearGradient(x-dx, y-dy, x, y);
        trail.addColorStop(0, 'rgba(255,183,104,0)');
        trail.addColorStop(.7, `rgba(255,194,128,${alpha * .65})`);
        trail.addColorStop(1, `rgba(255,244,207,${alpha})`);
        ctx.strokeStyle = trail;
        for (const [width, opacity] of [[7, .12 * glow], [3, .25], [1.2, 1]]) {
          ctx.globalAlpha = opacity; ctx.lineWidth = width;
          ctx.beginPath(); ctx.moveTo(x-dx,y-dy); ctx.lineTo(x,y); ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff1cd'; ctx.beginPath(); ctx.arc(x,y,i === 2 ? 2.6 : 1.5,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    },
    drawGround(ctx, env) {
      if (!active || env.reducedMotion) return;
      // A broad, low-opacity wash below the skyline; smooth envelope, no flash or whiteout.
      const fireball = tracks(env)[2];
      const alpha = fireball.alpha * .035;
      const { width: w, height: h } = env;
      ctx.save();
      const light = ctx.createRadialGradient(w*.65,h,0,w*.65,h,w*.6);
      light.addColorStop(0, `rgba(255,189,107,${alpha})`);
      light.addColorStop(1, 'rgba(255,189,107,0)');
      ctx.fillStyle = light; ctx.fillRect(0,h*.78,w,h*.22); ctx.restore();
    },
    get state() { return { active, time }; },
  };
}
