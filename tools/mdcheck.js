'use strict';
// Markdown table sanity for the hand-written docs: every row of a table must carry the
// same number of columns as its header. Unescaped pipes inside cell text are the usual
// cause of a broken row - a table that renders as a wall of text is a doc bug, and this
// catches it without opening a browser.
//
//   node tools/mdcheck.js [file.md ...]     default: the three docs this project ships
// Exit code 1 when any row mismatches, so it can gate a docs change.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const files = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (!files.length) files.push('docs/progress.md', 'docs/reports/perf.md', 'docs/reports/critic.md');
let badTotal = 0;
for (const rel of files) {
  const f = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  const L = fs.readFileSync(f, 'utf8').split('\n');
  let exp = -1, bad = 0, tables = 0;
  L.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '');
    if (!l.trim().startsWith('|')) { exp = -1; return; }
    const n = l.replace(/\\\|/g, '~').split('|').length - 1;
    if (exp < 0) { exp = n; tables++; }
    else if (n !== exp) { bad++; console.log('  ' + rel + ':' + (i + 1) + ' cols ' + n + ' != ' + exp + ' | ' + l.slice(0, 70)); }
  });
  console.log(rel + ': lines=' + L.length + ' tables=' + tables + ' mismatchedRows=' + bad);
  badTotal += bad;
}
if (badTotal) { console.log('FAILED: ' + badTotal + ' mismatched row(s)'); process.exitCode = 1; }
