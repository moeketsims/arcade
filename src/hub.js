// Arcade home screen: pick a game with the D-pad / left stick, A to play. Touchpad opens the live controller test.
import { Pad } from './common/pad.js?v=velocity-divide-1';
import { ControllerOverlay } from './common/overlay.js';
import { Sfx } from './common/sfx.js';

const $ = id => document.getElementById(id);
const GAMES = [
  { id: 'starbolt', page: 'starbolt.html', title: 'Starbolt', genre: '3D platformer', c1: '#46f0ff', c2: '#1d3a8a',
    desc: 'A tiny robot explores five worlds from a floating mothership, rescues lost bots and takes on the Void Titan.',
    feat: ['Hub + 5 worlds + 3-phase boss', 'Rocket Pack, Magnet Glove, Time Slow', '25 bots to rescue, hidden coins'],
    icon: `<circle cx="100" cy="92" r="46" fill="#f4f6fb"/><path d="M62 90a38 30 0 0 1 76 0v8H62z" fill="#0d1424"/><rect x="78" y="86" width="12" height="18" rx="6" fill="#46f0ff"/><rect x="110" y="86" width="12" height="18" rx="6" fill="#46f0ff"/><line x1="100" y1="46" x2="100" y2="30" stroke="#c9d1de" stroke-width="4"/><circle cx="100" cy="27" r="7" fill="#ff8a2b"/><rect x="72" y="138" width="56" height="36" rx="18" fill="#f4f6fb"/>` },
  { id: 'aura', page: 'aura.html', title: 'Aura Clash', genre: '3D arena fighter', c1: '#ffb965', c2: '#253166',
    desc: 'Four rivals meet on a cliffside court. Dash past attacks, guard, and bring your signature move to the duel.',
    feat: ['Four free fighters and distinct special moves', 'One-on-one CPU duels, keyboard, controller and touch', 'Earn arcade coins for optional cosmetic finishes'],
    icon: `<rect width="200" height="200" fill="#222b54"/><circle cx="100" cy="87" r="65" fill="#e9a34f"/><path d="M0 155 64 98l40 56 48-59 48 61v44H0Z" fill="#323460"/><path d="M100 26 113 68 149 84 113 99 99 141 87 99 50 85 87 69Z" fill="#fff0bc"/><path d="m100 47 9 30 21 9-21 8-9 28-9-28-22-8 22-9Z" fill="#fa8a54"/><path d="m48 152 104 0M65 166h70" stroke="#78ead8" stroke-width="4" opacity=".6"/>` },
  { id: 'football', page: 'football.html', title: 'Golazo Football', genre: 'Football', c1: '#5be37a', c2: '#0b4a24',
    desc: '11-a-side 3D football in a floodlit stadium. Pass, shoot, curl it with the stick, chip the keeper or try a bicycle kick — then take over in goal.',
    feat: ['X pass · B shoot · A long ball / bicycle kick', 'Y finesse, chip, power shot, rainbow flick, flick-over, volley, header, chest', 'Penalties and free kicks · keeper saves with X / Y / B'],
    icon: `<rect width="200" height="200" fill="#1e7a3a"/><g stroke="#ffffff88" stroke-width="3" fill="none"><rect x="14" y="40" width="172" height="120"/><line x1="100" y1="40" x2="100" y2="160"/><circle cx="100" cy="100" r="22"/></g><circle cx="128" cy="118" r="26" fill="#fff"/><path d="M128 102l10 7-4 12h-12l-4-12z" fill="#222"/><path d="M110 116l8-3M146 116l-8-3M120 136l4-6M136 136l-4-6M128 92v10" stroke="#222" stroke-width="3"/>` },
  { id: 'royale', page: 'royale.html', title: 'Storm Royale', genre: 'Battle royale shooter', c1: '#c77dff', c2: '#2a0b4a',
    desc: 'Jump from the battle bus, glide to an island, loot weapons from chests, build walls and ramps, and be the last one standing as the storm closes in.',
    feat: ['Assault rifles, shotguns, SMGs, snipers, launchers, bows, knives', 'Building: walls, floors, ramps, roofs', 'Storm circle, 30 opponents, Victory screen'],
    icon: `<circle cx="100" cy="100" r="90" fill="#3b1866"/><circle cx="100" cy="100" r="62" fill="none" stroke="#c77dff" stroke-width="10" stroke-dasharray="14 10"/><path d="M60 64h80l-10 22H70z" fill="#4cc9f0"/><path d="M100 86v46" stroke="#fff" stroke-width="4"/><circle cx="100" cy="140" r="12" fill="#ffd166"/>` },
  { id: 'frontline', page: 'frontline.html', title: 'Frontline Ops', genre: 'First-person shooter', c1: '#ff6b4a', c2: '#1b1d22',
    desc: 'Fast first-person combat against robot squads. Build a loadout, slide-cancel around corners, aim down sights and call in scorestreaks.',
    feat: ['ARs, SMGs, LMGs, snipers, shotguns, pistols, launchers', 'Combat knife, karambit, butterfly knife, machete, throwing knives', 'Tactical sprint, slide, slide-cancel, prone, mantle'],
    icon: `<rect width="200" height="200" fill="#22252c"/><circle cx="100" cy="100" r="54" fill="none" stroke="#ff6b4a" stroke-width="6"/><circle cx="100" cy="100" r="6" fill="#ff6b4a"/><path d="M100 30v40M100 130v40M30 100h40M130 100h40" stroke="#ff6b4a" stroke-width="6"/>` },
  { id: 'kart', page: 'kart.html', title: 'Sparkplug GP', genre: 'Kart racing', c1: '#ffb020', c2: '#5a1fa8',
    desc: 'Arcade kart racing on six handmade tracks. Drift to charge boosts, grab item crystals, and race seven CPU rivals for the Grand Cup.',
    feat: ['Grand Prix cups, single races, time trial with ghosts', '8 racers, 4 karts, drift boosts, ramps and tricks', 'Items: pucks, wasps, goo, shields, thunderheads · replays'],
    icon: `<rect width="200" height="200" fill="#3b1a7a"/><path d="M0 150 C60 120 140 120 200 150 V200 H0z" fill="#2c2f3d"/><path d="M0 162 C60 134 140 134 200 162" stroke="#fff" stroke-width="3" stroke-dasharray="14 10" fill="none"/><rect x="58" y="96" width="84" height="30" rx="12" fill="#ff5a1f"/><path d="M70 96l12-20h34l12 20z" fill="#ffd23f"/><circle cx="100" cy="72" r="15" fill="#ff7a2f"/><circle cx="94" cy="70" r="3" fill="#1a1d26"/><circle cx="106" cy="70" r="3" fill="#1a1d26"/><circle cx="72" cy="128" r="14" fill="#16181d"/><circle cx="128" cy="128" r="14" fill="#16181d"/><circle cx="72" cy="128" r="6" fill="#ffd23f"/><circle cx="128" cy="128" r="6" fill="#ffd23f"/><g fill="#4fe3ff"><circle cx="40" cy="134" r="4"/><circle cx="30" cy="124" r="3"/><circle cx="46" cy="120" r="2.5"/></g><g fill="#c45bff"><circle cx="160" cy="134" r="4"/><circle cx="170" cy="122" r="3"/></g>` },
  { id: 'velocity', page: 'velocity.html', title: 'Velocity Divide', genre: '3D action adventure', c1: '#ffc94a', c2: '#3b1c6e',
    desc: 'A sky city split in two. Run, glide and stomp through nine compact missions as the Dawnline Couriers or the Umbra Circuit, then face what the Divide woke up.',
    feat: ['Six playable characters: a runner, a seeker and a mech on each side', 'Homing dashes, gliding and digging, lock-on volleys', 'Shortcuts, checkpoints, three bosses, ranks and saved progress'],
    icon: `<rect width="200" height="200" fill="#1c1238"/><path d="M0 0H200L0 200z" fill="#ffc94a" opacity=".92"/><path d="M96 20l22 60-30 14 26 86-52-96 30-12z" fill="#fff"/><circle cx="54" cy="58" r="16" fill="#2f9bff"/><circle cx="150" cy="146" r="16" fill="#b06cff"/><path d="M20 96h44M136 108h44" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>` },
  { id: 'test', page: null, title: 'Controller Test', genre: 'System', c1: '#9fb0d8', c2: '#1b2233',
    desc: 'Check every button, both joysticks, the triggers and the D-pad. Everything lights up live, and A makes the controller rumble.',
    feat: ['Works with PS5 DualSense, Xbox and USB pads', 'Shows stick and trigger values', 'Keyboard fallback for every game'],
    icon: `<path d="M40 80c0-14 14-20 34-18h52c20-2 34 4 34 18l14 60c4 22-16 32-30 18l-22-24H78l-22 24c-14 14-34 4-30-18z" fill="#2b3550" stroke="#9fb0d8" stroke-width="4"/><circle cx="72" cy="104" r="12" fill="#9fb0d8"/><circle cx="140" cy="94" r="7" fill="#f2b705"/><circle cx="128" cy="106" r="7" fill="#2f7de1"/><circle cx="152" cy="106" r="7" fill="#e5383b"/><circle cx="140" cy="118" r="7" fill="#2fbf4f"/>` },
];

const pad = new Pad({ keymap: { A: ['Enter', 'Space'], B: ['Backspace'], LEFT: ['ArrowLeft', 'KeyA'], RIGHT: ['ArrowRight', 'KeyD'], TOUCH: ['KeyT'] }, touch: false, touchLook: false });   // touch: tap a tile; the on-screen pad shows only in the controller test
const sfx = new Sfx();
const overlay = new ControllerOverlay({ title: 'Controller test', pad, note: 'Press A to test rumble',
  map: { A: 'A button', B: 'B button', X: 'X button', Y: 'Y button', L1: 'Left bumper', R1: 'Right bumper', L2: 'Left trigger (analog)', R2: 'Right trigger (analog)', UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', LS: 'Left joystick', RS: 'Right joystick', L3: 'Left stick click', R3: 'Right stick click', SELECT: 'Create / View', START: 'Options / Menu', TOUCH: 'Touchpad click', HOME: 'PS / Xbox button' } });

let sel = Math.max(0, GAMES.findIndex(g => g.id === (new URLSearchParams(location.search).get('from') || localStorage.getItem('arcade-last') || 'starbolt')));
let stickWait = 0, stickRepeat = false, lastT = 0, launching = false, lastSig = '';
$('nojs')?.remove();   // the scripts run, so the "start the server" help is not needed
const row = $('row');
GAMES.forEach((g, i) => {
  const t = document.createElement('div'); t.className = 'tile';
  t.style.background = `linear-gradient(140deg, ${g.c1}, ${g.c2})`;
  t.innerHTML = `<svg viewBox="0 0 200 200">${g.icon}</svg><div class="tlabel"><div class="tname">${g.title}</div><div class="tgenre">${g.genre}</div></div>`;
  // mouse: hovering shows the game's details, one click opens it
  t.onmouseenter = () => { if (!pad.touch && sel !== i) { sel = i; render(); } };
  // touch: the first tap shows the game's details, a second tap (or Play) opens it
  t.onclick = () => { if (pad.touch && sel !== i) { sel = i; sfx.init(); sfx.play('ui'); render(); return; } sel = i; render(); launch(); };
  row.appendChild(t);
});
$('play').onclick = () => launch();

function render() {
  [...row.children].forEach((t, i) => t.classList.toggle('sel', i === sel));
  const g = GAMES[sel];
  $('gGenre').textContent = g.genre; $('gTitle').textContent = g.title; $('gDesc').textContent = g.desc;
  $('gFeat').innerHTML = g.feat.map(f => `<li>${f}</li>`).join('');
  $('play').textContent = g.page ? 'Play' : 'Open';
  $('gHint').innerHTML = `${pad.glyph('A')} ${g.page ? 'Play' : 'Open'}`;
  if (pad.touch) { $('gHint').textContent = ''; $('foot').innerHTML = `<span>Tap a game to see it, tap again or Play to start</span><span>In any game: <b>HOME</b> comes back here · <b>HELP</b> shows its controls · <b>MENU</b> pauses</span>`; }
  else $('foot').innerHTML = `<span>${pad.glyph('LEFT')}${pad.glyph('RIGHT')} or left stick: choose</span><span>${pad.glyph('A')} play</span><span>${pad.glyph('TOUCH')} controller test</span><span>In any game: ${pad.glyph('HOME')} / <kbd>\`</kbd> comes back here · ${pad.glyph('TOUCH')} / <kbd>Tab</kbd> shows its controls</span>`;
  bgColors = [g.c1, g.c2];
}

function launch() {
  if (launching) return;
  const g = GAMES[sel]; sfx.init(); sfx.play('start'); pad.rumble(0.4, 0.6, 180);
  if (!g.page) { overlay.show(); pad.showTouch(true); $('testpanel').classList.remove('hidden'); return; }
  launching = true; localStorage.setItem('arcade-last', g.id);
  document.body.classList.add('leaving'); setTimeout(() => { location.href = g.page; }, 300);
}

// animated background: soft glows in the selected game's colours
const cv = $('bg'), cx = cv.getContext('2d'); let bgColors = ['#46f0ff', '#1d3a8a'];
const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 3, s: 0.02 + Math.random() * 0.05 }));
function drawBg(t) {
  const w = cv.width = innerWidth, h = cv.height = innerHeight;
  const g = cx.createRadialGradient(w * 0.75, h * 0.35, 50, w * 0.6, h * 0.5, Math.max(w, h) * 0.9);
  g.addColorStop(0, bgColors[0] + '66'); g.addColorStop(0.45, bgColors[1] + 'aa'); g.addColorStop(1, '#05070f');
  cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  cx.fillStyle = '#ffffff';
  for (const d of dots) { d.y -= d.s * 0.004; if (d.y < -0.02) d.y = 1.02; cx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 900 + d.x * 10); cx.beginPath(); cx.arc(d.x * w, d.y * h, d.r, 0, 7); cx.fill(); }
  cx.globalAlpha = 1;
}

function loop(t) {
  pad.update();
  if (overlay.visible) {
    overlay.update();
    $('testpanel').textContent = `left stick  x ${pad.lx.toFixed(2)}  y ${pad.ly.toFixed(2)}     right stick  x ${pad.rx.toFixed(2)}  y ${pad.ry.toFixed(2)}     L2 ${pad.l2v.toFixed(2)}  R2 ${pad.r2v.toFixed(2)}\n${pad.connected ? pad.id.slice(0, 90) : 'no controller detected — press any button on it to wake it up'}`;
    if (pad.pressed('A')) { pad.rumble(1, 1, 400); sfx.init(); sfx.play('select'); }
    if (pad.pressed('TOUCH') || pad.pressed('B') || pad.pressed('START') || pad.pressed('HOME')) { overlay.hide(); pad.showTouch(false); $('testpanel').classList.add('hidden'); sfx.play('back'); }
  } else {
    let dx = 0;
    if (pad.pressed('LEFT')) dx = -1; if (pad.pressed('RIGHT')) dx = 1;
    // left stick: one step per push; holding it repeats after a short pause
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
    if (Math.abs(pad.lx) > 0.6) { stickWait -= dt; if (stickWait <= 0) { dx = Math.sign(pad.lx); stickWait = stickRepeat ? 0.2 : 0.45; stickRepeat = true; } }
    else { stickWait = 0; stickRepeat = false; }
    if (dx) { sel = (sel + dx + GAMES.length) % GAMES.length; sfx.init(); sfx.play('ui'); render(); }
    if (pad.pressed('A')) launch();
    if (pad.pressed('TOUCH')) { sel = GAMES.length - 1; render(); launch(); }
  }
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('padstate').textContent = pad.touch ? '👆 Touch' : pad.connected ? `🎮 ${pad.kind === 'playstation' ? 'DualSense' : pad.kind === 'xbox' ? 'Xbox controller' : 'Controller'}` : '⌨️ Keyboard';
  const sig = `${pad.connected}|${pad.usingPad}|${pad.kind}`; if (sig !== lastSig) { lastSig = sig; render(); }
  drawBg(t);
  requestAnimationFrame(loop);
}
// Coming back with the browser's Back button restores this page mid-launch: make it usable again.
addEventListener('pageshow', () => { launching = false; document.body.classList.remove('leaving'); });
render(); requestAnimationFrame(loop);
