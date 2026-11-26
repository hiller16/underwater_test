'use strict';
// Crop (and optionally magnify) a PNG region into a new PNG, so a defect can be viewed
// close up without a browser. usage: node tools/crop.js in.png x y w h [scale] out.png
const fs = require('fs'), zlib = require('zlib');
const { decode } = require('./png.js');
const [file, xs, ys, ws, hs, ss, out] = process.argv.slice(2);
const im = decode(file);
let x = +xs, y = +ys, w = +ws, h = +hs, sc = ss ? +ss : 1;
x = Math.max(0, Math.min(im.w - 1, x)); y = Math.max(0, Math.min(im.h - 1, y));
w = Math.min(w, im.w - x); h = Math.min(h, im.h - y);
const W = w * sc, H = h * sc;
const raw = Buffer.alloc(H * (1 + W * 3));
let p = 0;
for (let j = 0; j < H; j++) {
  raw[p++] = 0;                                       // filter: none
  const sy = y + ((j / sc) | 0);
  for (let i = 0; i < W; i++) {
    const sx = x + ((i / sc) | 0);
    const o = (sy * im.w + sx) * im.ch;
    raw[p++] = im.data[o]; raw[p++] = im.data[o + 1]; raw[p++] = im.data[o + 2];
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0, 0);
  return Buffer.concat([len, td, crc]);
}
let TAB = null;
function crc32(buf) {
  if (!TAB) {
    TAB = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TAB[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c ^ -1;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log(JSON.stringify({ out, src: [x, y, w, h], size: [W, H], bytes: png.length }));
