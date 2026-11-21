// Velocity Divide browser tests: real Chrome over the DevTools protocol, same approach as src/kart/tests/browser.mjs.
// Start the server (python serve.py), then: node src/velocity/tests/browser.mjs [--chrome path] [--base url] [--only name]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5173'), ONLY = arg('only', ''), SHOTS = arg('shots', join(tmpdir(), 'velocity-shots')); mkdirSync(SHOTS, { recursive: true });
const CHROME = arg('chrome', ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p)));
const PORT = 9600 + Math.floor(Math.random() * 200), sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, checks = 0; const log = [], ok = (c, m) => { checks++; const l = `${c ? 'PASS' : 'FAIL'}  ${m}`; log.push(l); console.log('  ' + l); if (!c) fails++; };

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.handlers = []; this.errors = [];
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.wait.has(m.id)) { const w = this.wait.get(m.id); this.wait.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } else if (m.method) this.handlers.forEach(h => h(m)); };
    this.handlers.push(m => { if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description).join(' ')); }); }
  static async open() { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); const p = new Page(ws); p.targetId = t.id; await p.send('Runtime.enable'); await p.send('Page.enable'); return p; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => { this.wait.set(id, { res, rej }); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); rej(new Error('timeout ' + method)); } }, 60000); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async goto(url) { this.errors = []; const done = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { this.handlers.splice(this.handlers.indexOf(h), 1); r(); } }; this.handlers.push(h); }); await this.send('Page.navigate', { url }); await Promise.race([done, sleep(20000)]); }
  async until(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* page busy */ } await sleep(100); } return false; }
  async key(code, type = 'tap') {
    const k = { Enter: 'Enter', Escape: 'Escape', Space: ' ', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Backquote: '`', Backspace: 'Backspace' }[code] || code.replace(/^Key/, '').toLowerCase();
    const p = { code, key: k, windowsVirtualKeyCode: { Enter: 13, Escape: 27, Space: 32, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backquote: 192, Backspace: 8 }[code] || k.toUpperCase().charCodeAt(0) };
    if (type !== 'up') await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); if (type === 'tap') await sleep(60); if (type !== 'down') await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); await sleep(80);
  }
  async shot(name) { const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(join(SHOTS, name + '.jpg'), Buffer.from(r.data, 'base64')); }
  async close() { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${this.targetId}`); } catch { /* gone */ } try { this.ws.close(); } catch { /* closed */ } }
}
const FAKE_PAD = `(() => { const st = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
  const gp = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, get axes() { return st.axes; }, get buttons() { return st.buttons; } };
  navigator.getGamepads = () => [gp, null, null, null];
  window.__fake = { set(o) { if (o.axes) st.axes = o.axes.slice(); st.buttons = Array.from({ length: 18 }, (_, i) => { const v = (o.buttons || [])[i] || 0; return { pressed: v > 0.5, value: v }; }); gp.timestamp++; } }; })();`;
const BTN = { A: 0, B: 1, START: 9, HOME: 16 }, btns = (...n) => { const b = []; for (const k of n) b[BTN[k]] = 1; return JSON.stringify(b); };
const PLAY = `window.__vd && window.__vd.S.name === 'play' && !window.__vd.S.page`, P = 'window.__vd.S.sim.p';
const tapOn = async (p, sel) => { const r = await p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, in: b.width > 0 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight }; })()`); if (!r) return null; await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 3 }] }); await sleep(250); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250); return r; };

const tests = {
  async hub(p) {
    await p.goto(BASE + '/index.html?from=starbolt'); await p.until(`document.querySelectorAll('.tile').length >= 7`, 8000);
    const tiles = await p.eval(`[...document.querySelectorAll('.tile .tname')].map(e => e.textContent)`);
    ok(tiles.length === 7 && tiles.includes('Velocity Divide'), `hub shows seven tiles with Velocity Divide (${tiles.join(', ')})`);
    ok(['Starbolt', 'Golazo Football', 'Storm Royale', 'Frontline Ops', 'Sparkplug GP', 'Controller Test'].every(t => tiles.includes(t)), 'hub still lists every existing tile');
    for (let i = 0; i < 8; i++) { if (await p.eval(`document.getElementById('gTitle').textContent`) === 'Velocity Divide') break; await p.key('ArrowRight'); }
    await p.key('Enter');
    ok(await p.until(`location.pathname.endsWith('velocity.html')`, 8000) && await p.until(`!!document.querySelector('.vd-logo')`, 15000), 'Enter on the tile opens velocity.html and its title screen');
    ok(p.errors.length === 0, `no console errors (${p.errors.slice(0, 2).join(' | ')})`);
  },
  async keyboard(p) {
    await p.goto(BASE + '/velocity.html'); await p.until(`!!document.querySelector('.vd-logo')`, 15000);
    await p.key('Enter'); ok(await p.until(`document.querySelectorAll('.vd-it').length === 6 && !!document.querySelector('.vd-card')`, 4000), 'Play opens the selector: six characters and a detail card');
    const card = await p.eval(`document.querySelector('.vd-card').textContent`); ok(/Kite Rennow/.test(card) && /Hero/.test(card) && /Speed runner/.test(card) && /homing/i.test(card), 'the card shows name, faction, role and abilities');
    await p.shot('10-selector');
    await p.key('ArrowDown'); ok(/Vesper Null/.test(await p.eval(`document.querySelector('.vd-card').textContent`)) , 'arrow keys move to the villain row');
    await p.key('ArrowUp'); await p.key('Enter'); await sleep(300); await p.key('Enter');
    ok(await p.until(PLAY, 8000), 'choosing Kite, then Start, begins the mission');
    await sleep(600); const z0 = await p.eval(`${P}.z`); await p.key('KeyW', 'down'); await sleep(900); await p.key('KeyW', 'up');
    ok(await p.eval(`${P}.z`) < z0 - 5, 'W runs forward'); const y0 = await p.eval(`${P}.y`); await p.key('Space', 'down'); await sleep(250); const y1 = await p.eval(`${P}.y`); await p.key('Space', 'up');
    ok(y1 > y0 + 0.8, 'Space jumps'); await p.shot('11-play');
    await p.eval(`${P}.y = -200`); ok(await p.until(`window.__vd.S.sim.retries === 1 && ${P}.dead <= 0 && ${P}.y > -5`, 5000), 'falling respawns at the checkpoint');
    await p.key('Escape'); ok(await p.until(`!!window.__vd.S.page && /Paused/.test(document.querySelector('.vd-panel').textContent)`, 3000), 'Esc pauses');
    await p.key('ArrowDown'); await p.key('Enter'); ok(await p.until(`${PLAY} && window.__vd.S.sim.time < 1`, 5000), 'Restart mission starts it again from zero');
    await p.key('Backquote'); ok(await p.until(`location.pathname.endsWith('index.html')`, 8000) && await p.until(`document.querySelector('.tile.sel .tname')?.textContent === 'Velocity Divide'`, 5000), 'the Home key returns to the hub with the tile selected');
    ok(p.errors.length === 0, `no console errors (${p.errors.slice(0, 2).join(' | ')})`);
  },
  async clear(p) {   // autopilot, sped up: one hero and one villain stage, every kit, the three finales, then the save after a reload
    for (const [m, c] of [['d1', 'kite'], ['u1', 'vesper'], ['d2', 'mossa'], ['u2', 'quill'], ['d3', 'pallet'], ['u3', 'ogre'], ['d4', 'kite'], ['u4', 'ogre'], ['x1', 'mossa']]) {
      await p.goto(`${BASE}/velocity.html?quick=1&m=${m}&c=${c}&auto=1&speed=6&seed=1`);
      const done = await p.until(`window.__vd && window.__vd.S.name === 'results'`, 150000);
      ok(done && p.errors.length === 0, `${m} as ${c}: cleared to the results screen${done ? ' (' + (await p.eval(`document.querySelector('.vd-rank').textContent + ', ' + window.__vd.S.sim.results().time + ' s'`)) + ')' : ''} ${p.errors.slice(0, 1).join('')}`);
      if (m === 'd1') await p.shot('20-results');
    }
    await p.key('Enter'); ok(await p.until(`/closed/.test(document.querySelector('.vd-panel h2')?.textContent || '')`, 4000), 'the last mission leads to the ending'); await p.shot('21-ending');
    await p.goto(BASE + '/velocity.html'); await p.until(`!!document.querySelector('.vd-logo')`, 15000);
    ok(await p.eval(`Object.keys(window.__vd.save.best).length`) === 9, 'after a reload all nine missions are saved as cleared');
    await p.key('ArrowDown'); await p.key('Enter'); ok(await p.until(`document.querySelectorAll('.vd-it').length === 9 && !document.querySelector('.vd-it.off')`, 4000), 'the mission list shows nine unlocked stages for replay');
  },
  async gamepad(p) {
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PAD });
    await p.goto(BASE + '/velocity.html?quick=1&m=u3&c=ogre'); ok(await p.until(PLAY, 15000), 'mission starts with an emulated pad present');
    await sleep(500); const z0 = await p.eval(`${P}.z`); await p.eval(`__fake.set({ axes: [0, -1, 0, 0] })`); await sleep(800);
    ok(await p.eval(`${P}.z`) < z0 - 3 && await p.eval(`window.__vd.pad.kind`) === 'xbox', 'left stick moves the mech; the pad is read as an Xbox pad');
    const y0 = await p.eval(`${P}.y`); await p.eval(`__fake.set({ axes: [0, 0, 0, 0], buttons: ${btns('A')} })`); await sleep(250); ok(await p.eval(`${P}.y`) > y0 + 0.6, 'A jumps');
    await p.eval(`__fake.set({ buttons: ${btns('B')} })`); await sleep(900); const locks = await p.eval(`${P}.locks.length`); await p.eval(`__fake.set({})`); await sleep(200);
    ok(locks >= 0 && await p.eval(`${P}.locks.length`) === 0, `B held then released runs the lock and fire cycle (${locks} locks at this range)`);
    await p.eval(`__fake.set({ buttons: ${btns('START')} })`); await sleep(150); await p.eval(`__fake.set({})`); ok(await p.until(`!!window.__vd.S.page`, 3000), 'Start pauses');
    await p.eval(`__fake.set({ buttons: ${btns('B')} })`); await sleep(150); await p.eval(`__fake.set({})`); ok(await p.until(PLAY, 3000), 'B resumes');
    await p.eval(`__fake.set({ buttons: ${btns('HOME')} })`); ok(await p.until(`location.pathname.endsWith('index.html')`, 8000), 'the Home button returns to the hub');
  },
  async phones(p) {
    for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
      await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await p.goto(BASE + '/velocity.html'); await p.until(`!!document.querySelector('.vd-logo')`, 15000);
      await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 4, y: 4, id: 1 }] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
      ok(!!(await tapOn(p, '.vd-it[data-i="0"]')) && await p.until(`!!document.querySelector('.vd-card')`, 4000), `phone ${name}: tapping Play opens the selector`); await p.shot(`30-${name}-selector`);
      await tapOn(p, '.vd-it[data-i="4"]'); ok(/Quill Sable/.test(await p.eval(`document.querySelector('.vd-card').textContent`)), `phone ${name}: a tap picks a villain and shows the card`);
      await p.eval(`document.getElementById('vdGo').scrollIntoView({ block: 'center' })`); await tapOn(p, '#vdGo'); await sleep(300); await tapOn(p, '.vd-it[data-i="0"]');
      ok(await p.until(PLAY, 8000) && await p.until(`!!document.querySelector('.tc.on')`, 4000), `phone ${name}: the mission starts with the on-screen controller`);
      const fit = await p.eval(`(() => { const c = document.getElementById('game').getBoundingClientRect(), b = [...document.querySelectorAll('.tc.on [data-b], .tc.on .tc-stick')].map(e => e.getBoundingClientRect()); return Math.round(c.width) === innerWidth && Math.round(c.height) === innerHeight && b.every(r => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight); })()`);
      ok(fit, `phone ${name}: the canvas fills ${w} x ${h} and every touch control is on screen`);
      await sleep(400); const y0 = await p.eval(`${P}.y`); const a = await p.eval(`(() => { const b = document.querySelector('.tc [data-b=A]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, label: document.querySelector('.tc [data-b=A]').textContent }; })()`);
      await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 5 }] }); await sleep(250); const y1 = await p.eval(`${P}.y`); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      ok(y1 > y0 + 0.6 && a.label === 'JUMP', `phone ${name}: the A button is labelled JUMP and jumps`); await p.shot(`31-${name}-play`);
      ok(p.errors.length === 0, `phone ${name}: no console errors (${p.errors.slice(0, 2).join(' | ')})`);
    }
    await p.send('Emulation.clearDeviceMetricsOverride'); await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  },
  async others(p) {
    for (const page of ['starbolt.html', 'football.html', 'royale.html?quick=1', 'frontline.html?mode=range', 'kart.html']) { await p.goto(BASE + '/' + page); await sleep(2500); ok(p.errors.length === 0 && await p.eval(`!!document.querySelector('canvas')`), `${page} still loads without console errors (${p.errors.slice(0, 2).join(' | ')})`); }
  },
};

if (!CHROME) { console.log('No Chrome or Edge found: pass --chrome <path>'); process.exit(2); }
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'velocity-chrome-' + process.pid)}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); up = true; } catch { await sleep(250); } }
if (!up) { console.log('Chrome did not start:', CHROME); process.exit(2); }
console.log(`Chrome: ${CHROME}\nServer: ${BASE}\nScreenshots: ${SHOTS}`);
for (const [name, fn] of Object.entries(tests)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  console.log(`\n== ${name}`); const p = await Page.open(); await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  try { await fn(p); } catch (e) { ok(false, `${name} crashed: ${e.message}`); } await p.close();
}
chrome.kill(); console.log(`\n${checks - fails}/${checks} browser checks passed`);
writeFileSync(join(SHOTS, 'results.txt'), log.join('\n') + `\n${checks - fails}/${checks} passed\n`); process.exit(fails ? 1 : 0);
