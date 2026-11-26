// Moya browser tests: real Chrome over the DevTools protocol, same approach as src/kart/tests/browser.mjs.
// Start the server (python serve.py), then: node src/moya/browser.mjs [--chrome path] [--base url] [--only name]
// Needs Node 22+ (built-in WebSocket) and Chrome or Edge.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5173'), ONLY = arg('only', ''), SHOTS = arg('shots', join(tmpdir(), 'moya-shots')); mkdirSync(SHOTS, { recursive: true });
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
  async until(expr, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* page busy */ } await sleep(80); } return false; }
  async key(code) {
    const named = { Enter: ['Enter', 13], Escape: ['Escape', 27], Backspace: ['Backspace', 8], Tab: ['Tab', 9], Backquote: ['`', 192], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Home: ['Home', 36] }[code];
    const key = named ? named[0] : code.startsWith('Digit') ? code.slice(5) : code.replace(/^Key/, '').toLowerCase();
    const vk = named ? named[1] : key.toUpperCase().charCodeAt(0);
    const text = code === 'Enter' ? { text: '\r' } : !named && key.length === 1 ? { text: key } : {};
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk, ...text }); await sleep(60);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk }); await sleep(90);
  }
  async click(sel) {
    const b = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!b) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(80); return true;
  }
  async tap(sel) {
    // touch points are in visual-viewport pixels; getBoundingClientRect is in layout-viewport pixels (they differ on phones)
    const b = await this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), v = visualViewport; return { x: (r.left + r.width / 2 - v.offsetLeft) * v.scale, y: (r.top + r.height / 2 - v.offsetTop) * v.scale }; })()`);
    if (!b) return false;
    await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }] }); await sleep(40);
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120); return true;
  }
  state() { return this.eval('window.moyaTest.state()'); }
  async shot(name) { const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(join(SHOTS, name + '.jpg'), Buffer.from(r.data, 'base64')); }
  async close() { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${this.targetId}`); } catch { /* gone */ } try { this.ws.close(); } catch { /* closed */ } }
}
const FAKE_PAD = `(() => { const st = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
  const gp = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, get axes() { return st.axes; }, get buttons() { return st.buttons; } };
  navigator.getGamepads = () => [gp, null, null, null];
  window.__fake = { set(o) { if (o.axes) st.axes = o.axes.slice(); st.buttons = Array.from({ length: 18 }, (_, i) => { const v = (o.buttons || [])[i] || 0; return { pressed: v > 0.5, value: v }; }); gp.timestamp++; } }; })();`;
const BTN = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16, TOUCH: 17 };
const settle = p => p.until(`(s => s.screen !== 'question' || !s.busy)(moyaTest.state())`, 4000);
const press = async (p, b) => { const buttons = Array(18).fill(0); buttons[BTN[b]] = 1; await p.eval(`window.__fake.set(${JSON.stringify({ axes: [0, 0, 0, 0], buttons })})`); await sleep(120); await p.eval('window.__fake.set({ axes: [0, 0, 0, 0] })'); await sleep(140); };

/** Answer honestly for `id` by clicking, until Moya guesses (or `stop` returns true). */
async function playAs(p, id, how = 'click') {
  playAs.want = [];
  for (let i = 0; i < 80; i++) {
    const st = await p.state();
    if (st.screen === 'question') {
      const a = await p.eval(`moyaTest.honest(${JSON.stringify(id)})`), before = st.asked; (playAs.want ||= []).push([st.q, a]);
      if (how === 'click') await p.click(`.ans[data-a="${a}"]`); else await p.tap(`.ans[data-a="${a}"]`);
      await p.until(`moyaTest.state().asked > ${before} || moyaTest.state().screen !== 'question'`, 4000); await settle(p);
    } else if (st.screen === 'guess') {
      if (!(await p.until('moyaTest.state().revealed', 4000))) return st;
      const g = await p.state(); if (g.guess === id) return g;
      await p.click('[data-act=wrong]'); await sleep(300);
    } else if (st.screen === 'wrong') { await p.click('[data-act=keep]'); await sleep(500); }
    else return st;
  }
  return p.state();
}

const tests = {
  async hub(p) {
    await p.goto(BASE + '/index.html?from=starbolt'); await p.until(`document.querySelectorAll('.tile').length === 9`, 8000);
    const tiles = await p.eval(`[...document.querySelectorAll('.tile .tname')].map(e => e.textContent)`);
    ok(tiles.length === 9 && tiles.at(-2) === 'Moya' && tiles.at(-1) === 'Controller Test', `hub: Moya is the tile before Controller Test (${tiles.join(', ')})`);
    for (let i = 0; i < 9 && (await p.eval(`document.getElementById('gTitle').textContent`)) !== 'Moya'; i++) await p.key('ArrowRight');
    ok(await p.eval(`document.getElementById('gTitle').textContent`) === 'Moya', 'hub: arrow keys select Moya');
    await p.key('Enter');
    ok(await p.until(`location.pathname.endsWith('moya.html') && !!window.moyaTest`, 8000), 'hub: Enter opens moya.html');
    ok(await p.until(`moyaTest.state().screen === 'title' && !!document.querySelector('.moya-svg')`, 6000), 'Moya title screen with the animated mascot');
    ok(p.errors.length === 0, `no console errors (${p.errors.slice(0, 2).join(' | ')})`);
  },

  async desktop(p) {
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000); await p.eval("localStorage.removeItem('arcade-moya-v1')"); await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000);
    await sleep(500); await p.shot('01-title');
    const labels = async () => p.eval(`[...document.querySelectorAll('.ans .l')].map(e => e.textContent)`);
    await p.click('[data-act=start]'); ok(await p.until(`moyaTest.state().screen === 'ready'`, 3000), 'Start shows "Think of a character"');
    await p.click('[data-act=go]'); ok(await p.until(`moyaTest.state().screen === 'question'`, 3000), 'the first question appears');
    ok(JSON.stringify(await labels()) === JSON.stringify(['Yes', 'No', 'Probably', 'Maybe', 'Probably not', "I don't know"]), 'six answers, in order: Yes, No, Probably, Maybe, Probably not, I don\'t know');
    await sleep(300); await p.shot('02-question');
    const r = await playAs(p, 'messi');
    ok(r.screen === 'guess' && r.guess === 'messi', `Moya guesses Lionel Messi (${r.guess} after ${r.asked} questions)`);
    await p.shot('03-guess');
    await p.click('[data-act=right]'); ok(await p.until(`moyaTest.state().screen === 'win'`, 3000), 'Yes, that\'s right! shows the win screen');
    await sleep(600); await p.shot('04-win');
    await p.click('[data-act=review]'); await p.until(`moyaTest.state().screen === 'review'`, 3000);
    ok(await p.eval(`document.querySelectorAll('.review li').length === moyaTest.state().asked`), 'My answers lists every question asked');
    const saved = await p.eval("JSON.parse(localStorage.getItem('arcade-moya-v1'))");
    ok(saved.games === 1 && saved.moyaWins === 1, 'the result is saved in the browser');
    ok(p.errors.length === 0, `no console errors (${p.errors.slice(0, 2).join(' | ')})`);
  },

  async keyboard(p) {
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000); await sleep(300);
    await p.key('Enter'); ok(await p.until(`moyaTest.state().screen === 'ready'`, 3000), 'Enter starts');
    await p.key('Enter'); ok(await p.until(`moyaTest.state().screen === 'question'`, 3000), 'Enter again: first question');
    const last = () => p.eval('moyaTest.history().at(-1)?.a');
    await p.key('Digit1'); ok(await p.until(`moyaTest.state().asked === 1`, 3000) && await last() === 'yes', 'key 1 answers Yes'); await settle(p);
    await p.key('KeyN'); ok(await p.until(`moyaTest.state().asked === 2`, 3000) && await last() === 'no', 'key N answers No'); await settle(p);
    await p.key('Digit4'); ok(await p.until(`moyaTest.state().asked === 3`, 3000) && await last() === 'maybe', 'key 4 answers Maybe'); await settle(p);
    await p.key('Digit6'); ok(await p.until(`moyaTest.state().asked === 4`, 3000) && await last() === 'idk', "key 6 answers I don't know"); await settle(p);
    await p.key('Backspace'); ok(await p.until(`moyaTest.state().asked === 3`, 3000), 'Backspace undoes the last answer');
    await sleep(300); await p.key('Escape'); ok(await p.until(`moyaTest.state().overlay === 'pause'`, 3000), 'Esc opens the menu');
    await p.key('Escape'); ok(await p.until(`moyaTest.state().overlay === null`, 3000), 'Esc closes it again');
    await p.key('KeyS'); ok(await p.until(`moyaTest.state().sound === false`, 2000), 'S turns the sound off'); await p.key('KeyS');
    await p.key('Backquote'); ok(await p.until(`location.pathname.endsWith('/index.html') && document.getElementById('gTitle')?.textContent === 'Moya'`, 6000), '` returns to the Arcade with Moya selected');
  },

  async gamepad(p) {
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_PAD });
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000); await p.eval('window.__fake.set({ axes: [0, 0, 0, 0] })'); await sleep(400);
    await press(p, 'A'); ok(await p.until(`moyaTest.state().screen === 'ready'`, 3000), 'A starts');
    ok(await p.until(`!!document.querySelector('.btn.primary .glyph.face.a')`, 3000), 'once the controller is used, buttons show controller glyphs');
    await press(p, 'A'); ok(await p.until(`moyaTest.state().screen === 'question'`, 3000), 'A again: first question');
    ok(await p.eval(`[...document.querySelectorAll('.ans .glyph')].length === 6`), 'each answer shows its controller button');
    const seq = [['A', 'yes'], ['B', 'no'], ['Y', 'probably'], ['R1', 'maybe'], ['X', 'probnot'], ['L1', 'idk']];
    for (const [b] of seq) { const before = (await p.state()).asked; await press(p, b); await p.until(`moyaTest.state().asked === ${before + 1} || moyaTest.state().screen !== 'question'`, 3000); await settle(p); }
    const got = (await p.eval('moyaTest.history()')).map(h => h.a), hist = await p.state();
    ok(JSON.stringify(got) === JSON.stringify(seq.map(x => x[1])), `A B Y R1 X L1 answer Yes, No, Probably, Maybe, Probably not, I don't know (${got.join(', ')})`);
    if (hist.screen === 'question') { await press(p, 'L2'); ok(await p.until(`moyaTest.state().asked === 5`, 3000), 'L2 undoes the last answer'); await settle(p); }
    await press(p, 'START'); ok(await p.until(`moyaTest.state().overlay === 'pause'`, 3000), 'Options opens the menu');
    await press(p, 'DOWN'); await press(p, 'B'); ok(await p.until(`moyaTest.state().overlay === null`, 3000), 'B closes the menu');
    await press(p, 'TOUCH'); ok(await p.until(`!document.querySelector('.ctl-overlay').classList.contains('hidden')`, 3000), 'the touchpad shows the controller diagram');
    await press(p, 'TOUCH'); await press(p, 'HOME');
    ok(await p.until(`location.pathname.endsWith('/index.html')`, 6000), 'the PS / Xbox button returns to the Arcade');
  },

  async teach(p) {
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000); await p.eval("localStorage.removeItem('arcade-moya-v1')"); await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000);
    await p.click('[data-act=start]'); await sleep(300); await p.click('[data-act=go]'); await p.until(`moyaTest.state().screen === 'question'`, 3000);
    // someone Moya does not know: a South African midfielder born before 2000
    const me = { real: 'yes', m: 'yes', f: 'no', alive: 'yes', za: 'yes', africa: 'yes', sport: 'yes', football: 'yes', mid: 'yes', fw: 'no', def: 'no', gk: 'no', coach: 'no', b2000: 'no', b1950: 'no', b1900: 'no', prem: 'no', human: 'yes', talk: 'yes', europe: 'no' };
    const answerFor = q => me[q] || 'idk';
    let st;
    for (let i = 0; i < 120; i++) {
      st = await p.state();
      if (st.screen === 'question') { const b = st.asked; await p.click(`.ans[data-a="${answerFor(st.q)}"]`); await p.until(`moyaTest.state().asked > ${b} || moyaTest.state().screen !== 'question'`, 3000); await sleep(400); }
      else if (st.screen === 'guess') { await p.until('moyaTest.state().revealed', 4000); await p.click('[data-act=wrong]'); await sleep(300); }
      else if (st.screen === 'wrong') { await p.click('[data-act=keep]'); await sleep(450); }
      else break;
    }
    ok(st.screen === 'teach', `after four wrong guesses Moya asks who it was (${st.screen}, ${st.guesses} guesses)`);
    await p.shot('05-teach');
    await p.eval(`document.getElementById('tName').value = 'Teboho Mokoena'; document.getElementById('tDesc').value = 'Bafana Bafana midfielder';`);
    await p.click('#teachForm [type=submit]');
    ok(await p.until(`moyaTest.state().screen === 'taught' && moyaTest.state().taught === 1`, 3000), 'Teach Moya saves the new character');
    await p.shot('06-taught');
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000);
    ok(await p.eval(`document.querySelector('.stats').textContent.includes('1 you taught me')`), 'after a reload the title counts 1 taught character');
    await p.click('[data-act=start]'); await sleep(300); await p.click('[data-act=go]'); await p.until(`moyaTest.state().screen === 'question'`, 3000);
    const tid = await p.eval("JSON.parse(localStorage.getItem('arcade-moya-v1')).taught[0].id");
    for (let i = 0; i < 80; i++) {
      st = await p.state();
      if (st.screen === 'question') { const b = st.asked; await p.click(`.ans[data-a="${answerFor(st.q)}"]`); await p.until(`moyaTest.state().asked > ${b} || moyaTest.state().screen !== 'question'`, 3000); await sleep(400); }
      else if (st.screen === 'guess') { await p.until('moyaTest.state().revealed', 4000); st = await p.state(); if (st.guess === tid) break; await p.click('[data-act=wrong]'); await sleep(300); }
      else if (st.screen === 'wrong') { await p.click('[data-act=keep]'); await sleep(450); }
      else break;
    }
    ok(st.guess === tid, `next game Moya guesses the character it was taught (${st.guess})`);
    // telling Moya a name it already knows shows where the answers disagreed
    await p.click('[data-act=wrong]'); await sleep(300); if ((await p.state()).screen === 'wrong') await p.click('[data-act=tell]');
    await p.until(`moyaTest.state().screen === 'teach'`, 3000);
    await p.eval(`document.getElementById('tName').value = 'mokoena'`); await p.click('#teachForm [type=submit]');
    ok(await p.until(`moyaTest.state().screen === 'taught' && moyaTest.state().taught === 1`, 3000), 'a taught name typed again updates it instead of adding a copy');
    ok(p.errors.length === 0, `no console errors (${p.errors.slice(0, 2).join(' | ')})`);
  },

  async phone(p) {
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.goto(BASE + '/moya.html'); await p.until('!!window.moyaTest', 6000); await sleep(400);
    await p.tap('[data-act=start]'); await p.until(`moyaTest.state().screen === 'ready'`, 3000);
    await p.tap('[data-act=go]'); await p.until(`moyaTest.state().screen === 'question'`, 3000); await sleep(400);
    const L = await p.eval(`(() => { const a = [...document.querySelectorAll('.ans')].map(e => e.getBoundingClientRect()); return { w: innerWidth, sw: document.documentElement.scrollWidth, ok: a.every(b => b.left >= 0 && b.right <= innerWidth && b.height >= 44), n: a.length, hints: document.getElementById('hints').textContent.trim() }; })()`);
    ok(L.n === 6 && L.ok && L.sw <= L.w, `phone: six answer buttons, at least 44 px tall, no sideways scrolling (${JSON.stringify(L)})`);
    ok(L.hints === '' && await p.eval(`!document.querySelector('.ans .glyph, .ans kbd')`), 'phone: no keyboard or controller hints on a touch screen');
    await p.shot('07-phone-question');
    const r = await playAs(p, 'gumball', 'tap');
    const H = await p.eval(`moyaTest.history()`), bad = H.filter(h => (playAs.want || []).find(w => w[0] === h.q)?.[1] !== h.a);
    if (bad.length) console.log('    answers recorded differently from the taps:', JSON.stringify(bad), JSON.stringify(playAs.want));
    ok(r.screen === 'guess' && r.guess === 'gumball', `phone: tapping the answers, Moya guesses Gumball (${r.screen}: ${r.guess} after ${r.asked})`);
    await p.shot('08-phone-guess');
    ok(p.errors.length === 0, `no console errors on a phone (${p.errors.slice(0, 2).join(' | ')})`);
  },
};

if (!CHROME) { console.log('No Chrome or Edge found: pass --chrome <path>'); process.exit(2); }
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'moya-chrome-' + process.pid)}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); up = true; } catch { await sleep(250); } }
if (!up) { console.log('Chrome did not start:', CHROME); process.exit(2); }
console.log(`Chrome: ${CHROME}\nServer: ${BASE}\nScreenshots: ${SHOTS}`);
const t0 = Date.now();
for (const [name, fn] of Object.entries(tests)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  console.log(`\n== ${name}`); const p = await Page.open(); await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  try { await fn(p); } catch (e) { ok(false, `${name} crashed: ${e.message}`); } await p.close();
}
chrome.kill(); console.log(`\n${checks - fails}/${checks} browser checks passed in ${Math.round((Date.now() - t0) / 1000)} s`);
writeFileSync(join(SHOTS, 'results.txt'), log.join('\n') + `\n${checks - fails}/${checks} passed\n`); process.exit(fails ? 1 : 0);
