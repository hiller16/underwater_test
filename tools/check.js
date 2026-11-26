'use strict';
// Syntax-check the inline script of a single-file page (and report its size).
// usage: node tools/check.js [index.html]
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const src = fs.readFileSync(file, 'utf8');
const blocks = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, offsetBase = 0;
while ((m = re.exec(src))) {
  if (/\bsrc\s*=/.test(m[1])) continue;
  const startLine = src.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length;
  blocks.push({ code: m[2], startLine });
}
let bad = 0;
blocks.forEach((b, i) => {
  const tmp = path.join(os.tmpdir(), 'uwcheck-' + process.pid + '-' + i + '.js');
  fs.writeFileSync(tmp, b.code);
  try {
    cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log('ok   script#' + i + ' at line ' + b.startLine + ' (' + b.code.length + ' chars)');
  } catch (e) {
    bad++;
    const msg = (e.stderr ? e.stderr.toString() : String(e)).split('\n').slice(0, 6).join('\n');
    console.log('FAIL script#' + i + ' at line ' + b.startLine + '\n' + msg);
  }
  try { fs.unlinkSync(tmp); } catch (e) { /* temp */ }
});
let minLen = 0, gzLen = 0;
try {
  const esbuild = require('esbuild');
  let minJs = '';
  for (const b of blocks) minJs += esbuild.transformSync(b.code, { loader: 'js', minify: true, target: 'es2022' }).code + ';';
  const htmlOnly = src.replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*[\r\n]/gm, '');
  minLen = minJs.length + htmlOnly.length;
  gzLen = require('zlib').gzipSync(minJs + htmlOnly, { level: 9 }).length;
  console.log('size: raw ' + (src.length / 1024).toFixed(1) + ' KiB | minified ' + (minLen / 1024).toFixed(1) +
    ' KiB | gzip ' + (gzLen / 1024).toFixed(1) + ' KiB');
} catch (e) {
  console.log('size: raw ' + (src.length / 1024).toFixed(1) + ' KiB (minifier unavailable: ' + e.message + ')');
}
process.exitCode = bad ? 1 : 0;
