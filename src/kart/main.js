// Dash Derby: the application shell. Renderer, showroom, menus (Grand Prix, Versus Race, Time Trial, options),
// racer / kart / cup / track select, race intro and countdown, chase camera, HUD, results, Grand Prix standings and
// podium, replays with TV cameras, the time-trial ghost and saved records.
import * as THREE from 'three';
import { Pad, goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { Sfx } from '../common/sfx.js';
import { RACERS, KARTS, CLASSES, TRACKS, CUPS, POINTS, ITEMS, ordinal, fmtTime, kartStats } from './data.js';
import { getTrack } from './track.js';
import { Race, angDiff } from './race.js';
import { makeKart, makeItemBox, makePuddle, makePuck, makeComet, makeLob, makeMover, portraitSVG, ITEM_ICON } from './models.js';
import { buildTrackScene, THEMES } from './trackmesh.js';
import { KartAudio } from './audio.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'dashderby-v1';
const Q = new URLSearchParams(location.search);
const readSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch { return {}; } };
const writeSave = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ } };
const save = Object.assign({ tt: {}, cups: {}, settings: {} }, readSave());
const settings = Object.assign({ music: true, autoGas: true, cam: 'near', minimap: true, cls: 'swift', racer: 'mango', kart: 'roadster' }, save.settings);
save.settings = settings;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------------------------------------------
const pad = new Pad({
  keymap: { A: ['Enter', 'KeyK'], B: ['Backspace', 'KeyL'], X: ['KeyJ'], Y: ['KeyI'], R1: ['Space', 'ShiftLeft', 'ShiftRight'], L1: ['KeyE', 'ControlLeft', 'ControlRight'],
    R3: ['KeyQ'], L3: ['KeyH'], SELECT: ['KeyC'], UP: ['Digit1'], DOWN: ['Digit2'], LEFT: ['Digit3'], RIGHT: ['Digit4'], START: ['KeyP'] },
  moveKeys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] },
  lookKeys: { up: [], down: [], left: [], right: [] },
  touch: false, touchLook: false,
});
const overlay = new ControllerOverlay({
  title: 'Dash Derby: controls', pad, note: 'On a phone: steer with the left stick, gas is automatic (turn it off in Options)',
  map: {
    A: 'Accelerate · menu select', B: 'Brake / reverse · menu back', X: 'Hop and drift (hold)', Y: 'Use item', R2: 'Accelerate (analog)', L2: 'Brake / reverse (analog)',
    R1: 'Hop and drift (hold, release for a mini-turbo)', L1: 'Use item (push the stick up / down to aim)', LS: 'Steer · aim items', RS: 'Look around (push down to look behind)',
    L3: 'Horn', R3: 'Look behind', UP: 'Minimap on / off', DOWN: 'Look behind', LEFT: 'Camera closer', RIGHT: 'Camera farther',
    SELECT: 'Camera: near / far', START: 'Pause', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
  },
  keys: { A: 'W / ↑ (gas) · Enter', B: 'S / ↓ (brake, hold to throw items behind) · Backspace', X: 'J', Y: 'I', R2: 'W / ↑', L2: 'S / ↓', R1: 'Space / Shift', L1: 'E / Ctrl', LS: 'A D / ← → steer', RS: '—', L3: 'H', R3: 'Q', UP: '1', DOWN: '2', LEFT: '3', RIGHT: '4', SELECT: 'C', START: 'Esc / P', TOUCH: 'Tab', HOME: '`' },
});
const sfx = new Sfx(); const audio = new KartAudio(sfx);
const wake = () => { sfx.init(); audio.setMusic(settings.music); };
addEventListener('pointerdown', wake); addEventListener('keydown', wake);

/** The player's driving controls from pad / keyboard / touch. */
function readControls(c) {
  const kb = !pad.usingPad;
  let thr = Math.max(pad.r2v, pad.down('A') ? 1 : 0, kb && pad.ly > 0.5 ? 1 : 0);
  const brk = Math.max(pad.l2v, pad.down('B') ? 1 : 0, kb && pad.ly < -0.5 ? 1 : 0);
  if (pad.kind === 'touch' && settings.autoGas && brk < 0.5) thr = 1;
  c.steer = clamp(pad.lx, -1, 1); c.throttle = thr; c.brake = brk;
  c.drift = pad.down('R1') || pad.down('X'); c.driftPressed = c.driftPressed || pad.pressed('R1') || pad.pressed('X');
  c.itemPressed = c.itemPressed || pad.pressed('L1') || pad.pressed('Y');
  // aim items: stick up / down on a pad; on the keyboard hold S (brake) to throw behind, F to toss ahead
  c.aim = kb ? (pad.keys.has('KeyF') ? 1 : brk > 0.5 ? -1 : 0) : (pad.ly > 0.5 ? 1 : pad.ly < -0.5 ? -1 : 0);
  c.lookBack = pad.down('R3') || pad.down('DOWN') || pad.ry > 0.6;
}

// ---------------------------------------------------------------------------------------------------------------
// renderer, showroom scene
// ---------------------------------------------------------------------------------------------------------------
const canvas = $('game');
const coarse = matchMedia('(pointer: coarse)').matches;
const lowFx = Q.has('low') || (coarse && Math.min(screen.width, screen.height) < 900);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFx, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowFx ? 1.25 : 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !lowFx; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1500);

const show = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 200), kart: null, key: '', ang: 0 };
{
  const s = show.scene; s.background = new THREE.Color(0x141a33); s.fog = new THREE.Fog(0x141a33, 18, 45);
  s.add(new THREE.HemisphereLight(0xcfe0ff, 0x30244a, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 8, 6); s.add(key);
  const rim = new THREE.DirectionalLight(0xff7eb6, 1.6); rim.position.set(-6, 3, -5); s.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0x2b3560, roughness: 0.4, metalness: 0.3 })); floor.position.y = -0.2; s.add(floor);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.06, 8, 64), new THREE.MeshBasicMaterial({ color: 0x46f0ff })); ring.rotation.x = Math.PI / 2; s.add(ring);
  for (let i = 0; i < 40; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2 + Math.random() * 6, 0.3), new THREE.MeshBasicMaterial({ color: [0xff7eb6, 0xffd166, 0x46f0ff][i % 3], transparent: true, opacity: 0.25 })); const a = i / 40 * Math.PI * 2; b.position.set(Math.cos(a) * (14 + Math.random() * 8), 1, Math.sin(a) * (14 + Math.random() * 8)); s.add(b); }
}
function showroomKart(racerId, kartId) {
  const key = racerId + '|' + kartId; if (show.key === key) return; show.key = key;
  if (show.kart) show.scene.remove(show.kart);
  show.kart = makeKart(RACERS.find(r => r.id === racerId), KARTS.find(k => k.id === kartId)); show.kart.scale.setScalar(1.15);
  show.scene.add(show.kart);
}

// ---------------------------------------------------------------------------------------------------------------
// race scene
// ---------------------------------------------------------------------------------------------------------------
const W = { scene: null, race: null, karts: [], boxes: [], movers: [], proj: new Map(), haz: new Map(), pool: { puck: [], comet: [], lob: [], puddle: [] }, ghost: null, ghostData: null, track: null, trackRoot: null, sun: null, particles: null, snow: null, tvCams: [] };
const app = {
  state: 'title', cfg: null, gp: null, paused: false, t: 0, stateT: 0, camMode: 'chase', cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 68, shake: 0 },
  replay: null, resultsShown: false, lastPlace: 8, msgT: 0, centerT: 0, lastCount: null, finishT: 0, menu: null, W,
};
window.__kart = app;

function disposeScene(s) {
  s?.traverse(o => { if (o.geometry && !o.geometry.userData?.keep) o.geometry.dispose?.(); });
}

class Particles {
  constructor(scene, n = 600) {
    this.n = n; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.i = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pts.frustumCulled = false; scene.add(this.pts);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
  }
  emit(x, y, z, vx, vy, vz, c, life = 0.5) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([c.r, c.g, c.b], i * 3); this.life[i] = life;
  }
  burst(x, y, z, c, k = 20, sp = 6, life = 0.7) { for (let j = 0; j < k; j++) this.emit(x, y, z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp, c, life * (0.5 + Math.random() * 0.5)); }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const k = i * 3;
      if (this.life[i] <= 0) { this.pos[k + 1] = -9999; continue; }
      this.vel[k + 1] -= 9 * dt; this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = Math.min(1, this.life[i] * 3); this.col[k] *= 0.985 + 0.015 * f; this.col[k + 1] *= 0.985 + 0.015 * f; this.col[k + 2] *= 0.985 + 0.015 * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
const SPARK = [new THREE.Color(0xffffff), new THREE.Color(0x3fa9ff), new THREE.Color(0xff8a1a), new THREE.Color(0xc04dff)];
const DUST = { meadow: 0x6b5a3a, beach: 0xe8cf94, canyon: 0xb86a3e, snow: 0xffffff, city: 0x666677, sky: 0x8acb6a };

function buildWorld(trackDef) {
  if (W.scene) disposeScene(W.scene);
  const scene = W.scene = new THREE.Scene();
  const T = W.track = getTrack(trackDef), th = THEMES[T.theme];
  scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
  const sun = W.sun = new THREE.DirectionalLight(th.sun, th.sunI); sun.position.set(60, 120, 40);
  sun.castShadow = !lowFx; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 300 }); sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  W.trackRoot = buildTrackScene(T, scene, { low: lowFx });
  W.boxes = T.boxes.map(b => { const m = makeItemBox(); m.position.set(b.x, b.y + 1.4, b.z); scene.add(m); return m; });
  W.movers = T.movers.map(m => { const o = makeMover(m.kind); scene.add(o); return o; });
  W.particles = new Particles(scene, lowFx ? 350 : 700);
  W.snow = null;
  if (th.snow) {
    const n = lowFx ? 500 : 1200, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * 80, Math.random() * 40, (Math.random() - 0.5) * 80], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    W.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.9, depthWrite: false })); W.snow.frustumCulled = false; scene.add(W.snow);
  }
  W.proj.clear(); W.haz.clear(); W.pool = { puck: [], comet: [], lob: [], puddle: [] };
  // TV cameras for replays: beside the course every 70 m, a little above it
  W.tvCams = []; for (let i = 0; i < T.n; i += Math.round(70 / T.step)) { const side = (i / 47 | 0) % 2 ? 1 : -1, j = T.wrap(i), off = (T.flags[j] & 1) ? T.half[j] + 6 : T.wall[j] + 3; const p = T.point(j, side * off); W.tvCams.push({ i: j, pos: new THREE.Vector3(p.x, p.y + 3 + (i % 3) * 2, p.z) }); }
  // minimap
  drawMinimapBase(T);
}

function kartVisuals(race) {
  for (const v of W.karts) W.scene.remove(v);
  W.karts = race.karts.map(k => { const v = makeKart(k.racer, k.kartDef); W.scene.add(v); return v; });
  if (W.ghost) { W.scene.remove(W.ghost); W.ghost = null; }
}

function makeGhost(g) {
  const r = RACERS.find(x => x.id === g.racer) || RACERS[0], k = KARTS.find(x => x.id === g.kart) || KARTS[1];
  const v = makeKart(r, k);
  v.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => ghostMat(m)) : ghostMat(o.material); o.castShadow = false; } });
  return v;
}
function ghostMat(m) { const c = m.clone(); c.transparent = true; c.opacity = Math.min(c.opacity ?? 1, 0.35); c.depthWrite = false; if (c.emissive) { c.emissive = new THREE.Color(0x46f0ff); c.emissiveIntensity = 0.5; } return c; }

// ---------------------------------------------------------------------------------------------------------------
// race setup
// ---------------------------------------------------------------------------------------------------------------
function entrantsFor(cfg) {
  if (cfg.mode === 'tt') return [{ racer: cfg.racer, kart: cfg.kart, isPlayer: true }];
  const others = RACERS.filter(r => r.id !== cfg.racer);
  const cpus = others.map((r, i) => ({ racer: r.id, kart: (cfg.cpuKarts && cfg.cpuKarts[r.id]) || KARTS[(i * 3 + 1) % KARTS.length].id, isPlayer: false }));
  if (cfg.mode === 'gp' && app.gp && app.gp.race > 0) {
    // later Grand Prix races: grid in reverse order of the standings (the leader starts at the back)
    const all = [{ racer: cfg.racer, kart: cfg.kart, isPlayer: true }, ...cpus];
    all.sort((a, b) => (app.gp.points[a.racer] || 0) - (app.gp.points[b.racer] || 0));
    return all;
  }
  return [...cpus, { racer: cfg.racer, kart: cfg.kart, isPlayer: true }];
}

function startRace(cfg) {
  app.cfg = cfg;
  const def = TRACKS.find(t => t.id === cfg.track) || TRACKS[0];
  buildWorld(def);
  const race = W.race = new Race({ track: def, cls: cfg.cls, entrants: entrantsFor(cfg), mode: cfg.mode, laps: cfg.laps || +Q.get('laps') || def.laps, seed: (Date.now() & 0xffff) ^ 0x5a5a });
  if (Q.has('auto')) race.player.autopilot = true;
  kartVisuals(race);
  W.ghostData = null;
  if (cfg.mode === 'tt' && save.tt[def.id]?.ghost) { W.ghostData = save.tt[def.id].ghost; W.ghost = makeGhost(W.ghostData); W.scene.add(W.ghost); }
  app.replay = null; app.resultsShown = false; app.finishT = 0; app.lastPlace = race.player.place; app.lastCount = null; app.camMode = 'chase';
  hideScreen(); $('hud').classList.remove('hidden'); $('replayTag').classList.add('hidden');
  $('center').textContent = ''; $('msg').textContent = '';
  setState(Q.has('nointro') || cfg.skipIntro ? 'race' : 'intro');
  if (app.state === 'race') race.time = Math.max(race.time, -3.2);
  audio.playSong(Q.has('nomusic') ? 'none' : def.id === 'seaside' ? 'seaside' : def.id);
  audio.tempo = 1;
  snapCamera();
  updateHud(0, true);
}

function setState(s) {
  app.state = s; app.stateT = 0;
  const racing = s === 'race' || s === 'intro' || s === 'finish';
  pad.showTouch(racing);
  document.body.classList.toggle('touchy', pad.kind === 'touch');
}

// ---------------------------------------------------------------------------------------------------------------
// screens and menus
// ---------------------------------------------------------------------------------------------------------------
const scr = $('screen');
function hideScreen() { scr.classList.add('hidden'); scr.innerHTML = ''; app.menu = null; }
function hintHTML(extra = []) {
  const parts = pad.kind === 'touch' ? ['Tap to choose', ...extra.filter(e => e.touch).map(e => e.touch)] :
    [`${pad.glyph('A')} select`, `${pad.glyph('B')} back`, ...extra.map(e => `${pad.glyph(e.b)} ${e.t}`), `${pad.glyph('TOUCH')} controls`, `${pad.glyph('HOME')} Arcade`];
  return `<div class="mhint">${parts.map(p => `<span>${p}</span>`).join('')}</div>`;
}

/**
 * A menu screen. spec: { title, sub, items: [{ label, sub, act, left, right, off }], grid: cols, render(i) → extra HTML,
 * back, cls, extra, onMove(i) }. Navigated with the D-pad / stick / arrow keys, A to choose, B to go back; tap or click works too.
 */
function openMenu(spec) {
  app.menu = { ...spec, i: clamp(spec.start ?? 0, 0, spec.items.length - 1) };
  setState(spec.state || 'menu');
  renderMenu();
}
function renderMenu() {
  const m = app.menu; if (!m) return;
  scr.className = m.cls || ''; scr.classList.remove('hidden');
  const items = m.items.map((it, i) => m.grid ? `<div class="card ${i === m.i ? 'sel' : ''} ${it.off ? 'off' : ''}" data-i="${i}">${it.html || it.label}</div>` :
    `<div class="mitem ${i === m.i ? 'sel' : ''} ${it.off ? 'off' : ''}" data-i="${i}"><span>${it.label}</span>${it.value != null ? `<small>◀ ${it.value} ▶</small>` : it.sub ? `<small>${it.sub}</small>` : ''}</div>`).join('');
  scr.innerHTML = `${m.head || ''}${m.title ? `<h2 class="scr-title">${m.title}</h2>` : ''}${m.sub ? `<p class="scr-sub">${m.sub}</p>` : ''}
    <div class="${m.grid ? 'mgrid' : 'mlist'}" style="${m.grid ? `grid-template-columns: repeat(${m.grid}, 1fr)` : ''}">${items}</div>
    ${m.render ? m.render(m.i) : ''}${hintHTML(m.extra || [])}${m.back ? '<div class="backbtn" id="backBtn">◀ Back</div>' : ''}`;
  scr.querySelectorAll('[data-i]').forEach(el => {
    el.onclick = e => {
      wake(); const i = +el.dataset.i, it = m.items[i];
      if (it.value != null && app.menu === m) {   // option rows: tap the left / right half to change
        const r = el.getBoundingClientRect(); m.i = i; (e.clientX < r.left + r.width / 2 ? it.left : it.right)?.(); renderMenu(); audio.play('ui'); return;
      }
      if (m.i !== i && pad.kind === 'touch' && m.grid && m.tapTwice) { m.i = i; m.onMove?.(i); renderMenu(); audio.play('ui'); return; }
      m.i = i; choose();
    };
  });
  $('backBtn') && ($('backBtn').onclick = () => { audio.play('back'); m.back(); });
  m.onMove?.(m.i);
}
let navWait = 0;
function menuInput(dt) {
  const m = app.menu; if (!m) return;
  let dx = 0, dy = 0;
  if (pad.pressed('UP')) dy = -1; if (pad.pressed('DOWN')) dy = 1; if (pad.pressed('LEFT')) dx = -1; if (pad.pressed('RIGHT')) dx = 1;
  const sx = pad.lx, sy = -pad.ly;
  if (Math.abs(sx) > 0.6 || Math.abs(sy) > 0.6) { navWait -= dt; if (navWait <= 0) { if (Math.abs(sx) > Math.abs(sy)) dx = Math.sign(sx); else dy = Math.sign(sy); navWait = navWait < -1 ? 0.12 : 0.28; } } else navWait = 0;
  if (dx || dy) {
    if (m.grid) { const n = m.items.length, c = m.grid; let i = m.i + dx + dy * c; if (i < 0) i += Math.ceil(n / c) * c; i = ((i % n) + n) % n; m.i = i; audio.play('ui'); renderMenu(); }
    else if (dy) { m.i = (m.i + dy + m.items.length) % m.items.length; audio.play('ui'); renderMenu(); }
    else if (dx) { const it = m.items[m.i]; if (dx < 0 && it.left) { it.left(); audio.play('ui'); renderMenu(); } else if (dx > 0 && it.right) { it.right(); audio.play('ui'); renderMenu(); } }
  }
  if (pad.pressed('A') || (!pad.usingPad && pad.pressed('R1'))) choose();
  else if ((pad.pressed('B') || pad.pressed('START') && app.state === 'menu') && m.back) { audio.play('back'); m.back(); }
}
function choose() { const m = app.menu, it = m?.items[m.i]; if (!it || it.off) { audio.play('back'); return; } audio.play('select'); it.act?.(); }

const statBars = st => ['speed', 'accel', 'handling', 'weight', 'drift'].map(s => `<div class="stat"><span>${{ speed: 'Top speed', accel: 'Acceleration', handling: 'Handling', weight: 'Weight', drift: 'Drift' }[s]}</span><div class="bar"><i style="width:${st[s] / 6 * 100}%"></i></div></div>`).join('');

function titleScreen() {
  setState('title'); app.menu = null;
  scr.className = 'full'; scr.classList.remove('hidden');
  scr.innerHTML = `<div class="logo">DASH DERBY<small>KART RACING</small></div>
    <p class="scr-sub" style="max-width:620px;text-align:center">Eight racers. Six tracks. Drift for mini-turbos, grab item boxes, and take the cup.</p>
    <p class="blink">${pad.kind === 'touch' ? 'Tap to start' : `Press ${pad.glyph('A')} or <kbd>Enter</kbd> to start`}</p>${hintHTML()}`;
  scr.onclick = () => { if (app.state === 'title') { wake(); audio.play('start'); mainMenu(); } };
  audio.playSong('menu');
}

function mainMenu(start = 0) {
  scr.onclick = null;
  audio.playSong('menu');
  openMenu({
    title: 'Main menu', start,
    items: [
      { label: 'Grand Prix', sub: 'Race a cup for the trophy', act: () => classMenu('gp') },
      { label: 'Versus Race', sub: 'One race, any track', act: () => classMenu('race') },
      { label: 'Time Trial', sub: 'Beat your ghost', act: () => racerMenu({ mode: 'tt', cls: 'swift' }) },
      { label: 'Options', act: optionsMenu },
      { label: 'Controls', act: () => overlay.show() },
      { label: 'Back to Arcade', act: () => goHome() },
    ],
    back: () => titleScreen(),
  });
}

function classMenu(mode) {
  openMenu({
    title: mode === 'gp' ? 'Grand Prix' : 'Versus Race', sub: 'Choose an engine class',
    start: Math.max(0, CLASSES.findIndex(c => c.id === settings.cls)),
    items: CLASSES.map(c => ({ label: c.name, sub: `${c.cc} · ${Math.round(c.speed * 100)} cc`, act: () => { settings.cls = c.id; writeSave(); racerMenu({ mode, cls: c.id }); } })),
    back: () => mainMenu(mode === 'gp' ? 0 : 1),
  });
}

function racerMenu(cfg) {
  openMenu({
    title: 'Choose your racer', grid: 4, tapTwice: true, start: Math.max(0, RACERS.findIndex(r => r.id === settings.racer)),
    items: RACERS.map(r => ({ html: `${portraitSVG(r, 58)}<div>${r.name}</div><div class="tag">${r.size}</div>`, act: () => { settings.racer = r.id; writeSave(); kartMenu({ ...cfg, racer: r.id }); } })),
    onMove: i => showroomKart(RACERS[i].id, settings.kart),
    render: i => { const r = RACERS[i]; return `<div class="panel"><h3 style="color:${r.color}">${r.name}</h3><p>${r.blurb}</p>${statBars(kartStats(r, settings.kart))}</div>`; },
    back: () => cfg.mode === 'tt' ? mainMenu(2) : classMenu(cfg.mode),
  });
}

function kartMenu(cfg) {
  const r = RACERS.find(x => x.id === cfg.racer);
  openMenu({
    title: 'Choose your kart', grid: 2, tapTwice: true, start: Math.max(0, KARTS.findIndex(k => k.id === settings.kart)),
    items: KARTS.map(k => ({ html: `<div style="font-size:18px">${k.name}</div><div class="tag">${k.blurb}</div>`, act: () => { settings.kart = k.id; writeSave(); (cfg.mode === 'gp' ? cupMenu : trackMenu)({ ...cfg, kart: k.id }); } })),
    onMove: i => showroomKart(cfg.racer, KARTS[i].id),
    render: i => `<div class="panel"><h3>${r.name} · ${KARTS[i].name}</h3>${statBars(kartStats(r, KARTS[i]))}</div>`,
    back: () => racerMenu(cfg),
  });
}

function trophyHTML(cupId) { const t = save.cups[cupId] || {}; return CLASSES.map(c => t[c.id] ? `<span class="trophy g${t[c.id]}" title="${c.name}"></span>` : '').join(''); }
function cupMenu(cfg) {
  openMenu({
    title: 'Choose a cup', sub: CLASSES.find(c => c.id === cfg.cls).name + ' class', grid: 3, tapTwice: true,
    items: CUPS.map(c => ({ html: `<div class="cup" style="color:${c.color}">🏆</div><div>${c.name}</div><div class="tag">${c.tracks.length} races</div><div class="rec">${trophyHTML(c.id)}</div>`, act: () => startGP({ ...cfg, cup: c.id }) })),
    render: i => `<div class="panel"><h3>${CUPS[i].name}</h3>${CUPS[i].tracks.map((t, k) => `<div>${k + 1}. ${TRACKS.find(x => x.id === t).name}</div>`).join('')}</div>`,
    back: () => kartMenu(cfg),
  });
}

function trackPreview(def, size = 120) {
  const T = getTrack(def), b = T.bounds, s = (size - 16) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const pts = []; for (let i = 0; i < T.n; i += 4) pts.push(`${(8 + (b.maxX - T.x[i]) * s).toFixed(1)},${(8 + (T.z[i] - b.minZ) * s).toFixed(1)}`);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size * 0.75}"><polyline points="${pts.join(' ')} ${pts[0]}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/><polyline points="${pts.join(' ')} ${pts[0]}" fill="none" stroke="${THEMES[def.theme].kerb[0]}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
function trackMenu(cfg) {
  openMenu({
    title: cfg.mode === 'tt' ? 'Time Trial: choose a track' : 'Choose a track', grid: 3, tapTwice: true, start: Math.max(0, TRACKS.findIndex(t => t.id === settings.track)),
    items: TRACKS.map(t => ({ html: `${trackPreview(t)}<div>${t.name}</div><div class="rec">${save.tt[t.id] ? '⏱ ' + fmtTime(save.tt[t.id].best) : ''}</div>`, act: () => { settings.track = t.id; writeSave(); startRace({ ...cfg, track: t.id }); } })),
    render: i => { const t = TRACKS[i], r = save.tt[t.id]; return `<div class="panel"><h3>${t.name}</h3><p>${t.blurb}</p>${cfg.mode === 'tt' ? `<div>Best: <b>${r ? fmtTime(r.best) : '--'}</b>${r ? ` (${RACERS.find(x => x.id === r.racer)?.name || ''}) · best lap ${fmtTime(r.lap)}` : ''}${r?.ghost ? ' · ghost saved' : ''}</div>` : ''}</div>`; },
    back: () => kartMenu(cfg),
  });
}

function optionsMenu(fromPause = false) {
  const items = [
    { label: 'Music', get value() { return settings.music ? 'On' : 'Off'; }, left: () => tog('music'), right: () => tog('music'), act: () => { tog('music'); renderMenu(); } },
    { label: 'Auto-accelerate (touch)', get value() { return settings.autoGas ? 'On' : 'Off'; }, left: () => tog('autoGas'), right: () => tog('autoGas'), act: () => { tog('autoGas'); renderMenu(); } },
    { label: 'Camera', get value() { return settings.cam === 'far' ? 'Far' : 'Near'; }, left: () => { settings.cam = settings.cam === 'far' ? 'near' : 'far'; writeSave(); }, right: () => { settings.cam = settings.cam === 'far' ? 'near' : 'far'; writeSave(); }, act: () => { settings.cam = settings.cam === 'far' ? 'near' : 'far'; writeSave(); renderMenu(); } },
    { label: 'Minimap', get value() { return settings.minimap ? 'On' : 'Off'; }, left: () => tog('minimap'), right: () => tog('minimap'), act: () => { tog('minimap'); renderMenu(); } },
    { label: 'Erase records', sub: 'Best times, ghosts, trophies', act: () => { save.tt = {}; save.cups = {}; writeSave(); toast('Records erased'); } },
    { label: 'Done', act: () => fromPause ? pauseMenu() : mainMenu(3) },
  ];
  openMenu({ title: 'Options', items, back: () => fromPause ? pauseMenu() : mainMenu(3), cls: fromPause ? 'dim' : '', state: fromPause ? 'paused' : 'menu' });
}
function tog(k) { settings[k] = !settings[k]; writeSave(); if (k === 'music') audio.setMusic(settings.music); }
function toast(t) { const m = $('msg'); m.className = ''; m.textContent = t; app.msgT = 1.6; }

function pauseMenu() {
  app.paused = true;
  openMenu({
    title: 'Paused', cls: 'dim', state: 'paused',
    items: [
      { label: 'Resume', act: resume },
      { label: 'Restart race', act: () => { app.paused = false; restartRace(); } },
      { label: 'Options', act: () => optionsMenu(true) },
      { label: 'Controls', act: () => overlay.show() },
      { label: 'Quit to menu', act: () => { app.paused = false; quitToMenu(); } },
      { label: 'Back to Arcade', act: () => goHome() },
    ],
    back: resume,
  });
}
function resume() { app.paused = false; hideScreen(); setState(app.prePause || 'race'); }
function restartRace() {
  if (app.cfg.mode === 'gp' && app.gp) { app.gp.points = { ...app.gp.before }; }
  startRace({ ...app.cfg });
}
function quitToMenu() { app.gp = null; $('hud').classList.add('hidden'); audio.updateEngine(null); mainMenu(); }

// ---- Grand Prix ----
function startGP(cfg) {
  const cup = CUPS.find(c => c.id === cfg.cup);
  const cpuKarts = {}; RACERS.forEach((r, i) => { cpuKarts[r.id] = KARTS[(i * 3 + 1) % KARTS.length].id; });
  app.gp = { cup, race: 0, points: Object.fromEntries(RACERS.map(r => [r.id, 0])), before: null, results: [], cpuKarts };
  nextGPRace(cfg);
}
function nextGPRace(cfg) {
  const gp = app.gp; gp.before = { ...gp.points };
  startRace({ ...cfg, mode: 'gp', track: gp.cup.tracks[gp.race], cpuKarts: gp.cpuKarts });
}

// ---- results, standings, podium ----
function showResults() {
  const race = W.race; race.estimateFinish();
  app.resultsShown = true;
  const gp = app.cfg.mode === 'gp' ? app.gp : null;
  if (gp) { race.order.forEach((k, i) => { gp.points[k.racer.id] = (gp.points[k.racer.id] || 0) + POINTS[i]; }); }
  const P = race.player, tt = app.cfg.mode === 'tt';
  let recordNote = '';
  if (tt) {
    const id = race.def.id, prev = save.tt[id], best = P.finishTime, lap = Math.min(...P.lapTimes);
    if (!prev || best < prev.best) {
      const frames = race.rec.frames.map(f => { const k = f.k[0]; return [+(f.t.toFixed(2)), +k[0].toFixed(2), +k[1].toFixed(2), +k[2].toFixed(2), +k[3].toFixed(3)]; });
      save.tt[id] = { best, lap: prev ? Math.min(prev.lap, lap) : lap, racer: P.racer.id, kart: P.kartDef.id, ghost: { racer: P.racer.id, kart: P.kartDef.id, frames } };
      writeSave(); recordNote = prev ? `<p class="scr-sub" style="color:#7ddf3a">New record! ${(prev.best - best).toFixed(3)} s faster. Ghost saved.</p>` : '<p class="scr-sub" style="color:#7ddf3a">First record set. Ghost saved: race it next time.</p>';
    } else { if (lap < prev.lap) { prev.lap = lap; writeSave(); } recordNote = `<p class="scr-sub">Record: ${fmtTime(prev.best)} (+${(best - prev.best).toFixed(3)} s)</p>`; }
  }
  const rows = tt ? P.lapTimes.map((t, i) => `<tr class="${t === Math.min(...P.lapTimes) ? 'me' : ''}"><td class="pos">L${i + 1}</td><td>Lap ${i + 1}</td><td class="time">${fmtTime(t)}</td></tr>`).join('') + `<tr><td class="pos">⏱</td><td><b>Total</b></td><td class="time"><b>${fmtTime(P.finishTime)}</b></td></tr>` :
    race.order.map((k, i) => `<tr class="${k.isPlayer ? 'me' : ''}"><td class="pos">${i + 1}</td><td class="port">${portraitSVG(k.racer, 34)}</td><td>${k.name}</td><td class="time">${k.estimated ? '~' : ''}${fmtTime(k.finishTime)}</td>${gp ? `<td class="pts">+${POINTS[i]}</td>` : ''}</tr>`).join('');
  const items = [];
  if (gp) items.push({ label: gp.race + 1 < gp.cup.tracks.length ? 'Standings' : 'Final standings', act: standings });
  else items.push({ label: tt ? 'Try again' : 'Race again', act: restartRace });
  items.push({ label: 'Watch replay', act: startReplay });
  if (!gp) items.push({ label: tt ? 'Change track' : 'Change track', act: () => { $('hud').classList.add('hidden'); trackMenu({ mode: app.cfg.mode, cls: app.cfg.cls, racer: app.cfg.racer, kart: app.cfg.kart }); } });
  if (gp) items.push({ label: 'Restart this race', act: restartRace });
  items.push({ label: 'Quit to menu', act: quitToMenu });
  openMenu({
    head: `<h2 class="scr-title">${tt ? 'Time Trial' : `${ordinal(P.place)} place`}</h2><p class="scr-sub">${race.def.name}${gp ? ` · ${gp.cup.name} race ${gp.race + 1}/${gp.cup.tracks.length}` : ''}</p>${recordNote}<table class="res">${rows}</table><div style="height:12px"></div>`,
    items, cls: 'dim', state: 'results',
  });
  audio.playSong('results');
}
function standings() {
  const gp = app.gp, last = gp.race + 1 >= gp.cup.tracks.length;
  const order = RACERS.map(r => r.id).sort((a, b) => gp.points[b] - gp.points[a]);
  const rows = order.map((id, i) => { const r = RACERS.find(x => x.id === id); return `<tr class="${id === app.cfg.racer ? 'me' : ''}"><td class="pos">${i + 1}</td><td class="port">${portraitSVG(r, 34)}</td><td>${r.name}</td><td class="pts">${gp.points[id]}</td></tr>`; }).join('');
  openMenu({
    head: `<h2 class="scr-title">${gp.cup.name} standings</h2><p class="scr-sub">After race ${gp.race + 1} of ${gp.cup.tracks.length}</p><table class="res">${rows}</table><div style="height:12px"></div>`,
    items: last ? [{ label: 'Trophy ceremony', act: () => podium(order) }] : [{ label: `Next race: ${TRACKS.find(t => t.id === gp.cup.tracks[gp.race + 1]).name}`, act: () => { gp.race++; nextGPRace(app.cfg); } }, { label: 'Quit cup', act: quitToMenu }],
    cls: 'dim', state: 'results',
  });
}
function podium(order) {
  const gp = app.gp, me = order.indexOf(app.cfg.racer) + 1;
  if (me <= 3) { const prev = save.cups[gp.cup.id]?.[app.cfg.cls]; save.cups[gp.cup.id] = { ...(save.cups[gp.cup.id] || {}), [app.cfg.cls]: prev ? Math.min(prev, me) : me }; writeSave(); }
  const top = order.slice(0, 3).map(id => RACERS.find(r => r.id === id));
  const blocks = [1, 0, 2].map(k => `<div>${portraitSVG(top[k], 64)}<div>${top[k].name}</div><div class="blk" style="height:${[110, 80, 60][k]}px;background:${['#ffd166', '#cfd8e3', '#d08b4f'][k]}">${k + 1}</div></div>`).join('');
  openMenu({
    head: `<div class="logo" style="font-size:48px">${me === 1 ? 'CHAMPION!' : me <= 3 ? 'ON THE PODIUM!' : 'CUP COMPLETE'}</div><p class="scr-sub">${gp.cup.name} · ${CLASSES.find(c => c.id === app.cfg.cls).name} class · you finished ${ordinal(me)} with ${gp.points[app.cfg.racer]} points${me <= 3 ? ' · trophy saved' : ''}</p><div class="podium">${blocks}</div>`,
    items: [{ label: 'Back to menu', act: quitToMenu }, { label: 'Race this cup again', act: () => startGP({ ...app.cfg, cup: gp.cup.id }) }],
    cls: 'full', state: 'results',
  });
  audio.play(me <= 3 ? 'finish' : 'finishBad');
}

// ---------------------------------------------------------------------------------------------------------------
// replay
// ---------------------------------------------------------------------------------------------------------------
function startReplay() {
  const fr = W.race.rec.frames; if (fr.length < 10) return;
  hideScreen(); setState('replay');
  app.replay = { t: fr[0].t, i: 0, follow: W.race.karts.indexOf(W.race.player), speed: 1, mode: 'tv', camI: -1, camT: 0 };
  $('replayTag').classList.remove('hidden'); $('center').textContent = ''; $('msg').textContent = '';
  audio.playSong(W.race.def.id);
}
function endReplay() { $('replayTag').classList.add('hidden'); app.replay = null; showResultsMenuOnly(); }
function showResultsMenuOnly() { app.resultsShown = false; const keep = app.gp ? { ...app.gp.points } : null; if (app.gp) { app.gp.points = { ...app.gp.before }; } showResults(); if (keep) app.gp.points = keep; }

function replayFrame(dt) {
  const R = app.replay, fr = W.race.rec.frames;
  if (pad.pressed('A') || pad.pressed('B') || pad.pressed('START')) { endReplay(); return; }
  if (pad.pressed('RIGHT')) R.follow = (R.follow + 1) % W.karts.length;
  if (pad.pressed('LEFT')) R.follow = (R.follow - 1 + W.karts.length) % W.karts.length;
  if (pad.pressed('Y') || pad.pressed('SELECT')) R.mode = R.mode === 'tv' ? 'chase' : 'tv';
  R.speed = pad.down('R1') || pad.down('R2') ? 3 : pad.down('L1') || pad.down('L2') ? 0.35 : 1;
  R.t += dt * R.speed;
  while (R.i < fr.length - 2 && fr[R.i + 1].t <= R.t) R.i++;
  if (R.i >= fr.length - 2) { endReplay(); return; }
  const a = fr[R.i], b = fr[R.i + 1], f = clamp((R.t - a.t) / (b.t - a.t), 0, 1);
  W.track.updateMovers(Math.max(0, R.t));
  W.karts.forEach((v, k) => {
    const A = a.k[k], Bk = b.k[k];
    const st = { x: lerp(A[0], Bk[0], f), y: lerp(A[1], Bk[1], f), z: lerp(A[2], Bk[2], f), h: A[3] + angDiff(Bk[3], A[3]) * f, roll: A[4], flags: A[5], tier: A[6], sp: A[7] };
    poseKart(v, st, dt, null);
  });
  W.boxes.forEach((m, i) => { m.visible = !a.b[i]; });
  syncPool('proj', a.p.map(p => ({ type: p[0], x: p[1], y: p[2], z: p[3] })), dt);
  syncPool('haz', a.h.map(h => ({ type: 'puddle', x: h[0], y: h[1], z: h[2] })), dt);
  const K = a.k[R.follow], kv = W.karts[R.follow];
  const target = new THREE.Vector3(kv.position.x, kv.position.y + 1, kv.position.z);
  if (R.mode === 'tv') {
    // the TV camera that is closest ahead of (or just behind) the followed kart
    let best = null, bd = Infinity;
    for (const c of W.tvCams) { const d = c.pos.distanceTo(target); if (d < bd) { bd = d; best = c; } }
    R.camT -= dt; if (best && (best !== R.cam && R.camT <= 0 || !R.cam)) { R.cam = best; R.camT = 1.2; }
    camera.position.copy(R.cam.pos); camera.lookAt(target); camera.fov = clamp(70 - (R.cam.pos.distanceTo(target) - 10) * 0.6, 22, 70); camera.updateProjectionMatrix();
  } else chaseCamera(dt, { x: K[0], y: K[1], z: K[2], h: K[3], md: K[3], boost: K[5] & 1 }, false, true);
  const name = W.race.karts[R.follow].name;
  $('replayInfo').innerHTML = pad.kind === 'touch' ? `${name} · tap to exit` : `${name} · ${pad.glyph('LEFT')}${pad.glyph('RIGHT')} racer · ${pad.glyph('Y')} ${R.mode === 'tv' ? 'TV' : 'chase'} cam · hold ${pad.glyph('R1')} fast / ${pad.glyph('L1')} slow · ${pad.glyph('A')} exit`;
  $('replayTag').onclick = endReplay;
  updateHud(dt, false, { replay: true, place: K[8], lap: K[9], sp: K[7] });
}

// ---------------------------------------------------------------------------------------------------------------
// drawing karts, items and particles
// ---------------------------------------------------------------------------------------------------------------
const _c = new THREE.Color();
function poseKart(v, st, dt, k) {
  const u = v.userData;
  v.position.set(st.x, st.y, st.z); v.rotation.y = st.h;
  u.tilt.rotation.z = st.roll || 0;
  u.tilt.position.y = k ? (k.air && k.hop ? 0 : 0) : 0;
  const boosting = !!(st.flags & 1), spinning = !!(st.flags & 4), falling = !!(st.flags & 32);
  u.flames.forEach((f, i) => { f.visible = boosting; if (boosting) f.scale.set(1, 0.7 + Math.random() * 0.6, 1); });
  u.shield.visible = !!(st.flags & 8) || !!(st.flags & 16);
  if (st.flags & 16) { u.shield.material.color.setHSL((performance.now() / 600) % 1, 0.9, 0.6); u.shield.material.emissive.setHSL((performance.now() / 600) % 1, 0.9, 0.5); u.shield.material.opacity = 0.35; }
  else { u.shield.material.color.set(0x7fd8ff); u.shield.material.emissive.set(0x3fb8ff); u.shield.material.opacity = 0.22; }
  const wr = (st.sp || 0) * dt;
  for (const w of u.wheels) { w.children[0].rotation.x += 0; w.rotation.x += wr / w.userData.r; if (w.userData.front && k) w.rotation.y = -k.ctl.steer * 0.35 * (k.spinT > 0 ? 0 : 1); }
  u.tilt.rotation.x = k && k.spinT > 1.0 && k.air ? (k.spinT - 1) * 12 : 0;
  u.blob.visible = !falling;
  if (k) { u.blob.position.y = 0.04 - (k.air ? 0 : 0); u.blob.material.opacity = k.air ? 0.15 : 0.32; }
  // drift sparks and dust
  const P = W.particles;
  if (st.flags & 2 && st.tier > 0 && P) {
    const c = SPARK[st.tier], sx = Math.sin(st.h), sz = Math.cos(st.h), rx = -Math.cos(st.h), rz = Math.sin(st.h);
    for (const s of [-1, 1]) { const x = st.x - sx * 1.1 + rx * s * 0.85, z = st.z - sz * 1.1 + rz * s * 0.85; P.emit(x, st.y + 0.25, z, (Math.random() - 0.5) * 3 - sx * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 3 - sz * 2, c, 0.3); }
  } else if (st.flags & 2 && P && Math.random() < 0.5) {
    _c.set(0xcccccc); P.emit(st.x - Math.sin(st.h) * 1.2, st.y + 0.2, st.z - Math.cos(st.h) * 1.2, 0, 1, 0, _c, 0.25);
  }
  if (st.flags & 64 && (st.sp || 0) > 6 && P && Math.random() < 0.6) { _c.set(DUST[W.track.theme] || 0x887766).multiplyScalar(0.6); P.emit(st.x - Math.sin(st.h) * 1.2, st.y + 0.3, st.z - Math.cos(st.h) * 1.2, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, _c, 0.5); }
  if (boosting && P && Math.random() < 0.7) { _c.set(0xffa040); P.emit(st.x - Math.sin(st.h) * 1.6, st.y + 0.5, st.z - Math.cos(st.h) * 1.6, 0, 0.5, 0, _c, 0.25); }
  if (spinning && P && Math.random() < 0.4) { _c.set(0xffee88); P.emit(st.x, st.y + 2.2, st.z, (Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3, _c, 0.4); }
}

function poolGet(type) {
  const p = W.pool[type]; for (const m of p) if (!m.visible) return m;
  const m = type === 'puck' ? makePuck() : type === 'comet' ? makeComet() : type === 'lob' ? makeLob() : makePuddle();
  W.scene.add(m); p.push(m); return m;
}
function syncPool(which, list, dt) {
  for (const arr of Object.values(W.pool)) for (const m of arr) if (m.userData.group === which) m.visible = false;
  for (const o of list) {
    const m = poolGet(o.type === 'puddle' ? 'puddle' : o.type); m.visible = true; m.userData.group = which;
    m.position.set(o.x, o.y, o.z);
    if (o.type === 'puck') m.rotation.y += dt * 12;
    if (o.type === 'comet') { m.rotation.y = o.dir ?? m.rotation.y; if (W.particles) { _c.set(0xff8a2b); W.particles.emit(o.x, o.y, o.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, _c, 0.6); } }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------------------------------------------
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function snapCamera() { const k = W.race?.player; if (!k) return; chaseCamera(1, { x: k.x, y: k.y, z: k.z, h: k.h, md: k.md }, false, true, true); }
function chaseCamera(dt, k, back, smooth = true, snap = false) {
  const far = settings.cam === 'far', dist = (far ? 7.4 : 5.8) + (app.camZoom || 0), height = far ? 3.0 : 2.5;
  let dir = k.md != null ? k.md + angDiff(k.h, k.md) * 0.35 : k.h; if (back) dir += Math.PI;
  const C = app.cam;
  _v.set(k.x - Math.sin(dir) * dist, k.y + height, k.z - Math.cos(dir) * dist);
  _w.set(k.x + Math.sin(dir) * 4, k.y + 1.1, k.z + Math.cos(dir) * 4);
  const a = snap ? 1 : 1 - Math.exp(-dt * (back ? 30 : 9));
  C.pos.lerp(_v, a); C.look.lerp(_w, snap ? 1 : 1 - Math.exp(-dt * 14));
  // keep the camera above the road surface
  if (W.track) { const L = W.track.locate(C.pos.x, C.pos.z, W.race?.player?.idx ?? -1, {}); if (C.pos.y < L.y + 1.2) C.pos.y = L.y + 1.2; }
  camera.position.copy(C.pos);
  if (C.shake > 0) { camera.position.x += (Math.random() - 0.5) * C.shake; camera.position.y += (Math.random() - 0.5) * C.shake; C.shake = Math.max(0, C.shake - dt * 2); }
  camera.lookAt(C.look);
  const fov = 68 + (k.boost ? 10 : 0); C.fov = lerp(C.fov, fov, 1 - Math.exp(-dt * 4)); camera.fov = C.fov; camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------------------------------------------
let mm = null;
function drawMinimapBase(T) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 200; const x = cv.getContext('2d');
  const b = T.bounds, s = 172 / Math.max(b.maxX - b.minX, b.maxZ - b.minZ), ox = (200 - (b.maxX - b.minX) * s) / 2, oz = (200 - (b.maxZ - b.minZ) * s) / 2;
  const map = (px, pz) => [ox + (b.maxX - px) * s, oz + (pz - b.minZ) * s];
  x.lineJoin = 'round'; x.lineCap = 'round';
  for (const [w, c] of [[11, '#0009'], [7, '#ffffffdd'], [3, '#2b3550']]) { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); for (let i = 0; i <= T.n; i += 3) { const [u, v] = map(T.x[i % T.n], T.z[i % T.n]); i ? x.lineTo(u, v) : x.moveTo(u, v); } x.closePath(); x.stroke(); }
  const [u0, v0] = map(T.x[0], T.z[0]); x.fillStyle = '#fff'; x.fillRect(u0 - 4, v0 - 4, 8, 8);
  mm = { base: cv, map };
}
function drawMinimap(karts) {
  const cv = $('minimap'); cv.style.display = settings.minimap ? '' : 'none'; if (!settings.minimap || !mm) return;
  const x = cv.getContext('2d'); x.clearRect(0, 0, 200, 200); x.drawImage(mm.base, 0, 0);
  for (const k of [...karts].reverse()) { const [u, v] = mm.map(k.x, k.z); x.fillStyle = k.color; x.strokeStyle = k.me ? '#fff' : '#0008'; x.lineWidth = k.me ? 3 : 1.5; x.beginPath(); x.arc(u, v, k.me ? 7 : 5, 0, 7); x.fill(); x.stroke(); }
}
const ICON_ORDER = Object.keys(ITEM_ICON);
let lastHud = {};
function setText(id, t) { if (lastHud[id] !== t) { lastHud[id] = t; $(id).innerHTML = t; } }
function updateHud(dt, force, rp) {
  const race = W.race; if (!race) return;
  const P = race.player;
  if (force) lastHud = {};
  const place = rp ? rp.place : P.place;
  setText('place', String(place)); setText('placeSuf', ordinal(place).slice(-2));
  $('placeBox').classList.toggle('p1', place === 1);
  if (place !== app.lastPlace) { const pb = $('placeBox'); pb.classList.remove('bump'); void pb.offsetWidth; pb.classList.add('bump'); app.lastPlace = place; }
  const lap = rp ? rp.lap : P.lap;
  setText('lapText', `LAP ${clamp(lap, 1, race.laps)}/${race.laps}`);
  setText('timeText', fmtTime(Math.max(0, P.finished ? P.finishTime : race.time)));
  if (!rp) {
    const bestLap = save.tt[race.def.id]?.lap;
    setText('lapTimes', P.lapTimes.map((t, i) => `<div class="${app.cfg.mode === 'tt' && bestLap ? (t <= bestLap ? 'best' : 'worse') : ''}">L${i + 1} ${fmtTime(t)}</div>`).join(''));
  }
  // item slot
  const ib = document.querySelector('.ibox');
  if (!rp && P.rouletteT > 0) { const k = ICON_ORDER[Math.floor(performance.now() / 80) % ICON_ORDER.length]; $('itemIcon').innerHTML = ITEM_ICON[k]; lastHud.itemIcon = null; ib.classList.add('roll'); setText('itemUses', ''); setText('itemName', ''); }
  else { ib.classList.remove('roll'); const it = rp ? null : P.item; setText('itemIcon', it ? ITEM_ICON[it] : ''); setText('itemUses', it && ITEMS[it].uses > 1 ? '×' + P.uses : ''); setText('itemName', it ? `${ITEMS[it].name}<br><small>${pad.kind === 'touch' ? 'ITEM' : pad.glyph('L1')} ${ITEMS[it].desc}</small>` : ''); }
  // speed and drift charge
  const sp = rp ? rp.sp : P.sp;
  setText('speed', String(Math.round(Math.abs(sp) * 3.6)));
  const bar = $('driftBar').firstChild, d = P.drift;
  if (!rp && d.on) { const t = d.charge / 2.7; bar.style.width = `${Math.min(100, t * 100)}%`; bar.style.background = ['#aab4c8', '#3fa9ff', '#ff8a1a', '#c04dff'][d.tier]; } else bar.style.width = '0';
  // ranks
  if (!rp) setText('ranks', race.order.map((k, i) => `<div class="${k.isPlayer ? 'me' : ''}"><b>${i + 1}</b><i style="background:${k.color}"></i>${k.name}</div>`).join(''));
  drawMinimap(race.karts.map((k, i) => { const v = W.karts[i]; return { x: v.position.x, z: v.position.z, color: k.color, me: rp ? i === app.replay.follow : k.isPlayer }; }));
  if (!rp && race.state === 'race' && race.time < 5 && pad.kind !== 'touch') setText('hint', `<span>${pad.glyph('R2')}/${pad.glyph('A')} gas</span><span>${pad.glyph('R1')} hold to drift</span><span>${pad.glyph('L1')} item</span>`);
  else setText('hint', '');
}

// ---------------------------------------------------------------------------------------------------------------
// main race frame
// ---------------------------------------------------------------------------------------------------------------
function raceEvents(race) {
  const P = race.player;
  for (const e of race.takeEvents()) {
    const mine = e.kart === P, near = e.kart && P ? Math.hypot(e.kart.x - P.x, e.kart.z - P.z) : 0, vol = mine ? 1 : clamp(1 - near / 60, 0, 0.7);
    switch (e.type) {
      case 'go': audio.play('go'); flashCenter('GO!'); break;
      case 'box': if (mine) audio.play('box'); else if (vol > 0.2) audio.play('box', { vol: vol * 0.5 }); W.particles.burst(e.kart.x, e.kart.y + 1.4, e.kart.z, new THREE.Color(0xffd166), 18, 7); break;
      case 'boxPop': W.particles.burst(e.kart.x, e.kart.y + 1.4, e.kart.z, new THREE.Color(0xff7eb6), 10, 6); break;
      case 'itemReady': if (mine) audio.play('itemReady'); break;
      case 'miniturbo': if (mine) { audio.play('miniturbo', { tier: 1 }); pad.rumble(0.3, 0.2, 120); } break;
      case 'driftTier': if (mine) { audio.play('tier', { tier: e.tier }); pad.rumble(0.2, 0, 60); } break;
      case 'startBoost': if (mine) { audio.play('boost'); flashMsg('START BOOST!'); } break;
      case 'stall': if (mine) { audio.play('stall'); flashMsg('Too early!'); } break;
      case 'pepper': case 'pad': case 'trickBoost': if (mine) { audio.play(e.type === 'pad' ? 'pad' : 'boost'); app.cam.shake = 0.15; } break;
      case 'nova': audio.play('nova', { vol }); break;
      case 'hop': if (mine) audio.play('hop'); break;
      case 'land': if (mine) { audio.play('land'); pad.rumble(0.4, 0.4, 100); } break;
      case 'wall': if (mine) { audio.play('wall'); pad.rumble(0.6, 0.6, 140); app.cam.shake = 0.25; } break;
      case 'bump': if (mine || e.other === P) { audio.play('bump'); pad.rumble(0.4, 0.3, 90); } else if (vol > 0.2) audio.play('bump', { vol: vol * 0.5 }); break;
      case 'hit': if (mine) { audio.play('hit'); audio.play('spin'); pad.rumble(1, 1, 400); app.cam.shake = 0.5; } else if (vol > 0.1) audio.play('hit', { vol }); W.particles.burst(e.kart.x, e.kart.y + 1.5, e.kart.z, new THREE.Color(e.kind === 'zap' ? 0x9fe8ff : 0xffee88), 24, 8); if (e.by === P && !mine) flashMsg(`Hit ${e.kart.name}!`); break;
      case 'fire': audio.play('fire', { vol }); break;
      case 'drop': audio.play('drop', { vol }); break;
      case 'splat': audio.play('splat', { vol: e.kart === P ? 1 : 0.5 }); W.particles.burst(e.x, (e.kart?.y ?? P.y) + 0.5, e.z, new THREE.Color(0x7ddf3a), 20, 6); break;
      case 'puckHit': break;
      case 'puckBounce': break;
      case 'shield': audio.play('shield', { vol }); break;
      case 'shieldPop': audio.play('shieldPop', { vol }); break;
      case 'comet': audio.play('comet', { vol: e.target === P ? 1 : vol }); if (e.target === P) flashMsg('☄ Comet incoming!', true); break;
      case 'explode': audio.play('explode', { vol: 0.7 }); W.particles.burst(e.x, e.y, e.z, new THREE.Color(0xff8a2b), 40, 12, 0.9); break;
      case 'storm': audio.play('storm'); stormFlash(); if (!mine && e.kart.place > P.place) flashMsg(`⚡ ${e.kart.name} used Static Storm!`, true); break;
      case 'lap': if (mine) { if (e.lap === race.laps) { audio.play('finalLap'); flashMsg('FINAL LAP!'); audio.tempo = 1.12; } else if (e.lap > 1) { audio.play('lap'); flashMsg(`LAP ${e.lap}`); } } break;
      case 'finish': if (mine) onPlayerFinish(); break;
      case 'fall': if (mine) { audio.play('fall'); } break;
      case 'respawn': if (mine) audio.play('respawn'); break;
      case 'ramp': if (mine) audio.play('ramp'); break;
      case 'trick': if (mine) audio.play('trick'); break;
      default: break;
    }
  }
}
function flashCenter(t, small = '') { const c = $('center'); c.innerHTML = t + (small ? `<small>${small}</small>` : ''); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); app.centerT = 1.1; }
function flashMsg(t, warn = false) { const m = $('msg'); m.textContent = t; m.className = warn ? 'warn' : ''; app.msgT = 1.8; }
function stormFlash() { const f = $('fade'); f.style.background = '#cfefff'; f.classList.add('on'); setTimeout(() => { f.classList.remove('on'); setTimeout(() => { f.style.background = ''; }, 300); }, 90); }

function onPlayerFinish() {
  const P = W.race.player, good = P.place <= 3 || app.cfg.mode === 'tt';
  audio.play(good ? 'finish' : 'finishBad'); audio.tempo = 1;
  flashCenter(app.cfg.mode === 'tt' ? 'FINISH!' : ordinal(P.place), app.cfg.mode === 'tt' ? fmtTime(P.finishTime) : 'FINISH!');
  app.centerT = 3; app.finishT = 0; setState('finish');
}

function raceFrame(dt) {
  const race = W.race, P = race.player;
  if (pad.pressed('START') && (app.state === 'race' || app.state === 'intro')) { app.prePause = app.state; pauseMenu(); return; }
  if (pad.pressed('SELECT')) { settings.cam = settings.cam === 'far' ? 'near' : 'far'; writeSave(); }
  if (pad.pressed('UP')) { settings.minimap = !settings.minimap; writeSave(); }
  if (pad.pressed('LEFT')) app.camZoom = Math.max(-1.5, (app.camZoom || 0) - 0.5);
  if (pad.pressed('RIGHT')) app.camZoom = Math.min(3, (app.camZoom || 0) + 0.5);
  if (pad.pressed('L3')) audio.play('horn');
  if (app.state === 'intro') {
    // flyover: a sweeping crane shot of the grid with the track name
    app.stateT += dt;
    const k = P, t = Math.min(1, app.stateT / 3.2), a = Math.PI * (1 - t) * 0.95 + 0.05, r = lerp(26, 7, t), hgt = lerp(14, 3, t);
    const dir = k.h + a;
    camera.position.set(k.x - Math.sin(dir) * r, k.y + hgt, k.z - Math.cos(dir) * r); camera.lookAt(k.x, k.y + 1, k.z); camera.fov = 60; camera.updateProjectionMatrix();
    app.cam.pos.copy(camera.position); app.cam.look.set(k.x, k.y + 1, k.z);
    if (app.stateT < 0.1) flashCenter(`<span style="font-size:.45em">${race.def.name}</span>`, app.cfg.mode === 'gp' ? `${app.gp.cup.name} · Race ${app.gp.race + 1}` : app.cfg.mode === 'tt' ? 'Time Trial' : CLASSES.find(c => c.id === app.cfg.cls).name + ' class');
    if (app.stateT > 3.2 || pad.pressed('A') || pad.pressed('R2') || pad.pressed('R1') || (pad.kind === 'touch' && app.stateT > 1.6 && settings.autoGas && false)) { setState('race'); race.time = Math.max(race.time, -3.6); $('center').textContent = ''; }
    for (let i = 0; i < W.karts.length; i++) { const k2 = race.karts[i]; poseKart(W.karts[i], { x: k2.x, y: k2.y, z: k2.z, h: k2.visH, roll: 0, flags: 0, sp: 0 }, dt, k2); }
    updateHud(dt);
    return;
  }
  // controls (the player's autopilot takes over after the finish line)
  if (!P.autopilot) readControls(P.ctl);
  // countdown lights and numbers
  if (race.state === 'countdown') {
    const n = Math.ceil(-race.time);
    if (n !== app.lastCount && n <= 3 && n >= 1) { app.lastCount = n; audio.play('count'); flashCenter(String(n)); const L = W.trackRoot.userData.startLights; L?.forEach((l, i) => { l.material.emissive.set(i < 4 - n ? 0xff2222 : 0x000000); }); }
  } else { const L = W.trackRoot.userData.startLights; if (L && race.time < 1) L.forEach(l => l.material.emissive.set(0x22ff44)); }
  // fixed-step simulation for stable physics at any frame rate
  app.acc = (app.acc || 0) + Math.min(dt, 0.1);
  const h = 1 / 120;
  while (app.acc >= h) { race.update(h); app.acc -= h; P.ctl.driftPressed = false; P.ctl.itemPressed = false; }
  raceEvents(race);
  // visuals
  race.karts.forEach((k, i) => {
    const st = { x: k.x, y: k.y + (k.fallT > 0 ? 0 : 0), z: k.z, h: k.visH, roll: k.roll, flags: (k.boostT > 0 ? 1 : 0) | (k.drift.on ? 2 : 0) | (k.spinT > 0 ? 4 : 0) | (k.shieldT > 0 ? 8 : 0) | (k.starT > 0 ? 16 : 0) | (k.fallT > 0 ? 32 : 0) | (k.offroad ? 64 : 0), tier: k.drift.tier, sp: k.sp };
    poseKart(W.karts[i], st, dt, k);
    if (k.fallT > 0 && k.fallT < 0.5) W.karts[i].visible = Math.floor(k.fallT * 20) % 2 === 0; else W.karts[i].visible = true;
    if (k.safeT > 0 && k.fallT <= 0) W.karts[i].visible = Math.floor(k.safeT * 16) % 2 === 0;
  });
  if (W.ghost && W.ghostData) {
    const fr = W.ghostData.frames; let j = app.ghostI || 0; while (j < fr.length - 2 && fr[j + 1][0] <= race.time) j++; if (fr[j][0] > race.time) j = 0; app.ghostI = j;
    const a = fr[j], b = fr[Math.min(j + 1, fr.length - 1)], f = clamp((race.time - a[0]) / Math.max(1e-3, b[0] - a[0]), 0, 1);
    W.ghost.position.set(lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)); W.ghost.rotation.y = a[4] + angDiff(b[4], a[4]) * f; W.ghost.visible = race.time < fr[fr.length - 1][0];
  }
  W.boxes.forEach((m, i) => { const b = W.track.boxes[i]; m.visible = b.t <= 0 || b.t < 0.3; const s = b.t > 0 ? 1 - b.t / 0.3 : 1; m.scale.setScalar(Math.max(0.01, s)); m.userData.cube.rotation.set(app.t * 0.9, app.t * 1.3, 0); m.position.y = b.y + 1.4 + Math.sin(app.t * 2 + i) * 0.15; });
  syncPool('proj', race.projectiles, dt);
  syncPool('haz', race.hazards.map(hz => ({ type: 'puddle', x: hz.x, y: hz.y, z: hz.z })), dt);
  // camera
  if (app.state === 'finish') {
    app.finishT += dt; const a = app.finishT * 0.5 + P.h + Math.PI * 0.8, r = 7;
    camera.position.lerp(_v.set(P.x + Math.sin(a) * r, P.y + 2.4, P.z + Math.cos(a) * r), 1 - Math.exp(-dt * 3)); camera.lookAt(P.x, P.y + 1, P.z);
    if (app.finishT > 4 && !app.resultsShown) showResults();
  } else chaseCamera(dt, { x: P.x, y: P.y, z: P.z, h: P.h, md: P.md, boost: P.boostT > 0 || P.starT > 0 }, P.ctl.lookBack);
  // messages
  if (P.wrongT > 1 && !P.finished) { const m = $('msg'); if (m.textContent !== 'WRONG WAY!') { m.textContent = 'WRONG WAY!'; m.className = 'warn'; audio.play('wrong'); } app.msgT = 0.3; }
  if (P.fallT > 0) { $('msg').textContent = 'Rescue drone on the way…'; $('msg').className = ''; app.msgT = 0.3; }
  // engine sound
  let near = null; for (const k of race.karts) if (k !== P) { const d = Math.hypot(k.x - P.x, k.z - P.z); if (!near || d < near.dist) near = { dist: d, sp: k.sp }; }
  audio.updateEngine(app.state === 'race' || app.state === 'finish' ? P : null, near, false);
  updateHud(dt);
}

function updateWorld(dt) {
  W.particles?.update(dt);
  const R = W.trackRoot?.userData; if (!R) return;
  if (R.padTex) R.padTex.offset.y -= dt * 1.6;
  for (const s of R.spinners || []) s.rotation.z += dt * 0.8;
  for (const f of R.floaters || []) f.position.y += Math.sin(app.t + f.position.x) * dt * 0.4;
  W.track.movers.forEach((m, i) => { const o = W.movers[i]; o.position.set(m.x, m.y, m.z); o.rotation.y = m.h + (m.kind === 'boulder' || m.kind === 'snowball' ? 0 : m.dir * Math.PI / 2); if (o.userData.spin) { if (o.userData.spin === o) o.rotation.y = app.t * 2; else o.userData.spin.rotation.x += dt * 2 * m.dir; } });
  if (W.snow) { const p = W.snow.geometry.attributes.position, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 4; if (y < cy - 15) y += 40; p.setY(i, y); let x = p.getX(i), z = p.getZ(i); if (x - cx > 40) x -= 80; if (x - cx < -40) x += 80; if (z - cz > 40) z -= 80; if (z - cz < -40) z += 80; p.setX(i, x + Math.sin(app.t + i) * dt * 0.5); p.setZ(i, z); } p.needsUpdate = true; }
  // the sun's shadow box follows the camera
  if (W.sun && W.race) { const k = app.replay ? W.karts[app.replay.follow].position : W.race.player; W.sun.position.set(k.x + 40, (k.y || 0) + 90, k.z + 25); W.sun.target.position.set(k.x, k.y || 0, k.z); }
}

// ---------------------------------------------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------------------------------------------
let lastT = performance.now(), vw = 0, vh = 0;
function resize() {
  const w = innerWidth, h = innerHeight; if (w === vw && h === vh) return; vw = w; vh = h;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  show.cam.aspect = w / h; show.cam.updateProjectionMatrix();
}
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; app.t += dt;
  resize();
  pad.update();
  if (pad.pressed('HOME')) { goHome(); }
  if (pad.pressed('TOUCH')) overlay.toggle();
  if (overlay.visible) { overlay.update(); if (pad.pressed('B') || pad.pressed('START')) overlay.hide(); }
  else if (app.state === 'title') { if (pad.pressed('A') || pad.pressed('START') || (!pad.usingPad && pad.pressed('R1'))) { wake(); audio.play('start'); mainMenu(); } }
  else if (app.state === 'menu' || app.state === 'paused' || app.state === 'results') menuInput(dt);
  const inRace = W.race && ['intro', 'race', 'finish', 'results', 'paused', 'replay'].includes(app.state) && !(app.state === 'menu');
  if (inRace) {
    if (app.state === 'replay') replayFrame(dt);
    else if (app.state === 'intro' || app.state === 'race' || app.state === 'finish') raceFrame(dt);
    else if (app.state === 'results') {
      // keep the race running behind the results so the others finish their laps
      const race = W.race; if (race.state !== 'done' && race.time < (race.player.finishTime || 0) + 60) { app.acc = (app.acc || 0) + dt; while (app.acc >= 1 / 60) { race.update(1 / 60); app.acc -= 1 / 60; } race.takeEvents(); race.karts.forEach((k, i) => poseKart(W.karts[i], { x: k.x, y: k.y, z: k.z, h: k.visH, roll: k.roll, flags: k.boostT > 0 ? 1 : 0, sp: k.sp }, dt, k)); }
      const P = W.race.player; app.finishT += dt; const a = app.finishT * 0.3 + P.h; camera.position.set(P.x + Math.sin(a) * 9, P.y + 3.5, P.z + Math.cos(a) * 9); camera.lookAt(P.x, P.y + 1, P.z);
      audio.updateEngine(null);
    } else if (app.state === 'paused') audio.updateEngine(null, null, true);
    updateWorld(dt);
    if (app.msgT > 0 && (app.msgT -= dt) <= 0) { $('msg').textContent = ''; $('msg').className = ''; }
    if (app.centerT > 0 && (app.centerT -= dt) <= 0) $('center').textContent = '';
    renderer.render(W.scene, camera);
  } else {
    // showroom behind the menus: the selected racer and kart on a turntable
    if (!show.kart) showroomKart(settings.racer, settings.kart);
    show.ang += dt * 0.6; show.kart.rotation.y = show.ang;
    // wide screens: the kart sits to the right of the menu; tall screens: above it
    const narrow = innerWidth < innerHeight * 1.1;
    show.cam.position.set(0, 2.4, narrow ? 12 : 8.5); show.cam.lookAt(0, 0.7, 0);
    show.cam.setViewOffset(innerWidth, innerHeight, narrow ? 0 : -innerWidth * 0.2, narrow ? innerHeight * 0.2 : 0, innerWidth, innerHeight);
    renderer.render(show.scene, show.cam);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------------------------------------------
if (Q.has('quick')) {
  const mode = Q.get('mode') || 'race';
  const cfg = { mode, cls: Q.get('cls') || 'swift', racer: Q.get('racer') || settings.racer, kart: Q.get('kart') || settings.kart, track: Q.get('track') || 'meadow' };
  if (mode === 'gp') startGP({ ...cfg, cup: Q.get('cup') || 'sun' }); else startRace(cfg);
} else titleScreen();
requestAnimationFrame(frame);
