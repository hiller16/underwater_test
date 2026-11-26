'use strict';
// Why is a tour frame flat? Boot the scene, walk the same capture times shoot.js
// uses (--tour <sec> --tour-frames 12, warm 2500 ms) and, for every camera position,
// count the kelp that can actually fill the frame:
//   dminAll  closest stalk, any height (small = the lens is against a blade)
//   band10   stalks whose [base, base+h] overlaps the camera height +-10 m, within 10 m
//   cone     stalks at camera height within 45 m AND within +-35 deg of the lens axis
//   coneMin  closest of those - a sparse cone (single-digit count, nearest ~10 m) means
//            the shot is leaves floating in bright water: low edge, the "flat frame"
// Usage: node tools/tourprobe.js [tourSeconds]
const { launch } = require('./cdp.js');

const EXPR = `(function(){
  const tourSec = ${process.argv[2] || 20}, frames = 12, warm = 2.5;
  const fl = FLORA.kelp, d = fl.data, n = fl.n, out = [];
  for (let k = 0; k < frames; k++) {
    const t = warm + (k + 1) * tourSec / frames;
    const u = (t / tourSec) % 1;
    tourSample(u);
    const x = tour.span[0], z = tour.span[2];
    const y = Math.max(tour.span[1], bedHeight(x, z) + 17.0);
    const yaw = tour.yaw + 0.30 * Math.sin(t * 0.21);
    const pitch = Math.max(-1.4, Math.min(1.4, tour.pitch + 0.18 * Math.sin(t * 0.33 + 1.1) - 0.02));
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    let band = 0, cone = 0, dmin = 1e9, coneMin = 1e9, dminAll = 1e9;
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const dx = d[o] - x, dz = d[o + 2] - z;
      const hd = Math.hypot(dx, dz);
      if (hd < dminAll) dminAll = hd;
      const base = d[o + 1], top = base + d[o + 3];
      if (top < y - 10 || base > y + 10) continue;      // no blades at this height
      if (hd < dmin) dmin = hd;
      if (hd < 10) band++;
      if (hd > 45 || hd < 0.5) continue;
      const c = (dx * fx + dz * fz) / hd;                // cos of the angle to the lens axis
      if (c > 0.819) { cone++; if (hd < coneMin) coneMin = hd; }
    }
    out.push({ f: 'f' + String(k).padStart(3, '0'), u: +u.toFixed(3),
               pos: [Math.round(x), Math.round(y), Math.round(z)],
               yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2),
               bed: Math.round(bedHeight(x, z)), surf: Math.round(CFG.surfaceY - y),
               dminAll: +dminAll.toFixed(1), dminBand: dmin > 1e8 ? null : +dmin.toFixed(1),
               band10: band, cone, coneMin: coneMin > 1e8 ? null : +coneMin.toFixed(1) });
  }
  return JSON.stringify(out, null, 0);
})()`;

(async () => {
  const b = await launch({ width: 640, height: 360, budgetLabel: 'tourprobe' });
  try {
    await b.open('index.html?noinfo=1', 400);
    await b.waitFor('__scene && __scene.ready', 60000);
    const rows = JSON.parse(await b.eval(EXPR, 60000));
    for (const r of rows) console.log(JSON.stringify(r));
    console.log('errors=' + JSON.stringify(b.errors));
  } finally {
    await b.close();
  }
})().catch(e => { console.log('ERR ' + e.message); process.exitCode = 1; });
