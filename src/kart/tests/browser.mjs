// Sparkplug GP browser tests: drives a real Chrome over the DevTools protocol (no npm packages; needs Node 22+ for
// the built-in WebSocket). Start the Arcade server first (python serve.py), then:
//   node src/kart/tests/browser.mjs [--chrome "C:\...\chrome.exe"] [--base http://127.0.0.1:5173] [--shots dir] [--only name]
// Checks: hub tile, the four existing games still load cleanly, menus by keyboard, a full race start to finish
// (autopilot, sped up), results, replay, restart, pause, back to the hub, emulated DualSense and Xbox pads,
// keyboard and multi-touch with steering + gas + drift + item held at once, and phone layouts.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5173');
const SHOTS = arg('shots', join(tmpdir(), 'kart-shots')); mkdirSync(SHOTS, { recursive: true });
const ONLY = arg('only', '');
const CHROME = arg('chrome', [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => existsSync(p)));
const PORT = 9333 + Math.floor(Math.random() * 200);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, checks = 0; const log = [];
const ok = (c, m) => { checks++; const line = `${c ? 'PASS' : 'FAIL'}  ${m}`; log.push(line); console.log('  ' + line); if (!c) fails++; };

// ---- minimal CDP client -----------------------------------------------------------------------------------------------
class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.handlers = []; this.errors = [];
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.wait.has(m.id)) { const w = this.wait.get(m.id); this.wait.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } else if (m.method) this.handlers.forEach(h => h(m)); };
    this.handlers.push(m => {
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) this.errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
    });
  }
  static async open(url = 'about:blank') {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const p = new Page(ws); p.targetId = t.id;
    await p.send('Runtime.enable'); await p.send('Log.enable'); await p.send('Page.enable');
    return p;
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => { this.wait.set(id, { res, rej }); setTimeout(() => { if (this.wait.has(id)) { this.wait.delete(id); rej(new Error('timeout ' + method)); } }, 60000); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async goto(url) { this.errors = []; const done = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired') { this.handlers.splice(this.handlers.indexOf(h), 1); r(); } }; this.handlers.push(h); }); await this.send('Page.navigate', { url }); await Promise.race([done, sleep(20000)]); }
  async until(expr, ms = 20000, step = 100) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* page busy */ } await sleep(step); } return false; }
  async key(code, type = 'tap', key) {
    const k = key || ({ Enter: 'Enter', Escape: 'Escape', Space: ' ', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Tab: 'Tab', Backquote: '`', Backspace: 'Backspace' }[code] || code.replace(/^Key/, '').toLowerCase());
    const p = { code, key: k, windowsVirtualKeyCode: { Enter: 13, Escape: 27, Space: 32, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Tab: 9, Backquote: 192, Backspace: 8 }[code] || k.toUpperCase().charCodeAt(0) };
    if (type !== 'up') await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
    if (type === 'tap') await sleep(60);
    if (type !== 'down') await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(60);
  }
  async shot(name) { const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); const f = join(SHOTS, name + '.jpg'); writeFileSync(f, Buffer.from(r.data, 'base64')); return f; }
  async close() { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${this.targetId}`); } catch { /* gone */ } try { this.ws.close(); } catch { /* closed */ } }
}

// A fake standard-mapping gamepad injected before the page's scripts run. window.__fake.set({ axes, buttons }).
const FAKE_PAD = id => `(() => {
  const st = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
  const gp = { id: ${JSON.stringify(id)}, index: 0, connected: true, mapping: 'standard', timestamp: 0, get axes() { return st.axes; }, get buttons() { return st.buttons; }, vibrationActuator: { playEffect: () => Promise.resolve('complete') } };
  navigator.getGamepads = () => [gp, null, null, null];
  window.__fake = { set(o) { if (o.axes) st.axes = o.axes.slice(); if (o.buttons) { st.buttons = Array.from({ length: 18 }, (_, i) => { const v = o.buttons[i] || 0; return { pressed: v > 0.5, value: v }; }); } gp.timestamp++; } };
})();`;

const BTN = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16, TOUCH: 17 };
const buttons = (...names) => { const b = []; for (const n of names) b[BTN[n]] = 1; return b; };

// ---- tests ----------------------------------------------------------------------------------------------------------------
const tests = {
  async hub(p) {
    await p.goto(BASE + '/index.html'); await sleep(1500);
    const tiles = await p.eval(`[...document.querySelectorAll('.tile .tname')].map(e => e.textContent)`);
    ok(tiles.includes('Sparkplug GP'), `hub shows a Sparkplug GP tile (${tiles.join(', ')})`);
    ok(['Starbolt', 'Golazo Football', 'Storm Royale', 'Frontline Ops'].every(t => tiles.includes(t)), 'hub still lists the four existing games');
    // pick it with the keyboard and launch
    const idx = tiles.indexOf('Sparkplug GP');
    for (let i = 0; i < 8; i++) { const sel = await p.eval(`[...document.querySelectorAll('.tile')].findIndex(t => t.classList.contains('sel'))`); if (sel === idx) break; await p.key('ArrowRight'); }
    ok(await p.eval(`document.getElementById('gTitle').textContent`) === 'Sparkplug GP', 'hub details panel shows Sparkplug GP when selected');
    await p.shot('01-hub');
    await p.key('Enter');
    ok(await p.until(`location.pathname.endsWith('kart.html')`, 8000), 'A / Enter on the tile opens kart.html');
    ok(await p.until(`window.__kart && document.querySelector('.k-logo')`, 15000), 'title screen appears');
    ok(p.errors.length === 0, `no console errors on hub → kart (${p.errors.slice(0, 3).join(' | ')})`);
  },

  async existing(p) {
    for (const [page, ready] of [['starbolt.html', `!!document.querySelector('canvas')`], ['football.html', `!!document.querySelector('#menuList div')`], ['royale.html', `!!document.querySelector('canvas')`], ['frontline.html', `!!document.querySelector('canvas')`]]) {
      await p.goto(BASE + '/' + page); await sleep(5000);
      const ready2 = await p.eval(ready).catch(() => false);
      const errs = p.errors.filter(e => !/AudioContext|autoplay|GPU stall|WebGL-|swiftshader/i.test(e));
      ok(ready2 && errs.length === 0, `${page} loads without errors ${errs.length ? '(' + errs.slice(0, 2).join(' | ') + ')' : ''}`);
      await p.shot('02-' + page.replace('.html', ''));
    }
  },

  async menus(p) {
    await p.goto(BASE + '/kart.html'); await p.until(`window.__kart && document.querySelector('.k-logo')`, 15000);
    await p.shot('03-title');
    const page = () => p.eval(`window.__kart.S.menu?.id`);
    await p.key('Enter'); ok(await page() === 'main', 'Enter on the title opens the main menu');
    await p.shot('04-main');
    await p.key('ArrowDown'); await p.key('Enter'); ok(await page() === 'class', 'Single Race → engine class');
    await p.key('ArrowDown'); await p.key('Enter'); ok(await page() === 'racer', 'Pro class → racer select');
    await p.key('ArrowRight'); await p.key('ArrowRight'); await sleep(400); await p.shot('05-racer');
    await p.key('Enter'); ok(await page() === 'kart', 'racer → kart select');
    await p.key('ArrowDown'); await sleep(300); await p.shot('06-kart');
    await p.key('Backspace'); ok(await page() === 'racer', 'B / Backspace goes back a screen');
    await p.key('Enter'); await p.key('Enter'); ok(await page() === 'track', 'kart → track select');
    await p.shot('07-track');
    for (let i = 0; i < 3; i++) await p.key('ArrowDown');
    await p.key('Enter');
    ok(await p.until(`window.__kart.S.name === 'race'`, 15000), 'choosing a track starts the race');
    const st = await p.eval(`({ racer: window.__kart.S.race.human.racer.name, kart: window.__kart.S.race.human.kart.name, track: window.__kart.S.race.def.name, n: window.__kart.S.race.karts.length })`);
    ok(st.racer === 'Bolt-E' && st.kart === 'Dune Buggy' && st.track === 'Frostbyte Peaks' && st.n === 8, `race set up as chosen (${JSON.stringify(st)})`);
    ok(p.errors.length === 0, `no console errors in the menus (${p.errors.slice(0, 3).join(' | ')})`);
  },

  async race(p) {
    // full race on autopilot, sped up: start → countdown → laps → finish → results → replay → restart → menu
    await p.goto(BASE + '/kart.html?quick=1&mode=vs&track=0&laps=2&auto=1&speed=4'); await p.until(`window.__kart?.S.name === 'race'`, 15000);
    ok(await p.until(`window.__kart.S.race.state === 'countdown'`, 5000), 'race begins with the countdown');
    await sleep(1200); await p.shot('10-intro');
    ok(await p.until(`window.__kart.S.race.state === 'race'`, 15000), 'countdown ends: GO');
    await sleep(1500); await p.shot('11-racing');
    const mid = await p.eval(`(() => { const r = window.__kart.S.race, me = r.human; return { lap: me.lap, speed: me.speed, place: me.place, hud: document.getElementById('hPos').textContent, lapTxt: document.getElementById('hLap').textContent }; })()`);
    ok(mid.speed > 10 && mid.lap === 1, `kart is racing on lap 1 (${JSON.stringify(mid)})`);
    ok(/LAP\s*1\s*\/\s*2/.test(mid.lapTxt) && /\d/.test(mid.hud), `HUD shows position and lap (${mid.hud} · ${mid.lapTxt})`);
    ok(await p.until(`window.__kart.S.race.human.lap >= 2`, 90000), 'crossed the line: lap 2');
    await p.shot('12-lap2');
    ok(await p.until(`window.__kart.S.name === 'menu' && window.__kart.S.menu.id === 'results'`, 120000), 'race finishes and shows the results');
    await sleep(600); await p.shot('13-results');
    const res = await p.eval(`({ rows: document.querySelectorAll('.k-res tr').length - 1, me: window.__kart.S.race.human.finishTime, place: window.__kart.S.race.human.place, laps: window.__kart.S.race.human.lapTimes.length })`);
    ok(res.rows === 8 && res.laps === 2 && res.me > 30, `results table lists 8 racers, 2 lap times (${JSON.stringify(res)})`);
    // replay
    const items = await p.eval(`window.__kart.S.menu.items.map(i => i.label)`);
    for (let i = 0; i < items.indexOf('Watch replay'); i++) await p.key('ArrowDown');
    await p.key('Enter'); ok(await p.until(`window.__kart.S.name === 'replay'`, 3000), 'Watch replay plays the race back');
    await sleep(1500); await p.shot('14-replay');
    await p.key('Enter'); await sleep(800); await p.shot('15-replay-chase');
    await p.key('Backspace'); ok(await p.until(`window.__kart.S.menu?.id === 'results'`, 3000), 'B leaves the replay back to the results');
    // race again (restart)
    await p.key('ArrowUp'); await p.key('ArrowUp'); await p.key('ArrowUp'); await p.key('ArrowUp');
    const label = await p.eval(`window.__kart.S.menu.items[window.__kart.S.sel].label`);
    await p.key('Enter'); ok(label === 'Race again' && await p.until(`window.__kart.S.name === 'race' && window.__kart.S.race.state === 'countdown'`, 5000), `"${label}" restarts the race`);
    // pause → restart → quit to menu
    await p.until(`window.__kart.S.race.state === 'race'`, 15000);
    await p.key('Escape'); ok(await p.eval(`window.__kart.S.name`) === 'pause', 'Esc pauses');
    const t1 = await p.eval(`window.__kart.S.race.t`); await sleep(500); ok(await p.eval(`window.__kart.S.race.t`) === t1, 'the race clock stops while paused');
    await p.shot('16-pause');
    await p.key('ArrowDown'); await p.key('Enter');
    ok(await p.until(`window.__kart.S.name === 'race' && window.__kart.S.race.t === 0`, 5000), 'pause → Restart race');
    await p.key('Escape'); for (let i = 0; i < 5; i++) await p.key('ArrowDown'); await p.key('Enter');
    ok(await p.until(`window.__kart.S.menu?.id === 'main'`, 5000), 'pause → Quit to menu');
    // HOME → hub
    await p.key('Backquote'); ok(await p.until(`location.pathname.endsWith('index.html')`, 5000), '` / HOME returns to the Arcade hub');
    ok(await p.until(`document.querySelector('.tile.sel .tname')?.textContent === 'Sparkplug GP'`, 4000), 'hub remembers Sparkplug GP as the last game');
    ok(p.errors.length === 0, `no console errors through a full race (${p.errors.slice(0, 3).join(' | ')})`);
  },

  async tracks(p) {
    for (let t = 0; t < 6; t++) {
      await p.goto(BASE + `/kart.html?quick=1&mode=vs&track=${t}&auto=1&speed=3`); await p.until(`window.__kart?.S.race?.state === 'race'`, 20000);
      await sleep(2500 + t * 200);
      const st = await p.eval(`(() => { const r = window.__kart.S.race; return { name: r.def.name, sp: r.human.speed, d: r.human.raceDist }; })()`);
      ok(st.d > 30, `${st.name}: renders and races (${st.d.toFixed(0)} m in)`);
      await p.shot(`20-track-${t}`);
    }
    ok(p.errors.length === 0, `no console errors on the six tracks (${p.errors.slice(0, 3).join(' | ')})`);
  },

  async gp(p) {
    await p.goto(BASE + '/kart.html?quick=1&mode=gp&cup=0&laps=1&auto=1&speed=5'); await p.until(`window.__kart?.S.name === 'race'`, 15000);
    ok(await p.until(`window.__kart.S.menu?.id === 'results'`, 90000), 'Grand Prix race 1 finishes');
    ok(await p.eval(`window.__kart.S.menu.items[0].label`) === 'Standings', 'results offer the cup standings');
    await p.key('Enter'); ok(await p.eval(`window.__kart.S.menu.id`) === 'standings', 'standings after race 1');
    await p.shot('30-standings');
    await p.key('Enter'); ok(await p.until(`window.__kart.S.name === 'race' && window.__kart.S.race.def.id === 'pier'`, 8000), 'next race: Saltspray Pier');
    ok(await p.until(`window.__kart.S.menu?.id === 'results'`, 90000), 'race 2 finishes');
    await p.key('Enter'); await p.key('Enter');
    ok(await p.until(`window.__kart.S.name === 'race' && window.__kart.S.race.def.id === 'canyon'`, 8000), 'race 3: Cinder Canyon');
    ok(await p.until(`window.__kart.S.menu?.id === 'results'`, 90000), 'race 3 finishes');
    ok(await p.eval(`window.__kart.S.menu.items[0].label`) === 'Cup results', 'last race offers the cup results');
    await p.key('Enter'); await sleep(400); await p.shot('31-cup-final');
    const pts = await p.eval(`[...window.__kart.S.gp.points.values()].reduce((a, b) => a + b, 0)`);
    ok(pts === 3 * 58, `points add up over 3 races (${pts})`);
    ok(p.errors.length === 0, `no console errors in a Grand Prix (${p.errors.slice(0, 3).join(' | ')})`);
  },

  async timetrial(p) {
    await p.goto(BASE + '/kart.html?quick=1&mode=tt&track=1&laps=1&auto=1&speed=5'); await p.until(`window.__kart?.S.name === 'race'`, 15000);
    ok(await p.eval(`window.__kart.S.race.karts.length === 1 && window.__kart.S.race.human.item === 'turbo3'`), 'time trial: solo, three Turbo Cans');
    ok(await p.until(`window.__kart.S.menu?.id === 'results'`, 60000), 'time trial finishes');
    ok(await p.eval(`!!localStorage.getItem('sparkplug-ghost-pier') && JSON.parse(localStorage.getItem('sparkplug-records')).tt.pier.time > 0`), 'record and ghost saved');
    await p.shot('32-tt-results');
    await p.key('Enter'); ok(await p.until(`window.__kart.S.name === 'race' && !!window.__kart.S.ghost`, 8000), 'Try again races against the saved ghost');
    await p.until(`window.__kart.S.race.state === 'race'`, 10000); await sleep(1500);
    ok(await p.eval(`window.__kart.S.race && document.querySelector('canvas') && true`), 'ghost run renders');
    await p.shot('33-tt-ghost');
  },

  async keyboard(p) {
    await p.goto(BASE + '/kart.html?quick=1&mode=tt&track=0'); await p.until(`window.__kart?.S.race?.state`, 15000);
    await p.until(`window.__kart.S.race.state === 'race'`, 15000);
    for (const k of ['KeyW', 'KeyD', 'Space', 'KeyE']) await p.key(k, 'down');
    await sleep(300);
    const inp = await p.eval(`window.__kart.readInput()`);
    ok(inp.accel === 1 && inp.steer === 1 && inp.drift && inp.item, `keyboard: W + D + Space + E held together (${JSON.stringify(inp)})`);
    await sleep(1500);
    const st = await p.eval(`(() => { const k = window.__kart.S.race.human; return { speed: k.speed, drift: k.drift, trailing: k.trailing }; })()`);
    ok(st.speed > 8 && st.drift === 1, `kart accelerates and drifts right while the item is held (${JSON.stringify(st)})`);
    for (const k of ['KeyW', 'KeyD', 'Space', 'KeyE']) await p.key(k, 'up');
  },

  async gamepads(p) {
    for (const [id, kind] of [['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'], ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox']]) {
      const { identifier } = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PAD(id) });
      await p.goto(BASE + '/kart.html?quick=1&mode=vs&track=4&cpu=3'); await p.until(`window.__kart?.S.race?.state === 'race'`, 20000);
      const name = kind === 'playstation' ? 'DualSense' : 'Xbox';
      ok(await p.eval(`window.__kart.pad.kind`) === kind, `${name}: detected as ${kind}`);
      // right trigger gas + left stick right + R1 drift held, then L1 item, all at once
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: (() => { const b = []; b[7] = 1; return b; })() })`); await sleep(2200);
      await p.eval(`window.__fake.set({ axes: [0.85, 0, 0, 0], buttons: (() => { const b = []; b[7] = 1; return b; })() })`); await sleep(150);
      await p.eval(`window.__fake.set({ axes: [0.85, 0, 0, 0], buttons: (() => { const b = []; b[7] = 1; b[5] = 1; return b; })() })`); await sleep(700);
      await p.eval(`window.__fake.set({ axes: [0.85, 0, 0, 0], buttons: (() => { const b = []; b[7] = 1; b[5] = 1; b[4] = 1; return b; })() })`); await sleep(200);
      const inp = await p.eval(`window.__kart.readInput()`);
      ok(inp.accel === 1 && inp.steer > 0.6 && inp.drift && inp.item, `${name}: R2 gas + stick steer + R1 drift + L1 item together (${JSON.stringify(inp)})`);
      const st = await p.eval(`(() => { const k = window.__kart.S.race.human; return { speed: +k.speed.toFixed(1), drift: k.drift, tier: k.driftTier }; })()`);
      ok(st.speed > 10 && st.drift === 1, `${name}: kart drives and drifts under the emulated pad (${JSON.stringify(st)})`);
      await p.shot(`40-pad-${kind}`);
      // A as gas, B brake, START pauses, A in pause resumes
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: [] })`); await sleep(150);
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: (() => { const b = []; b[9] = 1; return b; })() })`); await sleep(150);
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: [] })`); await sleep(150);
      ok(await p.eval(`window.__kart.S.name`) === 'pause', `${name}: Options/Menu pauses`);
      const glyph = await p.eval(`document.querySelector('#pause .k-foot').innerHTML`);
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: (() => { const b = []; b[0] = 1; return b; })() })`); await sleep(150);
      await p.eval(`window.__fake.set({ axes: [0, 0, 0, 0], buttons: [] })`); await sleep(150);
      ok(await p.eval(`window.__kart.S.name`) === 'race', `${name}: A on Resume continues (${glyph.includes('glyph') ? 'pad glyphs shown' : 'no glyphs'})`);
      await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  },

  async touch(p) {
    // phone in landscape with touch: the on-screen pad appears, relabelled; multi-touch steer + drift + item with auto-gas
    await p.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.goto(BASE + '/kart.html'); await p.until(`window.__kart && document.querySelector('.k-logo')`, 15000);
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 5, y: 5, id: 1 }] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300); await p.shot('50-phone-title');
    // a tap: touchstart/touchend; with touch emulation on, Chrome follows it with the click like a phone does
    const tap = async sel => { const r = await p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); if (!r) return false; await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...r, id: 2 }] }); await sleep(50); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300); return true; };
    await tap('.k-it'); ok(await p.eval(`window.__kart.S.menu.id`) === 'main', 'phone: tapping Start opens the main menu');
    await p.shot('51-phone-main');
    await tap('.k-it:nth-child(2)'); await tap('.k-it:nth-child(2)');   // first tap selects, second confirms
    ok(await p.eval(`window.__kart.S.menu.id`) === 'class', 'phone: tap to select, tap again to confirm (Single Race)');
    await tap('.k-it:nth-child(1)'); await tap('.k-it:nth-child(1)');
    await tap('.k-it:nth-child(3)'); await tap('.k-it:nth-child(3)'); await sleep(300); await p.shot('52-phone-racer');
    ok(await p.eval(`window.__kart.S.menu.id`) === 'kart', 'phone: racer picked by touch');
    await tap('.k-it:nth-child(1)'); await tap('.k-it:nth-child(1)');
    await tap('.k-it:nth-child(1)'); await tap('.k-it:nth-child(1)');
    ok(await p.until(`window.__kart.S.name === 'race'`, 8000), 'phone: race starts from touch menus');
    ok(await p.until(`document.querySelector('.tc.on') !== null`, 4000), 'phone: on-screen controls are shown in the race');
    const labels = await p.eval(`['A','B','X','Y','R1','L1'].map(b => document.querySelector('.tc [data-b=' + b + ']')?.textContent)`);
    ok(labels.join(',') === 'GAS,BRAKE,ITEM,DRIFT,DRIFT,ITEM', `phone: buttons relabelled for racing (${labels})`);
    await p.until(`window.__kart.S.race.state === 'race'`, 15000);
    // geometry
    const R = await p.eval(`(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }; return { ls: r('.tc-ls'), y: r('.tc [data-b=Y]'), x: r('.tc [data-b=X]'), a: r('.tc [data-b=A]'), item: r('.k-slot'), pos: r('#hPos'), map: r('#hMap'), w: innerWidth, h: innerHeight }; })()`);
    const inside = b => b && b[0] >= 0 && b[1] >= 0 && b[2] <= R.w + 1 && b[3] <= R.h + 1;
    const overlap = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    ok(['ls', 'y', 'x', 'a', 'item', 'pos', 'map'].every(k => inside(R[k])), 'phone landscape: sticks, buttons, item slot, position and map all on screen');
    ok(!overlap(R.item, R.y) && !overlap(R.item, R.x) && !overlap(R.map, R.ls) && !overlap(R.pos, R.ls), 'phone landscape: HUD does not sit under the touch controls');
    // three fingers: stick left, hold DRIFT (Y), then tap ITEM (X)
    const c = b => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 });
    const st = c(R.ls), yb = c(R.y), xb = c(R.x);
    await sleep(2000);   // auto-gas gets the kart up to speed first
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...st, id: 11 }] });
    await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st.x - 60, y: st.y, id: 11 }] });
    await sleep(150);
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x - 60, y: st.y, id: 11 }, { ...yb, id: 12 }] });
    await sleep(700);
    await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x - 60, y: st.y, id: 11 }, { ...yb, id: 12 }, { ...xb, id: 13 }] });
    await sleep(150);
    const inp = await p.eval(`window.__kart.readInput()`);
    ok(inp.steer < -0.6 && inp.accel === 1 && inp.drift && inp.item, `phone: steer + auto-gas + DRIFT + ITEM at once (${JSON.stringify({ steer: +inp.steer.toFixed(2), accel: inp.accel, drift: inp.drift, item: inp.item })})`);
    const k = await p.eval(`(() => { const k = window.__kart.S.race.human; return { speed: +k.speed.toFixed(1), drift: k.drift }; })()`);
    ok(k.speed > 8 && k.drift === -1, `phone: kart drifts left at speed under touch (${JSON.stringify(k)})`);
    await p.shot('53-phone-race');
    await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // portrait
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await sleep(800); await p.shot('54-phone-portrait');
    const P = await p.eval(`(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }; return { ls: r('.tc-ls'), a: r('.tc [data-b=A]'), item: r('.k-slot'), map: r('#hMap'), w: innerWidth, h: innerHeight }; })()`);
    ok(['ls', 'a', 'item', 'map'].every(k2 => P[k2] && P[k2][2] <= P.w + 1 && P[k2][3] <= P.h + 1 && P[k2][0] >= 0), 'phone portrait: controls and HUD fit on screen');
    // MENU (START) pauses; tapping Resume continues
    await tap('.tc [data-b=START]'); ok(await p.eval(`window.__kart.S.name`) === 'pause', 'phone: MENU button pauses');
    await sleep(200); await p.shot('55-phone-pause');
    await tap('#pause .k-it'); ok(await p.eval(`window.__kart.S.name`) === 'race', 'phone: tap Resume');
    ok(p.errors.length === 0, `no console errors on the phone (${p.errors.slice(0, 3).join(' | ')})`);
    await p.send('Emulation.clearDeviceMetricsOverride'); await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  },
};

// ---- run -------------------------------------------------------------------------------------------------------------------
const profile = join(tmpdir(), 'kart-chrome-' + process.pid);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); up = true; } catch { await sleep(250); } }
if (!up) { console.log('Chrome did not start:', CHROME); process.exit(2); }
console.log(`Chrome: ${CHROME}\nServer: ${BASE}\nScreenshots: ${SHOTS}`);
const t0 = Date.now();
for (const [name, fn] of Object.entries(tests)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  console.log(`\n== ${name}`);
  const p = await Page.open();
  await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  try { await fn(p); } catch (e) { ok(false, `${name} crashed: ${e.message}`); }
  await p.close();
}
chrome.kill();
console.log(`\n${checks - fails}/${checks} browser checks passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
writeFileSync(join(SHOTS, 'results.txt'), log.join('\n') + `\n${checks - fails}/${checks} passed\n`);
process.exit(fails ? 1 : 0);
