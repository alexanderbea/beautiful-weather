import { rgba } from './color.js';

/** Small, static land ornaments: no particles, input targets, timers or retained scene state. */
export function drawHolidayScenery(ctx, env, ridge) {
  if (!env.holiday) return;
  const art = env.artStyle.params;
  const print = art.keyline.alpha;
  const brush = env.artStyle.id === 'vangogh';
  const size = Math.max(19, Math.min(30, env.width * .025));
  const positions = env.width < 520 ? [.12, .28] : [.14, .21];
  function ellipse(x, y, rx, ry, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
  }
  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  positions.forEach((u, index) => {
    const x = env.width * u + ridge.shift;
    const s = size * (index === 1 ? .8 : 1);
    ctx.save(); ctx.translate(x, ridge.y(x) + 3); ctx.scale(s, s);
    ctx.lineWidth = (brush ? 1.8 : Math.max(1, art.keyline.width)) / s;
    ctx.strokeStyle = rgba(art.keyline.color, Math.max(.35, print));
    ellipse(0, .06, 1.2, .19, 'rgba(0,0,0,.22)');
    if (env.holiday === 'halloween') {
      const glow = ctx.createRadialGradient(0, -.7, .1, 0, -.7, 2.2);
      glow.addColorStop(0, `rgba(255,164,46,${(1 - env.dayMix) * .28})`);
      glow.addColorStop(1, 'rgba(255,164,46,0)');
      ctx.fillStyle = glow; ctx.fillRect(-2.2, -2.9, 4.4, 4.4);
      polygon([[-.12,-1.4],[-.09,-1.8],[.16,-1.87],[.08,-1.38]], '#727642');
      ellipse(-.39, -.69, .62, .71, '#cf692c');
      ellipse(.39, -.69, .62, .71, '#df7b32');
      ellipse(0, -.69, .53, .74, brush ? '#f4a43d' : '#e68a36');
      ctx.strokeStyle = '#904820';
      const fire = '#ffe69a';
      polygon([[-.65,-.88],[-.35,-1.13],[-.19,-.83]], fire);
      polygon([[.19,-.83],[.35,-1.13],[.65,-.88]], fire);
      polygon([[-.54,-.52],[-.22,-.42],[0,-.49],[.22,-.42],[.54,-.52],[.32,-.22],[-.3,-.22]], fire);
    } else if (env.holiday === 'christmas') {
      polygon([[-.14,0],[-.14,-1],[.14,-1],[.14,0]], '#a07953');
      for (let n = 0; n < 3; n++) polygon([[-1+n*.2,-.25-n*.55],[0,-1.5-n*.55],[1-n*.2,-.25-n*.55]], '#477562');
      for (const [x,y] of [[-.5,-.6],[.35,-1],[0,-1.8]]) ellipse(x,y,.09,.09,'#ffe5a1');
    } else if (env.holiday === 'new-year') {
      polygon([[-.65,-.1],[-.65,-1.4],[.65,-1.4],[.65,-.1]], '#d7af60');
      ellipse(0,-1.4,.65,.16,'#ffe4a0');
      ctx.fillStyle = '#fff0ba'; ctx.fillRect(-.4,-1.2,.8,.8);
      ctx.strokeStyle = '#ae8142'; ctx.strokeRect(-.4,-1.2,.8,.8);
    } else if (env.holiday === 'valentine') {
      polygon([[-.05,0],[-.05,-1.2],[.05,-1.2],[.05,0]], '#698457');
      ctx.fillStyle = '#e49a9c'; ctx.beginPath(); ctx.moveTo(0,-.6);
      ctx.bezierCurveTo(-1.5,-1.5,-.4,-2.2,0,-1.55);
      ctx.bezierCurveTo(.4,-2.2,1.5,-1.5,0,-.6); ctx.fill(); ctx.stroke();
    } else if (env.holiday === 'easter') {
      for (const [x,y,c] of [[-.55,-.45,'#e3b97a'],[.45,-.45,'#a5c6b9'],[0,-.65,'#d5a2b8']]) {
        ellipse(x,y,.4,.58,c);
        ctx.strokeStyle = '#fff0c7'; ctx.beginPath(); ctx.moveTo(x-.28,y); ctx.lineTo(x+.28,y); ctx.stroke();
      }
    } else if (env.holiday === 'midsummer') {
      ctx.strokeStyle = '#94b482'; ctx.lineWidth = .16;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-2.7); ctx.moveTo(-1,-2.1); ctx.lineTo(1,-2.1); ctx.stroke();
      for (const x of [-.7,.7]) {
        ctx.beginPath(); ctx.ellipse(x,-1.65,.35,.45,0,0,Math.PI*2); ctx.stroke();
        for (let n=0;n<6;n++) ellipse(x+Math.cos(n*Math.PI/3)*.35,-1.65+Math.sin(n*Math.PI/3)*.45,.09,.09,n%2?'#eee1b6':'#dfb0c6');
      }
    }
    ctx.restore();
  });
}
