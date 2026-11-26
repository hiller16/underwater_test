'use strict';
// Region statistics: mean luma, contrast (std), edge energy and clipping inside a box.
// Used to prove a part of the frame (ceiling, floor, distance) is actually structured
// instead of a flat wash.
//   node tools/region.js img.png [x0 y0 x1 y1]   (fractions 0..1, default whole frame)
const { decode } = require('./png.js');
const file = process.argv[2];
const f = process.argv.slice(3).map(parseFloat);
const im = decode(file);
const fx0 = f.length >= 2 ? f[0] : 0, fy0 = f.length >= 2 ? f[1] : 0;
const fx1 = f.length >= 4 ? f[2] : 1, fy1 = f.length >= 4 ? f[3] : 1;
const x0 = Math.floor(fx0 * im.w), x1 = Math.ceil(fx1 * im.w);
const y0 = Math.floor(fy0 * im.h), y1 = Math.ceil(fy1 * im.h);
const lum = (o) => (0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2]) / 255;
let n = 0, s = 0, s2 = 0, clip = 0, dark = 0, e = 0, eN = 0, mx = 0, mn = 1;
for (let y = y0; y < y1; y++) {
  for (let x = x0; x < x1; x++) {
    const o = (y * im.w + x) * im.ch, l = lum(o);
    n++; s += l; s2 += l * l;
    if (l > mx) mx = l; if (l < mn) mn = l;
    if (l > 0.985) clip++;
    if (l < 0.035) dark++;
    if (x + 1 < x1 && y + 1 < y1) {
      e += Math.abs(l - lum((y * im.w + x + 1) * im.ch)) +
          Math.abs(l - lum(((y + 1) * im.w + x) * im.ch));
      eN++;
    }
  }
}
const mean = s / n;
console.log(JSON.stringify({ file, box: [x0, y0, x1, y1],
  mean: +mean.toFixed(4), std: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(4),
  range: +(mx - mn).toFixed(3), edge: +(e / Math.max(1, eN) * 2).toFixed(4),
  clipPct: +(100 * clip / n).toFixed(2), darkPct: +(100 * dark / n).toFixed(2) }));
