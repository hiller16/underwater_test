'use strict';
// Minimal Chrome DevTools Protocol driver for headless verification runs.
// Launches headless Edge with the real GPU (no --disable-gpu) so WebGPU works,
// streams console/exception events, evaluates expressions, takes screenshots.
// No third-party packages: Node's built-in WebSocket is enough.
//
// Timeouts (.clinerules/workflow.md #2): a CDP command that gets no answer fails
// after CMD_MS instead of waiting forever; a socket close/error rejects every
// in-flight command at once; and the whole tool run gets a wall clock budget of
// BUDGET_MS, armed by the first launch(). When the budget expires the browser
// process tree is killed and the tool exits with code 1, so a browser that stops
// answering can never hold a verification run open until the outer 10 minute cap.
// Override with CDP_CMD_TIMEOUT_MS / CDP_BOOT_TIMEOUT_MS / CDP_BUDGET_MS.
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

const envMs = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const CMD_MS = envMs('CDP_CMD_TIMEOUT_MS', 30000);   // one CDP command
const BOOT_MS = envMs('CDP_BOOT_TIMEOUT_MS', 60000); // browser start-up
const BUDGET_MS = envMs('CDP_BUDGET_MS', 180000);    // the whole tool run

const live = new Set();   // browsers that still own a browser process
let budgetTimer = null;
let exitHookOn = false;

// Fail instead of hang: put a deadline on any promise.
function withTimeout(promise, ms, label) {
  if (!(ms > 0)) return promise;
  return new Promise((res, rej) => {
    const t = setTimeout(
      () => rej(new Error('timed out after ' + Math.round(ms / 1000) + ' s: ' + label)), ms);
    promise.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

// What the tools are still waiting on - only used in the timeout message.
function outstanding() {
  const wait = [];
  for (const b of live) for (const w of b.pending()) wait.push(w);
  return wait.join(', ');
}

// Total time limit of the tool run, armed once (by the first launch), so tools
// that open several browsers after each other stay inside one shared deadline.
function armBudget(ms, label) {
  if (budgetTimer || !(ms > 0)) return;
  budgetTimer = setTimeout(() => {
    const wait = outstanding();
    for (const b of live) killProc(b.proc);
    console.error('TIMEOUT: ' + (label || 'tool run') + ' exceeded ' + Math.round(ms / 1000) + ' s' +
      (wait ? ' (waiting on CDP: ' + wait + ')' : '') + ' - browser killed');
    process.exit(1);
  }, ms);
  budgetTimer.unref();  // never keep a finished tool alive; the socket holds the loop
}

async function launch(opts = {}) {
  if (!EXE) throw new Error('no Chromium browser found');
  armBudget(opts.budgetMs || BUDGET_MS, opts.budgetLabel);
  const cmdMs = opts.cmdTimeoutMs === undefined ? CMD_MS : opts.cmdTimeoutMs;
  const bootMs = opts.bootTimeoutMs === undefined ? BOOT_MS : opts.bootTimeoutMs;
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
  const rec = { proc, pending: () => [] };
  live.add(rec);
  if (!exitHookOn) {
    exitHookOn = true;
    process.on('exit', () => { for (const b of live) killProc(b.proc); });
  }
  const die = msg => { live.delete(rec); kill(proc, profile); throw new Error(msg); };
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  const tBoot = Date.now();
  while (!port && Date.now() - tBoot < bootMs) {
    await sleep(80);
    try { port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10) || 0; } catch (e) { /* not yet */ }
  }
  if (!port) die('browser did not open a debug port within ' + Math.round(bootMs / 1000) + ' s');
  const list = await withTimeout(
    fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(cmdMs) })
      .then(r => r.json()), cmdMs, 'GET /json/list')
    .catch(e => die('debug port unreadable: ' + e.message));
  const target = list.find(t => t.type === 'page');
  if (!target) die('no debuggable page target on port ' + port);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await withTimeout(new Promise((res, rej) => {
    ws.onopen = res; ws.onerror = () => rej(new Error('CDP connect failed'));
  }), cmdMs, 'CDP connect').catch(e => die(e.message));

  let seq = 0;
  const pending = new Map();
  rec.pending = () => [...pending.values()]
    .map(p => p.method + ' for ' + Math.round((Date.now() - p.t0) / 1000) + 's');
  const b = { errors: [], warnings: [], pageErrors: [], width, height, pid: proc.pid };
  // a dead socket must not leave the tool waiting for answers that can never come
  const dropPending = why => {
    for (const [id, p] of [...pending]) { pending.delete(id); p.rej(new Error(why)); }
  };
  ws.onclose = ev => dropPending('CDP socket closed' + (ev && ev.code ? ' (code ' + ev.code + ')' : ''));
  ws.onerror = () => dropPending('CDP socket error');
  const send = (method, params = {}, timeoutMs = cmdMs) => new Promise((res, rej) => {
    const id = ++seq;
    let timer = null;
    const p = { method, t0: Date.now(), res: () => {}, rej: () => {} };
    const settle = (fn, arg) => {
      if (timer !== null) { clearTimeout(timer); timer = null; }
      pending.delete(id);
      fn(arg);
    };
    p.res = v => settle(res, v);
    p.rej = e => settle(rej, e);
    pending.set(id, p);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!pending.has(id)) return;
        p.rej(new Error('CDP ' + method + ' timed out after ' + Math.round(timeoutMs / 1000) + ' s'));
      }, timeoutMs);
    }
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (e) { p.rej(new Error('CDP ' + method + ' send failed: ' + String((e && e.message) || e))); }
  });

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
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: opts.dsf === undefined ? 1 : opts.dsf, mobile: false });

  b.open = async (file, settleMs = 300) => {
    const url = /^(https?|file):/.test(file) ? file : 'file:///' + path.resolve(file).replace(/\\/g, '/');
    await send('Page.navigate', { url });
    await sleep(settleMs);
  };
  b.eval = async (expr, timeoutMs = cmdMs) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlocklist: true,
    }, timeoutMs);
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
      try { v = await b.eval(expr, timeoutMs); } catch (e) { v = false; }
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
  b.pending = rec.pending;
  b.closed = false;
  b.close = async () => {
    if (b.closed) return;
    b.closed = true;
    dropPending('browser closed by the tool');
    try { ws.close(); } catch (e) { /* already closed */ }
    live.delete(rec);
    kill(proc, profile);
  };
  return b;
}
// /T kills the whole tree: the launched msedge.exe is only the root of several
// renderer/GPU children, and those are the ones holding the GPU.
function killProc(proc) {
  try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* gone */ }
}
function kill(proc, profile) {
  killProc(proc);
  for (let i = 0; i < 12; i++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); return; } catch (e) { /* locked */ }
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},150)']);
  }
}
module.exports = { launch, sleep, EXE, CMD_MS, BOOT_MS, BUDGET_MS };
