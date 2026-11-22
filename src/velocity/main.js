// Velocity Divide: application shell. Renderer, input, menus, the character selector, mission flow, HUD, sound, saving.
import * as THREE from 'three';
import { Pad, goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { Sfx } from '../common/sfx.js';
import { CHARS, MISSIONS, SIDES, ENDINGS, charById, missionById, rankOf } from './data.js';
import { Sim, DT } from './sim.js';
import { Bot } from './bot.js';
import { View } from './view.js';

const $ = id => document.getElementById(id), Q = new URLSearchParams(location.search), SAVE_KEY = 'velocity-divide-save';
const canvas = $('game'), ui = $('ui'), hud = $('hud');
const coarse = matchMedia('(pointer: coarse)').matches;
let stored = {}; try { stored = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { /* storage blocked or damaged */ }
const save = { best: {}, plays: 0, ...stored };
const settings = save.settings = { quality: coarse ? 'low' : 'high', locked: false, music: true, sfx: 1, cam: 1, invert: false, ...(save.settings || {}) };
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ } };
try { localStorage.setItem('arcade-last', 'velocity'); } catch { /* storage blocked */ }

function fatal(msg) { $('err').innerHTML = `<div><h2>Velocity Divide cannot start</h2><p>${msg}</p><a href="index.html">Back to the Arcade</a></div>`; $('err').classList.remove('hidden'); }
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' }); } catch { renderer = null; }
if (!renderer) fatal('This browser or device did not give the game a WebGL graphics context. Try a current Chrome, Edge, Firefox or Safari with hardware acceleration switched on, or another device.');
else boot();

function boot() {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pad = new Pad({ keymap: { A: ['Space', 'Enter'], B: ['KeyJ', 'KeyF', 'Backspace'], X: ['KeyK'], Y: ['KeyC'], L1: ['ShiftLeft', 'KeyQ'], R1: ['ShiftRight', 'KeyE'], SELECT: ['KeyM'] } });
  pad.enablePointerLock(canvas); pad.showTouch(false);
  const sfx = new Sfx(), view = new View(renderer);
  const overlay = new ControllerOverlay({ title: 'Velocity Divide: controls', pad, note: 'Each character lists its own moves on the selector',
    map: { A: 'Jump · press again in the air for the role move · choose in menus', B: 'Action: roll, dig or punch, lock and fire · back in menus', X: 'Action (same as B)', Y: 'Camera behind you',
      L1: 'Quick move: burst, scan or thruster dash', R1: 'Quick move (same as L1)', L2: 'Quick move', R2: 'Action', LS: 'Move', RS: 'Camera', L3: 'Not used', R3: 'Camera behind you',
      UP: 'Move', DOWN: 'Move', LEFT: 'Move', RIGHT: 'Move', SELECT: 'Music on / off', START: 'Pause', TOUCH: 'This controls screen', HOME: 'Back to the Arcade' },
    keys: { A: 'Space / Enter', B: 'J / F', X: 'K', Y: 'C', L1: 'Shift / Q', R1: 'Right Shift / E', LS: 'W A S D', RS: 'Arrow keys, or click the game and move the mouse', SELECT: 'M', START: 'Esc', TOUCH: 'Tab', HOME: '`' } });
  const S = { name: 'title', page: null, sel: 0, stack: [], sim: null, bot: null, mission: null, char: null, acc: 0, last: performance.now(), speed: Math.max(1, +Q.get('speed') || 1), auto: Q.get('auto') === '1', seed: +Q.get('seed') || 0, navT: 0, navHeld: false, sig: '', lbl: '', erase: false, pfT: 0, pfN: 0 };
  window.__vd = { S, pad, save, settings, view };   // for the browser tests

  // ---- sound: short synthesised cues, and a small generated tune ------------------------------------------------------------
  const T = o => sfx.tone(o), N = o => sfx.noise(o);
  const SND = {
    jump: () => T({ f: 300, f2: 620, t: 0.12, type: 'triangle', vol: 0.2 }), jump2: () => T({ f: 420, f2: 880, t: 0.12, type: 'triangle', vol: 0.2 }), land: () => N({ t: 0.07, vol: 0.12, lp: 500 }),
    spark: () => { T({ f: 1320, t: 0.05, type: 'sine', vol: 0.14 }); T({ f: 1980, t: 0.09, type: 'sine', vol: 0.12, at: 0.04 }); }, heart: () => sfx.play('heal'), spring: () => T({ f: 220, f2: 900, t: 0.25, type: 'square', vol: 0.14 }),
    pad: () => N({ t: 0.35, vol: 0.25, lp: 800, lp2: 5000 }), dash: () => N({ t: 0.18, vol: 0.25, lp: 3000, lp2: 600, hp: 400 }), home: () => T({ f: 900, f2: 1800, t: 0.12, type: 'sawtooth', vol: 0.1 }),
    hurt: () => sfx.play('hurt'), fall: () => T({ f: 500, f2: 90, t: 0.5, type: 'triangle', vol: 0.2 }), down: () => T({ f: 400, f2: 80, t: 0.5, type: 'sawtooth', vol: 0.15 }), respawn: () => sfx.play('shield'),
    check: () => sfx.play('medal'), boom: () => { N({ t: 0.3, vol: 0.4, lp: 2400, lp2: 200 }); T({ f: 180, f2: 60, t: 0.2, type: 'sine', vol: 0.3 }); }, gate: () => sfx.play('chest'),
    lock: () => T({ f: 1500, t: 0.04, type: 'square', vol: 0.08 }), fire: () => T({ f: 1200, f2: 300, t: 0.14, type: 'sawtooth', vol: 0.12 }), shard: () => sfx.play('chest'), dig: () => N({ t: 0.4, vol: 0.25, lp: 900 }),
    punch: () => N({ t: 0.1, vol: 0.25, lp: 1500, hp: 300 }), stomp: () => { N({ t: 0.2, vol: 0.4, lp: 600 }); T({ f: 90, f2: 40, t: 0.2, type: 'sine', vol: 0.4 }); }, scan: () => [600, 900, 1200].forEach((f, i) => T({ f, t: 0.2, type: 'sine', vol: 0.12, at: i * 0.1 })),
    ring: () => N({ t: 0.5, vol: 0.18, lp: 400, lp2: 1600 }), open: () => sfx.play('shieldBreak'), shield: () => sfx.play('shield'), bosshit: () => T({ f: 160, f2: 70, t: 0.15, type: 'square', vol: 0.3 }),
    clang: () => T({ f: 1400, t: 0.08, type: 'sine', vol: 0.1 }), orb: () => T({ f: 500, f2: 250, t: 0.12, type: 'sine', vol: 0.08 }), win: () => sfx.play('win'),
  };
  const music = { t: 0, i: 0, tick() {
    if (!sfx.ctx || !settings.music || !S.sim) return; const c = sfx.ctx.currentTime; if (this.t < c) this.t = c + 0.05;
    const dark = ['umbra', 'archive', 'cinder', 'gyre', 'tide'].includes(S.sim.lv.theme), scale = dark ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9], step = S.sim.boss ? 0.14 : 0.19;
    while (this.t < c + 0.25) {
      const n = this.i++, deg = [0, 2, 4, 2, 3, 1, 4, 2][n % 8] + (n % 32 >= 16 ? 1 : 0), f = (dark ? 196 : 220) * 2 ** ((scale[deg % 5] + 12 * Math.floor(deg / 5)) / 12);
      sfx.tone({ f, t: step * 0.9, type: 'triangle', vol: 0.5, at: this.t - c, bus: sfx.musicBus }); if (n % 4 === 0) sfx.tone({ f: f / 4, t: step * 3, type: 'sine', vol: 0.6, at: this.t - c, bus: sfx.musicBus });
      this.t += step;
    }
  } };
  const volume = () => { if (sfx.master) sfx.master.gain.value = 0.6 * settings.sfx; };
  const wake = () => { sfx.init(); volume(); };
  let toastT = 0; const toast = msg => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); };

  // ---- quality and sizing ------------------------------------------------------------------------------------------------
  function resize() {
    const low = settings.quality === 'low'; view.low = low;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 2)); renderer.setSize(innerWidth, innerHeight, false); view.resize(innerWidth, innerHeight);
    if (view.scene) { view.scene.fog.near = low ? 45 : 70; view.scene.fog.far = low ? 190 : 320; }
  }
  addEventListener('resize', resize); addEventListener('orientationchange', resize);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fatal('The graphics context was lost. Reload the page to carry on: your progress is saved.'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.name === 'play' && !S.page && !S.auto) pause(); });
  function perf(dt) {   // a slow device on High drops to Fast by itself, once, unless the player chose the setting
    if (settings.quality !== 'high' || settings.locked || S.name !== 'play' || S.page || S.speed !== 1) return;
    S.pfT += dt; S.pfN++; if (S.pfT < 4) return;
    if (S.pfN / S.pfT < 38) { settings.quality = 'low'; resize(); persist(); toast('Switched to fast graphics (Options changes it back)'); }
    S.pfT = S.pfN = 0;
  }

  // ---- menus: one list of items per page, usable by pad, keyboard, mouse and touch ----------------------------------------------
  const unlocked = m => !m.needs || m.needs.every(id => save.best[id]);
  const sideTag = sd => sd === 'both' ? '<span class="vd-tag both">Both sides</span>' : `<span class="vd-tag ${sd}">${SIDES[sd].tag} · ${SIDES[sd].name}</span>`;
  const canBack = p => !!p.back || S.stack.length > 0;
  const foot = p => pad.touch ? `Tap to choose${canBack(p) ? ' <span class="vd-btn" data-back>Back</span>' : ''}` : `${pad.glyph('A')} choose${canBack(p) ? ` · ${pad.glyph('B')} back` : ''} · ${pad.glyph('TOUCH')} controls · ${pad.glyph('HOME')} Arcade`;
  function open(page, push = true) {
    if (push && S.page) S.stack.push({ page: S.page, sel: S.sel }); if (!push) S.stack = [];
    S.page = page; S.sel = Math.max(0, page.start ?? page.items.findIndex(i => !i.off));
    document.exitPointerLock?.(); pad.showTouch(false); draw();
  }
  function back() { const p = S.page; if (!p) return; if (p.back) { p.back(); return; } if (S.stack.length) { const s = S.stack.pop(); S.page = s.page; S.sel = s.sel; SND.dash(); draw(); } }
  function closeMenu() { S.page = null; S.stack = []; ui.classList.add('hidden'); ui.innerHTML = ''; }
  function draw() {
    const p = S.page; ui.className = 'vd-ui' + (p.over ? ' over' : '');
    ui.innerHTML = `<div class="vd-panel">${p.head || ''}<div class="vd-list" style="--cols:${p.cols || 1}">${p.items.map((it, i) => { const v = typeof it.val === 'function' ? it.val() : it.val; return `<div class="vd-it${it.off ? ' off' : ''}${it.cls ? ' ' + it.cls : ''}" data-i="${i}"><b>${it.label}</b>${v !== undefined ? `<i>${v}</i>` : ''}${it.sub ? `<small>${it.sub}</small>` : ''}</div>`; }).join('')}</div>${p.side ? '<div id="vdSide"></div>' : ''}<div class="vd-foot">${foot(p)}</div></div>`;
    ui.querySelectorAll('.vd-it').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = () => { wake(); if (p.items[i].off) return; if (p.side && S.sel !== i) { S.sel = i; sfx.play('ui'); mark(); return; } S.sel = i; mark(); choose(); };
      el.onmouseenter = () => { if (!pad.touch && !p.items[i].off && S.sel !== i) { S.sel = i; mark(); } };
    });
    const bb = ui.querySelector('[data-back]'); if (bb) bb.onclick = () => { wake(); back(); };
    mark();
  }
  function mark() {
    const p = S.page; ui.querySelectorAll('.vd-it').forEach((el, i) => el.classList.toggle('sel', i === S.sel));
    p.onSel?.(S.sel);
    if (p.side) { $('vdSide').innerHTML = p.side(S.sel); const go = $('vdGo'); if (go) go.onclick = () => { wake(); choose(); }; }
  }
  function choose() { const it = S.page?.items[S.sel]; if (!it || it.off) return; wake(); sfx.play('select'); if (it.adj && !it.act) { it.adj(1); draw(); } else it.act?.(); }
  function nav(dt) {
    const p = S.page; let dx = 0, dy = 0;
    if (pad.pressed('LEFT')) dx = -1; if (pad.pressed('RIGHT')) dx = 1; if (pad.pressed('UP')) dy = -1; if (pad.pressed('DOWN')) dy = 1;
    const sx = pad.lx + pad.rx, sy = pad.ry - pad.ly, horiz = Math.abs(sx) > Math.abs(sy);   // left stick, and the arrow keys through the right stick
    if (Math.max(Math.abs(sx), Math.abs(sy)) > 0.6) { S.navT -= dt; if (S.navT <= 0) { if (horiz) dx = dx || Math.sign(sx); else dy = dy || Math.sign(sy); S.navT = S.navHeld ? 0.16 : 0.4; S.navHeld = true; } }
    else { S.navT = 0; S.navHeld = false; }
    if (dx || dy) {
      const it = p.items[S.sel], n = p.items.length, cols = p.cols || 1;
      if (dx && it?.adj) { wake(); it.adj(dx); sfx.play('ui'); draw(); }
      else {
        const step = dy ? dy * cols : cols > 1 ? dx : 0; let i = S.sel;
        for (let k = 0; step && k < n; k++) { i += step; if (Math.abs(step) > 1) { if (i < 0 || i >= n) { i = S.sel; break; } } else i = (i + n) % n; if (!p.items[i].off) break; }
        if (i !== S.sel && !p.items[i].off) { S.sel = i; wake(); sfx.play('ui'); mark(); }
      }
    }
    if (pad.pressed('A')) choose(); else if (pad.pressed('B')) back();
  }

  const leave = () => { S.sim = null; S.bot = null; S.name = 'title'; hud.classList.add('hidden'); };
  const title = () => { leave(); open(titlePage(), false); };
  function titlePage() {
    const done = Object.keys(save.best).length;
    return { head: `<div class="vd-logo">VELOCITY<span>DIV</span><span>IDE</span></div><p>A sky city split in two. Pick a side, or play both. ${done ? `${done} of ${MISSIONS.length} missions cleared.` : 'Free, with no sign-in.'}</p>`,
      onSel: () => view.showChar(CHARS[0]),
      items: [{ label: 'Play', sub: 'Choose a hero or a villain and start at once', act: () => open(selectPage()) }, { label: 'Missions', sub: 'Every stage, your best ranks, the finales', act: () => open(missionsPage()) },
        { label: 'Options', act: () => open(optionsPage()) }, { label: 'Controls', act: () => overlay.show() }, { label: 'Back to the Arcade', act: () => goHome() }] };
  }
  function selectPage(filter, pick) {
    const list = CHARS.filter(filter || (() => true));
    return { cols: 3, onSel: i => view.showChar(list[i]),
      head: `<h2>${pick ? 'Who takes this one?' : 'Choose your character'}</h2>`,
      side: i => { const c = list[i], m = missionById(c.mission), b = save.best[m.id]; return `<div class="vd-card">${sideTag(c.side)}<h3>${c.name}</h3><div class="vd-role">${c.title}</div><p>${c.blurb}</p><ul>${c.moves.map(([k, t]) => `<li>${pad.glyph(k)} ${t}</li>`).join('')}</ul>${pick ? '' : `<div class="vd-next">Mission: <b>${m.name}</b>${b ? ` · best rank ${b.rank}` : ''}</div>`}<button id="vdGo">Play as ${c.name.split(' ')[0]}</button></div>`; },
      items: list.map(c => ({ label: c.name, sub: `${SIDES[c.side].tag} · ${c.title}`, cls: c.side, act: () => (pick ? pick(c) : brief(missionById(c.mission), c)) })) };
  }
  function missionsPage() {
    return { head: '<h2>Missions</h2><p>Clear a side\'s three stages to open its finale. Clear both finales for the last mission.</p>',
      onSel: i => { const m = MISSIONS[i]; view.showChar(charById(m.char) || CHARS[m.side === 'umbra' ? 3 : 0]); },
      items: MISSIONS.map(m => { const b = save.best[m.id], c = charById(m.char), ok = unlocked(m); return { label: m.name, cls: m.side, off: !ok, val: b ? `Rank ${b.rank}` : ok ? 'New' : 'Locked',
        sub: `${m.side === 'both' ? 'Both sides' : SIDES[m.side].tag} · ${c ? c.name : 'any character' + (m.side === 'both' ? '' : ' of that side')}`,
        act: () => (c ? brief(m, c) : open(selectPage(x => m.side === 'both' || x.side === m.side, x => brief(m, x)))) }; }) };
  }
  function brief(m, c) {
    view.showChar(c);
    open({ onSel: () => view.showChar(c), head: `${sideTag(m.side)}<h2>${m.name}</h2><p>${m.brief}</p><div class="vd-card"><div class="vd-role">${c.name} · ${c.title}</div><ul>${c.moves.map(([k, t]) => `<li>${pad.glyph(k)} ${t}</li>`).join('')}</ul></div>`,
      items: [{ label: 'Start', act: () => start(m, c) }, { label: 'Back', act: () => back() }] });
  }
  function optionsPage() {
    const cyc = (key, vals, dir) => { const i = vals.indexOf(settings[key]); settings[key] = vals[(i + dir + vals.length) % vals.length]; persist(); };
    return { over: !!S.sim, head: '<h2>Options</h2>', items: [
      { label: 'Graphics', val: () => (settings.quality === 'low' ? 'Fast' : 'High'), adj: d => { cyc('quality', ['high', 'low'], d); settings.locked = true; persist(); resize(); } },
      { label: 'Music', val: () => (settings.music ? 'On' : 'Off'), adj: () => { settings.music = !settings.music; persist(); } },
      { label: 'Sound', val: () => Math.round(settings.sfx * 100) + '%', adj: d => { settings.sfx = Math.max(0, Math.min(1, Math.round((settings.sfx + d * 0.2) * 5) / 5)); volume(); persist(); } },
      { label: 'Camera speed', val: () => ['Slow', 'Normal', 'Fast'][settings.cam], adj: d => cyc('cam', [0, 1, 2], d) },
      { label: 'Camera up / down', val: () => (settings.invert ? 'Inverted' : 'Normal'), adj: () => { settings.invert = !settings.invert; persist(); } },
      { label: 'Erase progress', sub: 'Ranks and unlocks. Choose it twice to confirm.', act: () => { if (!S.erase) { S.erase = true; toast('Choose it again to erase all progress'); } else { S.erase = false; save.best = {}; persist(); toast('Progress erased'); } } },
      { label: 'Back', act: () => back() }] };
  }
  function pause() {
    if (S.page || S.name !== 'play') return;
    open({ over: true, back: resume, head: `<h2>Paused</h2><p>${S.mission.name} · ${S.sim.objective()}</p>`, items: [{ label: 'Resume', act: resume }, { label: 'Restart mission', act: () => start(S.mission, S.char) },
      { label: 'Options', act: () => open(optionsPage()) }, { label: 'Controls', act: () => overlay.show() }, { label: 'Quit to the title screen', act: title }, { label: 'Back to the Arcade', act: () => goHome() }] }, false);
  }
  function resume() { closeMenu(); pad.showTouch(true); S.last = performance.now(); S.sim.prev = { jump: true, act: true, dash: true }; }

  // ---- mission flow ---------------------------------------------------------------------------------------------------------
  function start(m, c) {
    wake(); save.plays = (save.plays || 0) + 1; persist();
    S.mission = m; S.char = c; S.sim = new Sim(m, c, S.seed || save.plays); S.bot = S.auto ? new Bot(S.sim) : null;
    S.sim.prev = { jump: true, act: true, dash: true };   // the press that chose Start must not also jump
    view.load(S.sim, c); resize(); closeMenu(); S.name = 'play'; S.acc = 0; S.last = performance.now(); S.lbl = ''; S.pfT = S.pfN = 0;
    hud.classList.remove('hidden'); hud._h = ''; pad.showTouch(true); sfx.play('start'); toast(m.name);
  }
  function finish() {
    const s = S.sim, m = S.mission, c = S.char, r = { ...s.results(), ...rankOf(s.results(), m.par), char: c.id }, old = save.best[m.id], best = !old || r.score > old.score;
    if (best) save.best[m.id] = r; persist();
    S.name = 'results'; hud.classList.add('hidden');
    const next = MISSIONS.find(x => unlocked(x) && !save.best[x.id]), nc = next && (charById(next.char) || (next.side === 'both' || c.side === next.side ? c : null));
    const items = [];
    if (m.ending) items.push({ label: 'Continue', act: () => ending(m.ending) });
    if (next) items.push({ label: `Next: ${next.name}`, sub: nc ? `as ${nc.name}` : 'choose a character', act: () => { S.sim = null; if (nc) brief(next, nc); else open(selectPage(x => x.side === next.side, x => brief(next, x))); } });
    items.push({ label: 'Play again', sub: m.kind === 'seek' ? 'The shards hide in new places' : 'Go for a better rank', act: () => start(m, c) }, { label: 'Character select', act: () => { leave(); open(selectPage(), false); } }, { label: 'Missions', act: () => { leave(); open(missionsPage(), false); } }, { label: 'Title screen', act: title });
    const mm = Math.floor(r.time / 60), ss = (r.time % 60).toFixed(1).padStart(4, '0');
    open({ over: true, back: () => {}, head: `<h2>Mission clear</h2><div class="vd-rank">${r.rank}</div><div class="vd-stats"><span>Time</span><b>${mm}:${ss}</b><span>Sparks</span><b>${r.sparks} / ${r.total}</b><span>Retries</span><b>${r.retries}</b><span>Score</span><b>${r.score}${best && old ? ' · new best' : ''}</b></div><p>${m.outro}</p>`, items }, false);
  }
  function ending(key) {
    const [h, body, tail] = ENDINGS[key]; leave(); S.name = 'ending'; view.showChar(key === 'umbra' ? CHARS[3] : CHARS[0]); sfx.play('win');
    open({ back: () => {}, head: `<h2>${h}</h2><p>${body}</p><p><b>${tail}</b></p>`, items: [{ label: 'Missions', act: () => open(missionsPage(), false) }, { label: 'Title screen', act: title }] }, false);
  }

  // ---- play: input, HUD -----------------------------------------------------------------------------------------------------
  function readInput() {
    let x = pad.lx + (pad.down('RIGHT') ? 1 : 0) - (pad.down('LEFT') ? 1 : 0), y = pad.ly + (pad.down('UP') ? 1 : 0) - (pad.down('DOWN') ? 1 : 0); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return { x, y, yaw: view.yaw, jump: pad.down('A'), act: pad.down('B') || pad.down('X') || pad.r2v > 0.4, dash: pad.down('L1') || pad.down('R1') || pad.l2v > 0.4 };
  }
  const bar = v => `<span class="vd-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 20) * 5}%"></i></span>`;
  function hudDraw() {
    const s = S.sim, p = s.p, c = S.char, mm = Math.floor(s.time / 60), ss = (s.time % 60).toFixed(1).padStart(4, '0'), b = s.boss; let meter;
    if (c.role === 'runner') meter = `Speed ${bar(Math.hypot(p.vx, p.vz) / 36)}`;
    else if (c.role === 'seeker') { const d = Math.min(...s.shards.filter(h => !h.got).map(h => Math.hypot(h.x - p.x, h.z - p.z)), 999); meter = `Signal ${bar(1 - d / 60)}${p.scanCd > 0 ? '' : ' · scan ready'}`; }
    else meter = `Locks ${'◆'.repeat(p.locks.length)}${'◇'.repeat(c.stats.locks - p.locks.length)} · Hover ${bar(p.fuel / c.stats.hover)}`;
    const html = `<div class="vd-tl"><span class="vd-hearts">${'♥'.repeat(Math.max(0, p.hearts))}<em>${'♥'.repeat(Math.max(0, c.stats.hearts - p.hearts))}</em></span><span>✦ ${s.sparks}/${s.total}</span><span>${mm}:${ss}</span></div><div class="vd-obj">${s.objective()}</div>${b ? `<div class="vd-boss"><span>${b.name}${b.state === 'open' ? ' · OPEN' : ' · shielded'}</span><div><i style="width:${Math.max(0, Math.round(b.hp / b.max * 100))}%"></i></div></div>` : ''}<div class="vd-meter">${meter}</div><div class="vd-hints">${c.hint.map(([k, t]) => `<span>${pad.glyph(k)} ${t}</span>`).join('')}<span>${pad.glyph('START')} pause</span></div>`;
    if (html !== hud._h) hud.innerHTML = hud._h = html;
    if (pad.touch && S.lbl !== c.id) { const btns = document.querySelectorAll('.tc [data-b]'); if (btns.length) { btns.forEach(el => { const l = c.touch[el.dataset.b]; if (l) { el.textContent = l; el.classList.add('vd-lbl'); } }); S.lbl = c.id; } }
  }
  function play(dt) {
    if (pad.pressed('START')) { pause(); return; }
    if (pad.pressed('SELECT')) { settings.music = !settings.music; persist(); toast(settings.music ? 'Music on' : 'Music off'); }
    const sim = S.sim; S.acc += dt * S.speed; let n = 0;
    while (S.acc >= DT && n++ < 8 * S.speed) {
      S.acc -= DT; sim.step(S.bot ? S.bot.input() : readInput());
      for (const e of sim.events) { SND[e.t]?.(); view.fx(e); if (e.t === 'respawn') view.snap(sim); if (e.t === 'hurt') pad.rumble(0.6, 0.8, 160); } sim.events.length = 0;
      if (sim.done) break;
    }
    if (S.acc > DT * 4) S.acc = 0;
    if (pad.pressed('Y') || pad.pressed('R3')) view.behind(sim);
    view.update(sim, dt, S.bot ? { x: 0, y: 0, mdx: 0, mdy: 0, speed: 2, invert: false } : { x: pad.rx, y: pad.ry, mdx: pad.mdx, mdy: pad.mdy, speed: 1.6 + settings.cam * 0.9, invert: settings.invert });
    hudDraw(); music.tick();
    if (sim.done && sim.doneT > 1.2) finish();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    pad.update();
    const sig = `${pad.connected}|${pad.usingPad}|${pad.kind}`; if (sig !== S.sig) { S.sig = sig; if (S.page) draw(); hud._h = ''; }
    if (overlay.visible) { overlay.update(); if (pad.pressed('TOUCH') || pad.pressed('B') || pad.pressed('START')) overlay.hide(); else if (pad.pressed('HOME')) goHome(); }
    else {
      if (pad.pressed('HOME')) goHome();
      if (pad.pressed('TOUCH')) { if (S.name === 'play' && !S.page) pause(); overlay.show(); }
      else if (S.page) nav(dt); else if (S.name === 'play') play(dt);
    }
    if (S.sim) view.render(); else view.renderPreview(dt);
    perf(dt);
  }

  resize(); view.showChar(CHARS[0]);
  const qm = missionById(Q.get('m') || 'd1');
  if (Q.get('quick') === '1' && qm) start(qm, charById(Q.get('c')) || charById(qm.char) || CHARS[0]); else open(titlePage(), false);
  requestAnimationFrame(frame);
}
