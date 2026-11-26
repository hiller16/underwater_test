'use strict';
// Colour metric for the critic loop: mean / p50 / p95 / max chroma (max-min per channel)
// plus mean RGB, to prove a colour is no longer the loudest thing in the frame.
//   node tools/chroma.js shot.png [more.png ...]      (PNG input - shoot.js without --fmt jpeg)
const { decode } = require('./png.js');
for (const file of process.argv.slice(2)) {
  const im = decode(file);
  let s = 0, sCh = 0, mx = 0, r = 0, g = 0, b = 0, n = 0;
  const ch = new Float32Array(im.w * im.h);
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      const o = (y * im.w + x) * im.ch;
      const R = im.data[o] / 255, G = im.data[o + 1] / 255, B = im.data[o + 2] / 255;
      const c = Math.max(R, G, B) - Math.min(R, G, B);
      ch[n++] = c; sCh += c; r += R; g += G; b += B;
      if (c > mx) mx = c;
    }
  }
  Array.prototype.sort.call(ch, (p, q) => p - q);
  const P = p => ch[Math.min(n - 1, Math.round(p * (n - 1)))].toFixed(3);
  console.log(JSON.stringify({ file, chromaMean: +(sCh / n).toFixed(4), p50: +P(.5), p95: +P(.95),
    max: +mx.toFixed(3), rgb: [+(r / n).toFixed(3), +(g / n).toFixed(3), +(b / n).toFixed(3)] }));
}
