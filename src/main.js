import * as THREE from 'three';
import { Input, legendHTML, CONTROL_MAP } from './input.js';
import { goHome } from './common/pad.js';
import { ControllerOverlay } from './common/overlay.js';
import { Audio, TRACKS } from './audio.js';
import { Physics, Builder } from './world.js';
import { Player } from './player.js';
import { Entities, FX } from './entities.js';
import { Boss } from './boss.js';
import { WORLDS, HUB } from './levels.js';
import { makeBot } from './models.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'starbolt-save-v1';

class UI {
  constructor() { this.toastT = 0; this.bannerT = 0; }
  show(id, on) { $(id).classList.toggle('hidden', !on); }
  hud(g) {
    const P = g.player;
    $('hp').innerHTML = Array.from({ length: P.maxHp }, (_, i) => `<i class="${i < P.hp ? '' : 'off'}"></i>`).join('');
    $('coins').textContent = g.save.coins;
    $('bots').textContent = g.inHub ? `${g.save.bots.length} rescued` : `${g.levelBots}/${g.levelBotTotal}`;
    const pw = P.power; this.show('power', !!pw || (!g.inHub));
    if (pw) { $('powerName').textContent = { rocket: 'Rocket Pack', magnet: 'Magnet Glove', slow: 'Time Slow' }[pw.kind];
      $('powerCharge').textContent = pw.kind === 'rocket' ? '●'.repeat(pw.charges) + '○'.repeat(pw.max - pw.charges) : pw.kind === 'slow' ? (g.slowT > 0 ? 'active' : g.slowCd > 0 ? Math.ceil(g.slowCd) + 's' : 'ready') : ''; }
    else { $('powerName').textContent = P.grounded ? 'Scan' : 'Ground pound'; $('powerCharge').textContent = ''; }
  }
  toast(text, t = 2.2) { const el = $('toast'); el.textContent = text; el.classList.add('show'); this.toastT = t; }
  banner(title, sub, t = 2.6) { const el = $('banner'); el.innerHTML = `${sub ? `<small>${sub}</small>` : ''}${title}`; el.classList.add('show'); this.bannerT = t; }
  prompt(html) { const el = $('prompt'); if (html) { el.innerHTML = html; el.classList.remove('hidden'); } else el.classList.add('hidden'); }
  bossBar(on, frac = 1) { this.show('bossbar', on); $('bossfill').style.width = `${Math.max(0, frac) * 100}%`; }
  tick(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.remove('show');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) $('banner').classList.remove('show');
  }
}

class Game {
  constructor() {
    const canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 900);
    this.levelRoot = new THREE.Group(); this.scene.add(this.levelRoot);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0005; this.scene.add(this.sun, this.sun.target);
    this.makeSky();
    this.input = new Input(); this.audio = new Audio(); this.ui = new UI();
    this.overlay = new ControllerOverlay({ title: 'Starbolt — controls', map: CONTROL_MAP, pad: this.input.pad });
    this.phys = new Physics(); this.fx = new FX(this.scene); this.ents = new Entities(this);
    this.player = new Player(this); this.scene.add(this.player.model, this.player.shadow);
    this.save = this.loadSave();
    this.cam = { yaw: 0, pitch: 0.36, dist: 10, base: 10, zoom: 1, snap: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), shake: 0 };
    this.state = 'title'; this.slowT = 0; this.slowCd = 0; this.worldTime = 0; this.waterVolumes = []; this.entities = [];
    this.hubBots = []; this.boss = null;
    $('legendTitle').innerHTML = legendHTML(); $('legendPause').innerHTML = legendHTML();
    addEventListener('resize', () => this.resize()); this.resize();
    const qs = new URLSearchParams(location.search);
    if (qs.has('unlock')) { this.save.done = WORLDS.slice(0, 5).map(w => w.id); }
    this.debugWorld = qs.has('world') ? +qs.get('world') : null;
    this.loadHub(true);
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------- save ----------
  loadSave() { try { return { coins: 0, bots: [], done: [], ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return { coins: 0, bots: [], done: [] }; } }
  writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage unavailable */ } }
  isUnlocked(i) { if (i === 0) return true; if (WORLDS[i].boss) return WORLDS.slice(0, 5).every(w => this.save.done.includes(w.id)); return this.save.done.includes(WORLDS[i - 1].id); }

  // ---------- visuals ----------
  makeSky() {
    this.skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*0.5+0.5,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, smoothstep(0.35,1.0,h)),1.0); }' });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat); this.scene.add(this.sky);
    const n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(500); pos.set([v.x, v.y, v.z], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })); this.scene.add(this.stars);
  }
  applyTheme(t) {
    this.skyMat.uniforms.top.value.set(t.sky[0]); this.skyMat.uniforms.bottom.value.set(t.sky[1]);
    this.scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
    this.stars.visible = !!t.stars; this.sun.color.set(t.sun ?? 0xffffff);
    this.hemi.intensity = t.ambient ?? 0.9; this.hemi.groundColor.set(t.underwater ? 0x0a4a7a : 0x445566);
    this.sun.intensity = t.underwater ? 1.4 : 2.2;
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------- level loading ----------
  clearLevel() {
    if (this.boss) { this.boss.dispose(); this.boss = null; }
    this.levelRoot.clear(); this.phys.clear(); this.fx.clear(); this.entities = []; this.waterVolumes = [];
    this.hubBots = []; this.hubPortals = []; this.player.power = null; this.slowT = 0; this.slowCd = 0; this.worldTime = 0;
    this.ui.bossBar(false); this.ui.prompt(null);
  }
  build(theme, index) {
    this.clearLevel(); this.level = theme; this.level.index = index;
    this.applyTheme(theme); this.gravityScale = theme.gravityScale ?? 1;
    const B = new Builder(this, theme); theme.build(B, this);
    this.ents.build(this.entities);
    this.levelBotTotal = this.entities.filter(e => e.type === 'bot').length; this.levelBots = 0; this.levelCoins = 0;
    const [x, y, z] = theme.spawn; this.checkpoint = new THREE.Vector3(x, y, z);
    this.player.reset(this.checkpoint.clone()); this.player.hp = this.player.maxHp;
    this.cam.yaw = 0; this.cam.pitch = theme.camPitch ?? 0.36; this.cam.dist = this.cam.base = theme.camDist ?? 10; this.cam.zoom = 1; this.cam.snap = 0; this.cam.lift = theme.camLift ?? 1.3; this.snapCamera();
    this.audio.playMusic(TRACKS[theme.track]);
  }
  loadHub(first = false) {
    this.inHub = true; this.build(HUB, -1);
    const n = Math.min(30, this.save.bots.length);
    for (let i = 0; i < n; i++) { const m = makeBot(i); const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 12;
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); this.levelRoot.add(m); this.hubBots.push({ m, a: Math.random() * 6, t: Math.random() * 5, target: m.position.clone() }); }
    if (!first) this.ui.banner('The Mothership', `${this.save.bots.length} bots rescued`);
  }
  enterWorld(i) {
    this.inHub = false; const w = WORLDS[i]; this.build(w, i);
    this.ui.banner(w.name, w.sub, 3);
    if (w.boss) { this.boss = new Boss(this); this.ui.toast('Jump the shockwaves · hit the glowing hand core with X', 4); }
    $('worldName').textContent = w.name;
  }
  transition(fn) {
    if (this.fading) return; this.fading = true; $('fade').classList.add('on');
    setTimeout(() => { fn(); $('fade').classList.remove('on'); this.fading = false; }, 380);
  }

  // ---------- game events (called by player/entities) ----------
  addCoins(n, pos) { this.save.coins += n; this.levelCoins += n; this.audio.sfx('coin'); if (pos && n > 1) this.fx.burst(pos.clone(), 8, 0xffd34d); this.writeSave(); }
  rescueBot(e) {
    this.audio.sfx('rescue'); this.fx.burst(e.m.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 20, 0x46f0ff);
    if (!e.already) { this.save.bots.push(e.id); this.writeSave(); }
    this.levelBots++; this.ui.toast(e.already ? 'Bot already rescued' : `Bot rescued!  ${this.levelBots}/${this.levelBotTotal}`);
  }
  setCheckpoint(p) { this.checkpoint = p.clone().add(new THREE.Vector3(1.2, 0, 0)); this.ui.toast('Checkpoint'); }
  givePower(kind) {
    this.player.power = { kind, charges: 3, max: 3 }; this.audio.sfx('power');
    this.ui.toast({ rocket: 'ROCKET PACK!  Press Y to boost (3 charges)', magnet: 'MAGNET GLOVE!  Press Y near a red node', slow: 'TIME SLOW!  Press Y to slow the station' }[kind], 3.5);
  }
  nearestMagnet(pos, range) { let best = null, bd = range; for (const m of this.ents.magnets) { const d = m.distanceTo(pos); if (d < bd) { bd = d; best = m; } } return best; }
  magnetBeam(node) {
    const from = this.player.center(), geo = new THREE.BufferGeometry().setFromPoints([from, node]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5566 })); this.levelRoot.add(line);
    setTimeout(() => this.levelRoot.remove(line), 300);
  }
  startSlow() { this.slowT = 4; this.slowCd = 9; this.audio.sfx('slow'); this.ui.toast('Time slowed!', 1.4); }
  scan(pos) { this.audio.sfx('scan'); this.fx.ring(pos.clone().setY(pos.y - 0.7), 0x9ff6ff, 12, 0.8); const n = this.ents.reveal(pos, 13); if (n) this.ui.toast(`${n} hidden coins revealed`); }
  onPound(pos) { this.audio.sfx('pound'); this.shake(0.35); this.fx.ring(pos, 0xffffff, 3.2); this.fx.puff(pos, 10); this.ents.shockwave(pos, 3); this.boss?.onPound(pos); }
  onSpring(c) { this.audio.sfx('spring'); this.ents.onSpring(c); }
  onCrumble(c) { this.ents.onCrumble(c); }
  hoverBeam(pos) { if ((this.hoverTick = (this.hoverTick || 0) + 1) % 3 === 0) this.ents.hoverBeam(pos); }
  inWater(p) { const y = p.y + 0.7; return this.waterVolumes.some(w => p.x > w.min.x && p.x < w.max.x && y > w.min.y && y < w.max.y && p.z > w.min.z && p.z < w.max.z); }
  shake(a) { this.cam.shake = Math.max(this.cam.shake, a); }
  toast(t) { this.ui.toast(t, 3); }
  onDeath() {
    this.transition(() => { const P = this.player; P.reset(this.checkpoint.clone()); P.hp = P.maxHp; P.invul = 1.5; this.snapCamera(); });
  }
  fellOut() {
    const P = this.player; P.hp -= 1; this.audio.sfx('hurt');
    if (P.hp <= 0) { P.dead = true; this.onDeath(); return; }
    this.transition(() => { const hp = P.hp, pw = P.power; P.reset(this.checkpoint.clone()); P.hp = hp; P.power = pw; P.invul = 1.2; this.snapCamera(); });
  }
  completeLevel() {
    const w = this.level; this.audio.sfx('portal'); this.state = 'results';
    if (!this.save.done.includes(w.id)) this.save.done.push(w.id); this.writeSave();
    $('resTitle').textContent = w.boss ? 'The galaxy is safe!' : `${w.name} cleared!`;
    $('resBody').innerHTML = `Bots rescued: <b>${this.levelBots}/${this.levelBotTotal}</b><br>Coins collected: <b>${this.levelCoins}</b><br>Total bots: <b>${this.save.bots.length}</b>` +
      (w.boss ? '<br><br>Thanks for playing Starbolt!' : (WORLDS[w.index + 1] ? `<br><br>Unlocked: <b>${WORLDS[w.index + 1].name}</b>` : ''));
    this.ui.show('results', true);
  }
  onBossDefeated() { this.ui.banner('VOID TITAN DEFEATED', 'Final battle', 3.5); setTimeout(() => { if (this.level.boss) this.completeLevel(); }, 4200); }

  // ---------- pause menu ----------
  openPause() {
    this.state = 'pause'; this.pauseSel = 0;
    this.pauseItems = this.inHub ? ['Resume', 'Controls', 'Music on / off', 'Reset save data', 'Back to Arcade'] : ['Resume', 'Controls', 'Music on / off', 'Restart world', 'Return to Mothership', 'Back to Arcade'];
    this.renderPause(); this.ui.show('pause', true);
  }
  renderPause() { $('pauseMenu').innerHTML = this.pauseItems.map((t, i) => `<div class="${i === this.pauseSel ? 'sel' : ''}">${t}</div>`).join(''); }
  pauseInput() {
    const I = this.input;
    if (I.pressed('START') || I.pressed('B')) { this.closePause(); return; }
    const dy = (I.pressed('DOWN') || (I.move.y < -0.6 && !this.pauseHeld)) ? 1 : (I.pressed('UP') || (I.move.y > 0.6 && !this.pauseHeld)) ? -1 : 0;
    this.pauseHeld = Math.abs(I.move.y) > 0.6;
    if (dy) { this.pauseSel = (this.pauseSel + dy + this.pauseItems.length) % this.pauseItems.length; this.renderPause(); this.audio.sfx('select'); }
    if (I.pressed('A')) {
      const item = this.pauseItems[this.pauseSel]; this.closePause();
      if (item === 'Restart world') this.transition(() => this.enterWorld(this.level.index));
      if (item === 'Return to Mothership') this.transition(() => this.loadHub());
      if (item === 'Controls') this.overlay.show();
      if (item === 'Music on / off') { this.audio.init(); this.ui.toast(this.audio.toggleMusic() ? 'Music on' : 'Music off', 1.2); }
      if (item === 'Back to Arcade') goHome();
      if (item === 'Reset save data') { this.save = { coins: 0, bots: [], done: [] }; this.writeSave(); this.transition(() => this.loadHub()); }
    }
  }
  closePause() { this.state = 'play'; this.ui.show('pause', false); }

  // ---------- camera ----------
  snapCamera() { this.updateCamera(1, true); }
  updateCamera(dt, snap = false) {
    const c = this.cam, I = this.input, P = this.player;
    const playing = this.state === 'play' && !this.overlay.visible;
    if (playing) {
      if (I.pressed('L1')) c.snap += Math.PI / 4; if (I.pressed('R1')) c.snap -= Math.PI / 4;
      if (I.down('LEFT')) c.yaw += dt * 1.8; if (I.down('RIGHT')) c.yaw -= dt * 1.8;
      if (I.down('UP')) c.zoom = Math.max(0.55, c.zoom - dt * 0.9); if (I.down('DOWN')) c.zoom = Math.min(1.7, c.zoom + dt * 0.9);
      if (I.pressed('R3')) { let d = P.facing - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.snap = d; }
    }
    const step = c.snap * Math.min(1, dt * 8); c.yaw += step; c.snap -= step;
    c.dist += ((c.base ?? 10) * c.zoom * (playing && I.down('L2') ? 0.55 : 1) - c.dist) * Math.min(1, dt * 6);
    c.yaw -= I.cam.x * dt * 2.4; c.pitch = Math.max(0.05, Math.min(1.15, c.pitch + I.cam.y * dt * 1.6));
    const target = new THREE.Vector3(P.pos.x, P.pos.y + (c.lift ?? 1.3), P.pos.z);
    const off = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
    const want = target.clone().add(off);
    if (snap) { c.pos.copy(want); c.look.copy(target); } else { c.pos.lerp(want, Math.min(1, dt * 7)); c.look.lerp(target, Math.min(1, dt * 10)); }
    this.camera.position.copy(c.pos);
    if (c.shake > 0) { this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * c.shake, (Math.random() - 0.5) * c.shake, (Math.random() - 0.5) * c.shake)); c.shake = Math.max(0, c.shake - dt * 1.5); }
    this.camera.lookAt(c.look);
    this.sun.position.set(P.pos.x + 18, P.pos.y + 30, P.pos.z - 12); this.sun.target.position.copy(P.pos);
    this.sky.position.copy(this.camera.position); this.stars.position.copy(this.camera.position);
  }

  // ---------- main loop ----------
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const I = this.input; I.update(); this.audio.update(); this.ui.tick(dt);
    $('pad').textContent = I.padName ? `🎮 ${I.padName.slice(0, 40)}` : 'Keyboard · connect a controller any time';
    if (I.pressed('HOME')) { goHome(); return; }
    if (I.pressed('TOUCH')) { this.overlay.toggle(); this.audio.init(); }
    if (this.overlay.visible) { this.overlay.update(); if (I.pressed('START') || I.pressed('B')) this.overlay.hide(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(t => this.loop(t)); return; }
    if (I.pressed('MUSIC')) { this.audio.init(); this.ui.toast(this.audio.toggleMusic() ? 'Music on' : 'Music off', 1.2); }

    if (this.state === 'title') {
      if (I.anyPressed()) {
        this.audio.init(); this.audio.resume(); this.audio.playMusic(TRACKS.hub);
        this.ui.show('title', false); this.ui.show('hud', true); this.state = 'play';
        if (this.debugWorld !== null) this.enterWorld(this.debugWorld); else this.ui.banner('The Mothership', 'Step into a portal');
      }
      this.cam.yaw += dt * 0.15; this.updateCamera(dt);
    } else if (this.state === 'pause') this.pauseInput();
    else if (this.state === 'results') { if (I.pressed('A')) { this.ui.show('results', false); this.state = 'play'; this.transition(() => this.loadHub()); } }
    else if (this.state === 'play') this.step(dt);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(t => this.loop(t));
  }

  step(dt) {
    const I = this.input, P = this.player;
    if (I.pressed('START')) { this.openPause(); return; }
    if (this.fading) { this.updateCamera(dt); return; }
    this.slowT = Math.max(0, this.slowT - dt); this.slowCd = Math.max(0, this.slowCd - dt);
    const wdt = dt * (this.slowT > 0 ? 0.3 : 1); this.worldTime += wdt;
    P.update(dt, I, this.cam.yaw);
    this.ents.update(dt, wdt);
    this.boss?.update(dt, wdt);
    this.fx.update(dt);
    if (P.pos.y < this.level.killY && !P.dead) this.fellOut();
    if (this.inHub) this.updateHub(dt);
    this.renderer.toneMappingExposure = this.slowT > 0 ? 0.85 : 1.05;
    this.updateCamera(dt); this.ui.hud(this);
  }

  updateHub(dt) {
    const P = this.player; let near = null;
    if (this.hubOrb) { this.hubOrb.position.y = 4.4 + Math.sin(performance.now() / 600) * 0.2; }
    for (const p of this.hubPortals) {
      p.disc.material.opacity = 0.4 + Math.sin(performance.now() / 300 + p.i) * 0.15;
      const d = Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z);
      if (d < 3.2) near = p;
      if (d < 1.6 && Math.abs(P.pos.y - p.pos.y) < 1.5) {
        if (p.unlocked) { this.audio.sfx('portal'); const i = p.i; this.transition(() => this.enterWorld(i)); return; }
        else if (!this.lockToastT || performance.now() - this.lockToastT > 2500) { this.lockToastT = performance.now(); this.ui.toast(WORLDS[p.i].boss ? 'Clear all five worlds to face the Titan' : `Clear ${WORLDS[p.i - 1].name} first`); }
      }
    }
    this.ui.prompt(near && near.unlocked ? `Walk into the portal: <b>${WORLDS[near.i].name}</b>` : null);
    for (const b of this.hubBots) {
      b.t -= dt; if (b.t <= 0) { b.t = 2 + Math.random() * 4; const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 13; b.target.set(Math.cos(a) * r, 0, Math.sin(a) * r); }
      const d = b.target.clone().sub(b.m.position); d.y = 0; const l = d.length();
      if (l > 0.2) { d.multiplyScalar(Math.min(l, dt * 2) / l); b.m.position.add(d); b.m.rotation.y = Math.atan2(d.x, d.z); b.m.userData.root.position.y = Math.abs(Math.sin(performance.now() / 120)) * 0.08; }
      else b.m.userData.arm.rotation.z = -2.4 + Math.sin(performance.now() / 100) * 0.4;
    }
  }
}

window.game = new Game();
