'use strict';
// Minimal Chrome DevTools Protocol driver for headless verification runs.
// Launches headless Edge with the real GPU (no --disable-gpu) so WebGPU works,
// streams console/exception events, evaluates expressions, takes screenshots.
// No third-party packages: Node's built-in WebSocket is enough.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const EXE = process.env.BROWSER || CANDIDATES.find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(opts = {}) {
  if (!EXE) throw new Error('no Chromium browser found');
  const width = opts.width || 1920, height = opts.height || 1080;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uw-edge-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update',
    '--window-size=' + width + ',' + height, '--hide-scrollbars',
    '--metrics-recording-only', '--mute-audio',
    ...(opts.flags || []),
    'about:blank',
  ];
  const proc = spawn(EXE, args, { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 250 && !port; i++) {
    await sleep(80);
    try { port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10) || 0; } catch (e) { /* not yet */ }
  }
  if (!port) { kill(proc, profile); throw new Error('browser did not open a debug port'); }
  const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = list.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP connect failed')); });

  let seq = 0;
  const pending = new Map();
  const b = { errors: [], warnings: [], pageErrors: [], width, height, pid: proc.pid };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      return;
    }
    const p = m.params || {};
    if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {};
      b.errors.push('exception: ' + ((d.exception && d.exception.description) || d.text || '?').split('\n')[0]);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (p.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' ');
      if (p.type === 'error') b.errors.push('console.error: ' + txt);
      else if (p.type === 'warning') b.warnings.push(txt);
    } else if (m.method === 'Log.entryAdded' && p.entry && p.entry.level === 'error') {
      b.errors.push('browser: ' + p.entry.text);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: opts.dsf === undefined ? 1 : opts.dsf, mobile: false });

  b.open = async (file, settleMs = 300) => {
    const url = /^(https?|file):/.test(file) ? file : 'file:///' + path.resolve(file).replace(/\\/g, '/');
    await send('Page.navigate', { url });
    await sleep(settleMs);
  };
  b.eval = async expr => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlocklist: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description || d.text || 'eval failed').split('\n')[0]);
    }
    return r.result.value;
  };
  b.waitFor = async (expr, timeoutMs = 30000, stepMs = 120) => {
    const t0 = Date.now();
    for (;;) {
      let v = false;
      try { v = await b.eval(expr); } catch (e) { v = false; }
      if (v) return true;
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for ' + expr);
      await sleep(stepMs);
    }
  };
  b.screenshot = async (file, format = 'png') => {
    const r = await send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 90 : undefined });
    if (file) fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return r.data.length;
  };
  b.sleep = sleep;
  b.close = async () => {
    try { ws.close(); } catch (e) { /* already closed */ }
    kill(proc, profile);
  };
  return b;
}
function kill(proc, profile) {
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* gone */ }
  for (let i = 0; i < 12; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); return; } catch (e) { /* locked */ }
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},150)']);
  }
}
module.exports = { launch, sleep, EXE };
