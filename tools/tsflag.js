'use strict';
// Which Chrome flag (if any) unlocks pass-level timestamp queries on this build?
const { launch } = require('./cdp.js');
const EXPR = `(async () => {
  const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const names = [...a.features].filter(f => /timestamp/i.test(f));
  const d = await a.requestDevice({ requiredFeatures: names });
  const e = d.createCommandEncoder();
  const rp = e.beginRenderPass({ colorAttachments: [] });
  let pass = typeof rp.writeTimestamp === 'function' ? 'present' : 'absent';
  if (pass === 'present') {
    try { rp.writeTimestamp(d.createQuerySet({ type: 'timestamp', count: 2 }), 0); pass = 'usable'; }
    catch (err) { pass = String(err.message).slice(0, 60); }
  }
  rp.end(); e.finish();
  return JSON.stringify({ feats: names, enc: typeof e.writeTimestamp, pass });
})()`;
const VARIANTS = [
  ['stock', []],
  ['webgpu-developer-features', ['--enable-webgpu-developer-features']],
  ['blink=TimestampQueryInsidePasses', ['--enable-blink-features=TimestampQueryInsidePasses']],
  ['features=TimestampQueryInsidePasses', ['--enable-features=TimestampQueryInsidePasses']],
  ['blink=WebGPUTimestampQueryInsidePasses', ['--enable-blink-features=WebGPUTimestampQueryInsidePasses']],
  ['experimental-webgpu-features', ['--enable-experimental-webgpu-features']],
];
(async () => {
  for (const [label, flags] of VARIANTS) {
    const b = await launch({ width: 320, height: 240, flags });
    let out;
    try {
      await b.open('file:///c:/project_02/index.html?noinfo=1&hide=bg,bed,props,kelp,fish,manta,surf,snow,bub,rays,bloom', 1400);
      out = await b.eval(EXPR);
    } catch (e) { out = 'ERR ' + e.message; }
    console.log(label.padEnd(38) + ' ' + out);
    await b.close();
  }
})();
