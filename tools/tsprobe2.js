'use strict';
// End-to-end proof of per-pass GPU timestamps: writes a timestamp pair around each
// render pass with GPUCommandEncoder.writeTimestamp (the entry point this Chrome
// build exposes), resolves, maps and prints real milliseconds per pass.
const path = require('path');
const { launch } = require('./cdp.js');
const BLANK = 'file:///' + path.resolve(__dirname, 'blank.html').replace(/\\/g, '/');
const EXPR = `(async () => {
  const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  const feats = [...a.features];
  const want = feats.filter(f => f === 'timestamp-query' ||
    f === 'chromium-experimental-timestamp-query-inside-passes');
  const d = await a.requestDevice({ requiredFeatures: want });
  const NP = 3, QN = NP * 2;
  const q = d.createQuerySet({ type: 'timestamp', count: QN });
  const rb = d.createBuffer({ size: QN * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const dst = d.createBuffer({ size: QN * 8, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_READ });
  const tex = d.createTexture({ size: [256, 256], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  const mod = d.createShaderModule({ code: '@fragment fn f() -> @location(0) vec4<f32> { var s: u32 = 0u; for (var i: u32 = 0u; i < 20000u; i++) { s = s + i; } return vec4<f32>(f32(s) * 0.00001, 0.2, 0.5, 1.0); }' });
  const pipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: d.createShaderModule({ code: '@vertex fn v(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> { let p = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i & 2u) * 2 - 1)); return vec4<f32>(p, 0.0, 1.0); } }), entryPoint: 'v' }, fragment: { module: mod, entryPoint: 'f', targets: [{ format: 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
  const enc = d.createCommandEncoder();
  const times = [];
  for (let p = 0; p < NP; p++) {
    if (typeof enc.writeTimestamp === 'function') enc.writeTimestamp(q, p * 2);
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: p / 3, g: 0.2, b: 0.5, a: 1 } }] });
    rp.setPipeline(pipe); rp.draw(3);
    rp.end();
    if (typeof enc.writeTimestamp === 'function') enc.writeTimestamp(q, p * 2 + 1);
  }
  enc.resolveQuerySet(q, 0, QN, rb);
  const e2 = d.createCommandEncoder(); e2.copyBufferToBuffer(rb, 0, dst, 0, QN * 8);
  d.queue.submit([enc.finish(), e2.finish()]);
  await dst.mapAsync(GPUMapMode.READ);
  const v = new BigUint64Array(dst.getMappedRange().slice(0));
  for (let p = 0; p < NP; p++) times.push(+(Number(v[p * 2 + 1] - v[p * 2]) / 1e6).toFixed(3));
  dst.unmap();
  return JSON.stringify({ encWrite: typeof enc.writeTimestamp, required: want,
    insidePassesAdvertised: feats.some(f => f.includes('inside-passes')), passMs: times });
})()`;
(async () => {
  for (const [label, flags] of [['stock', []],
                                ['experimental-web-platform-features', ['--enable-experimental-web-platform-features']]]) {
    const b = await launch({ width: 320, height: 240, flags });
    let out;
    try { await b.open(BLANK, 200); out = await b.eval(EXPR); } catch (e) { out = 'ERR ' + e.message; }
    console.log('=== ' + label + '\n' + out + '\n');
    await b.close();
  }
})();
