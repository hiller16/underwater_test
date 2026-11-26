'use strict';
// Quick page inspector: runs --eval / --shot arguments in the order they appear.
//   node tools/dbg.js [--param hide=kelp] [--eval "expr"] [--shot out.png] ...
// PAGE / VW / VH / FLAGS environment variables control the page and viewport.
const path = require('path');
const { launch, sleep } = require('./cdp.js');
const ROOT = path.resolve(__dirname, '..');
const file = process.env.PAGE ? path.resolve(process.env.PAGE) : path.join(ROOT, 'index.html');
const args = process.argv.slice(2);
const DEFAULTS = [
  'JSON.stringify(ERRORS)',
  'JSON.stringify({ready:R.ready,w:R.w,h:R.h,frame:R.frame,passes:R.passes.length})',
  'JSON.stringify({x:+cam.x.toFixed(1),y:+cam.y.toFixed(1),z:+cam.z.toFixed(1),yaw:+cam.yaw.toFixed(2),pitch:+cam.pitch.toFixed(2),bed:+bedHeight(cam.x,cam.z).toFixed(1)})',
  'JSON.stringify(__scene.getStats())',
];
async function show(e) {
  let v;
  try { v = await b.eval(e); } catch (err) { v = 'ERR ' + err.message; }
  console.log('EVAL ' + e + '\n  => ' + (typeof v === 'string' ? v : JSON.stringify(v)));
}
let b;
(async () => {
  b = await launch({ width: +(process.env.VW || 1280), height: +(process.env.VH || 720),
                     flags: (process.env.FLAGS || '').split(' ').filter(Boolean) });
  try {
    const param = args.includes('--param') ? '&' + args[args.indexOf('--param') + 1] : '';
    await b.open(file + '?noinfo=1&dbg=1' + param, 2200);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--eval') await show(args[i + 1]);
      else if (args[i] === '--shot') { await sleep(500); await b.screenshot(args[i + 1]); console.log('shot ' + args[i + 1]); }
    }
    for (const e of DEFAULTS) await show(e);
    console.log('errors: ' + JSON.stringify(b.errors, null, 1));
  } finally { await b.close(); }
})();

