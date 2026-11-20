// Sparkplug GP: application shell. Renderer, input, menus (title, modes, class, racer, kart, cup/track), the race
// loop (fixed 60 Hz simulation), results, cup standings, replays, time-trial ghosts, pause and options.
import * as THREE from 'three';
import { Pad, goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { RACERS, KARTS, CLASSES, TRACKS, CUPS, POINTS, ITEMS, WEIGHT_STATS, kartStats } from './data.js';
import { Race, DT, NO_INPUT } from './sim.js';
import { View } from './view.js';
import { makeKart } from './models.js';
import { Hud, icon, fmt, ord } from './hud.js';
import { KartAudio } from './audio.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const readJSON = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return { ...d }; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
const SETTINGS_KEY = 'sparkplug-settings', RECORDS_KEY = 'sparkplug-records', SETUP_KEY = 'sparkplug-setup';

// ---- setup ---------------------------------------------------------------------------------------------------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const coarse = matchMedia('(pointer: coarse)').matches;
const settings = readJSON(SETTINGS_KEY, { autoGas: 'touch', music: 0.8, sfx: 1, shake: true, map: true, ranks: true, quality: coarse ? 'low' : 'high' });
let records = readJSON(RECORDS_KEY, { tt: {}, cups: {} });
const setup = readJSON(SETUP_KEY, { mode: 'gp', cls: 1, racer: 0, kart: 0, cup: 0, track: 0 });

const pad = new Pad({
  keymap: { A: ['Enter'], B: ['Backspace'], X: ['KeyQ'], L1: ['KeyE', 'KeyJ', 'ControlLeft'], R1: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyK'], SELECT: ['KeyM'], R3: ['KeyV'] },
  moveKeys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] },
  lookKeys: { up: [], down: [], left: [], right: [] }, touchLook: false,
});
const overlay = new ControllerOverlay({
  title: 'Sparkplug GP: controls', pad, note: 'Hold <b>drift</b> while steering to hop into a drift; let go when the sparks turn blue, orange or violet for a boost',
  map: {
    A: 'Accelerate', B: 'Brake · reverse', X: 'Use item (hold to trail it behind you)', Y: 'Drift (same as R1)', L1: 'Use item (hold to trail)', R1: 'Hop · drift · trick off ramps',
    L2: 'Brake · reverse (analog)', R2: 'Accelerate (analog)', LS: 'Steer · push ↑ to throw ahead, ↓ to fire behind', RS: 'Push ↓ to look behind', L3: 'Not used', R3: 'Look behind',
    UP: 'Throw item ahead (hold while firing)', DOWN: 'Fire item behind (hold while firing)', LEFT: 'Steer left', RIGHT: 'Steer right',
    SELECT: 'Minimap on / off', START: 'Pause', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
  },
  keys: { A: 'W / ↑ / Enter', B: 'S / ↓ / Backspace', X: 'Q (fires behind)', L1: 'E / J / Ctrl', R1: 'Space / Shift / K', LS: 'A D / ← →', R3: 'C / V', RS: 'C / V (look behind)', SELECT: 'M', START: 'Esc', TOUCH: 'Tab', HOME: '`' },
});
const audio = new KartAudio();
const view = new View(renderer);
view.lowSpec = settings.quality === 'low';
const hud = new Hud($('hud'));
const menuEl = $('menu');
const fpsTest = Q.get('fps') === '1';

// ---- state -----------------------------------------------------------------------------------------------------------
const S = {
  name: 'title', race: null, gp: null, paused: false, acc: 0, lastT: performance.now(), time: 0,
  replay: null, ghost: null, ghostRec: null, attract: null, menuStack: [], menu: null, sel: 0, resultsShown: false,
  camLook: false, introT: 0, finishedAt: 0,
};
window.__kart = { S, pad, settings, readInput: () => readInput() };   // for the browser tests

function resize() {
  const pr = Math.min(window.devicePixelRatio || 1, settings.quality === 'low' ? 1 : 1.5);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  view.camera.aspect = innerWidth / innerHeight; view.camera.updateProjectionMatrix();
  show.camera.aspect = 1; show.camera.updateProjectionMatrix();
}

// ---- showroom (racer/kart preview on the select screens) ---------------------------------------------------------------
const show = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(32, 1, 0.1, 100), kart: null, key: '' };
show.scene.add(new THREE.HemisphereLight('#ffffff', '#667', 2.6));
const sl = new THREE.DirectionalLight('#fff', 3); sl.position.set(4, 8, 6); show.scene.add(sl);
const sl2 = new THREE.DirectionalLight('#9fd3ff', 1.6); sl2.position.set(-5, 3, -4); show.scene.add(sl2);
const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.25, 40), new THREE.MeshStandardMaterial({ color: '#2a3150', metalness: 0.4, roughness: 0.4, emissive: '#33e0ff', emissiveIntensity: 0.08 }));
ring.position.y = -0.13; show.scene.add(ring);
show.camera.position.set(0, 2.6, 8.4); show.camera.lookAt(0, 0.9, 0);
function showKart(ri, ki) {
  const key = ri + '|' + ki; if (show.key === key) return; show.key = key;
  if (show.kart) show.scene.remove(show.kart);
  show.kart = makeKart(RACERS[ri], KARTS[ki]); show.scene.add(show.kart);
}

// ---- input -------------------------------------------------------------------------------------------------------------
const keyDown = (...codes) => codes.some(c => pad.keys.has(c));
function autoGasOn() { return settings.autoGas === 'on' || (settings.autoGas === 'touch' && pad.touch); }
function readInput() {
  const kb = !pad.gp;
  let steer = kb && !pad.touch ? (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0) : pad.lx;   // keys: full lock, not a diagonal
  if (pad.down('LEFT')) steer = -1; if (pad.down('RIGHT')) steer = 1;
  const kbUp = kb && keyDown('KeyW', 'ArrowUp'), kbDown = kb && keyDown('KeyS', 'ArrowDown');
  let accel = Math.max(pad.down('A') ? 1 : 0, pad.r2v, kbUp ? 1 : 0, autoGasOn() ? 1 : 0);
  const brake = Math.max(pad.down('B') ? 1 : 0, pad.l2v, kbDown ? 1 : 0);
  if (brake > 0.3 && autoGasOn() && !pad.down('A') && pad.r2v < 0.3 && !kbUp) accel = 0;
  const drift = pad.down('R1') || pad.down('Y');
  const item = pad.down('L1') || pad.down('X');
  const stickY = kb ? 0 : pad.ly;
  const itemBack = pad.down('DOWN') || stickY < -0.5 || (kb && keyDown('KeyQ'));
  const itemFwd = pad.down('UP') || stickY > 0.5;
  const lookBack = pad.down('R3') || pad.ry > 0.6 || (kb && keyDown('KeyC', 'KeyV'));
  return { steer, accel, brake, drift, item, itemBack, itemFwd, lookBack };
}
// touch: relabel the on-screen buttons for racing
const TOUCH_LABELS = { A: 'GAS', B: 'BRAKE', X: 'ITEM', Y: 'DRIFT', L1: 'ITEM', R1: 'DRIFT', L2: 'BRAKE', R2: 'GAS', R3: 'LOOK', UP: '▲', DOWN: '▼' };
function relabelTouch() {
  const btns = document.querySelectorAll('.tc [data-b]'); if (!btns.length || relabelTouch.done) return;
  btns.forEach(b => { const l = TOUCH_LABELS[b.dataset.b]; if (l && b.textContent !== l) { b.textContent = l; b.classList.add('k-lbl'); } });
  relabelTouch.done = true;
}

// ---- menus ---------------------------------------------------------------------------------------------------------------
// A page: { id, title, sub, items: [{ label, sub, value, act, disabled, card }], grid: columns, preview: fn(sel) }
function openPage(page, push = true) {
  if (push && S.menu) S.menuStack.push({ page: S.menu, sel: S.sel });
  S.menu = page; S.sel = page.start ?? Math.max(0, page.items.findIndex(i => !i.disabled)); S.name = 'menu';
  renderMenu(); menuEl.classList.remove('hidden');
}
function back() {
  if (S.menu?.noBack) return;
  if (S.menuStack.length) { const p = S.menuStack.pop(); S.menu = p.page; S.sel = p.sel; renderMenu(); audio.play('back'); }
  else if (S.menu?.id !== 'main') { openPage(mainPage(), false); audio.play('back'); }
}
function renderMenu() {
  const p = S.menu; if (!p) return;
  const isGrid = !!p.grid;
  menuEl.className = 'k-screen' + (p.preview ? ' with-preview' : '') + (p.cls ? ' ' + p.cls : '');
  menuEl.innerHTML = `
    <div class="k-head">${p.logo ? '<div class="k-logo">SPARKPLUG<span>GP</span></div>' : `<h2>${p.title}</h2>`}${p.sub ? `<p class="k-sub">${p.sub}</p>` : ''}</div>
    <div class="k-body">
      <div class="k-list ${isGrid ? 'grid' : ''}" style="${isGrid ? `--cols:${p.grid}` : ''}">${p.items.map((it, i) => `<div class="k-it ${i === S.sel ? 'sel' : ''} ${it.disabled ? 'dis' : ''} ${it.card ? 'card' : ''}" data-i="${i}">${it.card || `<span class="lbl">${it.label}</span>${it.value !== undefined ? `<b class="val">${it.value}</b>` : ''}${it.sub ? `<small>${it.sub}</small>` : ''}`}</div>`).join('')}</div>
      ${p.preview ? `<div class="k-preview"><div class="k-pv-stage"></div><div class="k-pv-info" id="pvInfo"></div></div>` : ''}
      ${p.extra ? `<div class="k-extra">${p.extra}</div>` : ''}
    </div>
    <div class="k-foot">${p.foot || footHint()}</div>`;
  menuEl.querySelectorAll('.k-it').forEach(el => {
    const i = +el.dataset.i;
    el.onclick = () => { if (S.sel !== i && (pad.touch || p.items[i].card)) { S.sel = i; audio.init(); audio.play('ui'); renderMenu(); if (!pad.touch) choose(); return; } S.sel = i; choose(); };
    el.onmouseenter = () => { if (!pad.touch && S.sel !== i && !p.items[i].disabled) { S.sel = i; highlight(); } };
  });
  highlight();
}
function highlight() {
  menuEl.querySelectorAll('.k-it').forEach((el, i) => el.classList.toggle('sel', i === S.sel));
  const p = S.menu; if (p.preview) { const info = p.preview(S.sel); const el = $('pvInfo'); if (el) el.innerHTML = info || ''; }
  menuEl.querySelector('.k-it.sel')?.scrollIntoView?.({ block: 'nearest' });
}
function footHint() {
  if (pad.touch) return 'Tap to choose · tap again to confirm · <b>MENU</b> back';
  return `${pad.glyph('A')} choose &nbsp; ${pad.glyph('B')} back &nbsp; ${pad.glyph('TOUCH')} controls &nbsp; ${pad.glyph('HOME')} Arcade`;
}
function choose() {
  const it = S.menu.items[S.sel]; if (!it || it.disabled) { audio.play('back'); return; }
  audio.init(); audio.play('select'); it.act?.();
}
function menuNav(dt) {
  const p = S.menu; if (!p) return;
  let dx = 0, dy = 0;
  if (pad.pressed('UP')) dy = -1; if (pad.pressed('DOWN')) dy = 1; if (pad.pressed('LEFT')) dx = -1; if (pad.pressed('RIGHT')) dx = 1;
  // stick (and WASD / arrows): one step per push, repeating while held
  const sx = Math.abs(pad.lx) > 0.6 ? Math.sign(pad.lx) : 0, sy = Math.abs(pad.ly) > 0.6 ? -Math.sign(pad.ly) : 0;
  if (sx || sy) { S.navT = (S.navT ?? 0) - dt; if (S.navT <= 0) { dx = dx || sx; dy = dy || sy; S.navT = S.navHeld ? 0.16 : 0.4; S.navHeld = true; } } else { S.navT = 0; S.navHeld = false; }
  const n = p.items.length, cols = p.grid || 1;
  if (dx || dy) {
    const it = p.items[S.sel];
    if (!p.grid && dx && it?.adjust) { it.adjust(dx); audio.play('ui'); return; }
    let s = S.sel;
    for (let tries = 0; tries < n; tries++) {
      if (p.grid) { if (dx) s = (s + dx + n) % n; else s = (s + dy * cols + n) % n; }
      else s = (s + (dy || dx) + n) % n;
      if (!p.items[s].disabled) break;
    }
    if (s !== S.sel) { S.sel = s; audio.play('ui'); highlight(); }
  }
  if (pad.pressed('A') || (!pad.gp && pad.pressed('R1') && pad.keys.has('Space'))) choose();
  else if (pad.pressed('B') || pad.pressed('START')) back();
}

const statBars = st => ['speed', 'accel', 'handling', 'weight'].map(k => `<div class="k-stat"><span>${{ speed: 'Speed', accel: 'Accel', handling: 'Handling', weight: 'Weight' }[k]}</span><i style="--v:${st[k] / 6}"></i></div>`).join('') + (st.offroad ? '<div class="k-tag">Off-road grip</div>' : '');

function titlePage() {
  return { id: 'title', logo: true, sub: 'Drift, boost and bump your way to the Grand Cup.', cls: 'title', foot: pad.touch ? 'Tap <b>Start</b>' : `Press ${pad.glyph('A')} to start`,
    items: [{ label: 'Start', act: () => openPage(mainPage(), false) }] };
}
function mainPage() {
  return { id: 'main', logo: true, cls: 'main', items: [
    { label: 'Grand Prix', sub: 'Three or six races, points for every finish, a trophy at the end', act: () => { setup.mode = 'gp'; openPage(classPage()); } },
    { label: 'Single Race', sub: 'Any track against seven CPU racers', act: () => { setup.mode = 'vs'; openPage(classPage()); } },
    { label: 'Time Trial', sub: 'Race the clock and your own ghost. Three Turbo Cans, no rivals.', act: () => { setup.mode = 'tt'; setup.cls = 1; openPage(racerPage()); } },
    { label: 'Options', sub: 'Auto-accelerate, sound, camera, graphics', act: () => openPage(optionsPage()) },
    { label: 'How to play', sub: 'Controls, drifting, items', act: () => openPage(helpPage()) },
    { label: 'Back to the Arcade', act: () => leave() },
  ] };
}
function classPage() {
  return { id: 'class', title: 'Engine class', sub: setup.mode === 'gp' ? 'Grand Prix' : 'Single Race', start: setup.cls,
    items: CLASSES.map((c, i) => ({ label: `${c.name} <span class="cc">${c.cc}</span>`, sub: c.desc, act: () => { setup.cls = i; openPage(racerPage()); } })) };
}
function racerPage() {
  return { id: 'racer', title: 'Choose your racer', grid: 4, start: setup.racer, preview: i => { showKart(i, setup.kart); const r = RACERS[i]; return `<h3>${r.name}</h3><p>${r.bio}</p><div class="k-w">${WEIGHT_STATS[r.weight].name} class</div>${statBars(kartStats(r, KARTS[setup.kart]))}`; },
    items: RACERS.map((r, i) => ({ card: `<div class="k-face" style="background:linear-gradient(150deg, ${r.color}, ${r.accent})">${faceSvg(r)}</div><div class="k-cn">${r.name}</div><div class="k-cw">${WEIGHT_STATS[r.weight].name}</div>`, act: () => { setup.racer = i; openPage(kartPage()); } })) };
}
function kartPage() {
  return { id: 'kart', title: 'Choose your kart', sub: RACERS[setup.racer].name, start: setup.kart, preview: i => { showKart(setup.racer, i); const k = KARTS[i]; return `<h3>${k.name}</h3><p>${k.desc}</p>${statBars(kartStats(RACERS[setup.racer], k))}`; },
    items: KARTS.map((k, i) => ({ label: k.name, sub: k.desc, act: () => { setup.kart = i; writeJSON(SETUP_KEY, setup); openPage(setup.mode === 'gp' ? cupPage() : trackPage()); } })) };
}
function cupPage() {
  return { id: 'cup', title: 'Choose a cup', sub: `${CLASSES[setup.cls].name} ${CLASSES[setup.cls].cc}`, start: setup.cup,
    items: CUPS.map((c, i) => { const won = records.cups[c.id + '_' + setup.cls]; return { label: `<span class="cup" style="background:${c.color}"></span>${c.name}`, value: won ? trophy(won) : '', sub: c.tracks.map(t => TRACKS[t].name).join(' · '), act: () => { setup.cup = i; writeJSON(SETUP_KEY, setup); startCup(i); } }; }) };
}
function trackPage() {
  const tt = setup.mode === 'tt';
  return { id: 'track', title: tt ? 'Time Trial: choose a track' : 'Choose a track', start: setup.track,
    items: TRACKS.map((t, i) => { const rec = records.tt[t.id]; return { label: t.name, value: tt ? (rec ? fmt(rec.time) : '--:--.---') : '', sub: t.blurb + (tt && rec ? ` · best lap ${fmt(rec.lap)} (${RACERS[rec.racer]?.name || '?'})` : ''), act: () => { setup.track = i; writeJSON(SETUP_KEY, setup); startRace({ track: i, mode: setup.mode }); } }; }) };
}
function optionsPage() {
  const page = { id: 'options', title: 'Options', sub: pad.touch ? 'Tap a setting to change it' : `${pad.glyph('LEFT')} ${pad.glyph('RIGHT')} change`, items: [] };
  const rebuild = () => { page.items = build(); renderMenu(); };
  const opt = (label, value, adjust, sub) => ({ label, value, sub, adjust: d => { adjust(d); saveSettings(); rebuild(); }, act: () => { adjust(1); saveSettings(); rebuild(); } });
  const cyc = (k, vals) => d => { const i = vals.indexOf(settings[k]); settings[k] = vals[(i + d + vals.length) % vals.length]; };
  const vol = k => d => { settings[k] = Math.round(Math.max(0, Math.min(1, settings[k] + d * 0.1)) * 10) / 10; };
  const build = () => [
    opt('Auto-accelerate', { off: 'Off', on: 'On', touch: 'On for touch' }[settings.autoGas], cyc('autoGas', ['touch', 'on', 'off'])),
    opt('Music volume', Math.round(settings.music * 10), vol('music')),
    opt('Sound effects', Math.round(settings.sfx * 10), vol('sfx')),
    opt('Camera shake', settings.shake ? 'On' : 'Off', () => { settings.shake = !settings.shake; }),
    opt('Minimap', settings.map ? 'On' : 'Off', () => { settings.map = !settings.map; }),
    opt('Standings list', settings.ranks ? 'On' : 'Off', () => { settings.ranks = !settings.ranks; }),
    opt('Graphics', settings.quality === 'low' ? 'Fast (phones)' : 'Detailed', () => { settings.quality = settings.quality === 'low' ? 'high' : 'low'; view.lowSpec = settings.quality === 'low'; resize(); }, 'Applies from the next race'),
    { label: 'Clear records', sub: 'Time trial bests, ghosts and trophies', act: () => { records = { tt: {}, cups: {} }; writeJSON(RECORDS_KEY, records); for (const t of TRACKS) try { localStorage.removeItem('sparkplug-ghost-' + t.id); } catch { /* storage blocked */ } toast('Records cleared'); } },
    { label: 'Done', act: () => back() },
  ];
  page.items = build();
  return page;
}
function saveSettings() { writeJSON(SETTINGS_KEY, settings); audio.setVolumes(settings.music, settings.sfx); }
function helpPage() {
  const g = b => pad.glyph(b);
  return { id: 'help', title: 'How to play', cls: 'help', items: [{ label: 'Show the controller diagram', act: () => overlay.show() }, { label: 'Back', act: () => back() }],
    extra: `<div class="k-help">
      <p><b>Drive:</b> ${g('A')} or ${g('R2')} accelerate, ${g('B')} or ${g('L2')} brake and reverse, left stick or D-pad steer. Keyboard: W/↑ go, S/↓ brake, A D / ← → steer.</p>
      <p><b>Drift:</b> hold ${g('R1')} (Space) while steering to hop into a drift. Keep it held: sparks turn <span style="color:#4fe3ff">blue</span>, then <span style="color:#ffb020">orange</span>, then <span style="color:#c45bff">violet</span>. Let go for a boost that grows with the colour. Steer into the drift to charge faster.</p>
      <p><b>Start boost:</b> press the throttle just after <b>2</b> disappears. Too early floods the engine.</p>
      <p><b>Ramps:</b> press drift in the air for a trick and a boost on landing. <b>Orange chevrons</b> are boost pads.</p>
      <p><b>Items:</b> drive through a crystal, then ${g('L1')} or ${g('X')} (E) to use it. Hold to trail a Goo Blob or Bounce Puck behind you as a shield. Push ↑ to throw ahead, ↓ (or Q) to fire behind.</p>
      <div class="k-items">${Object.entries(ITEMS).map(([id, it]) => `<div>${icon(id, 40)}<span><b>${it.name}</b> ${it.desc}</span></div>`).join('')}</div>
      <p><b>Touch:</b> left stick steers, GAS / BRAKE / DRIFT / ITEM on the right. Auto-accelerate is on for touch (Options).</p></div>` };
}
function trophy(place) { return `<span class="trophy t${place}">${place === 1 ? 'GOLD' : place === 2 ? 'SILVER' : 'BRONZE'}</span>`; }
function faceSvg(r) {
  // a simple original portrait: head colour, eyes, kind-specific ears
  const ears = { fox: '<path d="M22 30l8-22 12 16zM78 30l-8-22-12 16z"/>', bear: '<circle cx="26" cy="22" r="10"/><circle cx="74" cy="22" r="10"/>', panda: '<circle cx="26" cy="22" r="10"/><circle cx="74" cy="22" r="10"/>', alien: '<path d="M38 18l-6-14M62 18l6-14" stroke-width="4" stroke="currentColor"/><circle cx="31" cy="5" r="5"/><circle cx="69" cy="5" r="5"/>', robot: '<rect x="47" y="2" width="6" height="16"/><circle cx="50" cy="4" r="5" fill="#ff8a2b"/>', frog: '<circle cx="32" cy="26" r="12"/><circle cx="68" cy="26" r="12"/>', penguin: '', dino: '<path d="M40 12l6-8 6 8 6-8 6 8z" fill="#ffd23f"/>' }[r.kind] || '';
  const head = r.kind === 'robot' ? `<rect x="22" y="22" width="56" height="50" rx="8" fill="${r.color}"/><rect x="30" y="38" width="40" height="12" rx="4" fill="${r.accent}"/>` : `<circle cx="50" cy="50" r="30" fill="${r.color}"/>`;
  const eyes = r.kind === 'robot' ? '' : r.kind === 'alien' ? '<ellipse cx="40" cy="48" rx="7" ry="10" fill="#1a1d26"/><ellipse cx="60" cy="48" rx="7" ry="10" fill="#1a1d26"/>' : '<circle cx="40" cy="46" r="7" fill="#fff"/><circle cx="60" cy="46" r="7" fill="#fff"/><circle cx="41" cy="47" r="3.5" fill="#1a1d26"/><circle cx="61" cy="47" r="3.5" fill="#1a1d26"/>';
  const snout = r.kind === 'penguin' ? `<ellipse cx="50" cy="56" rx="20" ry="16" fill="#fff"/><path d="M44 58h12l-6 9z" fill="${r.accent}"/>` : ['fox', 'bear', 'panda'].includes(r.kind) ? `<ellipse cx="50" cy="62" rx="12" ry="8" fill="${r.accent}"/><circle cx="50" cy="59" r="3" fill="#1a1d26"/>` : '';
  return `<svg viewBox="0 0 100 100"><g fill="${r.color}" color="${r.color}">${ears}</g>${head}${snout}${eyes}</svg>`;
}

let toastT = 0;
function toast(msg) { const t = $('toast'); t.innerHTML = msg; t.classList.add('show'); toastT = 2; }

// ---- race lifecycle ----------------------------------------------------------------------------------------------------
function makeRace(o) {
  const laps = +Q.get('laps') || undefined;
  const cpu = Q.has('cpu') ? +Q.get('cpu') : undefined;
  return new Race({ track: o.track, cls: o.mode === 'tt' ? 1 : setup.cls, mode: o.mode, players: [{ racer: setup.racer, kart: setup.kart }], seed: o.seed ?? (Date.now() & 0xffff), laps, cpu, grid: o.grid, gridOrder: o.gridOrder });
}

function startRace(o) {
  audio.init(); audio.setVolumes(settings.music, settings.sfx);
  S.attract = null;
  const race = S.race = makeRace(o); S.raceOpts = o;
  if (o.mode === 'tt') { const me = race.human; me.item = 'turbo3'; me.itemCount = 3; }
  view.build(race.track, race.karts.map(k => ({ racer: k.racer, kart: k.kart })));
  hud.setTrack(race.track, race); hud.show(true); hud.lapList.innerHTML = '';
  S.ghost = null; view.setGhost(null);
  if (o.mode === 'tt') {
    try { const g = JSON.parse(localStorage.getItem('sparkplug-ghost-' + race.def.id) || 'null'); if (g) { S.ghost = g; view.setGhost(RACERS[g.racer], KARTS[g.kart]); } } catch { /* corrupt ghost */ }
  }
  if (Q.get('auto') === '1') race.human.autopilot = true;
  menuEl.classList.add('hidden'); $('pause').classList.add('hidden'); $('replayBar').classList.add('hidden');
  S.name = 'race'; S.paused = false; S.acc = 0; S.introT = Q.get('quick') === '1' ? 0 : 2.6; S.resultsShown = false; S.finishedAt = 0; S.replay = null;
  S.lastPlace = race.human.place;
  view.camInit = false; view.camH = undefined; view.fx.clear();
  audio.playSong(race.def.music);
  hud.say(`<div class="k-tname">${race.def.name}</div><small>${o.mode === 'gp' ? `${CUPS[S.gp.cup].name} · Race ${S.gp.index + 1} of ${CUPS[S.gp.cup].tracks.length}` : o.mode === 'tt' ? 'Time Trial' : CLASSES[setup.cls].name + ' ' + CLASSES[setup.cls].cc}</small>`, S.introT + 0.3, 'intro');
  hud.hint.innerHTML = controlHint(); hud.hint.classList.add('show'); S.hintT = 7;
  document.body.classList.add('racing');
}
function controlHint() {
  if (pad.touch) return `Left stick steer · <b>DRIFT</b> hold + steer · <b>ITEM</b> use${autoGasOn() ? ' · auto-gas on' : ' · <b>GAS</b> go'}`;
  if (!pad.gp) return '<kbd>W</kbd> go · <kbd>A</kbd><kbd>D</kbd> steer · hold <kbd>Space</kbd> drift · <kbd>E</kbd> item · <kbd>Esc</kbd> pause';
  return `${pad.glyph('A')} go · hold ${pad.glyph('R1')} drift · ${pad.glyph('L1')} item · ${pad.glyph('START')} pause`;
}

function startCup(ci) {
  S.gp = { cup: ci, index: 0, points: new Map(), results: [], grid: null };
  nextCupRace();
}
function nextCupRace() {
  const cup = CUPS[S.gp.cup];
  // after the first race the grid starts in reverse order of the standings
  let gridOrder = null;
  startRace({ track: cup.tracks[S.gp.index], mode: 'gp', seed: (S.gp.cup * 97 + S.gp.index * 13 + 5) ^ (Date.now() & 0xff) });
  if (S.gp.index > 0) {
    const pts = S.gp.points, race = S.race;
    gridOrder = [...race.karts].sort((a, b) => (pts.get(a.racer.id) || 0) - (pts.get(b.racer.id) || 0));
    // re-place karts on the grid in that order
    gridOrder.forEach((k, slot) => {
      const T = race.track, row = Math.floor(slot / 2), side = slot % 2 ? -1 : 1, i = T.wrap(-Math.round((6 + row * 7) / T.step)), p = T.at(i, side * T.w[i] * 0.22);
      k.x = p.x; k.z = p.z; k.y = p.y; k.h = k.move = T.heading(i); k.ti = i; k.safeI = i; k.place = slot + 1;
    });
    race.order = [...race.karts].sort((a, b) => a.place - b.place);
  }
}

function restartRace() {
  const o = S.raceOpts; if (!o) return;
  if (o.mode === 'gp') {
    // racing it again takes back the points this race already gave
    for (const [id, pt] of S.gp.adds?.[S.gp.index] || []) S.gp.points.set(id, S.gp.points.get(id) - pt);
    if (S.gp.adds) S.gp.adds.length = S.gp.index;
    S.gp.results.length = S.gp.index; startRace({ ...o, seed: (Date.now() & 0xffff) });
  } else startRace({ ...o, seed: Date.now() & 0xffff });
}

function quitToMenu() {
  S.race = null; S.replay = null; hud.show(false); audio.silenceEngines(); document.body.classList.remove('racing');
  $('pause').classList.add('hidden'); $('replayBar').classList.add('hidden');
  startAttract(); S.menuStack = []; openPage(mainPage(), false); audio.menuSong();
}
function leave() { audio.silenceEngines(); audio.stopSong(); goHome(); }

// ---- the race loop -----------------------------------------------------------------------------------------------------
function raceFrame(dt) {
  const race = S.race, me = race.human;
  if (S.introT > 0) {   // a quick orbit of the grid before the countdown
    S.introT -= dt;
    if (pad.pressed('A') || pad.pressed('START') || pad.pressed('B')) S.introT = 0;
    view.render(liveFrame(race), { dt, time: S.time, follow: me.idx, cam: 'orbit' });
    if (S.introT <= 0) { view.camInit = false; hud.banner.className = 'k-banner'; hud.bannerT = 0; }
    return;
  }
  const inp = readInput(); S.camLook = inp.lookBack;
  S.acc += Math.min(dt, 0.1) * (+Q.get('speed') || 1);
  const events = [];
  while (S.acc >= DT) {
    S.acc -= DT;
    race.events.length = 0;
    race.step([inp]);
    events.push(...race.events);
    if (race.state === 'done') break;
  }
  handleEvents(events, race, me);
  // engine sounds: you, and the nearest rival quieter
  audio.engine(0, race.state === 'countdown' ? (inp.accel > 0.5 ? me.top * 0.55 : me.top * 0.1) : me.speed, me.top, me.boostT > 0, me.fallT > 0 ? 0.3 : 1);
  let near = null, nd = 40; for (const k of race.karts) if (k !== me) { const d = Math.hypot(k.x - me.x, k.z - me.z); if (d < nd) { nd = d; near = k; } }
  audio.engine(1, near ? near.speed : 0, near ? near.top : 30, near?.boostT > 0, near ? (1 - nd / 40) * 0.5 : 0);
  audio.drift(me.drift && me.grounded ? 1 : 0, me.driftTier); audio.offroad(me.offroad && Math.abs(me.speed) > 4 ? Math.min(1, Math.abs(me.speed) / 20) : 0);
  // ghost
  let ghostState = null;
  if (S.ghost && race.state !== 'countdown') { const f = S.ghost.f, i = Math.min(f.length - 1, Math.floor(race.t * 30)); ghostState = f[i]; }
  view.showGhost(ghostState);
  view.shakeOn = settings.shake;
  view.render(liveFrame(race), { dt, time: S.time, follow: me.idx, cam: 'chase', lookBack: S.camLook, events });
  if (!settings.shake) view.shake = 0;
  hud.update(race, me, { dt, showMap: settings.map && S.mapOn !== false, showRanks: settings.ranks, itemGlyph: pad.glyph('L1'), ghost: ghostState, onRoulette: () => audio.play('roulette') });
  if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) hud.hint.classList.remove('show'); }
  if (pad.pressed('SELECT')) { S.mapOn = S.mapOn === false; }
  if (race.state === 'done' && !S.resultsShown) { if ((S.finishedAt += dt) > 0.4) showResults(); }
  if (pad.pressed('START') && race.state !== 'done') pauseGame();
}

function liveFrame(race) {
  return { k: race.karts.map(k => [k.x, k.y, k.z, k.h, k.steerVis, k.drift, k.driftTier, k.boostT > 0 ? 1 : 0, k.spinVis, k.shieldT > 0 ? 1 : 0, k.speed, k.place]), p: race.projs.map(p => [p.type, p.x, p.y, p.z]), b: race.boxes.map(b => (b.t > 0 ? 0 : 1)) };
}

function handleEvents(events, race, me) {
  for (const e of events) {
    const mine = e.k === me.idx;
    const k = race.karts[e.k], d = k ? Math.hypot(k.x - me.x, k.z - me.z) : 0, near = Math.max(0, 1 - d / 60);
    switch (e.type) {
      case 'count': hud.say(`<div class="k-count">${e.n}</div>`, 0.9, 'count'); audio.play('count'); break;
      case 'go': hud.say('<div class="k-count go">GO!</div>', 0.9, 'count'); audio.play('go'); break;
      case 'startboost': if (mine) { hud.say('<div class="k-pop">ROCKET START!</div>', 1, 'pop'); audio.play('boost'); pad.rumble(0.6, 0.6, 300); } break;
      case 'stall': if (mine) { hud.say('<div class="k-pop bad">Flooded!</div>', 1, 'pop'); audio.play('stall'); } break;
      case 'hop': if (mine) audio.play('hop'); break;
      case 'drifttier': if (mine) { audio.play('tier', { tier: e.tier }); pad.rumble(0.2 * e.tier, 0.1, 60); } break;
      case 'boost': if (mine) { audio.play('boost'); pad.rumble(0.5, 0.3, 200); if (e.trick) hud.say('<div class="k-pop">TRICK!</div>', 0.8, 'pop'); } else if (near > 0.3) audio.play('boost', { vol: near * 0.4 }); break;
      case 'pad': if (mine) audio.play('pad'); break;
      case 'box': if (mine) audio.play('box'); else if (near > 0.2) audio.play('box', { vol: near * 0.3 }); break;
      case 'itemready': if (mine) audio.play('itemready'); break;
      case 'fire': if (mine || near > 0.2) audio.play('fire', { vol: mine ? 1 : near * 0.5 }); break;
      case 'drop': if (mine || near > 0.2) audio.play('drop', { vol: mine ? 1 : near * 0.5 }); break;
      case 'hit': if (mine) { audio.play('hit'); pad.rumble(1, 1, 450); hud.doFlash('#ff3355', 0.25); } else if (near > 0.1) audio.play('hit', { vol: near * 0.6 }); if (e.by === me.idx && !mine) hud.say(`<div class="k-pop">HIT ${race.karts[e.k].racer.name.toUpperCase()}!</div>`, 0.8, 'pop'); break;
      case 'wall': if (mine) { audio.play('wall', { hit: e.hit }); pad.rumble(0.3 * e.hit, 0.5 * e.hit, 120); } break;
      case 'bump': if (mine || e.o === me.idx) { audio.play('bump'); pad.rumble(0.4, 0.2, 100); } break;
      case 'shield': if (mine || near > 0.2) audio.play('shield', { vol: mine ? 1 : near }); break;
      case 'thunder': audio.play('thunder'); hud.doFlash('#fff6a0', mine ? 0.3 : 0.7); if (!mine && race.karts[e.k].place > me.place) pad.rumble(0.8, 0.8, 500); break;
      case 'block': if (mine) audio.play('block'); break;
      case 'bounce': { const dd = Math.hypot(e.x - me.x, e.z - me.z); if (dd < 50) audio.play('bounce', { vol: 1 - dd / 50 }); break; }
      case 'pop': { const dd = Math.hypot(e.x - me.x, e.z - me.z); if (dd < 50) audio.play('pop', { vol: 1 - dd / 50 }); break; }
      case 'fall': if (mine) { audio.play('fall'); hud.say('<div class="k-pop bad">Whoops!</div>', 1.2, 'pop'); } break;
      case 'respawn': if (mine) audio.play('respawn'); break;
      case 'land': if (mine) audio.play('land'); break;
      case 'trick': if (mine) audio.play('trick'); break;
      case 'lap': if (mine && e.lap <= race.laps) { if (e.lap === race.laps) { hud.say('<div class="k-pop final">FINAL LAP</div>', 1.6, 'pop'); audio.play('finallap'); audio.tempoMul = 1.08; } else { hud.say(`<div class="k-pop">LAP ${e.lap}</div><small>${fmt(e.time)}</small>`, 1.4, 'pop'); audio.play('lap'); } } break;
      case 'finish': if (mine) { const p = e.place; hud.say(race.mode === 'tt' ? `<div class="k-pop">FINISH!</div><small>${fmt(e.time)}</small>` : `<div class="k-pop ${p <= 3 ? 'final' : ''}">${ord(p)}</div><small>FINISH · ${fmt(e.time)}</small>`, 3, 'pop'); audio.play(p <= 3 || race.mode === 'tt' ? 'finish' : 'lose'); pad.rumble(0.6, 0.6, 400); } break;
      default: break;
    }
  }
}

// ---- results, standings, replay ---------------------------------------------------------------------------------------
function showResults() {
  S.resultsShown = true; const race = S.race, me = race.human; S.name = 'results';
  audio.silenceEngines(); audio.tempoMul = 1;
  const tt = race.mode === 'tt';
  let recordMsg = '';
  if (tt) {
    const id = race.def.id, rec = records.tt[id];
    const newBest = !rec || me.finishTime < rec.time, newLap = !rec || me.bestLap < rec.lap;
    if (newBest || newLap) {
      records.tt[id] = { time: Math.min(me.finishTime, rec?.time ?? Infinity), lap: Math.min(me.bestLap, rec?.lap ?? Infinity), racer: setup.racer, kart: setup.kart };
      writeJSON(RECORDS_KEY, records);
      recordMsg = newBest ? '<div class="k-record">NEW RECORD!</div>' : '<div class="k-record">NEW BEST LAP!</div>';
    }
    if (newBest) {   // save the ghost (30 fps, rounded)
      const f = race.replay.filter(fr => fr.t > 0).map(fr => fr.k[0].slice(0, 4).map(v => Math.round(v * 100) / 100));
      writeJSON('sparkplug-ghost-' + id, { racer: setup.racer, kart: setup.kart, time: me.finishTime, f });
    }
  }
  let pointsCol = '';
  if (race.mode === 'gp') {
    S.gp.adds = S.gp.adds || [];
    S.gp.adds[S.gp.index] = race.finishOrder.map(k => [k.racer.id, POINTS[k.place - 1]]);
    for (const [id, pt] of S.gp.adds[S.gp.index]) S.gp.points.set(id, (S.gp.points.get(id) || 0) + pt);
    S.gp.results[S.gp.index] = race.finishOrder.map(k => k.racer.id);
    pointsCol = 'pts';
  }
  const rows = (tt ? [me] : race.finishOrder).map(k => `<tr class="${k === me ? 'me' : ''}"><td>${tt ? '' : ord(k.place)}</td><td><i style="background:${k.racer.color}"></i>${k.racer.name}</td><td>${k.kart.name}</td><td>${k.projected ? '<span class="dim">' + fmt(k.finishTime) + '*</span>' : fmt(k.finishTime)}</td><td>${fmt(k.bestLap)}</td>${pointsCol ? `<td>+${POINTS[k.place - 1]}</td>` : ''}</tr>`).join('');
  const laps = me.lapTimes.map((t, i) => `<span>Lap ${i + 1}: <b>${fmt(t)}</b></span>`).join('');
  const items = [];
  if (race.mode === 'gp') {
    const last = S.gp.index >= CUPS[S.gp.cup].tracks.length - 1;
    items.push({ label: last ? 'Cup results' : 'Standings', act: () => standingsPage(last) });
  }
  if (race.mode === 'vs') items.push({ label: 'Race again', act: () => restartRace() });
  if (tt) items.push({ label: 'Try again', act: () => restartRace() });
  items.push({ label: 'Watch replay', act: () => startReplay() });
  if (race.mode !== 'gp') items.push({ label: 'Change track', act: () => { hud.show(false); document.body.classList.remove('racing'); S.race = null; startAttract(); S.menuStack = []; openPage(mainPage(), false); openPage(trackPage()); } });
  if (race.mode === 'gp') items.push({ label: 'Restart this race', act: () => restartRace() });
  items.push({ label: 'Main menu', act: () => quitToMenu() });
  hud.show(false);
  S.menuStack = [];
  openPage({ id: 'results', noBack: true, title: tt ? 'Time Trial' : `${ord(me.place)} place`, sub: race.def.name, cls: 'results', items,
    extra: `${recordMsg}<table class="k-res"><tr><th></th><th>Racer</th><th>Kart</th><th>Time</th><th>Best lap</th>${pointsCol ? '<th>Pts</th>' : ''}</tr>${rows}</table><div class="k-laps2">${laps}</div>${race.finishOrder.some(k => k.projected) ? '<div class="dim small">* still racing: estimated time</div>' : ''}`,
    foot: pad.touch ? 'Tap to choose' : `${pad.glyph('A')} choose` }, false);
}

function standingsPage(last) {
  const pts = S.gp.points, all = RACERS.filter(r => pts.has(r.id)).map(r => ({ r, p: pts.get(r.id) })).sort((a, b) => b.p - a.p);
  const meId = RACERS[setup.racer].id, myRank = all.findIndex(a => a.r.id === meId) + 1;
  const rows = all.map((a, i) => `<tr class="${a.r.id === meId ? 'me' : ''}"><td>${ord(i + 1)}</td><td><i style="background:${a.r.color}"></i>${a.r.name}</td><td>${S.gp.results.map(res => { const p = res.indexOf(a.r.id); return p >= 0 ? POINTS[p] : '-'; }).join(' · ')}</td><td><b>${a.p}</b></td></tr>`).join('');
  const cup = CUPS[S.gp.cup];
  const items = [];
  let extra = '';
  if (last) {
    if (myRank <= 3) { const key = cup.id + '_' + setup.cls, prev = records.cups[key]; if (!prev || myRank < prev) { records.cups[key] = myRank; writeJSON(RECORDS_KEY, records); } }
    extra = myRank <= 3 ? `<div class="k-trophy t${myRank}"><svg viewBox="0 0 100 100" width="120" height="120"><path d="M30 14h40v20a20 20 0 0 1-40 0z" fill="currentColor"/><path d="M30 20H16a14 14 0 0 0 16 18M70 20h14a14 14 0 0 1-16 18" fill="none" stroke="currentColor" stroke-width="5"/><rect x="45" y="52" width="10" height="16" fill="currentColor"/><rect x="32" y="68" width="36" height="10" rx="3" fill="currentColor"/><rect x="26" y="78" width="48" height="10" rx="3" fill="#5a4a2a"/></svg><div>${trophy(myRank)} ${cup.name}</div></div>` : `<div class="k-trophy none">${ord(myRank)} overall. Finish in the top 3 for a trophy.</div>`;
    audio.play(myRank <= 3 ? 'finish' : 'lose');
    items.push({ label: 'Race this cup again', act: () => startCup(S.gp.cup) }, { label: 'Main menu', act: () => quitToMenu() });
  } else {
    items.push({ label: `Next race: ${TRACKS[cup.tracks[S.gp.index + 1]].name}`, act: () => { S.gp.index++; nextCupRace(); } }, { label: 'Quit the cup', act: () => quitToMenu() });
  }
  openPage({ id: 'standings', noBack: true, title: last ? `${cup.name}: final standings` : `${cup.name}: standings`, sub: `${CLASSES[setup.cls].name} ${CLASSES[setup.cls].cc} · after race ${S.gp.index + 1} of ${cup.tracks.length}`, cls: 'results', items,
    extra: `${extra}<table class="k-res"><tr><th></th><th>Racer</th><th>Races</th><th>Points</th></tr>${rows}</table>` }, false);
}

function startReplay() {
  const race = S.race; if (!race?.replay.length) return;
  menuEl.classList.add('hidden'); S.name = 'replay';
  S.replay = { i: 0, t: 0, follow: race.human.idx, cam: 'replay', camT: 0, speed: 1, paused: false };
  $('replayBar').classList.remove('hidden'); renderReplayBar();
  view.fx.clear(); view.camInit = false; audio.playSong(race.def.music);
}
function renderReplayBar() {
  const R = S.replay, race = S.race;
  $('replayBar').innerHTML = `<span class="rec">● REPLAY</span><span>${race.karts[R.follow].racer.name}</span><span class="dim">${R.cam === 'replay' ? 'Trackside' : 'Chase'} camera${R.speed !== 1 ? ' · ×' + R.speed : ''}${R.paused ? ' · paused' : ''}</span>
    <span class="keys">${pad.touch ? '<b data-r="cam">CAMERA</b><b data-r="prev">◀</b><b data-r="next">▶</b><b data-r="ff">×2</b><b data-r="exit">DONE</b>' : (pad.gp ? `${pad.glyph('A')} camera ${pad.glyph('LEFT')}${pad.glyph('RIGHT')} racer ${pad.glyph('R1')} fast ${pad.glyph('X')} pause ${pad.glyph('B')} done` : '<kbd>Enter</kbd> camera <kbd>←</kbd><kbd>→</kbd> racer <kbd>Space</kbd> fast <kbd>Q</kbd> pause <kbd>Backspace</kbd> done')}</span>`;
  $('replayBar').querySelectorAll('[data-r]').forEach(b => { b.onclick = () => replayCmd(b.dataset.r); });
}
function replayCmd(c) {
  const R = S.replay, n = S.race.karts.length;
  if (c === 'cam') R.cam = R.cam === 'replay' ? 'chase' : 'replay';
  if (c === 'prev') R.follow = (R.follow - 1 + n) % n;
  if (c === 'next') R.follow = (R.follow + 1) % n;
  if (c === 'ff') R.speed = R.speed === 1 ? 2 : R.speed === 2 ? 4 : 1;
  if (c === 'pause') R.paused = !R.paused;
  if (c === 'exit') { $('replayBar').classList.add('hidden'); S.replay = null; audio.silenceEngines(); S.resultsShown = false; showResults(); return; }
  view.camInit = false; view._pole = undefined; renderReplayBar();
}
function replayFrame(dt) {
  const R = S.replay, race = S.race, frames = race.replay;
  if (pad.pressed('A')) replayCmd('cam'); if (pad.pressed('LEFT')) replayCmd('prev'); if (pad.pressed('RIGHT')) replayCmd('next');
  if (pad.pressed('R1')) replayCmd('ff'); if (pad.pressed('X')) replayCmd('pause'); if (pad.pressed('B') || pad.pressed('START')) { replayCmd('exit'); return; }
  if (!R.paused) R.t += dt * R.speed;
  const i = Math.min(frames.length - 1, Math.floor(R.t * 30));
  if (i >= frames.length - 1) { R.t = 0; view.fx.clear(); }   // loop
  const f = frames[i], kf = f.k[R.follow];
  view.render(f, { dt: R.paused ? 0 : dt * R.speed, time: S.time, follow: R.follow, cam: R.cam, events: [] });
  audio.engine(0, kf[10], 30, kf[7], 0.7);
}

// ---- pause ------------------------------------------------------------------------------------------------------------
const pauseItems = () => [
  { label: 'Resume', act: () => resume() },
  { label: 'Restart race', act: () => { $('pause').classList.add('hidden'); restartRace(); } },
  { label: 'Controls', act: () => overlay.show() },
  { label: `Auto-accelerate: ${{ off: 'Off', on: 'On', touch: 'On for touch' }[settings.autoGas]}`, act: () => { settings.autoGas = { touch: 'on', on: 'off', off: 'touch' }[settings.autoGas]; saveSettings(); renderPause(); } },
  { label: `Music: ${settings.music > 0 ? 'On' : 'Off'}`, act: () => { settings.music = settings.music > 0 ? 0 : 0.8; saveSettings(); renderPause(); } },
  { label: S.race?.mode === 'gp' ? 'Quit the cup' : 'Quit to menu', act: () => quitToMenu() },
  { label: 'Back to the Arcade', act: () => leave() },
];
function pauseGame() { S.paused = true; S.name = 'pause'; S.pauseSel = 0; audio.silenceEngines(); renderPause(); $('pause').classList.remove('hidden'); audio.play('ui'); }
function resume() { S.paused = false; S.name = 'race'; $('pause').classList.add('hidden'); S.lastT = performance.now(); }
function renderPause() {
  const it = pauseItems();
  $('pause').innerHTML = `<div class="k-pause"><h2>Paused</h2><div class="k-sub">${S.race.def.name} · ${S.race.mode === 'tt' ? 'Time Trial' : 'Lap ' + Math.max(1, Math.min(S.race.laps, S.race.human.lap)) + '/' + S.race.laps}</div><div class="k-list">${it.map((x, i) => `<div class="k-it ${i === S.pauseSel ? 'sel' : ''}" data-i="${i}"><span class="lbl">${x.label}</span></div>`).join('')}</div><div class="k-foot">${pad.touch ? 'Tap to choose · <b>MENU</b> resumes' : `${pad.glyph('A')} choose ${pad.glyph('START')} resume`}</div></div>`;
  $('pause').querySelectorAll('.k-it').forEach(el => { el.onclick = () => { S.pauseSel = +el.dataset.i; audio.play('select'); pauseItems()[S.pauseSel].act(); }; });
}
function pauseFrame() {
  const it = pauseItems();
  let d = 0; if (pad.pressed('UP') || (pad.ly > 0.6 && !S.pNav)) d = -1; if (pad.pressed('DOWN') || (pad.ly < -0.6 && !S.pNav)) d = 1;
  S.pNav = Math.abs(pad.ly) > 0.6;
  if (d) { S.pauseSel = (S.pauseSel + d + it.length) % it.length; audio.play('ui'); renderPause(); }
  if (pad.pressed('A')) { audio.play('select'); it[S.pauseSel].act(); }
  else if (pad.pressed('START') || pad.pressed('B')) resume();
  view.draw();
}

// ---- attract mode: a CPU race behind the menus ---------------------------------------------------------------------------
function startAttract() {
  const ti = Math.floor(Math.random() * TRACKS.length);
  const race = new Race({ track: ti, cls: 2, mode: 'vs', players: [], cpu: 8, seed: Date.now() & 0xffff, countdown: 0.01, laps: 99 });
  view.build(race.track, race.karts.map(k => ({ racer: k.racer, kart: k.kart })));
  // spread them around the lap a little
  for (let i = 0; i < 200; i++) race.step([]);
  S.attract = { race, follow: 0, t: 0 };
  view.camInit = false; view._pole = undefined;
}
function attractFrame(dt) {
  const A = S.attract; if (!A) { view.draw(); return; }
  A.acc = (A.acc || 0) + Math.min(dt, 0.1);
  while (A.acc >= DT) { A.acc -= DT; A.race.events.length = 0; A.race.step([]); }
  A.t += dt; if (A.t > 8) { A.t = 0; A.follow = (A.follow + 3) % A.race.karts.length; view._pole = undefined; }
  view.render(liveFrame(A.race), { dt, time: S.time, follow: A.follow, cam: 'replay', events: A.race.events });
}

// ---- main loop ---------------------------------------------------------------------------------------------------------
let fpsN = 0, fpsT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - S.lastT) / 1000); S.lastT = now; S.time += dt;
  pad.update(); relabelTouch(); pad.showTouch(S.name === 'race' || S.name === 'pause');
  if (pad.any() && !audio.ctx) { audio.init(); audio.setVolumes(settings.music, settings.sfx); if (S.name === 'menu') audio.menuSong(); }
  audio.tick();
  if (pad.pressed('HOME')) { leave(); }
  if (overlay.visible) { overlay.update(); if (pad.pressed('TOUCH') || pad.pressed('B') || pad.pressed('START')) overlay.hide(); view.draw(); requestAnimationFrame(loop); return; }
  if (pad.pressed('TOUCH')) { overlay.show(); if (S.name === 'race') pauseGame(); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  const sig = `${pad.touch}|${pad.kind}|${!!pad.gp}`; if (sig !== S.sig) { S.sig = sig; if (S.name === 'menu') renderMenu(); relabelTouch.done = false; document.body.classList.toggle('touch', pad.touch); }
  switch (S.name) {
    case 'title': case 'menu': case 'results':
      if (S.name !== 'results' || !S.race) attractFrame(dt); else { view.render(liveFrame(S.race), { dt, time: S.time, follow: S.race.human.idx, cam: 'orbit', events: [] }); }
      menuNav(dt);
      if (S.menu?.preview && show.kart) {   // turntable preview on top
        show.kart.rotation.y += dt * 0.8;
        const el = menuEl.querySelector('.k-pv-stage'), r = el?.getBoundingClientRect();
        if (r && r.width > 40 && r.height > 40) {
          const H = innerHeight, size = Math.min(r.width, r.height);
          renderer.setScissorTest(true); renderer.autoClear = false;
          const x = r.left + (r.width - size) / 2, y = H - (r.top + (r.height + size) / 2);
          renderer.setViewport(x, y, size, size); renderer.setScissor(x, y, size, size); renderer.clearDepth();
          renderer.render(show.scene, show.camera);
          renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight); renderer.autoClear = true;
        }
      }
      break;
    case 'race': raceFrame(dt); break;
    case 'pause': pauseFrame(); break;
    case 'replay': replayFrame(dt); break;
  }
  if (fpsTest) { fpsN++; fpsT += dt; if (fpsT > 1) { $('fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = 0; fpsT = 0; } }
  requestAnimationFrame(loop);
}

// ---- boot ---------------------------------------------------------------------------------------------------------------
addEventListener('resize', resize); resize();
try { localStorage.setItem('arcade-last', 'kart'); } catch { /* storage blocked */ }   // the hub reopens on this tile
addEventListener('pageshow', () => { S.lastT = performance.now(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.name === 'race') pauseGame(); });
if (fpsTest) $('fps').classList.remove('hidden');
// quick start for testing: kart.html?quick=1&track=2&mode=vs|tt|gp&racer=3&kart=1&cls=2&laps=1&auto=1
if (Q.get('quick') === '1') {
  for (const k of ['racer', 'kart', 'cls', 'track']) if (Q.has(k)) setup[k] = +Q.get(k);
  const mode = Q.get('mode') || 'vs';
  setup.mode = mode;
  if (mode === 'gp') { setup.cup = +(Q.get('cup') || 0); startCup(setup.cup); } else startRace({ track: setup.track, mode });
} else {
  startAttract(); openPage(titlePage(), false);
}
requestAnimationFrame(loop);
