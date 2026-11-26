'use strict';
// Find near-black blobs in a screenshot: prints their bounding boxes and mean RGB.
// usage: node tools/scan.js file.png [threshold] [minSize]
const { decode } = require('./png.js');
const file = process.argv[2];
const thr = +(process.argv[3] || 18);
const minSize = +(process.argv[4] || 60);
const im = decode(file);
const m = new Uint8Array(im.w * im.h);
for (let i = 0; i < im.w * im.h; i++) {
  const o = i * im.ch;
  if (im.data[o] + im.data[o + 1] + im.data[o + 2] < thr) m[i] = 1;
}
const seen = new Uint8Array(im.w * im.h);
const out = [];
for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
  const i0 = y * im.w + x;
  if (!m[i0] || seen[i0]) continue;
  // flood fill (scanline, iterative)
  const st = [i0]; seen[i0] = 1;
  let n = 0, x0 = x, x1 = x, y0 = y, y1 = y, rs = 0, gs = 0, bs = 0;
  while (st.length) {
    const i = st.pop(); n++;
    const cx = i % im.w, cy = (i / im.w) | 0;
    if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
    const o = i * im.ch; rs += im.data[o]; gs += im.data[o + 1]; bs += im.data[o + 2];
    if (cx > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; st.push(i - 1); }
    if (cx < im.w - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; st.push(i + 1); }
    if (cy > 0 && m[i - im.w] && !seen[i - im.w]) { seen[i - im.w] = 1; st.push(i - im.w); }
    if (cy < im.h - 1 && m[i + im.w] && !seen[i + im.w]) { seen[i + im.w] = 1; st.push(i + im.w); }
  }
  if (n >= minSize) out.push({ x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, n,
    rgb: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] });
}
out.sort((a, b) => b.n - a.n);
console.log(JSON.stringify({ file, size: [im.w, im.h], blobs: out.slice(0, 12), totalBlobs: out.length }));
