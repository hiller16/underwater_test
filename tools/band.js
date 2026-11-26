'use strict';
// Banding / posterisation check: PNGs straight out of shoot.js, no browser.
//
//   node tools/band.js shot.png [y0] [y1]     measure rows y0..y1 (default: top 40 %)
//   node tools/band.js --selftest             prove the metric on synthetic ramps
//
// Banding is the contour line the eye reads inside an area that is supposed to be a
// smooth gradient (haze, sky, blurred foreground). Counting distinct luma values is not
// enough - a bright sky uses few levels because it is bright - and a row-mean profile is
// dominated by geometry crossing the frame. So this looks for the thing itself:
//
//   contour  a boundary between two plateaus. Walking down a column, rows y-4..y-1 all
//            share one 8-bit value A and rows y..y+3 all share B, with |A-B| >= 2, and
//            the 9x9 neighbourhood is otherwise flat (so the step is not a blade edge).
//            Dither breaks plateaus apart, so a dithered ramp has almost none; a
//            posterised ramp is nothing but plateaus.
//   ratio    inside 32-px blocks that are genuinely flat, distinct luma values divided by
//            the block's own 8-bit range. A dithered ramp uses nearly every level in its
//            range (ratio ~1); a posterised one uses a handful (ratio << 1).
//
// Verdict is BANDING when contours are common or the flat blocks waste their range.
const { decode } = require('./png.js');

// ---- measurement on a 0..1 luma source ------------------------------------------
// getLuma(x, y) -> 0..1, plus the row window to walk. Returns the two metrics.
const P = 3;                        // rows of identical value that make a plateau
function analyse(getLuma, x0, x1, y0, y1) {
  const q = (x, y) => Math.round(getLuma(x, y) * 255);
  let contours = 0, maxStep = 0, plateau = 0, samples = 0;
  for (let x = x0; x < x1; x++) {
    for (let y = y0 + P; y < y1 - P; y++) {
      samples++;
      const a = q(x, y - 1), b = q(x, y);
      if (b === a) plateau++;
      const step = Math.abs(b - a);
      if (step < 2) continue;                              // 1 LSB is invisible
      // both sides have to be plateaus, and flat sideways too, or the step is geometry
      let ok = true;
      for (let dx = -4; dx <= 4 && ok; dx++) {
        if (q(x + dx, y - 1) !== a || q(x + dx, y) !== b) ok = false;
      }
      for (let dy = -P; dy <= P - 1 && ok; dy++) {
        if (q(x, y + dy) !== (dy < 0 ? a : b)) ok = false;
      }
      if (!ok) continue;
      contours++;
      if (step > maxStep) maxStep = step;
    }
  }
  return { contours, per10k: +(10000 * contours / Math.max(1, samples)).toFixed(1),
           maxStep, plateauPct: +(100 * plateau / Math.max(1, samples)).toFixed(1) };
}

// ---- distinct levels actually used inside flat 32-px blocks ---------------------
function blockUse(getLuma, x0, x1, y0, y1, maxStd) {
  const BS = 32, out = [];
  for (let by = y0; by + BS <= y1; by += BS) {
    for (let bx = x0; bx + BS <= x1; bx += BS) {
      let s = 0, s2 = 0, n = 0, lo = 255, hi = 0, edge = false;
      const seen = new Set();
      for (let y = by; y < by + BS; y++) {
        for (let x = bx; x < bx + BS; x++) {
          const v = Math.round(getLuma(x, y) * 255), l = v / 255;
          s += l; s2 += l * l; n++; seen.add(v);
          if (v < lo) lo = v; if (v > hi) hi = v;
          if (x > bx && Math.abs(v - Math.round(getLuma(x - 1, y) * 255)) > 5) edge = true;
        }
      }
      const mean = s / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      if (std >= maxStd || edge || hi - lo < 4) continue;   // flat, or too constant to judge
      out.push({ x: bx, y: by, mean: +mean.toFixed(3), levels: seen.size, range: hi - lo,
                 ratio: seen.size / (hi - lo + 1) });
    }
  }
  const avg = out.length ? out.reduce((a, b) => a + b.ratio, 0) / out.length : 0;
  const worst = out.slice().sort((a, b) => a.ratio - b.ratio)[0] || null;
  return { blocks: out.length, ratioAvg: +avg.toFixed(3),
           ratioMin: worst ? +worst.ratio.toFixed(3) : null, worstAt: worst ? [worst.x, worst.y] : null };
}

function verdict(st, bu) {
  if (st.per10k >= 25 || (bu.blocks >= 8 && bu.ratioAvg < 0.55)) return 'BANDING';
  if (st.per10k >= 8 || (bu.blocks >= 8 && bu.ratioAvg < 0.80)) return 'mild';
  return 'clean';
}
function report(name, getLuma, x0, x1, y0, y1, maxStd) {
  const st = analyse(getLuma, x0, x1, y0, y1), bu = blockUse(getLuma, x0, x1, y0, y1, maxStd);
  console.log(JSON.stringify({ file: name, rows: [y0, y1], contours: st.contours,
    contoursPer10k: st.per10k, maxStep: st.maxStep, plateauPct: st.plateauPct,
    ...bu, verdict: verdict(st, bu) }));
}

// ---- selftest: a 256-level ramp, the same ramp posterised to 8 levels, and the
// same ramp with the scene's own 1/255 dither. The metric must separate them.
function selftest() {
  const W = 256, H = 128;
  const mk = fn => { const src = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) src[y * W + x] = fn(x, y);
    return (x, y) => src[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] / 255; };
  const ramp = mk((x, y) => 40 + y * 0.7);                                // smooth, no dither
  const post = mk((x, y) => Math.round((40 + y * 0.7) / 8) * 8);          // 8-level bands
  const dith = mk((x, y) => 40 + y * 0.7 + ((x * 7 + y * 13) % 4) - 1.5); // scene-like dither
  console.log('-- selftest (BANDING expected only for the posterised ramp) --');
  report('ramp        ', ramp, 0, W, 0, H, 0.02);
  report('posterised  ', post, 0, W, 0, H, 0.02);
  report('dithered    ', dith, 0, W, 0, H, 0.02);
}

const args = process.argv.slice(2);
if (!args.length || args[0] === '--selftest') { selftest(); if (!args.length) console.log('usage: node tools/band.js shot.png [y0] [y1]'); process.exit(0); }
const im = decode(args[0]);
const Y0 = args[1] !== undefined ? parseInt(args[1], 10) : 0;
const Y1 = args[2] !== undefined ? parseInt(args[2], 10) : Math.round(im.h * 0.4);
const lum = (x, y) => {
  const o = (Math.min(im.h - 1, y) * im.w + Math.min(im.w - 1, x)) * im.ch;
  return (0.2126 * im.data[o] + 0.7152 * im.data[o + 1] + 0.0722 * im.data[o + 2]) / 255;
};
report(args[0], lum, 0, im.w, Y0, Math.min(Y1, im.h), 0.012);
