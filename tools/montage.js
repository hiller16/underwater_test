'use strict';
// Contact sheet: packs PNG/JPEG shots into one downscaled PNG so several poses can be
// reviewed in a single image. usage: node tools/montage.js out.png [--cols n] [--w px] a b c...
const fs = require('fs'), zlib = require('zlib');
const { decode } = require('./png.js');
const argv = process.argv.slice(2);
const out = argv.shift();
let cols = 3, tw = 480;
for (;;) {
  if (argv[0] === '--cols') { cols = +argv[1]; argv.splice(0, 2); continue; }
  if (argv[0] === '--w') { tw = +argv[1]; argv.splice(0, 2); continue; }
  break;
}
const items = argv.map(f => decode(f));
const th = Math.round(tw * 9 / 16);
const rows = Math.ceil(items.length / cols);
const W = cols * tw, H = rows * th;
const rgb = Buffer.alloc(W * H * 3, 8);
items.forEach((im, k) => {
  const ox = (k % cols) * tw, oy = ((k / cols) | 0) * th;
  for (let y = 0; y < th; y++) {
    const sy = Math.min(im.h - 1, (y * im.h / th) | 0);
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(im.w - 1, (x * im.w / tw) | 0);
      const so = (sy * im.w + sx) * im.ch, doff = ((oy + y) * W + ox + x) * 3;
      rgb[doff] = im.data[so]; rgb[doff + 1] = im.data[so + 1]; rgb[doff + 2] = im.data[so + 2];
    }
  }
});
const raw = Buffer.alloc(H * (1 + W * 3));
let p = 0;
for (let y = 0; y < H; y++) {
  raw[p++] = 0;
  rgb.copy(raw, p, y * W * 3, (y + 1) * W * 3);
  p += W * 3;
}
let TAB = null;
function crc32(buf) {
  if (!TAB) { TAB = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); TAB[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log(JSON.stringify({ out, size: [W, H], tiles: items.length, bytes: png.length }));
