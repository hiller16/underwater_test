'use strict';
// What timestamp APIs does this browser actually expose? (adapter features + prototypes)
const { launch } = require('./cdp.js');
(async () => {
  const b = await launch({ width: 640, height: 360, flags: process.env.FLAGS ? process.env.FLAGS.split(' ') : [] });
  await b.open('file:///c:/project_02/index.html?noinfo=1&hide=bed,surf,kelp,props,life,snow,bub,rays,bloom', 1800);
  console.log(await b.eval(`(async()=>{
    const a = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    const feats = [...a.features].sort();
    const dev = await a.requestDevice({ requiredFeatures: feats.filter(f=>/timestamp/.test(f)) });
    const enc = Object.getOwnPropertyNames(GPUCommandEncoder.prototype).filter(n=>/stamp/i.test(n));
    const pass = Object.getOwnPropertyNames(GPURenderPassEncoder.prototype).filter(n=>/stamp/i.test(n));
    const e = dev.createCommandEncoder();
    let encOk = typeof e.writeTimestamp === 'function';
    let passOk = false;
    try {
      const q = dev.createQuerySet({type:'timestamp',count:2});
      const rp = e.beginRenderPass({colorAttachments:[]});
      passOk = typeof rp.writeTimestamp === 'function';
      if (passOk) rp.writeTimestamp(q, 0);
      rp.end();
    } catch (err) { passOk = 'throw: ' + err.message; }
    try { e.finish().destroy(); } catch (err) { /* already consumed */ }
    return JSON.stringify({feats, enc, pass, encOk, passOk}, null, 1);
  })()`));
  console.log('errors', JSON.stringify(b.errors.slice(0, 4)));
  await b.close();
})();

