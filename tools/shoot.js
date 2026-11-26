'use strict';
// Verification capture tool: fixed critic poses + scripted fly-through + perf log.
//
//   node tools/shoot.js [--file index.html] [--size 1920x1080] [--out _critic]
//                       [--poses 0,1,2,3,4,5] [--tour 30] [--tour-frames 24]
//                       [--perf] [--profile] [--flags "--a --b"] [--settle 900]
//
// --perf runs the page in fenced mode (GPU completion measured per frame).
// --profile additionally splits the measurement per render pass.
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp.js');

const a = process.argv.slice(2);
const one = (k, d) => { const i = a.indexOf(k); return i >= 0 && a[i + 1] !== undefined ? a[i + 1] : d; };
const flag = k => a.indexOf(k) >= 0;
const ROOT = path.resolve(__dirname, '..');
const file = path.resolve(one('--file', path.join(ROOT, 'index.html')));
const [W, H] = one('--size', '1920x1080').split('x').map(n => parseInt(n, 10));
const outDir = path.resolve(one('--out', path.join(ROOT, '_critic')));
const poses = one('--poses', '0,1,2,3,4,5').split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
const tourSec = parseFloat(one('--tour', '0'));
const tourFrames = parseInt(one('--tour-frames', '0'), 10);
const settle = parseInt(one('--settle', '900'), 10);
const warm = parseInt(one('--warm', '2500'), 10);
const fmt = one('--fmt', 'png');
const extraFlags = one('--flags', '').split(' ').filter(Boolean);
const extraQ = one('--q', '');
// Total time cap for the run (enforced by cdp.js): fixed overhead plus everything
// asked for, so a legitimate long tour survives but a hung browser gets killed.
// Override with --budget <seconds>.
const budgetSec = parseInt(one('--budget', '0'), 10);
const budgetMs = budgetSec > 0 ? budgetSec * 1000
  : 60000 + (tourSec > 0 ? Math.round(tourSec * 1000) + warm : 0) +
    poses.length * (settle + 12000) + (tourFrames > 0 ? tourFrames * 2500 : 0);
const mode = (flag('--profile') ? '&profile=1' : (flag('--perf') ? '&perf=1' : '')) +
             (extraQ ? '&' + extraQ : '');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const flags = extraFlags.slice();
  if (flag('--nolimit')) flags.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  const b = await launch({ width: W, height: H, flags, budgetMs, budgetLabel: 'shoot.js' });
  const summary = { size: [W, H], shots: [], errors: [], perf: null, tourStats: null };
  try {
    await b.open(file + '?noinfo=1' + mode + (one('--param', '') ? '&' + one('--param', '') : ''), 400);
    await b.waitFor('__scene && __scene.ready', 60000);
    summary.errors = b.errors.slice();
    summary.init = await b.eval('JSON.stringify({msaa:__scene.info.msaa, scale:__scene.info.renderScale, density:__scene.info.density})');
    await b.eval('__scene.hideOverlay(); __scene.hud(' + (flag('--hud') ? 'true' : 'false') + ');');
    const names = await b.eval('JSON.stringify(__scene.poses)');
    summary.poses = JSON.parse(names);
    for (const i of poses) {
      const nm = await b.eval('__scene.setPose(' + i + ')');
      await sleep(settle);
      const f = path.join(outDir, 'pose' + i + '-' + nm + '.' + (fmt === 'jpeg' ? 'jpg' : 'png'));
      await b.screenshot(f, fmt);
      summary.shots.push(path.relative(ROOT, f));
    }
    if (tourSec > 0) {
      await b.eval('__scene.startTour(' + tourSec + ')');
      // warm up first (pipeline compile, instance streaming), then start the log so
      // shader-compile spikes do not end up in the reported percentiles
      await sleep(warm);
      await b.eval('__scene.resetStats()');
      if (tourFrames > 0) {
        const dir = path.join(outDir, 'tour');
        fs.mkdirSync(dir, { recursive: true });
        const gap = (tourSec * 1000) / tourFrames;
        for (let k = 0; k < tourFrames; k++) {
          await sleep(gap);
          const f = path.join(dir, 'f' + String(k).padStart(3, '0') + '.' + (fmt === 'jpeg' ? 'jpg' : 'png'));
          await b.screenshot(f, fmt);
          summary.shots.push(path.relative(ROOT, f));
        }
      } else {
        await sleep(tourSec * 1000);
      }
      summary.tourStats = await b.eval('JSON.stringify(__scene.getStats())');
      fs.writeFileSync(path.join(outDir, 'tour-stats.json'), summary.tourStats);
      const logs = await b.eval('JSON.stringify({cpu:__scene.frameLog(),gpu:__scene.gpuLog(),ts:__scene.tsInfo()})');
      fs.writeFileSync(path.join(outDir, 'frame-log.json'), logs);
      summary.perf = JSON.parse(logs).ts;
    }
    summary.errors = b.errors.slice();
    console.log(JSON.stringify(summary, null, 1));
  } catch (e) {
    summary.fatal = String(e && e.message || e);
    summary.errors = b.errors.slice();
    console.log(JSON.stringify(summary, null, 1));
    process.exitCode = 1;
  } finally {
    await b.close();
  }
})();
