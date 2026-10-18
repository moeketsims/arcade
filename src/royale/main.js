// Storm Royale — game orchestration: loading, title, bus drop, match loop, pause, end screen.
import * as THREE from 'three';
import { Pad, goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { Sfx } from '../common/sfx.js';
import { World } from './world.js';
import { Fighter } from './fighter.js';
import { Combat } from './combat.js';
import { Loot } from './loot.js';
import { BuildSystem } from './build.js';
import { Storm } from './storm.js';
import { Bus } from './bus.js';
import { Bot, BOT_NAMES } from './bots.js';
import { FX } from './fx.js';
import { Hud } from './hud.js';
import { PlayerController, KEYMAP } from './player.js';
import { ITEMS, makeItem } from './items.js';
import { SKIN, HAIR } from '../common/humanoid.js';

const $ = id => document.getElementById(id);
const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)];
const PALS = [[0xe0503a, 0xffd23f], [0x3a8cff, 0xffffff], [0x3ad17a, 0x1d6b43], [0xc77dff, 0x4a1d7a], [0xffa53a, 0x6b3a0d], [0x2dd4d4, 0x0d4f55], [0xff5ea8, 0x7a1d4a], [0xb8e04a, 0x4a5d12], [0xf2f2f2, 0x384152], [0x8a63ff, 0xff8a3a]];
const METALS = [0x9aa7bd, 0xb9c2d0, 0xc4a77d, 0x8fa6a0, 0xa4a0b8, 0xc9b0a0, 0x7f8da3];
const VISORS = [0xff3355, 0x33e0ff, 0xffd23f, 0x6dff6d, 0xff7be5, 0xff8a3a];

const CONTROL_MAP = {
  A: 'Jump · glider · jump from bus', B: 'Build mode on / off', X: 'Reload · HOLD to open / pick up / use', Y: 'Pickaxe (press again to swing / harvest)',
  L1: 'Previous slot · (build) roof', R1: 'Next slot · (build) floor', L2: 'Aim down sights · (build) ramp · blade dash', R2: 'Fire / swing · (build) wall',
  UP: 'Use heal / shield item', DOWN: 'Throw grenade', LEFT: 'Previous slot · (build) previous material', RIGHT: 'Next slot · (build) next material',
  LS: 'Move · skydive steer', RS: 'Look / aim', L3: 'Sprint (toggle)', R3: 'Crouch', SELECT: 'Emote (press again to change)', START: 'Pause menu', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
};
const CONTROL_KEYS = { LS: 'W A S D', RS: 'Mouse (click to capture)', A: 'Space', B: 'Q', X: 'R tap · E hold', Y: 'F', L1: 'Wheel ↑ · (build) V roof', R1: 'Wheel ↓ · (build) X floor', L2: 'Mouse R · (build) C ramp', R2: 'Mouse L · (build) Z wall', UP: 'H', DOWN: 'T', RIGHT: 'G (material) · 1-6 slots', L3: 'Shift', R3: 'C', SELECT: 'B', START: 'Esc', TOUCH: 'Tab', HOME: '`' };

class Menu {
  constructor(el, items, onPick) { this.el = el; this.items = items; this.sel = 0; this.onPick = onPick; this.held = 0; this.render(); }
  render() { this.el.innerHTML = this.items.map((t, i) => `<div class="${i === this.sel ? 'sel' : ''}" data-i="${i}">${t}</div>`).join(''); [...this.el.children].forEach((c, i) => { c.onclick = () => { this.sel = i; this.onPick(i); }; c.onmouseenter = () => { if (this.sel !== i) { this.sel = i; this.render(); } }; }); }
  set(items) { this.items = items; this.sel = 0; this.render(); }
  update(pad, ctl, sfx) {
    let d = 0;
    if (pad.pressed('DOWN') || ctl.key('ArrowDown') || ctl.key('KeyS')) d = 1; if (pad.pressed('UP') || ctl.key('ArrowUp') || ctl.key('KeyW')) d = -1;
    if (Math.abs(pad.ly) > 0.6) { if (!this.held) { d = pad.ly > 0 ? -1 : 1; this.held = 1; } } else this.held = 0;
    if (d) { this.sel = (this.sel + d + this.items.length) % this.items.length; this.render(); sfx.play('ui'); }
    if (pad.pressed('A') || ctl.key('Enter')) { sfx.play('select'); this.onPick(this.sel); }
  }
}

export class Game {
  constructor(o = {}) {
    const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    this.opts = { quick: qs.get('quick') === '1', bots: qs.has('bots') ? +qs.get('bots') : null, storm: qs.get('storm') !== '0', god: qs.get('god') === '1', give: qs.get('give') ? qs.get('give').split(',') : null, rarity: qs.has('rarity') ? +qs.get('rarity') : 2, seed: qs.has('seed') ? +qs.get('seed') : null, range: qs.get('range') === '1', sens: +qs.get('sens') || 1, fps: qs.get('fps') === '1', ...(o.opts || {}) };
    const canvas = $('game');
    this.renderer = o.renderer || new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05; this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.pad = new Pad({ keymap: KEYMAP, pointerLock: canvas }); this.sfx = new Sfx(); this.hud = new Hud();
    this.overlay = new ControllerOverlay({ title: 'Storm Royale — controls', map: CONTROL_MAP, keys: CONTROL_KEYS, pad: this.pad, note: 'Every button works in build mode too' });
    this.state = 'loading'; this.paused = false; this.time = 0; this.matchTime = 0; this.fighters = []; this.alive = []; this.bots = []; this.pool = []; this.player = null; this.listenerPos = new THREE.Vector3();
    this.interactTarget = null; this.stormTick = 1; this.busSfxT = 0; this.endT = -1; this.stats = null; this.matchNo = 0; this.hintT = 0; this.fpsAcc = 0; this.fpsN = 0; this.last = performance.now();
    this.ctl = null; this.menu = null; this.endMenu = null; this.fx = null;
    addEventListener('resize', () => this.resize());
    // Esc leaves pointer lock before the page sees the key: treat losing the lock mid-game as "pause"
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement) return; this.lockLostT = performance.now();
      if ((this.state === 'bus' || this.state === 'play') && !this.paused && !this.overlay.visible) this.setPaused(true);
    });
    const wake = () => { try { this.sfx.init(); } catch (e) { /* audio unavailable */ } };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  }

  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); if (this.ctl) { this.ctl.cam.aspect = w / h; this.ctl.cam.updateProjectionMatrix(); } }
  async progress(p, msg) { const f = $('loadFill'); if (f) f.style.width = Math.round(p * 100) + '%'; if (msg && $('loadMsg')) $('loadMsg').textContent = msg; await new Promise(r => setTimeout(r, 24)); }

  async init() {
    await this.progress(0.05, 'Shaping the island...');
    this.world = new World(this.scene, 7); this.fx = new FX(this.scene);
    await this.progress(0.35, 'Painting the map...');
    this.hud.setMap(this.world.terrain.minimapPixels(512, 640), 512);
    await this.progress(0.5, 'Building towns and trees...');
    this.world.generate(this.opts.seed ?? ((Math.random() * 1e6) | 0));
    this.combat = new Combat(this); this.loot = new Loot(this); this.build = new BuildSystem(this); this.storm = new Storm(this.scene, this.world.terrain); this.bus = new Bus(this.scene);
    this.ctl = new PlayerController(this);
    await this.progress(0.8, 'Warming up the contestants...');
    this.makeFighters(); this.setupMenus();
    await this.progress(1.0, 'Ready');
    this.resize(); this.state = 'title'; $('loading').classList.add('hidden'); $('title').classList.remove('hidden');
    this.resetMatchObjects(); this.renderTitleLegend();
    requestAnimationFrame(t => this.loop(t));
  }

  makeFighters() {
    const n = 31, names = [...BOT_NAMES].sort(() => rnd() - 0.5);
    this.player = new Fighter(this, { name: 'You', isPlayer: true, look: { robot: false, skin: SKIN[2], hair: HAIR[1], hairStyle: 'short', shirt: 0xffc42e, shirt2: 0xffc42e, shorts: 0x2b3a67, socks: 0x2f7de1, boots: 0x20242c, helmet: 0x2f7de1 }, gliderColor: 0x35e0ff, gliderColor2: 0xffd23f });
    this.pool = [this.player];
    for (let i = 1; i < n; i++) {
      const pal = PALS[(i * 3) % PALS.length], dark = 0x1b2230;
      const look = { robot: true, skin: pick(METALS), shirt: pal[0], shirt2: pal[1], shorts: rnd() < 0.5 ? dark : pal[1], socks: pal[1], boots: 0x15181d, gloves: rnd() < 0.5 ? pal[1] : undefined, helmet: rnd() < 0.55 ? pick([0x1b2433, pal[1], 0x3a3f4d]) : undefined, visor: pick(VISORS), build: 0.92 + rnd() * 0.14, height: 0.96 + rnd() * 0.1 };
      this.pool.push(new Fighter(this, { name: names[i % names.length], look, gliderColor: pal[0], gliderColor2: pal[1] }));
    }
    for (const f of this.pool) f.root.visible = false;   // shown when a match places them
  }

  setupMenus() {
    this.menu = new Menu($('pauseMenu'), ['Resume', 'Controls', 'Restart', 'Back to Arcade'], i => {
      if (i === 0) this.setPaused(false); else if (i === 1) { this.overlay.show(); } else if (i === 2) { this.setPaused(false); this.startMatch(); } else goHome();
    });
    this.endMenu = new Menu($('endMenu'), ['Play again', 'Back to Arcade'], i => { if (i === 0) this.startMatch(); else goHome(); });
  }
  setPaused(on) {
    this.paused = on; $('pause').classList.toggle('hidden', !on); if (!on && !this.pad.usingPad && !this.pad.connected) { try { const r = $('game').requestPointerLock?.(); r && r.catch && r.catch(() => {}); } catch (e) { /* needs a gesture */ } } if (on) { this.menu.sel = 0; this.menu.render(); this.renderPauseLegend(); if (document.pointerLockElement) document.exitPointerLock?.(); }
    if (on) this.sfx.play('select'); else this.sfx.play('back');
  }
  renderTitleLegend() {
    const g = b => this.pad.glyph(b), rows = [['Move', 'LS'], ['Look', 'RS'], ['Fire', 'R2'], ['Aim', 'L2'], ['Jump', 'A'], ['Build', 'B'], ['Reload / hold: open · pick up', 'X'], ['Pickaxe', 'Y'], ['Heal', 'UP'], ['Grenade', 'DOWN']];
    $('legend').innerHTML = rows.map(([t, b]) => `<div>${b === 'LS' || b === 'RS' ? `<kbd>${this.pad.touch ? (b === 'LS' ? 'Left stick' : 'Drag / right stick') : b === 'LS' ? 'WASD' : 'Mouse'}</kbd>` : g(b)} ${t}</div>`).join('') + `<div style="grid-column:1/3;justify-content:center;opacity:.85">${g('TOUCH')} all controls &nbsp;·&nbsp; ${g('HOME')} back to the Arcade</div>`;
  }
  renderPauseLegend() { const g = b => this.pad.glyph(b); $('pauseLegend').innerHTML = `<div>${g('A')} select</div><div>${g('START')} resume</div><div>${g('TOUCH')} controls</div><div>${g('HOME')} arcade</div>`; }

  // ====================== match setup ======================
  resetMatchObjects() {
    this.loot.reset(); this.combat.reset(); this.fx.clear(); this.storm.reset(); this.bus.dispose();
    this.world.cw.stampCtr = 1;
  }
  startMatch() {
    this.matchNo++; this.sfx.init();
    if (!this.pad.usingPad && !this.pad.connected) { try { const r = $('game').requestPointerLock?.(); r && r.catch && r.catch(() => {}); } catch (e) { /* needs a user gesture */ } }
    $('title').classList.add('hidden'); $('end').classList.add('hidden'); this.hud.show(true);
    this.world.generate(this.opts.seed ?? ((Math.random() * 1e6) | 0));
    this.resetMatchObjects();
    for (const c of this.world.out.chestSpots) this.loot.addChest(c); this.loot.rebuildChests(); this.loot.scatter(this.world.out, this.world.terrain, this.world.occ);
    const quick = this.opts.quick, nb = this.opts.bots ?? (quick ? 5 : 30), T = this.world.terrain;
    this.fighters = []; this.bots = []; this.alive = [];
    const p = this.player; p.reset(); p.root.visible = true; this.fighters.push(p); this.alive.push(p);
    for (let i = 0; i < nb; i++) { const f = this.pool[1 + (i % (this.pool.length - 1))]; f.reset(); f.root.visible = true; this.fighters.push(f); this.alive.push(f); const b = new Bot(this, f, {}); this.bots.push(b); f.bot = b; }
    for (const f of this.pool) if (!this.fighters.includes(f)) { f.root.visible = false; f.bot = null; }
    this.dropCounts = new Map(); this.time = 0; this.matchTime = 0; this.endT = -1; this.stormTick = 1; this.stats = null; this.interactTarget = null; this.hintT = 0;
    p.inv.mats = [100, 0, 0]; for (const b of this.bots) b.f.inv.mats = [Math.floor(rnd() * 120), Math.floor(rnd() * 60), 0];
    this.ctl.resetView(0);
    if (quick) this.setupQuick(T); else this.setupBus();
    this.state = quick ? 'play' : 'bus'; this.paused = false; $('pause').classList.add('hidden');
    this.hud.banner(quick ? 'QUICK TEST' : 'STORM ROYALE', quick ? 'Spawned with a loadout · 5 bots nearby' : 'Battle bus is on its way', 3);
  }
  setupBus() {
    const bus = this.bus; bus.begin(); this.ctl.resetView(Math.atan2(bus.dir.x, bus.dir.z));
    for (const f of this.fighters) f.enterBus(bus.pos);
    for (const b of this.bots) b.planDrop(bus);
    if (this.opts.storm) this.storm.start();
    this.sfx.play('start');
  }
  setupQuick(T) {
    const poi = T.poi('pinecrest'), p = this.player, occ = this.world.occ;
    // a clear spot near the village plaza (not inside a house)
    let x = poi.x + 16, z = poi.z + 16;
    for (let k = 0; k < 300; k++) {
      const a = rnd() * 6.28, r = 11 + rnd() * 22, cx = poi.x + Math.cos(a) * r, cz = poi.z + Math.sin(a) * r;
      if ([[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [6, 0], [-6, 0], [0, 6], [0, -6]].every(([dx, dz]) => occ.free(cx + dx, cz + dz)) && T.slopeAt(cx, cz) < 0.2) { x = cx; z = cz; break; }
    }
    p.placeAt(x, z); p.inv.mats = [300, 300, 300];
    const give = this.opts.give || ['striker', 'pump', 'bolt', 'rocket'], r = this.opts.rarity;
    give.forEach(id => { if (ITEMS[id]) p.pickup(makeItem(id, r)); });
    if (p.emptySlot() >= 0) p.pickup(makeItem('bandage', 0, 8));
    p.inv.ammo = { light: 150, medium: 180, heavy: 24, shells: 30, rockets: 8, arrows: 24 };
    for (const s of p.inv.slots) if (s && ITEMS[s.id].type === 'gun') s.mag = ITEMS[s.id].mag;
    p.select(1, true); p.shield = 100; p.hp = 100;
    // bots on the ground around the village
    const weaponPool = ['striker', 'burst', 'pump', 'rapidsmg', 'sidearm', 'scopedar', 'tactical', 'huntrifle', 'lmg', 'revolver'];
    this.bots.forEach((b, i) => {
      b.skill = 0.2 + rnd() * 0.25; b.aggr = 0.4; b.react = 1.0 + rnd() * 0.5; b.calmUntil = 14 + rnd() * 6;   // gentler opponents for testing
      const ang = (i / this.bots.length) * Math.PI * 2 + 0.6 + rnd() * 0.4, d = 38 + rnd() * 35; let bx = x + Math.cos(ang) * d, bz = z + Math.sin(ang) * d;
      for (let k = 0; k < 40 && !(T.isLand(bx, bz, 2) && occ.free(bx, bz)); k++) { bx = x + Math.cos(ang + k * 0.4) * (d * (0.5 + 0.5 * rnd())); bz = z + Math.sin(ang + k * 0.4) * (d * (0.5 + 0.5 * rnd())); }
      b.f.placeAt(bx, bz); b.state = 'roam'; b.f.pickup(makeItem(pick(weaponPool), Math.floor(rnd() * 3))); b.f.pickup(makeItem('bandage', 0, 4));
      b.f.inv.ammo = { light: 120, medium: 120, heavy: 12, shells: 24, rockets: 0, arrows: 0 }; b.f.select(1, true); for (const s of b.f.inv.slots) if (s && ITEMS[s.id].type === 'gun') s.mag = ITEMS[s.id].mag;
    });
    // face the bots; put a chest and some test items in front of the spawn
    if (this.bots.length) { const c = this.bots[0].f.pos; this.ctl.yaw = p.yaw = Math.atan2(c.x - x, c.z - z); }
    const fx = Math.sin(this.ctl.yaw), fz = Math.cos(this.ctl.yaw), rx = -fz, rz = fx, ground = (px, pz) => this.world.cw.supportAt(px, pz, 99, 0.5);
    const cx = x + fx * 6, cz = z + fz * 6; this.loot.addChest({ x: cx, y: ground(cx, cz), z: cz, dx: -fx, dz: -fz, tier: 'camp' }); this.loot.rebuildChests();
    const test = this.opts.range ? Object.keys(ITEMS).filter(id => id !== 'pickaxe') : ['potion', 'smallshield', 'frag', 'impulse', 'smoke', 'knife', 'blade', 'machete', 'tknives', 'crossbow', 'bow', 'minigun'];
    test.forEach((id, i) => {
      const ring = this.opts.range, a = ring ? (i / test.length) * Math.PI * 2 : -0.9 + (i / (test.length - 1)) * 1.8, rad = ring ? 7 : 5 + (i % 2) * 1.6;
      const ix = ring ? x + Math.cos(a) * rad : x + fx * Math.cos(a) * rad + rx * Math.sin(a) * rad * 1.0, iz = ring ? z + Math.sin(a) * rad : z + fz * Math.cos(a) * rad + rz * Math.sin(a) * rad;
      if (!occ.free(ix, iz)) return; const it = makeItem(id, Math.min(4, i % 5)); this.loot.spawnDrop(new THREE.Vector3(ix, ground(ix, iz) + 0.3, iz), { item: it });
    });
    for (const t of ['light', 'medium', 'heavy', 'shells', 'rockets', 'arrows']) { const a = Math.random() * 6.28; this.loot.spawnDrop(new THREE.Vector3(x + Math.cos(a) * 3, ground(x, z) + 0.3, z + Math.sin(a) * 3), { ammo: t, n: 30 }); }
    this.bus.dispose(); if (this.opts.storm) this.storm.start();
  }

  ejectFromBus(f) {
    if (f.state !== 'bus') return; const bus = this.bus;
    f.pos.copy(bus.pos); f.pos.x += (rnd() - 0.5) * 3; f.pos.y -= 2.6; f.pos.z += (rnd() - 0.5) * 3; f.leaveBus(bus.vel.clone().multiplyScalar(0.75));
    if (f.isPlayer) { this.state = 'play'; this.hud.banner('DROP!', 'Skydive', 1.4); this.sfx.play('jump'); this.hintT = 30; }
  }

  // ====================== callbacks from the simulation ======================
  sfx3d(name, pos, vol = 1, ref = 30) {
    if (!this.sfx.ready || !pos) return; const d = this.listenerPos.distanceTo(pos); if (d > ref * 5) return;
    const v = vol * (ref * ref) / (ref * ref + d * d); if (v < 0.04) return;
    const now = performance.now(); if (now - (this.sndWin || 0) > 100) { this.sndWin = now; this.sndCount = 0; } if (++this.sndCount > 9) return;   // cap sounds per 100 ms
    this.sfx.play(name, { vol: Math.min(1.2, v) });
  }
  onNoise(src, pos, radius) { for (const b of this.bots) if (b.f !== src && b.f.alive) b.hear(src, pos, radius); }
  onLanded(f) { if (f.isPlayer) { this.hud.banner('LANDED', '', 1.0); this.hintT = 40; } else if (f.bot) { f.bot.state = 'loot'; f.bot.goal = null; f.bot.calmUntil = this.time + 25 + rnd() * 20; } }
  onBuilt(f, p) { }
  onPlayerShot(f, d) { }
  onDamaged(f, info, sh, hp) {
    if (f.isPlayer) {
      this.hud.hurt(info.attacker ? info.attacker.pos : null, sh + hp);
      if (info.kind === 'storm') { this.sfx.play('hurt', { vol: 0.5 }); } else if (sh > 0 && f.shield <= 0) this.sfx.play('shieldBreak', { vol: 0.8 }); else if (sh > 0 && hp <= 0) this.sfx.play('shieldHit', { vol: 0.7 }); else this.sfx.play('hurt', { vol: 0.7 });
      this.pad.rumble(0.5, Math.min(1, 0.3 + (sh + hp) / 60), 140);
    }
    if (f.bot) { const a = info.attacker; if (a && a !== f && a.alive) { f.bot.alertPos = a.pos.clone(); f.bot.alertT = 5; if (!f.bot.target && f.bot.skill > 0.3) f.yaw = Math.atan2(a.pos.x - f.pos.x, a.pos.z - f.pos.z); } }
  }
  onHitConfirmed(att, target, res, point) {
    if (!att || !att.isPlayer) return;
    const kill = !target.alive, head = !!res.head, hud = this.hud;
    if (res.sh > 0.5) hud.number(point, res.sh, 'shield'); if (res.hp > 0.5) hud.number(point, res.hp, head ? 'head' : 'body');
    hud.hitmarker(head, kill); hud.enemyBar(target);
    this.sfx.play(kill ? 'kill' : head ? 'headshot' : 'hit', { vol: kill ? 0.9 : 0.7 }); this.pad.rumble(0.2, head ? 0.6 : 0.25, 70);
  }
  onEliminated(f, info) {
    const idx = this.alive.indexOf(f), place = this.alive.length; f.place = place; if (idx >= 0) this.alive.splice(idx, 1);
    this.loot.dropAll(f); this.fx.burst(f.center(new THREE.Vector3()), f.isPlayer ? 0xffd23f : 0x9fe8ff); this.sfx3d('kill', f.pos, 1, 60); this.sfx3d('shieldBreak', f.pos, 0.8, 40);
    const k = info.attacker && info.attacker !== f ? info.attacker : null; if (k) k.kills++;
    const nm = x => x.isPlayer ? '<b style="color:#ffd23f">You</b>' : `<b>${x.name}</b>`, w = info.weapon ? ` <i>(${info.weapon})</i>` : '';
    let html; if (info.kind === 'storm') html = `${nm(f)} <i>was caught by the storm</i>`; else if (info.kind === 'fall') html = `${nm(f)} <i>fell too far</i>`; else if (k) html = `${nm(k)} <i>eliminated</i> ${nm(f)}${w}`; else html = `${nm(f)} <i>was eliminated</i>`;
    this.hud.feed(html, f.isPlayer ? 'died' : k && k.isPlayer ? 'me' : '');
    if (k && k.isPlayer) { this.hud.banner(`ELIMINATED ${f.name.toUpperCase()}`, `${k.kills} elimination${k.kills > 1 ? 's' : ''}`, 1.6); }
    if (k && k.bot && k.alive && rnd() < 0.2 && k.bot.skill > 0.4) k.bot.emoteT = 0;
    if (f.isPlayer) { const win = place === 1; this.stats = { place, kills: f.kills, damage: Math.round(f.damageDealt), time: this.matchTime, win }; this.endT = win ? 1.2 : 2.4; if (!win) { this.hud.banner('ELIMINATED', info.attacker ? `by ${info.attacker.name}` : '', 2.2); this.sfx.play('lose'); } }
    if (this.alive.length === 1 && this.alive[0].isPlayer && !this.stats) { const p = this.alive[0]; this.stats = { place: 1, kills: p.kills, damage: Math.round(p.damageDealt), time: this.matchTime, win: true }; this.endT = 2.0; p.startEmote(); this.sfx.play('win'); }
    else if (this.alive.length === 0 && !this.stats) { this.stats = { place: 1, kills: this.player.kills, damage: Math.round(this.player.damageDealt), time: this.matchTime, win: true }; this.endT = 2; }
  }
  showEnd() {
    const s = this.stats; this.state = 'ended'; const win = !!s.win; document.exitPointerLock?.();
    $('endKicker').textContent = win ? 'VICTORY' : 'ELIMINATED'; const t = $('endTitle'); t.textContent = win ? '#1 STORM CHAMPION' : `You placed #${s.place}`; t.className = win ? 'win' : '';
    const mm = Math.floor(s.time / 60), ss = String(Math.floor(s.time % 60)).padStart(2, '0');
    $('endStats').innerHTML = `<div class="stat"><b>${s.kills}</b><span>ELIMINATIONS</span></div><div class="stat"><b>${s.damage}</b><span>DAMAGE</span></div><div class="stat"><b>${mm}:${ss}</b><span>SURVIVED</span></div>`;
    this.endMenu.sel = 0; this.endMenu.render(); $('end').classList.remove('hidden'); this.hud.show(false);
    if (win) { for (let i = 0; i < 70; i++) { const d = document.createElement('div'); d.className = 'confetti'; d.style.left = rnd() * 100 + 'vw'; d.style.background = pick(['#ffd23f', '#b86bff', '#35e0ff', '#ff5ea8', '#6dff6d']); d.style.animationDuration = 2.5 + rnd() * 3 + 's'; d.style.animationDelay = rnd() * 1.5 + 's'; document.body.appendChild(d); setTimeout(() => d.remove(), 8000); } this.sfx.play('win'); }
  }

  // ====================== main loop ======================
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000)); this.last = now;
    try { this.frame(dt); } catch (e) { console.error(e); if (!this._errShown) { this._errShown = true; const d = $('pad'); if (d) d.textContent = 'Error: ' + e.message; } }
  }
  frame(dt) {
    const pad = this.pad, ctl = this.ctl; pad.update();
    if (this.opts.fps) { this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { $('pad').textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.renderer.info?.render?.calls ?? '?'} calls · ${Math.round((this.renderer.info?.render?.triangles ?? 0) / 1000)}k tris`; this.fpsAcc = 0; this.fpsN = 0; } }
    else $('pad').textContent = pad.connected ? `Controller: ${pad.id.slice(0, 40)}` : 'Keyboard + mouse';
    if (pad.touch && !this._touchLegend && this.state === 'title') { this._touchLegend = true; this.renderTitleLegend(); }   // drawn before touch was detected
    if (pad.any() && this.sfx.ctx && this.sfx.ctx.state !== 'running') this.sfx.init();
    if (pad.pressed('HOME')) { goHome(); return; }
    if (pad.pressed('TOUCH') && this.state !== 'loading') { this.overlay.toggle(); this.sfx.play('ui'); }
    if (this.overlay.visible && (pad.pressed('START') || pad.pressed('B'))) { this.overlay.hide(); this.sfx.play('back'); pad.held.START = false; }
    this.overlay.update();
    const overlayOn = this.overlay.visible;
    if (this.state === 'title') {
      $('startPrompt').innerHTML = `Press ${pad.glyph('A')} to start`; this.time += dt; ctl.update(dt); this.world.update(dt, ctl.camPos, new THREE.Vector3(0, 0, 0)); this.fx.update(dt);
      if (!overlayOn && (pad.pressed('A') || ctl.key('Enter') || pad.pressed('START') || pad.pressed('R2'))) { this.sfx.init(); this.startMatch(); }
      this.renderer.render(this.scene, ctl.cam); ctl.endFrame(); return;
    }
    if (this.state === 'ended') { this.updateSim(dt, false); this.endMenu.update(pad, ctl, this.sfx); this.renderScene(dt); ctl.endFrame(); return; }
    if (pad.pressed('START') && !overlayOn && !(performance.now() - (this.lockLostT || 0) < 350)) this.setPaused(!this.paused);
    if (this.paused) { if (overlayOn) { /* overlay open from pause */ } else { this.menu.update(pad, ctl, this.sfx); if (pad.pressed('B')) this.setPaused(false); } this.renderScene(0); ctl.endFrame(); return; }
    if (overlayOn) { this.renderScene(0); ctl.endFrame(); return; }
    this.updateSim(dt, true); this.renderScene(dt); ctl.endFrame();
  }

  updateSim(dt, input) {
    const G = this, ctl = this.ctl, p = this.player, cw = this.world.cw;
    this.time += dt; if (p.alive || this.state !== 'ended') this.matchTime += dt;
    // input -> player
    if (input && this.state !== 'ended') ctl.handleInput(dt, true); else ctl.handleInput(dt, false);
    // bus
    const bus = this.bus;
    if (bus.active) {
      bus.update(dt); for (const f of this.fighters) if (f.state === 'bus') f.pos.copy(bus.pos);
      this.busSfxT -= dt; if (this.busSfxT <= 0 && this.state === 'bus') { this.busSfxT = 0.5; this.sfx.play('bus', { vol: 0.8 }); }
      if (!bus.active) for (const f of this.fighters) if (f.state === 'bus') this.ejectFromBus(f);
    }
    // storm
    if (this.storm.active) {
      this.storm.update(dt); const a = this.storm.announce; if (a) { this.storm.announce = null; if (a.type === 'new') { this.hud.banner(a.phase === 0 ? 'STORM FORMING' : `STORM PHASE ${a.phase + 1}`, 'Next safe zone marked on the map', 2.6); this.sfx.play('storm'); } else { this.hud.banner('STORM CLOSING', 'Head to the safe zone', 2.2); this.sfx.play('storm'); } }
      this.stormTick -= dt;
      if (this.stormTick <= 0) { this.stormTick = 1; const dmg = this.storm.dmg; for (const f of this.alive) if ((f.state === 'ground' || f.state === 'glide') && !this.storm.inside(f.pos.x, f.pos.z)) f.damage(dmg, { bypass: true, kind: 'storm' }); }
    }
    // fighters
    const camP = ctl.camPos;
    for (const b of this.bots) {
      const f = b.f; if (!f.alive) { f.update(dt); f.updateVisual(dt, camP); continue; }
      const dx = f.pos.x - p.pos.x, dz = f.pos.z - p.pos.z, d2 = dx * dx + dz * dz; b.far = d2 > 150 * 150 && f.state === 'ground';
      if (b.far) { b.acc = (b.acc || 0) + dt; if (b.acc >= 0.1) { const a = b.acc; b.acc = 0; b.update(a, this.time); f.update(a); f.visible = false; f.root.visible = false; } }
      else { b.acc = 0; b.update(dt, this.time); f.update(dt); }
    }
    p.update(dt);
    // separation between standing fighters
    const al = this.alive;
    for (let i = 0; i < al.length; i++) { const a = al[i]; if (a.state !== 'ground') continue; for (let j = i + 1; j < al.length; j++) { const b = al[j]; if (b.state !== 'ground') continue; const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5) { const d = Math.sqrt(d2), k = (0.72 - d) * 0.5 / d; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; } } }
    this.combat.update(dt); this.loot.update(dt, p.pos); this.world.pieces.update(dt); this.fx.update(dt);
    // end of match flow
    if (this.endT > 0) { this.endT -= dt; if (this.endT <= 0 && this.stats) this.showEnd(); }
  }

  renderScene(dt) {
    const ctl = this.ctl, p = this.player, cam = ctl.cam, T = this.world.terrain;
    if (this.state !== 'title') {
      for (const f of this.fighters) if (f.alive || f.dissolve >= 0) f.updateVisual(dt, ctl.camPos);
      ctl.update(dt || 0.0001); ctl.computeAim(); this.listenerPos.copy(ctl.camPos);   // camera last: it can hide the player's body when scoped
      if (this.state !== 'ended') this.build.updateGhost(p, p.buildMode && p.alive); else this.build.updateGhost(p, false);
      this.world.update(dt, ctl.camPos, p.pos);
      // loops: wind in the air, storm rumble
      if (this.sfx.ready) {
        const air = p.state === 'free' ? 0.28 + Math.min(0.2, p.speed * 0.004) : p.state === 'glide' ? 0.1 : 0; this.sfx.loop('wind', air, p.state === 'free' ? 900 : 600);
        let sl = 0; if (this.storm.active) { const d = this.storm.distToWall(p.pos.x, p.pos.z); sl = d > 0 ? 0.22 : Math.max(0, 0.2 * (1 - -d / 70)); } this.sfx.loop('storm', sl, 260);
      }
      this.fx.setView(innerHeight * (this.renderer.getPixelRatio?.() ?? 1), cam.fov);
      // HUD
      const st = this.storm, outside = st.active && !st.inside(p.pos.x, p.pos.z) && p.alive && p.state !== 'bus';
      const bus = this.bus, busEnd = bus.pointAt(bus.len, new THREE.Vector3());
      this.hud.update({ p, pad: this.pad, dt: dt || 0.0001, alive: this.alive.length, storm: st, outside, state: p.state === 'bus' ? 'bus' : 'play', adsT: ctl.adsT, fov: cam.fov, camera: cam, yaw: ctl.yaw, px: p.pos.x, pz: p.pos.z, pois: T.pois,
        busPos: bus.active ? bus.pos : null, busStart: bus.start, busEnd, busLeft: Math.max(0, Math.round(bus.len - bus.s)), target: this.interactTarget, stormTint: outside ? 0.95 : 0, needMouse: !this.pad.usingPad && !this.pad.connected && !this.pad.locked && !this.paused && this.state !== 'ended', showHints: p.alive && !(ctl.firstPerson), hintCount: this.hintT > 0 ? 7 : 5 });
      this.hintT = Math.max(0, this.hintT - dt);
      if (p.alive && p.state !== 'bus') { const poi = T.nearestPoi(p.pos.x, p.pos.z), d = Math.hypot(poi.x - p.pos.x, poi.z - p.pos.z); const id = d < poi.flat + 14 ? poi.id : null; if (id !== this.curPoi) { this.curPoi = id; if (id) this.hud.location(poi.name); } }
    }
    this.renderer.render(this.scene, cam);
  }
}

export async function boot() {
  try { const game = new Game(); window.game = game; await game.init(); }
  catch (e) { console.error(e); const m = $('loadMsg'); if (m) m.textContent = 'Could not start (WebGL needed): ' + e.message; }
}
if (typeof window !== 'undefined' && !globalThis.__ROYALE_NO_BOOT__) boot();
