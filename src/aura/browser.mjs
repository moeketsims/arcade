// Aura Clash browser tests: real Chrome over the DevTools protocol, same approach as src/kart/tests/browser.mjs.
// Start the server (python serve.py), then: node src/velocity/tests/browser.mjs [--chrome path] [--base url] [--only name]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:5186'), ONLY = arg('only', ''), SHOTS = arg('shots', join(tmpdir(), 'aura-shots')); mkdirSync(SHOTS, { recursive: true });
const CHROME = arg('chrome', ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => existsSync(p)));
const PORT = 9800 + Math.floor(Math.random() * 200), sleep = ms => new Promise(r => setTimeout(r, ms));
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
const tests = {
 async aura(p) {
  const base=BASE, a=()=>p.eval('window.auraPreview()'), click=q=>p.eval('document.querySelector('+JSON.stringify(q)+').click()');
  const check=async(expr,msg)=>ok(await p.until(expr,6000),msg);
  await p.goto(base+'/'); await check("[...document.querySelectorAll('.tname')].some(x=>x.textContent==='Aura Clash')",'hub includes Aura Clash');
  ok((await p.eval("document.querySelectorAll('.tile').length"))===8,'all previous tiles plus Aura Clash');
  await click('.tile:nth-child(2)'); await check("window.auraPreview?.().mode==='select'",'hub tile opens Aura Clash');
  ok(await p.eval("document.querySelectorAll('.fighter').length===4 && document.querySelector('#wallet').textContent==='0'"),'four free fighters, no starting purchase needed');
  await p.shot('01-aura-roster');
  await click('[data-fighter="2"]'); ok((await a()).model==='orrin','select another fighter');
  await click('[data-action="shop"]'); await click('[data-action="buy:sun"]'); ok((await a()).wallet.coins===0 && (await a()).wallet.finish==='base','insufficient coins do not unlock cosmetic');
  await click('[data-action="select"]');
  const play=async ()=>{
   await click('[data-action="fight"],[data-action="rematch"]'); await sleep(1020);
   const ss=await a(); ok(ss.mode==='fight'&&ss.hp===118,'match starts with selected fighter health');
   let kheld=new Set(), start=Date.now(), snapped=false;
   const set=async(k,on)=>{if(kheld.has(k)===on)return; await p.key(k,on?'down':'up');if(on)kheld.add(k);else kheld.delete(k)};
   while(Date.now()-start<68000){
    const s=await a();if(s.mode==='result')break;
    const dx=s.cpuX-s.x,dz=s.cpuZ-s.z, dd=Math.hypot(dx,dz);
    await set('KeyD',dx>1.2);await set('KeyA',dx< -1.2);
    await set('KeyW',dz<-.58);await set('KeyS',dz>.58);
    await set('KeyK',dd<2.5);await set('KeyL',dd>2.6);
    if(s.energy>=48&&dd<4.3)await p.key('KeyI');
    if(!snapped&&s.timer<61){await p.shot('03-aura-fight');snapped=true}
    await sleep(60);
   }
   for(const k of [...kheld])await set(k,false);
   await check("window.auraPreview().mode==='result'",'live duel reaches result');
   ok((await a()).wallet.coins>=20,'completed fight earns coins');
   await p.shot('04-aura-result');
  };
  await play();
  if((await a()).wallet.coins<40)await play();
  const w=(await a()).wallet.coins;
  await click('[data-action="shop"]'); await click('[data-action="buy:sun"]');
  let now=await a();ok(now.wallet.coins===w-40&&now.wallet.finish==='sun'&&now.wallet.owns.includes('sun'),'buy and equip with 40 earned coins');
  await p.shot('05-aura-forge');
  await p.goto(base+'/aura.html'); await check("window.auraPreview?.().mode==='select'",'reloaded Aura Clash renders');
  let loaded=await a();ok(loaded.wallet.coins===w-40&&loaded.wallet.finish==='sun'&&loaded.wallet.owns.includes('sun'),'wallet and equipped cosmetic persist after reload');
  await p.key('Home'); await check("location.pathname.endsWith('/index.html') && document.querySelector('#gTitle').textContent==='Aura Clash'",'Home returns to Arcade and selects Aura Clash');
  ok(!p.errors.length,'no console errors in desktop flow '+p.errors.slice(0,2).join(' '));
 },
 async auraTouch(p){
  await p.send('Emulation.setDeviceMetricsOverride',{width:360,height:700,deviceScaleFactor:1,mobile:true});
  await p.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await p.goto(BASE+'/aura.html'); await p.until("window.auraPreview?.().mode==='select'",10000); await p.shot('07-aura-phone-roster');
  await p.eval("document.querySelector('[data-action=fight]').click()");
  const rect=await p.eval(`(()=>{const q=[...document.querySelectorAll('#touch button')].map(e=>{const b=e.getBoundingClientRect();return [b.x,b.y,b.width,b.height]});return {q,w:innerWidth,h:innerHeight,pause:document.querySelector('#pauseBtn').getBoundingClientRect().bottom}})()`);
  ok(rect.q.length===10&&rect.q.every(([x,y,w,h])=>x>=0&&y>=0&&x+w<=rect.w&&y+h<=rect.h&&h>=44),'all 10 touch controls fit on 360 px phone');
  const point=await p.eval("(()=>{const b=document.querySelector('[data-hold=right]').getBoundingClientRect();return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,id:5}})()");
  await sleep(1000);const before=await p.eval('window.auraPreview().x');
  await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await sleep(530);await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  ok(await p.eval('window.auraPreview().x')>before+.5,'emulated touch D-pad moves fighter');
  const g=await p.eval("(()=>{const b=document.querySelector('[data-hold=guard]').getBoundingClientRect();return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2,id:6}})()");
  await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[g]});await sleep(400);
  ok(await p.eval("document.querySelector('#playerCall').textContent==='GUARD'"),'emulated touch guard activates'); await p.shot('08-aura-phone-fight');
  await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  ok(!p.errors.length,'no console errors in phone mode '+p.errors.slice(0,2).join(' '));
  await p.send('Emulation.clearDeviceMetricsOverride');await p.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 },


 async gamepad(p) {
  await p.send('Page.addScriptToEvaluateOnNewDocument',{source:FAKE_PAD});
  await p.goto(BASE+'/aura.html'); await p.until("window.auraPreview?.().mode==='select'",10000);
  const gp=(axes,b=[])=>p.eval('window.__fake.set('+JSON.stringify({axes,buttons:b.reduce((a,i)=>(a[i]=1,a),Array(18).fill(0))})+')');
  await gp([0,0,0,0]); await sleep(200);
  await gp([0,0,0,0],[15]); await sleep(230); await gp([0,0,0,0]);
  ok(await p.eval("window.auraPreview().model==='nyra'"),'standard-controller D-pad selects next fighter');
  await gp([0,0,0,0],[0]); await sleep(210); await gp([0,0,0,0]); await sleep(990);
  const x=await p.eval('window.auraPreview().x'); await gp([.9,0,0,0]); await sleep(420); await gp([0,0,0,0]);
  ok(await p.eval('window.auraPreview().x')>x+.6,'standard-controller A starts and stick moves');
  await gp([0,0,0,0],[4]); await sleep(300);
  ok(await p.eval("document.querySelector('#playerCall').textContent==='GUARD'"),'standard-controller L1 guards');
  await gp([0,0,0,0],[16]); ok(await p.until("document.querySelector('#gTitle')?.textContent==='Aura Clash'",5000),'standard-controller Home returns to hub');
 },
 async otherGames(p) {
  for(const [route,check] of [['starbolt.html','canvas'],['football.html','canvas'],['royale.html?quick=1','canvas'],['frontline.html?mode=range','canvas'],['kart.html','.k-logo'],['velocity.html','.vd-logo']]){
   await p.goto(BASE+'/'+route); await sleep(1400); const good=await p.until('!!document.querySelector('+JSON.stringify(check)+')',6500);
   ok(good&&!p.errors.length,route+' loads without console errors '+p.errors.slice(0,2).join(' '));
  }
 },

};

if (!CHROME) { console.log('No Chrome or Edge found: pass --chrome <path>'); process.exit(2); }
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'aura-chrome-' + process.pid)}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
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
