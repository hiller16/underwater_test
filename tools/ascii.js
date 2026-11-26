'use strict';
// Text preview of a render: downsample to an ASCII luminance map plus a colour strip,
// so composition can be checked without an image channel.
// usage: node tools/ascii.js img.png [cols]
const { decode } = require('./png.js');
const file = process.argv[2];
const COLS = +(process.argv[3] || 78);
const im = decode(file);
const RAMP = ' .:-=+*#%@';
const rows = Math.max(1, Math.round(COLS * (im.h / im.w) * 0.5));
const bw = im.w / COLS, bh = im.h / rows;
let out = '';
for (let r = 0; r < rows; r++) {
  let line = '', cs = '';
  for (let c = 0; c < COLS; c++) {
    let sr = 0, sg = 0, sb = 0, n = 0;
    const x0 = Math.floor(c * bw), x1 = Math.max(x0 + 1, Math.floor((c + 1) * bw));
    const y0 = Math.floor(r * bh), y1 = Math.max(y0 + 1, Math.floor((r + 1) * bh));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * im.w + x) * im.ch;
      sr += im.data[o]; sg += im.data[o + 1]; sb += im.data[o + 2]; n++;
    }
    sr /= n; sg /= n; sb /= n;
    const l = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / 255;
    line += RAMP[Math.min(9, Math.floor(l * 9.999))];
    // one character of hue: R=G=B '.', red-ish 'r', green 'g', blue 'b', magenta 'm', yellow 'y'
    const mx = Math.max(sr, sg, sb), mn = Math.min(sr, sg, sb);
    let ch = '.';
    if (mx - mn > 26) {
      if (sr > sg && sr > sb) ch = (sg > 120) ? 'y' : 'r';
      else if (sg > sr && sg > sb) ch = 'g';
      else ch = (sr > 120) ? 'm' : 'b';
    }
    cs += ch;
  }
  out += line + '|' + cs + '\n';
}
console.log(out);
