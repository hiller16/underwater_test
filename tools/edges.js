'use strict';
// Aggregate region statistics for a folder of frames - the tour-quality numbers.
//
//   node tools/edges.js _rev14/tour [label]
//
// Prints one line per frame plus the aggregate the critic loop compares: mean/min edge
// energy (how much structure the eye can lock onto) and the lowest std (flatness of the
// worst frame). Uses the same maths as region.js over the whole frame, no browser.
const fs = require('fs'), path = require('path');
const { decode } = require('./png.js');

const dir = process.argv[2];
const label = process.argv[3] || path.basename(path.resolve(dir));
if (!dir || !fs.existsSync(dir)) { console.log('usage: node tools/edges.js <dir with PNGs> [label]'); process.exit(2); }
const files = fs.readdirSync(dir).filter(f => /\.png$/i.test(f)).sort();
if (!files.length) { console.log('no pngs in ' + dir); process.exit(2); }

const rows = files.map(f => {
  const im = decode(path.join(dir, f));
  let s = 0, s2 = 0, n = 0, e = 0, eN = 0;
  const lum = (x, y) => {
    const o = (y * im.w + x) * im.ch;
    return 0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2];
  };
  for (let y = 0; y < im.h; y++) {
    let prev = lum(0, y);
    for (let x = 0; x < im.w; x++) {
      const l = x === 0 ? prev : lum(x, y);
      s += l; s2 += l * l; n++;
      if (x + 1 < im.w) { e += Math.abs(lum(x + 1, y) - l); eN++; }
      if (y + 1 < im.h) { e += Math.abs(lum(x, y + 1) - l); eN++; }
      prev = l;
    }
  }
  const mean = s / n;
  return { f, edge: e / Math.max(1, eN) * 2, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
});
for (const r of rows) console.log('  ' + r.f + '  edge=' + r.edge.toFixed(4) + '  std=' + r.std.toFixed(4));
const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const min = k => Math.min(...rows.map(r => r[k]));
const worst = rows.slice().sort((a, b) => a.edge - b.edge)[0];
console.log(JSON.stringify({ label, frames: rows.length, edgeAvg: +avg('edge').toFixed(4),
  edgeMin: +min('edge').toFixed(4), edgeMax: +Math.max(...rows.map(r => r.edge)).toFixed(4),
  stdMin: +min('std').toFixed(4), worstFrame: worst.f }));
