'use strict';
// Pixel difference between two PNG frames - answers "does this layer read on screen?"
//
//   node tools/diff.js full.png without_layer.png [changed_threshold] [--mask=x,y,w,h]
//
// --mask ignores a rectangle (the HUD text lives top-left and its FPS digits change
// between two screenshots, which would otherwise dominate every comparison).
//
// The scene is animated (kelp sway, caustics, drifting snow), so two frames of the same
// configuration already differ. That noise floor has to be measured too: run this once on
// two consecutive frames of the SAME setup, then on the pair that hides the layer. A
// layer only counts as visible when its number clearly sits above the floor.
//
//   meanAbs  average luma difference over the frame, in 8-bit levels
//   p99Abs   99th percentile of the per-pixel difference - ignores sparse animation
//   changed  pixels that moved by more than `changed_threshold` (default 8) and where
//            they are (bbox), which localises the contribution
const { decode } = require('./png.js');

const args = process.argv.slice(2);
const maskArg = (args.find(s => s.startsWith('--mask=')) || '').slice(7);
const MASK = maskArg ? maskArg.split(',').map(n => parseInt(n, 10)) : null;
const pos = args.filter(s => !s.startsWith('--'));
const [fa, fb, thArg] = pos;
if (!fa || !fb) { console.log('usage: node tools/diff.js a.png b.png [changed_threshold] [--mask=x,y,w,h]'); process.exit(2); }
const TH = parseFloat(thArg || '8');
const A = decode(fa), B = decode(fb);
if (A.w !== B.w || A.h !== B.h) { console.log('size mismatch: ' + A.w + 'x' + A.h + ' vs ' + B.w + 'x' + B.h); process.exit(2); }
const lum = (im, i) => 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
const inMask = (x, y) => !!MASK && x >= MASK[0] && x < MASK[0] + MASK[2] && y >= MASK[1] && y < MASK[1] + MASK[3];

const hist = new Float64Array(256);
let s = 0, n = 0, mx = 0, ch = 0, ch2 = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
for (let y = 0; y < A.h; y++) {
  for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * A.ch;
    if (inMask(x, y)) continue;
    const d = Math.abs(lum(A, i) - lum(B, i));
    const q = Math.min(255, Math.round(d));
    hist[q]++; s += d; n++;
    if (d > mx) mx = d;
    if (d > 2) ch2++;
    if (d > TH) {
      ch++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
let acc = 0, p99 = 0;
const target = n * 0.99;
for (let q = 0; q < 256; q++) { acc += hist[q]; if (acc >= target) { p99 = q; break; } }
console.log(JSON.stringify({
  a: fa, b: fb, size: [A.w, A.h], threshold: TH, mask: MASK,
  meanAbs: +(s / n).toFixed(3), p99Abs: p99, maxAbs: Math.round(mx),
  changed: ch, changedPct: +(100 * ch / n).toFixed(2), changed2: ch2,
  bbox: ch ? [x0, y0, x1, y1] : null,
}));
