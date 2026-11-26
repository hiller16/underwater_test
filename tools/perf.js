'use strict';
// Reads a fly-through frame log (tools/shoot.js output) and prints the frame-time
// report: average, percentiles, the worst frames and a coarse histogram.
// usage: node tools/perf.js _perf/raw [more dirs...]
const fs = require('fs'), path = require('path');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['_perf/raw'];
for (const d of dirs) {
  const lp = path.resolve(d, 'frame-log.json'), sp = path.resolve(d, 'tour-stats.json');
  if (!fs.existsSync(lp)) { console.log(d + ': no frame-log.json'); continue; }
  const log = JSON.parse(fs.readFileSync(lp, 'utf8'));
  const st = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const cpu = log.cpu.slice().sort((a, b) => a - b), gpu = log.gpu.slice().sort((a, b) => a - b);
  const n = cpu.length;
  const P = (c, p) => c[Math.min(c.length - 1, Math.max(0, Math.round(p * (c.length - 1))))];
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const bucket = [0, 5.6, 8, 11.2, 16.7, 22, 28, 34, 45, 90, 1e9];
  const hist = new Array(bucket.length).fill(0);
  for (let i = 0; i < n; i++) {
    for (let b = 1; b < bucket.length; b++) {
      if (cpu[i] < bucket[b]) { hist[b]++; break; }
    }
  }
  const worst = log.cpu.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 6);
  console.log('=== ' + d + '  (' + n + ' frames, ' + st.time + ' s, ' +
    st.size[0] + 'x' + st.size[1] + ', msaa x' + st.msaa + ', mode ' + st.mode + ')');
  console.log(' cpu frame ms : avg ' + avg(cpu).toFixed(2) + '  p50 ' + P(cpu, .5).toFixed(2) +
    '  p90 ' + P(cpu, .9).toFixed(2) + '  p99 ' + P(cpu, .99).toFixed(2) +
    '  p99.9 ' + P(cpu, .999).toFixed(2) + '  max ' + cpu[n - 1].toFixed(2));
  console.log(' fps          : avg ' + (1000 / avg(cpu)).toFixed(1) + '  1% low ' +
    (1000 / P(cpu, .99)).toFixed(1) + '  0.1% low ' + (1000 / cpu[n - 1]).toFixed(1));
  if (gpu[n - 1] > 0) console.log(' gpu submit ms: avg ' + avg(gpu).toFixed(2) + '  p99 ' + P(gpu, .99).toFixed(2) +
    '  p99.9 ' + P(gpu, .999).toFixed(2) + '  max ' + gpu[n - 1].toFixed(2));
  console.log(' frames >= budget: 11.1ms ' + (100 * cpu.filter(v => v > 11.1).length / n).toFixed(2) +
    '%   16.7ms ' + (100 * cpu.filter(v => v > 16.7).length / n).toFixed(2) +
    '%   27.8ms ' + (100 * cpu.filter(v => v > 27.8).length / n).toFixed(2) + '%');
  let line = ' histogram     :';
  for (let b = 1; b < bucket.length; b++) {
    if (!hist[b]) continue;
    const hi = bucket[b] > 900 ? 'inf' : bucket[b] + 'ms';
    line += '  <' + hi + ' ' + (100 * hist[b] / n).toFixed(1) + '%';
  }
  console.log(line);
  console.log(' worst frames  : ' + worst.map(w => w[0].toFixed(1) + '@' + w[1]).join(', '));
  if (st.passMs && Object.keys(st.passMs).length) {
    const pm = st.passMs; let tot = 0;
    for (const k in pm) tot += pm[k];
    console.log(' per-pass gpu  : ' + Object.keys(pm).map(k => k + ' ' + pm[k].toFixed(2)).join('  ') +
      '  | sum ' + tot.toFixed(2));
  }
  console.log(' gpu ts query  : ' + JSON.stringify(log.ts));
  if (st.errors && st.errors.length) console.log(' errors        : ' + JSON.stringify(st.errors));
  console.log('');
}
