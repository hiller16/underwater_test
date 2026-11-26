'use strict';
// npm test - WP9 delivery acceptance for the single-file scene (plan 2.6).
//
//   node tests/verify.js                TAP 13 on stdout, exit 1 if anything fails
//
// What it proves, in the order the plan asks for it: index.html is one
// self-contained file inside the size budget, the page boots with a real WebGPU
// device, the render loop advances, the six critic poses switch the camera, the
// rendered frames contain content instead of a flat fill, and nothing logged an
// error. Driven by tools/cdp.js (headless Edge with the real GPU), so it needs the
// same environment as tools/shoot.js - typically ~35 s.
//
//   VERIFY_SIZE=1280x720  viewport of the run (default 800x500)
//   VERIFY_KEEP=1         keep the frames in _test/ instead of deleting them
// An optional first argument points the harness at another HTML file, which is how the
// negative test proves these assertions can actually fail.
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('../tools/cdp.js');
const { decode } = require('../tools/png.js');

const ROOT = path.resolve(__dirname, '..');
const FILE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, '_test');
const [VW, VH] = (process.env.VERIFY_SIZE || '800x500').split('x').map(n => parseInt(n, 10));
const KEEP = process.env.VERIFY_KEEP === '1';
const SIZE_BUDGET_KIB = 200;     // plan section 4: one HTML file, minified target < 200 KB
const BLANK_POSES = [0, 2, 5];   // forest, ship hull, arch: three different kinds of content

const tests = [];
const add = (name, ok, diag) => { tests.push({ name, ok: !!ok, diag: diag || '' }); };

// ---------- static checks: no browser needed ----------
function staticChecks() {
  const src = fs.readFileSync(FILE, 'utf8');
  const external = [];
  if (/<script[^>]+\bsrc\s*=/i.test(src)) external.push('<script src>');
  if (/<link[\s>]/i.test(src)) external.push('<link>');
  if (/<img|<video|<audio|<iframe/i.test(src)) external.push('media element');
  if (/\bfetch\s*\(/.test(src)) external.push('fetch()');
  if (/XMLHttpRequest/.test(src)) external.push('XMLHttpRequest');
  if (/^\s*(?:import|export)[\s{*]/m.test(src)) external.push('ES module syntax');
  if (/url\(\s*['"]?[^)]/i.test(src)) external.push('css url()');
  add('index.html is self-contained', external.length === 0,
      external.length ? 'found ' + external.join(', ') : 'no src/href/fetch/import/url()');

  const kib = fs.statSync(FILE).size / 1024;
  add('index.html is within the size budget', kib <= SIZE_BUDGET_KIB,
      'raw ' + kib.toFixed(1) + ' KiB of ' + SIZE_BUDGET_KIB + ' KiB');
}

// Mean / spread of a captured frame: a blank canvas has no spread, and a frame that
// is entirely black or entirely white has carried no light through the tonemapper.
function frameStats(file) {
  const im = decode(file);
  let s = 0, s2 = 0, n = 0, mn = 1, mx = 0;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const o = (y * im.w + x) * im.ch;
      const l = (0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2]) / 255;
      s += l; s2 += l * l; n++;
      if (l < mn) mn = l;
      if (l > mx) mx = l;
    }
  }
  const mean = s / n;
  return { w: im.w, h: im.h, mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), min: mn, max: mx };
}

(async () => {
  staticChecks();
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch({ width: VW, height: VH, budgetMs: 150000, budgetLabel: 'tests/verify.js' });
  try {
    await b.open(FILE + '?noinfo=1', 500);
    let boot = '', ready = false, api = null;
    try {
      await b.waitFor('__scene && __scene.ready', 60000);
      ready = true;
      boot = await b.eval('JSON.stringify({msaa:__scene.info.msaa, scale:__scene.info.renderScale, ' +
                          'density:__scene.info.density, frame:__scene.getStats().frame, ' +
                          'gpu:!!document.querySelector("canvas").getContext("webgpu")})');
      api = JSON.parse(boot);
    } catch (e) { boot = e.message; }
    add('__scene.ready with a live WebGPU device', ready && !!api && api.gpu === true, boot);
    if (!ready) throw new Error('page did not boot: ' + boot);

    await b.eval('__scene.hideOverlay(); __scene.hud(false);');

    // The render loop has to actually run, or every later check is meaningless. The very
    // first frames pay for pipeline compilation, so let the loop settle before measuring.
    await sleep(1200);
    const f1 = await b.eval('__scene.getStats().frame');
    await sleep(800);
    const f2 = await b.eval('__scene.getStats().frame');
    add('the render loop advances frames', f2 > f1 + 20, 'frames ' + f1 + ' -> ' + f2 + ' in 800 ms');

    // no network traffic beyond the document itself
    const req = await b.eval('JSON.stringify(performance.getEntriesByType("resource").map(r => r.name))');
    const list = JSON.parse(req);
    add('no external requests at runtime', list.length === 0, list.length ? list.join(', ') : '0 resource entries');

    const names = JSON.parse(await b.eval('JSON.stringify(__scene.poses)'));
    add('six critic poses are exposed', names.length === 6, names.join(', '));
    for (let i = 0; i < names.length; i++) {
      const got = await b.eval('__scene.setPose(' + i + ')');
      await sleep(200);
      const c = JSON.parse(await b.eval('JSON.stringify([__scene.cam.x, __scene.cam.y, __scene.cam.z, ' +
                                        '__scene.POSES[' + i + '].x, __scene.POSES[' + i + '].z])'));
      const d = Math.hypot(c[0] - c[3], c[2] - c[4]);   // cam.xz against the pose viewpoint
      add('pose ' + i + ' (' + names[i] + ') switches the camera',
          got === names[i] && d < 0.01 && Number.isFinite(c[1]),
          'name=' + got + ' offset=' + d.toFixed(3) + ' m, eye y=' + c[1].toFixed(1) +
          ' (bed ' + await b.eval('bedHeight(__scene.cam.x, __scene.cam.z).toFixed(1)') + ')');
    }

    add('no console errors or page exceptions', b.errors.length === 0,
        b.errors.length ? b.errors.join(' | ').slice(0, 300) : '0 errors');
    const gpu = JSON.parse(await b.eval('JSON.stringify(__scene.errors)'));
    add('no GPU errors reported by the page', gpu.length === 0,
        gpu.length ? gpu.join(' | ').slice(0, 300) : '0 errors');

    for (const i of BLANK_POSES) {
      await b.eval('__scene.setPose(' + i + ')');
      await sleep(700);
      const file = path.join(OUT, 'verify-pose' + i + '-' + names[i] + '.png');
      await b.screenshot(file, 'png');
      const st = frameStats(file);
      add('frame at pose ' + i + ' (' + names[i] + ') is not blank',
          st.sd > 0.05 && st.max - st.min > 0.3 && st.mean > 0.03 && st.mean < 0.97,
          path.basename(file) + ' mean=' + st.mean.toFixed(3) + ' sd=' + st.sd.toFixed(3) +
          ' range=' + st.min.toFixed(2) + '..' + st.max.toFixed(2));
    }
  } catch (e) {
    add('verification run completed', false, e.message);
  } finally {
    await b.close();
  }

  console.log('TAP version 13');
  console.log('1..' + tests.length);
  tests.forEach((t, i) => {
    console.log((t.ok ? 'ok ' : 'not ok ') + (i + 1) + ' - ' + t.name);
    if (t.diag) console.log('  # ' + t.diag);
  });
  const failed = tests.filter(t => !t.ok).length;
  console.log('# ' + (tests.length - failed) + '/' + tests.length + ' passed  (' +
              VW + 'x' + VH + ', ' + (failed ? failed + ' FAILED' : 'all green') + ')');
  if (!KEEP) { try { fs.rmSync(OUT, { recursive: true, force: true }); } catch (e) { /* keep it */ } }
  process.exitCode = failed ? 1 : 0;
})().catch(e => {
  console.log('TAP version 13');
  console.log('1..1');
  console.log('not ok 1 - verification harness could not run');
  console.log('  # ' + e.message);
  process.exitCode = 1;
});
