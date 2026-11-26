'use strict';
// Minimal PNG reader (8-bit RGB/RGBA, non-interlaced) + image statistics.
// Used by the verification tooling so nothing outside Node is required.
const fs = require('fs'), zlib = require('zlib');
function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png: ' + file);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9];
      if (data[12] !== 0) throw new Error('interlaced png unsupported');
      if (bd !== 8) throw new Error('only 8-bit png supported, got ' + bd);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (!ch) throw new Error('colour type ' + ct + ' unsupported');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    const line = raw.slice(q, q + stride); q += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
// mean/max luma, banding metric (largest single-step luminance plateau difference
// along the vertical axis) and colour spread - enough to flag washed-out frames.
function stats(file) {
  const im = decode(file), d = im.data, ch = im.ch;
  let sum = 0, mx = 0, n = 0, sr = 0, sg = 0, sb = 0;
  const hist = new Array(64).fill(0);
  const cols = new Float64Array(im.w);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const o = (y * im.w + x) * ch;
    const r = d[o], g = d[o + 1], b = d[o + 2];
    const l = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    sum += l; if (l > mx) mx = l; n++;
    sr += r; sg += g; sb += b;
    hist[Math.min(63, (l * 64) | 0)]++;
    cols[x] += l;
  }
  // banding: strongest luminance jump between adjacent columns (vertical stripes)
  let band = 0, bandX = 0;
  for (let x = 1; x < im.w; x++) {
    const a = cols[x - 1] / im.h, b2 = cols[x] / im.h;
    const dl = Math.abs(a - b2);
    if (dl > band) { band = dl; bandX = x; }
  }
  // posterisation proxy: fraction of the darkest buckets + largest empty gap
  const dark = (hist[0] + hist[1] + hist[2]) / n;
  const bright = hist.slice(58).reduce((a, b2) => a + b2, 0) / n;
  return { file: file.replace(/\\/g, '/').split('/').pop(), w: im.w, h: im.h,
    mean: +(sum / n).toFixed(4), max: +mx.toFixed(3),
    meanRGB: [sr / n / 255, sg / n / 255, sb / n / 255].map(v => +v.toFixed(3)),
    darkPct: +(dark * 100).toFixed(2), clipPct: +(bright * 100).toFixed(2),
    stripe: +(band * 1000).toFixed(2) };
}
module.exports = { decode, stats };
if (require.main === module) for (const f of process.argv.slice(2)) console.log(JSON.stringify(stats(f)));
