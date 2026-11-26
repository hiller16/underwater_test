'use strict';
// Review contact sheet: lays the given renders into a labeled grid and screenshots it
// as a small JPEG, so several poses can be reviewed in one image.
// usage: node tools/sheet.js --out sheet.jpg [--cols 3] [--w 1440] img1 img2 ...
const fs = require('fs'), path = require('path');
const { launch } = require('./cdp.js');
const argv = process.argv.slice(2);
const one = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const out = one('--out', '_view/sheet.jpg');
const cols = +one('--cols', 3);
const W = +one('--w', 1440);
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out'
  && argv[i - 1] !== '--cols' && argv[i - 1] !== '--w');
const tw = Math.floor(W / cols), th = Math.round(tw * 9 / 16);
const rows = Math.ceil(files.length / cols);
const cells = files.map(f => {
  const label = path.basename(f).replace(/\.(png|jpg)$/, '');
  const url = 'file:///' + path.resolve(f).replace(/\\/g, '/');
  return `<div class=c><img src="${url}"><div class=l>${label}</div></div>`;
}).join('');
const html = `<!DOCTYPE html><meta charset="utf-8"><style>
body{margin:0;background:#111;font:12px ui-monospace,Consolas,monospace;color:#cde}
.wrap{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:0}
.c{position:relative;width:${tw}px;height:${th}px;overflow:hidden}
img{width:${tw}px;height:${th}px;object-fit:cover;display:block}
.l{position:absolute;left:0;top:0;background:rgba(0,0,0,.62);padding:1px 5px;color:#ffe6b0}
</style><div class=wrap>${cells}</div>`;
// unique per output: otherwise the browser reuses the cached page of the previous sheet
const tmp = path.join(path.dirname(path.resolve(out)),
                      '.sheet-' + path.basename(out).replace(/[^a-z0-9]/gi, '') + '.html');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(tmp, html);
(async () => {
  const b = await launch({ width: W, height: rows * th });
  try {
    await b.open(tmp, 1800);
    await b.screenshot(out, 'jpeg');
    console.log(JSON.stringify({ out, size: [W, rows * th], tiles: files.length,
                                 bytes: fs.statSync(out).size }));
  } finally { await b.close(); }
})();
