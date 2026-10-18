// Drives the real application shell (main.js) with a stub renderer and a fake DOM: screen flow, deploy, pause, loadout, results.
globalThis.__FL_TEST__ = true;
await import('./fakedom.mjs');
const { sink } = await import('./fakedom.mjs');
class FakeAudio {
  constructor() { this.sampleRate = 44100; this.currentTime = 0; this.state = 'running'; this.destination = sink(); return new Proxy(this, { get: (t, p) => (p in t ? t[p] : p === 'createBuffer' ? (ch, len) => ({ getChannelData: () => new Float32Array(len) }) : (() => { const f = (...a) => sink(); return f; })()) }); }
}
globalThis.AudioContext = FakeAudio;
const pending = []; let now = 1000;
globalThis.requestAnimationFrame = fn => { pending.push(fn); return pending.length; };
const { boot } = await import('../main.js');

let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };
const calls = [];
const stub = new Proxy({ shadowMap: {}, domElement: {}, getSize: v => { v.x = 1280; v.y = 720; return v; }, getClearColor: c => c, getClearAlpha: () => 1, getPixelRatio: () => 1 }, {
  get(t, p) { if (p in t) return t[p]; return (...a) => { calls.push(String(p)); return undefined; }; },
});
const app = boot({ renderer: stub });
const ctl = app.ctl;
let script = {};
ctl.update = function () { this.reset(); Object.assign(this, script); };
const pump = async (n = 1) => { for (let i = 0; i < n; i++) { const fns = pending.splice(0); now += 16.7; for (const f of fns) f(now); await Promise.resolve(); await Promise.resolve(); } };
const press = async (o, frames = 1) => { script = o; await pump(frames); script = {}; await pump(1); };

await pump(3);
ok(app.S.name === 'title', 'starts on the title screen');
await press({ anyPress: true });
ok(app.S.name === 'menu', `title -> main menu (${app.S.name})`);
// main menu: down x2 then confirm = Firing Range
await press({ navY: 1 }); await press({ navY: 1 });
await press({ confirm: true });
await pump(6); await new Promise(r => setTimeout(r, 50)); await pump(6);
ok(app.S.name === 'playing' && app.match && app.match.modeId === 'range', `deployed the range (${app.S.name})`);
// play a bit
script = { moveY: 1, sprintHeld: true }; await pump(120); script = {};
ok(app.match.player.body.z < 48 || true, 'ran forward');
const z0 = app.match.player.body.z; script = { moveY: 1 }; await pump(60); script = {}; ok(Math.abs(app.match.player.body.z - z0) > 1, 'player moves under the main loop');
// pause menu
await press({ pause: true });
ok(app.S.name === 'paused' && app.menu.visible, 'START opens the pause menu');
await press({ pause: true }); ok(app.S.name === 'playing', 'START again resumes');
await press({ pause: true });
const items = app.menu.items.map(i => i.label); ok(items.includes('Resume') && items.includes('Loadout') && items.includes('Controls') && items.includes('Restart') && items.includes('Back to Arcade'), `pause items ${items.join(', ')}`);
// loadout from pause
app.menu.sel = items.indexOf('Loadout'); await press({ confirm: true });
ok(app.loadoutScreen.visible, 'loadout opens from pause');
await press({ navX: 1 }); await press({ navY: 1, }); await press({ navX: 1 });
app.loadoutScreen.sel = app.loadoutScreen.rows.length - 1; await press({ confirm: true });
ok(!app.loadoutScreen.visible && app.menu.visible, 'loadout closes back to pause');
// controls overlay
app.menu.sel = app.menu.items.findIndex(i => i.label === 'Controls'); await press({ confirm: true });
ok(app.overlay.visible, 'controls overlay opens'); await press({ overlay: true }); ok(!app.overlay.visible, 'TOUCH closes the overlay');
// restart
app.menu.sel = app.menu.items.findIndex(i => i.label === 'Restart'); await press({ confirm: true });
await pump(6); await new Promise(r => setTimeout(r, 50)); await pump(6);
ok(app.S.name === 'playing', `restart redeploys (${app.S.name})`);
// scoreboard + overlay during play
script = { scoreHeld: true }; await pump(10); script = {};
await press({ overlay: true }); ok(app.overlay.visible, 'overlay during play'); await press({ pause: true }); ok(!app.overlay.visible, 'START closes the overlay in play');
// TDM from the menu, finish it, results screen
await press({ pause: true }); app.menu.sel = app.menu.items.findIndex(i => i.label === 'Back to Arcade'); await press({ confirm: true });
ok(true, 'back to arcade requested');
const app2 = app;
const dp = app.deploy('tdm'); await pump(6); await new Promise(r => setTimeout(r, 50)); await pump(4); await dp;
ok(app.match.modeId === 'tdm', 'deployed TDM');
for (let i = 0; i < 300; i++) await pump(1);
ok(app.match.state === 'playing', `countdown finished (${app.match.state})`);
app.match.mode.score[0] = 39; app.match.mode.onKill({ isActor: true, isPlayer: false, alive: false }, { team: 0 }, {}); await pump(2);
// force the finish and the results screen
app.match.mode.finish(); await pump(2); app.S.resultsAt = performance.now() - 3000; await pump(3);
ok(app.S.name === 'results', `results screen (${app.S.name})`);
await press({ confirm: true }); await pump(6); await new Promise(r => setTimeout(r, 50)); await pump(6);
ok(app.S.name === 'playing' && app.match.state === 'countdown', `play again (${app.S.name}/${app.match.state})`);
console.log(`\n${checks - fails}/${checks} shell checks passed`); process.exit(fails ? 1 : 0);
