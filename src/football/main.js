// Golazo Football — match engine, controls, rules, cameras and HUD.
import * as THREE from 'three';
import { Pad, goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { Sfx } from '../common/sfx.js';
import { Stadium, HL, HW, GOAL_W, GOAL_H } from './stadium.js';
import { Ball, R } from './ball.js';
import { Footballer, ACTIONS } from './player.js';
import { CLUBS, makeSquad } from './teams.js';
import { TeamAI } from './ai.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.87;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pick = a => a[Math.floor(Math.random() * a.length)];

// Buttons are positional (A bottom, B right, X left, Y top). Keyboard diamond: I = Y, J = X, L = B, K = A.
const KEYMAP = {
  A: ['KeyK', 'Space'], B: ['KeyL'], X: ['KeyJ'], Y: ['KeyI'],
  L1: ['KeyQ'], R1: ['KeyE'], L2: ['KeyZ'], R2: ['ShiftLeft', 'ShiftRight'], L3: ['KeyF'], R3: ['KeyG'],
  UP: ['Digit1'], DOWN: ['Digit2'], LEFT: ['Digit3'], RIGHT: ['Digit4'], START: ['Escape', 'Enter', 'KeyP'], SELECT: ['KeyM'],
};
const CONTROL_MAP = {
  X: 'Pass · L1+X through ball · R1+X driven pass · keeper: SAVE RIGHT',
  B: 'Shoot (hold = power) · free kicks & penalties · SLIDE TACKLE · keeper: SAVE MIDDLE',
  A: 'Long pass / cross · BICYCLE KICK (ball in air) · keeper: rush out / punt',
  Y: 'Finesse shot · volley / header / chest · free kicks & penalties · TACKLE · keeper: SAVE LEFT',
  L1: 'L1+Y chip shot · L1+X through ball · switch player (defending)',
  R1: 'R1+Y power (stunning) shot · R1+X driven pass · hold: team press',
  L2: 'L2+Y rainbow flick · hold: shield ball / jockey',
  R2: 'Sprint · R2+Y flick the ball over',
  LS: 'Move · dribble · aim passes, shots, penalties', RS: 'CURVE shots & free kicks · skill moves · switch player',
  L3: 'Knock-on sprint · keeper rush (defending)', R3: 'Control your goalkeeper on / off',
  UP: 'Attacking tactics', DOWN: 'Defensive tactics', LEFT: 'Camera angle ◀', RIGHT: 'Camera angle ▶',
  SELECT: 'Radar on / off', START: 'Pause menu', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
};
const CAMS = ['broadcast', 'tele', 'behind'];
const LINES = {
  goal: ['GOOOAL!', 'What a finish!', 'Into the back of the net!', 'GOLAZO!'],
  save: ['What a save!', 'Denied by the keeper!', 'Brilliant stop!', 'Kept out!'],
  post: ['Off the post!', 'Rattles the woodwork!', 'Crossbar!'],
  miss: ['Just wide!', 'Over the bar!', 'So close!'],
};

class Game {
  constructor() {
    const canvas = $('c');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x16213d, 140, 320);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 700); this.camPos = V(0, 21, 47); this.camLook = V();
    this.scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x2a4a2a, 0.75));
    const sun = this.sun = new THREE.DirectionalLight(0xfff6e8, 2.4); sun.position.set(30, 70, 35); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 50, bottom: -50, near: 10, far: 200 }); sun.shadow.bias = -0.0004;
    this.scene.add(sun); const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(-40, 50, -30); this.scene.add(fill);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec3 p; void main(){ float h = clamp(p.y,0.,1.); vec3 c = mix(vec3(0.95,0.55,0.32), vec3(0.06,0.1,0.25), smoothstep(0.0,0.35,h)); gl_FragColor = vec4(c,1.); }' }));
    this.scene.add(sky);
    this.stadium = new Stadium(this.scene);
    this.sfx = new Sfx();
    this.pad = new Pad({ keymap: KEYMAP });
    this.overlay = new ControllerOverlay({ title: 'Golazo Football — controls', map: CONTROL_MAP, pad: this.pad, note: 'Defending: Y tackle · B slide tackle · L1 switch' });
    this.ball = new Ball(this.scene, this.stadium, this.sfx);
    // controlled-player marker
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: 0x33e0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; this.marker.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3), new THREE.MeshBasicMaterial({ color: 0x33e0ff })); arrow.rotation.x = Math.PI; arrow.position.y = 2.35; this.marker.add(arrow);
    this.markerRing = ring; this.markerArrow = arrow; this.scene.add(this.marker);
    this.aimMarker = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    this.aimMarker.rotation.x = -Math.PI / 2; this.aimMarker.visible = false; this.scene.add(this.aimMarker);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.reticle.visible = false; this.reticle.renderOrder = 10; this.scene.add(this.reticle);
    this.settings = { home: 0, away: 1, half: 3, difficulty: 'pro', keeper: 'manual', camera: 'broadcast', radar: true };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('golazo-settings') || '{}')); } catch { /* ignore */ }
    this.teams = null; this.state = 'menu'; this.ui = 'menu'; this.timeScale = 1; this.slowT = 0; this.slowK = 1; this.menuSel = 0; this.user = null;
    this.toastT = 0; this.charge = null; this.queued = null; this.rsLatch = false; this.keeperMode = false; this.saveMoment = null;
    addEventListener('resize', () => this.resize()); this.resize();
    this.buildMenu();
    this.last = performance.now(); requestAnimationFrame(t => this.loop(t));
    // demo match in the background of the menu
    this.newMatch('demo');
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  // ======================= setup =======================
  newMatch(mode = 'match') {
    if (this.teams) for (const t of this.teams) t.players.forEach(p => p.dispose());
    const clubs = [CLUBS[this.settings.home], CLUBS[this.settings.away === this.settings.home ? (this.settings.home + 1) % CLUBS.length : this.settings.away]];
    this.teams = clubs.map((club, i) => {
      const squad = makeSquad(club, i + 3);
      const t = { club, squad, score: 0, players: [], stats: { shots: 0, onTarget: 0, passes: 0, fouls: 0, corners: 0, saves: 0, poss: 0 } };
      t.players = squad.map(info => new Footballer(this, i, info, club));
      return t;
    });
    this.teams.forEach((t, i) => { t.ai = new TeamAI(this, i); });
    this.mode = mode; this.clock = 0; this.half = 1; this.keeperMode = false; this.saveMoment = null; this.user = null; this.queued = null; this.charge = null;
    $('tHome').textContent = clubs[0].id; $('tAway').textContent = clubs[1].id;
    $('tHome').style.background = clubs[0].color; $('tAway').style.background = clubs[1].color;
    $('tHome').style.color = $('tAway').style.color = '#08121f';
    if (mode === 'shootout') this.startShootout();
    else if (mode === 'fk') this.startFkChallenge();
    else this.kickoff(0);
  }
  get players() { return this.teams ? [...this.teams[0].players, ...this.teams[1].players] : []; }
  dir(team) { return team === 0 ? 1 : -1; }
  oppGoal(team) { return V(this.dir(team) * HL, 0, 0); }
  isHumanControlled(p) { return this.mode !== 'demo' && (p === this.user || (this.saveMoment && p === this.teams[0].players[0])); }
  keeperOf(team) { return this.teams[team].players[0]; }

  kickoff(team) {
    this.state = 'kickoff'; this.kickTeam = team; this.koT = 0;
    this.ball.reset(0, 0);
    for (const [ti, t] of this.teams.entries()) for (const p of t.players) {
      const tgt = t.ai.shapeTarget(p, false), ax = Math.min(-1.5, t.ai.ax(tgt.x) * 0.92 - 4);
      p.place(this.dir(ti) * ax, tgt.z * 0.9, ti === 0 ? Math.PI / 2 : -Math.PI / 2);
      if (p.isKeeper) p.place(-this.dir(ti) * (HL - 0.8), 0);
    }
    const kt = this.teams[team].players, d = this.dir(team);
    kt[9].place(-d * 0.35, 0.15, d > 0 ? Math.PI / 2 : -Math.PI / 2); kt[7].place(-d * 1.8, -6, d > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.kicker = kt[9];
    for (const p of this.players) p.setTarget = p.pos.clone();
    if (this.mode !== 'demo') this.user = team === 0 ? kt[9] : this.nearestTo(0, this.ball.pos);
    this.sfx.play('whistle');
  }

  // ======================= main loop =======================
  loop(now) {
    const realDt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const P = this.pad; P.update();
    if (P.any()) this.sfx.init();
    if (P.pressed('HOME')) { goHome(); return; }
    if (P.pressed('TOUCH')) this.overlay.toggle();
    if (this.overlay.visible) { this.overlay.update(); if (P.pressed('B') || P.pressed('START')) this.overlay.hide(); }
    else if (this.ui === 'menu' || this.ui === 'pause') this.menuInput();
    else if (this.ui === 'summary') { if (P.pressed('A') || P.pressed('START')) this.afterSummary(); }
    else if (P.pressed('START') && this.mode !== 'demo') this.openPause();
    const simulate = (this.ui === 'game' && !this.overlay.visible) || (this.ui === 'menu' && this.mode === 'demo');
    if (simulate) {
      // slow motion (bicycle kicks, power shots, keeper save moments)
      if (this.slowT > 0) { this.slowT -= realDt; this.timeScale += (this.slowK - this.timeScale) * Math.min(1, realDt * 12); }
      else this.timeScale += (1 - this.timeScale) * Math.min(1, realDt * 4);
      const dt = realDt * this.timeScale;
      this.tick(dt / 2, true); this.tick(dt / 2, false);
    }
    if (this.sfx.ready) { const bp = this.ball.pos, nearGoal = Math.abs(bp.x) > HL - 25 ? 0.25 : 0; this.sfx.crowd(this.ui === 'game' ? 0.28 + nearGoal + Math.min(0.6, this.stadium.cheer * 0.35) : 0.12); }
    this.stadium.update(realDt); this.ball.render(realDt * this.timeScale);
    if ((this.lodTick = (this.lodTick || 0) + 1) % 8 === 0) for (const p of this.players) p.h.setDetail(p.pos.distanceTo(this.camera.position) < 24);
    this.updateCamera(realDt); this.hud(realDt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(t => this.loop(t));
  }

  tick(dt, first) {
    if (!this.teams) return;
    const b = this.ball;
    if (this.mode !== 'demo' && first) this.controlUser(dt);
    if (first) { this.teams[0].ai.update(dt * 2); this.teams[1].ai.update(dt * 2); }
    for (const p of this.players) p.update(dt);
    this.separate();
    if (this.state === 'kickoff') this.kickoffLogic(dt);
    if (this.state === 'setpiece') this.setPieceLogic(dt);
    if (this.state === 'goal') this.goalLogic(dt);
    if (this.state === 'pk') this.shootoutLogic(dt);
    const ev = b.step(dt);
    for (const e of ev) { if (e === 'post') { this.sfx.play('post'); this.say(pick(LINES.post)); this.stadium.cheer = 0.6; } if (e === 'bounce' && b.speed > 4) this.sfx.play('bounce', { vol: Math.min(1, b.speed / 15) }); if (e === 'net') this.sfx.play('net'); }
    this.ballInteractions(dt);
    if (this.state === 'play') { this.rules(); this.clockTick(dt); }
    if (this.pendingAir) {
      const pa = this.pendingAir; pa.t -= dt;
      if (b.owner || b.held) this.pendingAir = null;
      else { const to = V(pa.spot.x - pa.p.pos.x, 0, pa.spot.z - pa.p.pos.z); if (to.length() > 0.5) { pa.p.moveDir.copy(to.normalize()); pa.p.moveSpeed = pa.p.maxSpeed; } if (pa.t <= 0) { this.pendingAir = null; pa.run(); } }
    }
    if (this.aftertouch > 0) { this.aftertouch -= dt; if (b.loose && this.aftertouchTeam === 0) { b.curve += this.pad.rx * dt * 9; b.dip += this.pad.ry * dt * 10; } }
    if (this.mode === 'fk' && this.state === 'play' && this.fk) { this.fk.t = (this.fk.t || 0) + dt; if (this.fk.t > 5 || b.held) this.nextFk(); }
    // possession stats
    const own = b.owner || b.held; if (own && this.state === 'play') this.teams[own.team].stats.poss += dt;
  }

  separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], c = ps[j]; if (a.down || c.down) continue;
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.7 - d) * 0.5; a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; c.pos.x += dx / d * push; c.pos.z += dz / d * push; }
    }
  }

  nearestTo(team, pt, exclude = null, noKeeper = true) {
    let best = null, bd = Infinity;
    for (const p of this.teams[team].players) { if (p === exclude || (noKeeper && p.isKeeper) || p.down) continue; const d = p.pos.distanceTo(pt); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ======================= ball contact =======================
  setOwner(p) {
    const b = this.ball, prev = b.owner || b.held || b.lastTouch;
    b.owner = p; b.held = null; b.lastTouch = p; b.curve = 0; b.dip = 0; b.wobble = 0; b.inNet = 0;
    p.touchCool = 0.05;
    this.teams[p.team].ai.receiver = null;
    if (p.team === 0 && this.mode !== 'demo' && !this.keeperMode && !this.saveMoment) { if (this.user !== p) this.user = p; }
    if (prev && prev.team !== p.team) this.sfx.play('kickSoft', { vol: 0.5 });
  }

  ballInteractions(dt) {
    const b = this.ball, ps = this.players;
    if (b.owner) {
      const o = b.owner;
      if (o.down) { b.owner = null; return; }
      const sp = Math.hypot(o.vel.x, o.vel.z), f = o.forward;
      const touch = 0.45 + Math.max(0, Math.sin(o.phase * 0.5)) * Math.min(0.6, sp * 0.075);
      const tgt = V(o.pos.x + f.x * touch, R, o.pos.z + f.z * touch);
      b.pos.lerp(tgt, Math.min(1, dt * 22)); b.vel.set(o.vel.x, 0, o.vel.z);
      return;
    }
    if (b.held) {
      const k = b.held;
      if (this.state === 'setpiece' && this.sp?.type === 'throw' && this.sp.taker === k) { const hp = k.h.worldOf('head'); b.pos.set(hp.x, hp.y + 0.28, hp.z); }
      else b.pos.copy(k.h.worldOf('chest').add(k.forward.multiplyScalar(0.3)));
      b.vel.set(0, 0, 0); return;
    }
    if (this.state === 'setpiece' && !(this.sp?.ready && this.sp.done)) return;
    // keepers: hands and body
    for (const k of [this.keeperOf(0), this.keeperOf(1)]) {
      if (b.kicker === k && b.kickT < 0.4) continue;
      if (!this.inOwnBox(k, b.pos, 2)) continue;
      const near = Math.hypot(b.pos.x - k.pos.x, b.pos.z - k.pos.z);
      if (b.speed < 3.5) { if (near < 1.0 && b.pos.y < 2.2 && !k.busy && this.state === 'play') { b.held = k; b.owner = null; b.vel.set(0, 0, 0); b.lastTouch = k; k.holdT = 0; this.sfx.play('save', { vol: 0.5 }); return; } continue; }
      const [lh, rh] = k.hands(), chest = k.h.worldOf('chest');
      const diving = k.act && (k.act.type === 'dive' || k.act.type === 'saveMid');
      const hit = [lh, rh, chest].some((q, i) => q.distanceTo(b.pos) < (i === 2 ? (diving ? 0.55 : 0.42) : (diving ? 0.45 : 0.34))) || k.bodyHit(b);
      if (hit) { this.keeperSave(k); return; }
    }
    // outfield: blocks, traps
    for (const p of ps) {
      if (p.isKeeper && this.inOwnBox(p, b.pos)) continue;
      if (b.kicker === p && b.kickT < 0.35) continue;
      if (p.touchCool > 0) continue;
      const hd = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (hd > 1.2) continue;
      const rel = b.vel.clone().sub(p.vel).length();
      if (b.speed > 11 && p.bodyHit(b) && !(p.act && ['header', 'volley', 'bicycle', 'chest'].includes(p.act.type))) { // block / deflection
        const n = V(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z).normalize();
        b.vel.set(-b.vel.x * 0.25 + n.x * 3 + gauss() * 2, Math.abs(b.vel.y) * 0.3 + 1.5, -b.vel.z * 0.25 + n.z * 3 + gauss() * 2);
        b.kicker = p; b.kickT = 0; b.lastTouch = p; b.curve = 0; this.sfx.play('tackle', { vol: 0.6 }); p.touchCool = 0.3;
        if (this.mode !== 'demo') this.say('Blocked!');
        continue;
      }
      if (p.busy) continue;
      if (hd < 0.85 && b.pos.y < 0.62 && rel < 17) { this.setOwner(p); return; }
      if (hd < 0.75 && b.pos.y >= 0.62 && b.pos.y < 1.55 && rel < 13) { this.setOwner(p); p.action('chest', { dur: 0.45 }); return; }
    }
  }

  inOwnBox(p, pt, margin = 0) { const d = this.dir(p.team), ax = d * pt.x; return ax < -(HL - 16.5) + margin && Math.abs(pt.z) < 20.16 + margin; }

  keeperSave(k) {
    const b = this.ball, sp = b.speed, d = this.dir(k.team);
    const chest = k.h.worldOf('chest'), nearChest = chest.distanceTo(b.pos) < 0.55;
    const skill = (k.info.keeping - 60) / 40;
    const catchIt = sp < 24 && b.pos.y < 2.35 && (nearChest || Math.random() < 0.3 + skill * 0.3) && Math.random() < 0.85;
    const shooterTeam = 1 - k.team;
    if (b.kicker && b.kicker.team === shooterTeam && b.kickT < 2) { this.teams[k.team].stats.saves++; }
    if (catchIt) { b.held = k; b.owner = null; b.vel.set(0, 0, 0); b.lastTouch = k; b.curve = 0; this.sfx.play('save'); k.holdT = 0; }
    else {
      b.kick(V(d * (Math.abs(b.vel.x) * 0.3 + 3), 2.5 + Math.random() * 3, (Math.sign(b.pos.z - k.pos.z) || 1) * (3 + Math.random() * 6)), { by: k });
      b.kickT = 0.2; this.sfx.play('save');
    }
    if (this.mode !== 'demo' && sp > 9) { this.say(pick(LINES.save)); this.stadium.cheer = 0.8; this.pad.rumble(0.6, 0.4, 150); }
    this.endSaveMoment(0.6);
  }

  // ======================= kicks =======================
  /** Choose foot: true = left foot (mirrored animation) when the target is on the player's left. */
  leftFoot(p, target) { const f = p.forward, left = V(f.z, 0, -f.x); return target.clone().sub(p.pos).dot(left) > 0.6; }

  groundPass(p, receiver, o = {}) {
    if (p.busy) return;
    const target = receiver.pos ? receiver.pos.clone().add(o.lead || V()) : receiver.clone();
    p.faceTarget = target.clone(); const mirror = this.leftFoot(p, target);
    p.action('pass', { mirror, onContact: () => {
      p.faceTarget = null;
      const b = this.ball; if (b.owner !== p && b.pos.distanceTo(p.footPoint()) > 1.3) return;
      const from = b.pos.clone(), dist = Math.hypot(target.x - from.x, target.z - from.z);
      const speed = clamp(7.5 + dist * 0.55 + (o.driven ? 6 : 0) + (o.power || 0) * 4, 8, o.driven ? 30 : 24);
      const dir = V(target.x - from.x, 0, target.z - from.z).normalize();
      const err = (1.15 - p.info.pass / 100) * 0.08 * (o.driven ? 1.5 : 1);
      dir.applyAxisAngle(V(0, 1, 0), gauss() * err);
      b.owner = null; b.kick(dir.multiplyScalar(speed).setY(o.driven ? 1.2 : 0.4), { by: p });
      this.teams[p.team].stats.passes++;
      if (receiver.pos) { this.teams[p.team].ai.receiver = receiver; if (p.team === 0 && this.mode !== 'demo' && !this.keeperMode) this.user = receiver; }
      this.sfx.play('kickSoft');
    } });
  }

  longPass(p, spot, o = {}) {
    if (p.busy) return;
    p.faceTarget = spot.clone(); const mirror = this.leftFoot(p, spot);
    p.action('lob', { mirror, onContact: () => {
      p.faceTarget = null;
      const b = this.ball; if (b.owner !== p && b.held !== p && b.pos.distanceTo(p.footPoint()) > 1.3) return;
      const from = b.pos.clone(), dist = Math.hypot(spot.x - from.x, spot.z - from.z);
      const speed = clamp(11 + dist * 0.33 + (o.power || 0) * 4, 13, 30);
      const err = (1.2 - p.info.pass / 100) * (o.cross ? 2.2 : 1.6);
      const tgt = V(spot.x + gauss() * err, R + (o.cross ? 1.4 : 0), spot.z + gauss() * err);
      const v = Ball.aim(from, tgt, speed, { curve: o.curve || 0 });
      b.owner = null; b.held = null; b.kick(v, { by: p, curve: o.curve || 0 });
      this.teams[p.team].stats.passes++;
      const recv = o.receiver || this.nearestTo(p.team, spot, p);
      if (recv) { this.teams[p.team].ai.receiver = recv; if (p.team === 0 && this.mode !== 'demo' && !this.keeperMode) this.user = recv; }
      this.sfx.play('kick');
    } });
  }

  /**
   * Shots. kind: shot | finesse | chip | power | volley | header | bicycle | penalty | freekick | panenka
   * aim: { z, y } goal-mouth target (optional; auto picks a corner), curve: user curve (right-stick), power 0..1
   */
  shoot(p, kind, o = {}) {
    if (p.busy && !o.force) return;
    const actionType = { shot: 'shot', finesse: 'finesse', chip: 'chip', power: 'power', volley: 'volley', header: 'header', bicycle: 'bicycle', penalty: 'shot', freekick: 'shot', panenka: 'chip', placed: 'finesse' }[kind];
    const goal = this.oppGoal(p.team), d = this.dir(p.team);
    const reachFoot = pl => { const b = this.ball; return b.owner === pl || b.pos.distanceTo(pl.foot('r')) < 0.85 || b.pos.distanceTo(pl.foot('l')) < 0.85 || (Math.hypot(b.pos.x - pl.pos.x, b.pos.z - pl.pos.z) < 1.0 && b.pos.y < 1.3); };
    const reachHead = pl => { const b = this.ball; return b.pos.distanceTo(pl.head()) < 0.62; };
    const air = ['volley', 'header', 'bicycle'].includes(kind);
    if (air && !o.timed && this.delayAir(p, kind, () => this.shoot(p, kind, { ...o, timed: true }))) return;
    p.faceTarget = goal.clone();
    if (kind === 'bicycle') { p.faceTarget = p.pos.clone().sub(goal.clone().sub(p.pos)); this.slow(0.35, 1.0); }
    p.action(actionType, {
      win0: air ? 0.2 : 0, win1: air ? 0.22 : 0,
      reach: air ? (kind === 'header' ? reachHead : reachFoot) : null,
      onUpdate: air ? (pl, pr, dt) => { const b = this.ball; const dx = b.pos.x - pl.pos.x, dz = b.pos.z - pl.pos.z; if (Math.hypot(dx, dz) < 2) { pl.pos.x += dx * Math.min(1, dt * 3); pl.pos.z += dz * Math.min(1, dt * 3); } } : null,
      onContact: (pl, whiff) => {
        pl.faceTarget = null;
        const b = this.ball;
        if (whiff) { if (pl.team === 0 && this.mode !== 'demo') this.say('Missed it!'); return; }
        if (!air && b.owner !== pl && b.pos.distanceTo(pl.footPoint()) > 1.3) return;
        const pw = clamp(o.power ?? 0.7, 0, 1);
        const keeper = this.keeperOf(1 - pl.team);
        let z = o.aim?.z, y = o.aim?.y;
        if (z == null) { const side = Math.abs(keeper.pos.z) > 0.4 ? -Math.sign(keeper.pos.z) : (Math.sign(pl.pos.z) || 1) * -1; z = side * (2.4 + Math.random() * 0.8); }
        const prof = {
          shot: { sp: 20 + pw * 13, y: 0.4 + pw * 1.5 + Math.max(0, pw - 0.86) * 7, err: 0.35 + pw * pw * 0.9, curve: 0 },
          finesse: { sp: 17 + pw * 8, y: 0.7 + pw * 1.2, err: 0.3 + pw * 0.4, curve: 4.2 },
          placed: { sp: 17 + pw * 7, y: 0.45 + pw * 0.9, err: 0.15 + pw * 0.3, curve: 1.5 },
          chip: { sp: 12.5 + pw * 4, y: 2.0, err: 0.35, curve: 0, chip: true },
          panenka: { sp: 11.5, y: 1.7, err: 0.15, curve: 0, chip: true },
          power: { sp: 32 + pw * 5, y: 0.45 + pw * 1.1, err: 0.45 + pw * 0.6, curve: 0, wobble: 1.4 },
          volley: { sp: 22 + pw * 9, y: 0.5 + pw * 1.0, err: 0.8 + pw * 0.6, curve: 0 },
          header: { sp: 13 + pw * 6, y: 0.35 + Math.random() * 0.8, err: 0.6, curve: 0 },
          bicycle: { sp: 24 + pw * 4, y: 0.6 + Math.random() * 1.2, err: 1.3, curve: 0 },
          penalty: { sp: 23 + pw * 7, y: 0.35 + pw * 1.3 + Math.max(0, pw - 0.9) * 8, err: 0.2 + pw * pw * 0.7, curve: 0 },
          freekick: { sp: 25 + pw * 8, y: 1.2 + pw * 1.0, err: 0.3 + pw * 0.5, curve: 0, wobble: 1.0 },
        }[kind];
        if (kind === 'finesse' || kind === 'placed') z = Math.sign(z || 1) * Math.min(3.35, Math.abs(z) + 0.4);
        if (y == null) y = prof.y;
        const moving = Math.hypot(pl.vel.x, pl.vel.z) > 6 ? 0.35 : 0;
        const errK = (prof.err + moving) * (1.35 - pl.info.shoot / 100) * (o.aimErr ?? 1);
        z += gauss() * errK; y = Math.max(0.15, y + gauss() * errK * 0.6);
        const target = V(goal.x + d * 0.3, y, clamp(z, -5, 5));
        // curve: finesse bends back toward the middle; the right stick adds the user's own bend (+ = to the right of travel)
        let curve = (o.curve || 0) * 5.5;
        if (prof.curve) curve += -Math.sign(target.z || 1) * d * prof.curve;   // finesse: bend back in toward the far post
        const from = b.pos.clone();
        let v;
        if (prof.chip) v = Ball.aim(from, target, prof.sp, {});
        else v = Ball.aim(from, target, prof.sp, { curve });
        b.owner = null; b.held = null;
        b.kick(v, { by: pl, curve, wobble: prof.wobble || 0, dip: kind === 'freekick' && pw > 0.6 ? 2.5 : 0 });
        const st = this.teams[pl.team].stats; st.shots++;
        const onT = Math.abs(target.z) < GOAL_W / 2 && target.y < GOAL_H; if (onT) st.onTarget++;
        this.sfx.play(kind === 'power' || pw > 0.85 ? 'kickHard' : 'kick'); this.pad.rumble(0.3, 0.8, 140);
        if (kind === 'power') { this.slow(0.4, 0.45); this.say('STUNNER!'); }
        for (const w of this.players) if (w.wall) { w.wall = false; w.action('header', { dur: 0.7 }); }
        if (pl.team === 0 && this.mode !== 'demo') { this.aftertouch = 0.65; this.aftertouchTeam = 0; }
        if (pl.team === 1) this.onCpuShot(pl);
        this.stadium.cheer = Math.max(this.stadium.cheer, 0.5);
      },
    });
  }

  /**
   * Time an aerial action so the contact frame meets the ball: predict the flight, find when the ball will be
   * at the right height within reach, and start the animation that much earlier. Returns true if it was queued.
   */
  /**
   * Predicted points on the ball's flight that player p can actually get to in time (run 60 % of top speed,
   * plus ~0.9 m of reach). Returns { t, spot, h } for the first one inside [lo, hi] height, or null.
   */
  interceptAir(p, lo = 0.2, hi = 2.6, maxT = 1.4) {
    const b = this.ball; if (!b.loose) return null;
    const path = Ball.simulate(b.pos, b.vel, { curve: b.curve, dip: b.dip }, maxT, 1 / 60);
    for (const st of path) {
      if (st.p.y < lo || st.p.y > hi) continue;
      const hd = Math.hypot(st.p.x - p.pos.x, st.p.z - p.pos.z);
      if (hd - 0.9 <= st.t * p.maxSpeed * 0.6) return { t: st.t, spot: st.p.clone(), h: st.p.y };
    }
    return null;
  }
  airWindow(p, kind) {
    const [lo, hi] = { header: [1.4, 2.6], bicycle: [0.85, 2.4], chest: [1.0, 1.55], volley: [0.2, 1.25] }[kind];
    return this.interceptAir(p, lo, hi);
  }
  delayAir(p, kind, run) {
    const type = { volley: 'volley', header: 'header', bicycle: 'bicycle', chest: 'chest' }[kind];
    const def = ACTIONS[type], contactT = def.dur * def.contact, w = this.airWindow(p, kind);
    if (!w) return false;
    const delay = w.t - contactT;
    if (delay > 0.04) { this.pendingAir = { t: delay, p, run, spot: w.spot }; return true; }
    return false;
  }

  /** Rainbow flick: the ball rolls up the back of the leg and over the player's head. */
  rainbow(p) {
    if (p.busy) return;
    p.action('rainbow', { onContact: () => { const b = this.ball; if (b.owner !== p) return; const f = p.forward; b.owner = null; b.kick(V(f.x * 5.2, 7.2, f.z * 5.2), { by: p }); b.kickT = 0; p.touchCool = 0.55; this.sfx.play('kickSoft'); if (p.team === 0) this.say('Rainbow flick!'); } });
  }
  /** Flick the ball up (and over a defender) to set up a volley. */
  flickUp(p) {
    if (p.busy) return;
    p.action('flick', { onContact: () => { const b = this.ball; if (b.owner !== p) return; const f = p.forward; b.owner = null; b.kick(V(f.x * 3.2, 5.6, f.z * 3.2), { by: p }); p.touchCool = 0.5; this.sfx.play('kickSoft'); } });
  }
  stepover(p, side) {
    if (p.busy) return;
    p.action('stepover', { mirror: side < 0, onUpdate: (pl, pr) => { if (pr > 0.35 && pr < 0.75) { const f = pl.forward, left = V(f.z, 0, -f.x).multiplyScalar(side * 7); pl.vel.lerp(left.add(f.clone().multiplyScalar(4)), 0.25); } } });
  }
  dragBack(p) { if (p.busy) return; p.facing += Math.PI; p.vel.multiplyScalar(-0.3); p.action('stepover', { dur: 0.35 }); }
  knockOn(p) {
    const b = this.ball; if (b.owner !== p || p.busy) return;
    const f = p.forward; b.owner = null; b.kick(V(f.x * (Math.hypot(p.vel.x, p.vel.z) + 7), 0.3, f.z * (Math.hypot(p.vel.x, p.vel.z) + 7)), { by: p }); b.kickT = 0.2; p.touchCool = 0.35; this.sfx.play('kickSoft');
  }

  tackle(p) {
    if (p.busy) return;
    const b = this.ball;
    p.faceTarget = b.pos.clone();
    p.action('tackle', { win0: 0.05, win1: 0.25, reach: pl => b.pos.distanceTo(pl.footPoint()) < 1.3 && b.pos.y < 0.8, onContact: (pl, whiff) => {
      pl.faceTarget = null; if (whiff) return;
      const carrier = b.owner;
      let prob = 0.5 + pl.info.defend / 220;
      if (carrier) { const toC = carrier.pos.clone().sub(pl.pos).normalize(), cf = carrier.forward, behind = toC.dot(cf) > 0.5; if (behind) { prob *= 0.55; if (Math.random() < 0.3) { this.foul(pl, carrier); return; } } }
      if (pl.team === 1) prob *= (this.teams[1].ai.diff.tackle + 0.2);
      if (!carrier || Math.random() < prob) {
        if (carrier) carrier.action('stumble');
        if (Math.random() < 0.5) this.setOwner(pl);
        else { b.owner = null; const f = pl.forward; b.kick(V(f.x * 5 + gauss() * 2, 0.5, f.z * 5 + gauss() * 2), { by: pl }); b.kickT = 0.15; }
        this.sfx.play('tackle'); if (pl.team === 0) this.pad.rumble(0.4, 0.6, 120);
      }
    } });
  }

  slide(p) {
    if (p.busy) return;
    const b = this.ball, dir = V(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z); if (dir.lengthSq() < 0.01) dir.copy(p.forward); dir.normalize();
    p.facing = Math.atan2(dir.x, dir.z); this.sfx.play('slide');
    const st = { hitBall: false, fouled: false };
    p.action('slide', { slideVel: dir.clone().multiplyScalar(9.5), onUpdate: (pl, pr) => {
      if (pr < 0.12 || pr > 0.78) return;
      const foot = pl.foot('l');
      if (!st.hitBall && b.pos.distanceTo(foot) < 0.95 && b.pos.y < 0.9) {
        st.hitBall = true; const carrier = b.owner; b.owner = null; b.held = null;
        b.kick(V(dir.x * 8 + gauss() * 3, 1, dir.z * 8 + gauss() * 3), { by: pl }); b.kickT = 0.1; this.sfx.play('tackle'); if (pl.team === 0) this.pad.rumble(0.6, 0.6, 160);
        if (carrier && Math.random() < 0.5) carrier.action('fallen');
      }
      if (!st.hitBall && !st.fouled) for (const o of this.teams[1 - pl.team].players) {
        if (o.down) continue;
        if (Math.hypot(o.pos.x - foot.x, o.pos.z - foot.z) < 0.85) { st.fouled = true; o.action('fallen'); this.foul(pl, o, true); break; }
      }
    } });
  }

  foul(fouler, victim, slide = false) {
    if (this.state !== 'play') return;
    this.teams[fouler.team].stats.fouls++;
    victim.action('fallen'); this.sfx.play('whistle');
    const behind = victim.forward.dot(V(fouler.pos.x - victim.pos.x, 0, fouler.pos.z - victim.pos.z).normalize()) < -0.3;
    if (Math.random() < (slide ? 0.45 : 0.2) + (behind ? 0.3 : 0)) { fouler.yellow++; this.say(`Yellow card — ${fouler.info.short}`, 2.5); }
    else this.say('Foul!');
    const spot = victim.pos.clone(); spot.y = 0;
    const pen = this.inOwnBox(fouler, spot);
    this.setPiece(pen ? 'penalty' : 'freekick', victim.team, spot);
  }

  // keeper actions
  keeperReact(k, err = 0.3) {
    const b = this.ball, path = Ball.simulate(b.pos, b.vel, { curve: b.curve, dip: b.dip }, 2.5, 1 / 60, p => this.dir(k.team) * p.x < this.dir(k.team) * k.pos.x);
    const end = path[path.length - 1]; if (!end) return;
    const c = end.p, tc = end.t;
    if (Math.abs(c.z) > GOAL_W / 2 + 0.8 || c.y > GOAL_H + 0.6) { k.faceTarget = b.pos.clone(); return; }
    const dz = c.z - k.pos.z + gauss() * err * 1.4;
    this.keeperDive(k, dz, c.y, tc);
  }
  keeperDive(k, dz, height, tc = 0.6) {
    if (Math.abs(dz) < 0.55 && height < 2.0) { k.action('saveMid', { high: height > 1.45 }); return; }
    const d = this.dir(k.team), leftZ = -d, side = Math.sign(dz) * leftZ;
    k.facing = d > 0 ? Math.PI / 2 : -Math.PI / 2;
    const reach = clamp(Math.abs(dz) - 0.7, 0.4, 2.6), speed = clamp(reach / 0.34, 2, 8.6);   // hands add ~0.7 m of reach
    k.action('dive', { side, height: clamp(height / 2.3, 0, 1), diveVel: V(0, 0, Math.sign(dz) * speed) });
    this.sfx.play('jump');
  }
  keeperSmother(k) { const b = this.ball; const dz = b.pos.z - k.pos.z; this.keeperDive(k, Math.abs(dz) < 0.6 ? Math.sign(dz || 1) * 0.7 : dz, 0.1); }
  keeperDistribute(k) {
    const b = this.ball, d = this.dir(k.team);
    const mates = this.teams[k.team].players.filter(p => p !== k && !p.down);
    const open = mates.filter(m => d * m.pos.x < -10).sort((a, c) => a.pos.distanceTo(k.pos) - c.pos.distanceTo(k.pos))[0];
    if (open && Math.random() < 0.6) {
      k.action('keeperThrow', { onContact: () => { if (b.held !== k) return; b.held = null; const from = k.h.worldOf('rHand'); b.pos.copy(from); const v = Ball.aim(from, V(open.pos.x, R, open.pos.z), 13); b.kick(v, { by: k }); this.teams[k.team].ai.receiver = open; if (k.team === 0 && this.mode !== 'demo') this.user = open; } });
    } else {
      const spot = V(d * (5 + Math.random() * 15), 0, (Math.random() - 0.5) * 40);
      k.action('punt', { onContact: () => { if (b.held !== k) return; b.held = null; b.pos.copy(k.footPoint()).setY(0.6); const v = Ball.aim(b.pos, V(spot.x, R, spot.z), 27); b.kick(v, { by: k }); this.sfx.play('kickHard'); const r = this.nearestTo(k.team, spot); if (r) { this.teams[k.team].ai.receiver = r; if (k.team === 0 && this.mode !== 'demo') this.user = r; } } });
    }
  }
  /** Head or volley the ball clear, up the pitch. */
  clearBall(p) {
    const b = this.ball, high = b.pos.y > 1.3, d = this.dir(p.team);
    p.action(high ? 'header' : 'volley', { win0: 0.2, win1: 0.25, reach: pl => b.pos.distanceTo(high ? pl.head() : pl.foot('r')) < 0.85, onUpdate: (pl, pr, dt) => { const dx = b.pos.x - pl.pos.x, dz = b.pos.z - pl.pos.z; if (Math.hypot(dx, dz) < 2) { pl.pos.x += dx * Math.min(1, dt * 3); pl.pos.z += dz * Math.min(1, dt * 3); } }, onContact: (pl, whiff) => {
      if (whiff) return; const tgt = V(pl.pos.x + d * (22 + Math.random() * 14), R, clamp(pl.pos.z + (Math.random() - 0.5) * 30, -30, 30));
      b.owner = null; b.kick(Ball.aim(b.pos, tgt, 19), { by: pl }); this.sfx.play('kick');
    } });
  }
  aiShoot(p, aimErr) { this.shoot(p, Math.random() < 0.35 ? 'finesse' : 'shot', { power: 0.55 + Math.random() * 0.4, aimErr }); }

  // ======================= user control =======================
  stickWorld(x, y) {
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = V(-f.z, 0, f.x);
    return r.multiplyScalar(x).add(f.multiplyScalar(y));
  }

  controlUser(dt) {
    const P = this.pad, b = this.ball;
    if (this.state === 'kickoff') { this.controlKickoff(); return; }
    if (this.state === 'setpiece') { this.controlSetPiece(dt); return; }
    if (this.state === 'pk') { this.controlPenalty(dt); return; }
    if (this.state !== 'play') return;
    // tactics, camera, radar
    if (P.pressed('UP')) { this.teams[0].ai.mentality = Math.min(2, this.teams[0].ai.mentality + 1); this.say(['', 'Attacking', 'All-out attack'][this.teams[0].ai.mentality] || 'Balanced'); }
    if (P.pressed('DOWN')) { this.teams[0].ai.mentality = Math.max(-2, this.teams[0].ai.mentality - 1); this.say(['Park the bus', 'Defensive', 'Balanced'][this.teams[0].ai.mentality + 2]); }
    if (P.pressed('LEFT') || P.pressed('RIGHT')) { const i = CAMS.indexOf(this.settings.camera); this.settings.camera = CAMS[(i + (P.pressed('RIGHT') ? 1 : CAMS.length - 1)) % CAMS.length]; this.say(`Camera: ${this.settings.camera}`); }
    if (P.pressed('SELECT')) this.settings.radar = !this.settings.radar;
    if (P.pressed('R3')) { this.keeperMode = !this.keeperMode; if (this.keeperMode) this.user = this.keeperOf(0); else this.user = this.nearestTo(0, b.pos); this.say(this.keeperMode ? 'You are the goalkeeper' : 'Keeper control off'); }
    this.teams[0].ai.pressAll = P.down('R1') && !(b.owner && b.owner.team === 0);
    let u = this.user;
    if (!u) { this.user = u = this.nearestTo(0, b.pos); if (!u) return; }
    const stick = this.stickWorld(P.lx, P.ly), mag = Math.min(1, stick.length());
    const attacking = (b.owner && b.owner.team === 0) || (b.held && b.held.team === 0);
    // switching (defending)
    if (!attacking && !u.isKeeper) {
      if (P.pressed('L1') && !P.down('Y')) { const n = this.nearestTo(0, b.pos, u); if (n) this.user = u = n; }
      const rsm = Math.hypot(P.rx, P.ry);
      if (rsm > 0.75 && !this.rsLatch) { this.rsLatch = true; const dirv = this.stickWorld(P.rx, -P.ry).normalize(); let best = null, bs = -1; for (const p of this.teams[0].players) { if (p === u || p.isKeeper) continue; const v = p.pos.clone().sub(u.pos); const s = v.normalize().dot(dirv) - p.pos.distanceTo(u.pos) / 80; if (s > bs) { bs = s; best = p; } } if (best && bs > 0.3) this.user = u = best; }
      if (rsm < 0.4) this.rsLatch = false;
      // auto-switch when the ball is far away from the controlled player
      if (u.pos.distanceTo(b.pos) > 26 && !P.down('X') && mag < 0.2) { const n = this.nearestTo(0, b.pos); if (n) this.user = u = n; }
    }
    if (u.isKeeper && (this.keeperMode || this.saveMoment)) { this.controlKeeper(dt, stick, mag); return; }
    // movement
    u.moveDir.copy(mag > 0.12 ? stick.clone().normalize() : V()); u.moveSpeed = mag * u.maxSpeed * (b.owner === u ? 0.93 : 1);
    u.sprint = P.down('R2') && mag > 0.3; u.jockey = P.down('L2') && b.owner !== u;
    u.faceTarget = null;
    if (P.down('L2') && b.owner === u) { u.moveSpeed *= 0.45; const r = this.nearestTo(1, u.pos, null, false); if (r) u.faceTarget = u.pos.clone().multiplyScalar(2).sub(r.pos); }
    if (u.jockey && b.owner) u.faceTarget = b.owner.pos.clone();
    // defending buttons
    if (!attacking) {
      if (P.down('X') && b.owner && b.owner.team === 1) { const goalSide = b.owner.pos.clone().add(V(-HL - b.owner.pos.x, 0, -b.owner.pos.z).normalize().multiplyScalar(1.2)); u.moveDir.copy(goalSide.sub(u.pos).setY(0).normalize()); u.moveSpeed = u.maxSpeed; u.faceTarget = b.owner.pos.clone(); }
      if (P.down('A') && b.owner && b.owner.team === 1) this.teams[0].ai.pressAll = true;
      if (P.pressed('L3')) { this.keeperRush = 1.5; this.say('Keeper rushes out!'); }
      const air = this.airBall(u);
      if (air && b.loose) { this.airButtons(u, air); return; }
      if (P.pressed('Y')) { this.tackle(u); return; }
      if (P.pressed('B')) { this.slide(u); return; }
      if (b.loose && b.pos.distanceTo(u.pos) < 3 && ['X', 'A'].some(k => P.pressed(k))) { this.queued = { btn: P.pressed('X') ? 'X' : 'A', t: 0.9 }; }
    }
    // queued action after collecting a loose ball
    if (this.queued) { this.queued.t -= dt; if (this.queued.t <= 0) this.queued = null; else if (b.owner === u) { const q = this.queued; this.queued = null; this.execute(u, q.btn, 0.45, {}); return; } else if (b.loose) { u.moveDir.copy(V(b.pos.x - u.pos.x, 0, b.pos.z - u.pos.z).normalize()); u.moveSpeed = u.maxSpeed; } }
    if (!attacking && !b.loose) return;
    // ball in the air near you
    const air = this.airBall(u);
    if (air && b.loose) { this.airButtons(u, air); return; }
    if (b.owner !== u) return;
    // with the ball
    if (P.pressed('L3')) { this.knockOn(u); return; }
    // right stick skill moves (only when not charging a shot)
    const rsm = Math.hypot(P.rx, P.ry);
    if (!this.charge && rsm > 0.8 && !this.rsLatch) {
      this.rsLatch = true; const sx = P.rx, sy = -P.ry;
      if (sy > 0.6) this.flickUp(u); else if (sy < -0.6) this.dragBack(u); else this.stepover(u, sx > 0 ? -1 : 1);
    }
    if (rsm < 0.4) this.rsLatch = false;
    // instant Y combos
    if (P.pressed('Y') && P.down('L2')) { this.rainbow(u); return; }
    if (P.pressed('Y') && P.down('R2')) { this.flickUp(u); return; }
    for (const btn of ['X', 'A', 'B', 'Y']) if (P.pressed(btn)) this.charge = { btn, L1: P.down('L1'), R1: P.down('R1') };
    if (this.charge) {
      const c = this.charge, held = P.heldFor(c.btn), power = clamp(held / 0.85, 0.12, 1);
      this.power = power;
      if (P.released(c.btn) || held > 1.05) { this.charge = null; this.power = 0; this.execute(u, c.btn, power, c); }
    }
  }

  execute(u, btn, power, mods) {
    const P = this.pad, stick = this.stickWorld(P.lx, P.ly), aimDir = stick.length() > 0.25 ? stick.clone().normalize() : u.forward;
    const goalAim = () => { // goal-mouth target from the left stick (lateral) when it points at goal
      const s = this.stickWorld(P.lx, P.ly); if (s.length() < 0.25) return null;
      return { z: clamp(s.z * 3.6, -3.4, 3.4) };
    };
    const curve = P.rx * (u.team === 0 ? 1 : 1);
    if (btn === 'X') {
      if (mods.L1) { const r = this.pickReceiver(u, aimDir, true); if (r) { const spot = r.pos.clone().add(V(this.dir(0) * 8, 0, 0)); this.groundPass(u, spot, { power }); this.teams[0].ai.receiver = r; this.user = r; return; } }
      const r = this.pickReceiver(u, aimDir);
      if (r) this.groundPass(u, r, { lead: r.vel.clone().multiplyScalar(0.6), power, driven: mods.R1 });
      else this.groundPass(u, u.pos.clone().add(aimDir.clone().multiplyScalar(12 + power * 10)), { power });
    } else if (btn === 'A') {
      const r = this.pickReceiver(u, aimDir, true);
      const spot = r ? r.pos.clone().add(r.vel.clone().multiplyScalar(0.9)).add(mods.L1 ? V(this.dir(0) * 8, 0, 0) : V()) : u.pos.clone().add(aimDir.clone().multiplyScalar(20 + power * 25));
      const cross = this.dir(0) * u.pos.x > 30 && Math.abs(u.pos.z) > 14;
      this.longPass(u, spot, { power, receiver: r, cross, curve: curve * 2.5 });
    } else if (btn === 'B') {
      this.shoot(u, 'shot', { power, aim: goalAim(), curve });
    } else if (btn === 'Y') {
      const kind = mods.L1 ? 'chip' : mods.R1 ? 'power' : 'finesse';
      this.shoot(u, kind, { power, aim: goalAim(), curve });
    }
  }

  pickReceiver(u, dir, long = false) {
    let best = null, bs = -Infinity;
    for (const m of this.teams[u.team].players) {
      if (m === u || m.down) continue;
      const v = m.pos.clone().sub(u.pos).setY(0), d = v.length(); if (d < 3 || d > (long ? 60 : 38)) continue;
      const cos = v.normalize().dot(dir); if (cos < 0.45) continue;
      const free = Math.min(8, ...this.teams[1 - u.team].players.map(o => o.pos.distanceTo(m.pos)));
      const s = cos * 3 - d / (long ? 60 : 30) + free * 0.08 - (m.isKeeper ? 1.5 : 0);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  /** Ball in the air that this player can meet within ~1.1 s: predicted height, time and spot. */
  airBall(u) {
    const b = this.ball; if (!b.loose || (b.pos.y < 0.35 && b.vel.y <= 0.5)) return null;
    if (Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z) > 16) return null;
    const hit = this.interceptAir(u, 0.25, 2.6, 1.1);
    return hit ? { h: hit.h, t: hit.t, spot: hit.spot } : null;
  }
  airButtons(u, air) {
    const P = this.pad, h = air.h;
    const nearGoal = u.pos.distanceTo(this.oppGoal(u.team)) < 30;
    if (P.pressed('Y')) {
      if (h < 1.0) this.shoot(u, 'volley', { power: 0.7, curve: P.rx });
      else if (h < 1.45) { if (!this.delayAir(u, 'chest', () => this.airChest(u))) this.airChest(u); }
      else if (nearGoal) this.shoot(u, 'header', { power: 0.8 });
      else this.headerPass(u);
    } else if (P.pressed('B')) this.shoot(u, h < 1.35 ? 'volley' : 'header', { power: 0.85, curve: P.rx });
    else if (P.pressed('A')) { if (this.airWindow(u, 'bicycle')) { this.shoot(u, 'bicycle', { power: 0.9 }); this.say('BICYCLE KICK!'); } else this.headerPass(u, true); }
    else if (P.pressed('X')) this.headerPass(u);
  }
  airChest(u) { u.action('chest', { win0: 0.15, win1: 0.4, reach: pl => this.ball.pos.distanceTo(pl.h.worldOf('chest')) < 0.75, onContact: (pl, whiff) => { if (!whiff) { this.setOwner(pl); this.sfx.play('kickSoft'); } } }); }
  headerPass(u, long = false, timed = false) {
    const kind = (this.airBall(u)?.h ?? this.ball.pos.y) > 1.3 ? 'header' : 'volley';
    if (!timed && this.delayAir(u, kind, () => this.headerPass(u, long, true))) return;
    const r = this.pickReceiver(u, u.forward, long) || this.nearestTo(u.team, u.pos, u);
    u.action(this.ball.pos.y > 1.3 ? 'header' : 'volley', { win0: 0.2, win1: 0.25, reach: pl => this.ball.pos.distanceTo(this.ball.pos.y > 1.3 ? pl.head() : pl.foot('r')) < 0.8, onContact: (pl, whiff) => {
      if (whiff || !r) return; const b = this.ball; const v = Ball.aim(b.pos, V(r.pos.x, R, r.pos.z), clamp(8 + b.pos.distanceTo(r.pos) * 0.45, 9, 22)); b.kick(v, { by: pl }); this.teams[0].ai.receiver = r; this.user = r; this.sfx.play('kickSoft');
    } });
  }

  controlKeeper(dt, stick, mag) {
    const P = this.pad, k = this.keeperOf(0), b = this.ball;
    this.user = k;
    if (!k.busy) { k.moveDir.copy(mag > 0.12 ? stick.clone().normalize() : V()); k.moveSpeed = mag * 6.5; k.sprint = P.down('R2'); k.keeperReady = true; k.faceTarget = b.pos.clone(); }
    if (b.held === k) {
      if (P.pressed('X')) { const r = this.pickReceiver(k, stick.length() > 0.2 ? stick.clone().normalize() : V(1, 0, 0), true); if (r) { k.action('keeperThrow', { onContact: () => { if (b.held !== k) return; b.held = null; const from = k.h.worldOf('rHand'); b.pos.copy(from); b.kick(Ball.aim(from, V(r.pos.x, R, r.pos.z), 14), { by: k }); this.keeperMode = false; this.user = r; } }); } }
      if (P.pressed('A')) { this.keeperMode = false; this.keeperDistribute(k); }
      if (P.pressed('B')) { b.held = null; this.setOwner(k); }
      return;
    }
    if (k.busy) return;
    const est = this.incoming(k);
    // X = dive to the keeper's right (+z, screen right in the keeper cam), Y = left (−z). Picking the right side
    // dives at where the ball is actually going (assisted); a wrong guess dives the full width the other way.
    const diveTo = side => { const right = side > 0; const ok = est && Math.abs(est.z) < GOAL_W / 2 + 0.8 && (est.z - k.pos.z > 0) === right; this.keeperDive(k, ok ? est.z - k.pos.z : (right ? 2.6 : -2.6), est ? est.y : 0.8); };
    if (P.pressed('X')) diveTo(1);
    else if (P.pressed('Y')) diveTo(-1);
    else if (P.pressed('B')) k.action('saveMid', { high: est ? est.y > 1.45 : false });
    else if (P.pressed('A') || P.pressed('L3')) { this.teams[0].ai.moveTo(k, b.pos, 1.2); k.sprint = true; if (k.pos.distanceTo(b.pos) < 2.2) this.keeperSmother(k); }
  }
  /** Where a shot will cross the keeper's line (if it is coming at goal). */
  incoming(k) {
    const b = this.ball; if (!b.loose || b.speed < 5) return null;
    const path = Ball.simulate(b.pos, b.vel, { curve: b.curve, dip: b.dip }, 2.5, 1 / 60, p => this.dir(k.team) * p.x < this.dir(k.team) * k.pos.x);
    const e = path[path.length - 1]; return e ? { z: e.p.z, y: e.p.y, t: e.t } : null;
  }

  onCpuShot(shooter) {
    if (this.mode === 'demo' || this.settings.keeper !== 'manual') return;
    const k = this.keeperOf(0); const est = this.incoming(k);
    if (!est || Math.abs(est.z) > GOAL_W / 2 + 0.6 || est.y > GOAL_H + 0.4) return;
    this.saveMoment = { t: 0, prevUser: this.user, auto: false };
    this.user = k; this.slow(0.32, 3);
    k.diveDone = true; // stop the AI from diving for you
  }
  endSaveMoment(delay = 0) {
    if (!this.saveMoment || this.saveMoment.ending) return; this.saveMoment.ending = true;
    setTimeout(() => { if (!this.saveMoment) return; this.user = this.keeperMode ? this.keeperOf(0) : (this.saveMoment.prevUser || this.user); this.saveMoment = null; this.slowT = 0; }, delay * 1000);
  }
  slow(k, t) { this.slowK = k; this.slowT = t; }

  // ======================= rules =======================
  rules() {
    const b = this.ball, p = b.pos;
    if (this.mode === 'fk') { if (p.x > HL + R && Math.abs(p.z) < GOAL_W / 2 && p.y < GOAL_H) { this.goal(0); return; } if (Math.abs(p.z) > HW + R || Math.abs(p.x) > HL + R) { this.say(pick(LINES.miss)); this.nextFk(); } return; }
    // goal: the whole ball over the line between the posts and under the bar
    for (const s of [-1, 1]) {
      if (s * p.x > HL + R && Math.abs(p.z) < GOAL_W / 2 && p.y < GOAL_H) { this.goal(s > 0 ? 0 : 1); return; }
    }
    if (this.saveMoment) { this.saveMoment.t += 1 / 60; const k = this.keeperOf(0); if (!b.loose || b.kickT > 2.2 || b.vel.x > 0) this.endSaveMoment(0.4); else if (!this.saveMoment.auto && b.pos.x < -HL + 9 && !k.busy) { this.saveMoment.auto = true; this.keeperReact(k, 1.2); } }
    if (Math.abs(p.z) > HW + R) { const last = b.lastTouch; const team = last ? 1 - last.team : 0; this.setPiece('throw', team, V(clamp(p.x, -HL + 1, HL - 1), 0, Math.sign(p.z) * HW)); return; }
    if (Math.abs(p.x) > HL + R) {
      const s = Math.sign(p.x), defending = s > 0 ? 1 : 0, last = b.lastTouch;
      if (!last || last.team === defending) { this.setPiece('corner', 1 - defending, V(s * (HL - 0.6), 0, Math.sign(p.z || 1) * (HW - 0.6))); this.teams[1 - defending].stats.corners++; }
      else this.setPiece('goalkick', defending, V(s * (HL - 5.5), 0, Math.sign(p.z || 1) * 6));
      if (b.kicker && b.kickT < 3 && Math.abs(p.z) < 12 && this.mode !== 'demo') this.say(pick(LINES.miss));
    }
  }

  clockTick(dt) {
    if (this.mode !== 'match') return;
    this.clock += dt * (45 * 60) / (this.settings.half * 60);
    if (this.clock >= 45 * 60) { this.clock = 45 * 60; this.endHalf(); }
  }

  goal(team) {
    const b = this.ball, scorer = b.lastTouch, own = scorer && scorer.team !== team;
    this.teams[team].score++; this.state = 'goal'; this.goalT = 0; this.goalTeam = team;
    this.scorer = own ? null : scorer;
    this.sfx.play('net'); this.sfx.play('whistle', { vol: 0.6 });
    this.stadium.cheer = team === 0 ? 2.2 : 1.2; this.pad.rumble(1, 1, 500);
    const min = Math.floor(this.clock / 60) + (this.half === 2 ? 45 : 0) + 1;
    this.say(own ? `Own goal! ${min}'` : `${pick(LINES.goal)} ${scorer ? scorer.info.short : ''} ${this.mode === 'match' ? min + "'" : ''}`, 3.2);
    if (this.scorer) this.scorer.action(Math.random() < 0.5 ? 'kneeSlide' : 'celebrate');
    this.endSaveMoment(0); this.slow(0.5, 0.8);
    if (this.mode === 'fk') this.fk.goals++;
  }
  goalLogic(dt) {
    this.goalT += dt;
    for (const p of this.players) { p.sprint = false; p.moveDir.set(0, 0, 0); p.moveSpeed = 0; }
    if (this.scorer) { for (const p of this.teams[this.goalTeam].players) if (p !== this.scorer && !p.isKeeper) { p.moveDir.copy(this.scorer.pos.clone().sub(p.pos).setY(0).normalize()); p.moveSpeed = p.pos.distanceTo(this.scorer.pos) > 2 ? 6 : 0; } }
    if (this.goalT > 3.6) { if (this.mode === 'fk') this.nextFk(); else this.kickoff(1 - this.goalTeam); }
  }

  endHalf() {
    this.sfx.play(this.half === 1 ? 'whistle2' : 'whistle3'); this.endSaveMoment(0);
    this.ui = 'summary';
    const [h, a] = this.teams, poss = h.stats.poss + a.stats.poss || 1;
    $('sumTitle').textContent = this.half === 1 ? 'Half-time' : (h.score > a.score ? 'You win!' : h.score < a.score ? 'Full-time — defeat' : 'Full-time — draw');
    const row = (l, x, y) => `<tr><td class="l">${x}</td><td class="m">${l}</td><td class="r">${y}</td></tr>`;
    $('sumBody').innerHTML = `<table>${row('', `<b>${h.club.name}</b>`, `<b>${a.club.name}</b>`)}${row('Score', h.score, a.score)}${row('Possession', Math.round(h.stats.poss / poss * 100) + '%', Math.round(a.stats.poss / poss * 100) + '%')}${row('Shots', h.stats.shots, a.stats.shots)}${row('On target', h.stats.onTarget, a.stats.onTarget)}${row('Passes', h.stats.passes, a.stats.passes)}${row('Saves', h.stats.saves, a.stats.saves)}${row('Corners', h.stats.corners, a.stats.corners)}${row('Fouls', h.stats.fouls, a.stats.fouls)}</table>`;
    $('sumHint').innerHTML = `${this.pad.glyph('A')} ${this.half === 1 ? 'Second half' : 'Back to menu'}`;
    $('summary').classList.remove('hidden');
    if (this.half === 2) this.sfx.play(h.score >= a.score ? 'win' : 'lose');
  }
  afterSummary() {
    $('summary').classList.add('hidden'); this.ui = 'game';
    if (this.mode === 'match' && this.half === 1) { this.half = 2; this.clock = 0; this.kickoff(1); return; }
    this.toMenu();
  }

  // ======================= kick-off & set pieces =======================
  kickoffLogic(dt) {
    this.koT += dt;
    if (this.kickTeam === 1 || this.mode === 'demo' || !this.user) { if (this.koT > 1.2) this.takeKickoff(); }
  }
  takeKickoff() {
    const k = this.kicker; this.setOwner(k); this.state = 'play';
    const mate = this.teams[k.team].players[6];
    this.groundPass(k, mate, {});
  }
  controlKickoff() {
    const P = this.pad; if (this.kickTeam !== 0) return;
    this.user = this.kicker;
    if (P.pressed('X') || P.pressed('A') || P.pressed('B')) this.takeKickoff();
  }

  fadeCut(fn) { $('cut').classList.add('on'); setTimeout(() => { fn(); $('cut').classList.remove('on'); }, 200); }

  setPiece(type, team, spot) {
    if (this.state === 'setpiece' || this.state === 'goal') return;
    this.state = 'setpiece'; this.endSaveMoment(0);
    this.sp = { type, team, spot: spot.clone(), t: 0, ready: false, aim: V(), curve: 0, done: false };
    if (type !== 'freekick' && type !== 'penalty') this.sfx.play('whistle', { vol: 0.5 });
    const label = { throw: 'Throw-in', corner: 'Corner kick', goalkick: 'Goal kick', freekick: 'Free kick', penalty: 'PENALTY!' }[type];
    if (this.mode !== 'demo') this.say(`${label} — ${this.teams[team].club.name}`, 2);
    this.ball.owner = null; this.ball.held = null; this.ball.vel.set(0, 0, 0);
    setTimeout(() => this.fadeCut(() => this.arrangeSetPiece()), 650);
  }

  arrangeSetPiece() {
    const sp = this.sp; if (!sp || this.state !== 'setpiece') return;
    const b = this.ball, T = this.teams[sp.team], D = this.teams[1 - sp.team], d = this.dir(sp.team);
    const goal = this.oppGoal(sp.team);
    for (const [ti, t] of this.teams.entries()) for (const p of t.players) { p.act = null; p.jumpY = 0; const tg = t.ai.shapeTarget(p, ti === sp.team); p.place(tg.x, tg.z); p.setTarget = tg; }
    for (const k of [this.keeperOf(0), this.keeperOf(1)]) k.place(-this.dir(k.team) * (HL - 0.6), 0, this.dir(k.team) > 0 ? Math.PI / 2 : -Math.PI / 2);
    let taker;
    const sx = sp.spot.x, sz = sp.spot.z;
    if (sp.type === 'goalkick') taker = this.keeperOf(sp.team);
    else if (sp.type === 'penalty') taker = [...T.players].filter(p => !p.isKeeper).sort((a, c) => c.info.shoot - a.info.shoot)[0];
    else taker = this.nearestTo(sp.team, sp.spot);
    sp.taker = taker;
    if (sp.type === 'throw') { b.reset(sx, sz); taker.place(sx, sz + Math.sign(sz) * 0.3, Math.atan2(0, -Math.sign(sz)) ); taker.facing = Math.sign(sz) > 0 ? Math.PI : 0; b.held = taker; }
    else {
      const ballPos = sp.type === 'penalty' ? V(d * (HL - 11), 0, 0) : sp.spot.clone();
      b.reset(ballPos.x, ballPos.z);
      const toGoal = (sp.type === 'goalkick' ? V(0, 0, 0).sub(ballPos) : goal.clone().sub(ballPos)).setY(0).normalize();
      if (sp.type === 'corner') toGoal.copy(V(d * (HL - 11), 0, 0).sub(ballPos).setY(0).normalize());
      taker.place(ballPos.x - toGoal.x * 1.6, ballPos.z - toGoal.z * 1.6, Math.atan2(toGoal.x, toGoal.z));
      sp.dir = toGoal;
    }
    if (sp.type === 'corner') {
      const box = T.players.filter(p => p !== taker && !p.isKeeper && p.info.role !== 'DEF').concat(T.players.filter(p => p.info.pos === 'CB'));
      box.slice(0, 6).forEach((p, i) => p.place(d * (HL - 7 - (i % 3) * 3.5), 0, -6 + (i % 4) * 4 + Math.random()));
      const mk = D.players.filter(p => !p.isKeeper);
      mk.slice(0, 7).forEach((p, i) => { const tgt = box[i % box.length]; p.place(tgt.pos.x + d * 0.8, tgt.pos.z + 0.6); });
      sp.aim.set(d * (HL - 9), 0, 0);
    }
    if (sp.type === 'penalty') {
      for (const p of [...T.players, ...D.players]) if (p !== taker && !p.isKeeper) { const i = p.info.slot + p.team * 11; p.place(d * (HL - 22 - (i % 2) * 2), 0, -18 + (i % 10) * 4); }
      sp.aim.set(0, 1, 0);
    }
    if (sp.type === 'freekick') {
      const dist = sp.spot.distanceTo(goal);
      sp.direct = dist < 32 && Math.abs(sp.spot.z) < 24 && d * sp.spot.x > 10;
      if (sp.direct) {
        const n = dist < 20 ? 5 : dist < 26 ? 4 : 3, wallC = sp.spot.clone().add(sp.dir.clone().multiplyScalar(9.15)), lat = V(-sp.dir.z, 0, sp.dir.x);
        D.players.filter(p => !p.isKeeper).sort((a, c) => a.pos.distanceTo(wallC) - c.pos.distanceTo(wallC)).slice(0, n).forEach((p, i) => { p.place(wallC.x + lat.x * (i - (n - 1) / 2) * 0.62, wallC.z + lat.z * (i - (n - 1) / 2) * 0.62, Math.atan2(-sp.dir.x, -sp.dir.z)); p.wall = true; });
        const k = this.keeperOf(1 - sp.team); k.place(-this.dir(k.team) * (HL - 0.6), -Math.sign(sp.spot.z || 1) * 1.2);
        sp.aim.set(0, 1.4, -Math.sign(sp.spot.z || 1) * 2.6);
      }
    }
    for (const p of this.players) p.setTarget = p.pos.clone();
    if (sp.team === 0 && this.mode !== 'demo') this.user = taker;
    sp.ready = true; sp.t = 0;
    if (sp.type === 'freekick' || sp.type === 'penalty') this.sfx.play('whistle', { vol: 0.5 });
  }

  setPieceLogic(dt) {
    const sp = this.sp; if (!sp || !sp.ready) return;
    sp.t += dt;
    const taker = sp.taker, b = this.ball;
    if (sp.type === 'throw' && b.held === taker) { const hp = taker.h.worldOf('head'); b.pos.set(hp.x, hp.y + 0.28, hp.z); }
    if (!taker.busy && sp.type !== 'throw') { taker.moveDir.set(0, 0, 0); taker.moveSpeed = 0; }
    for (const p of this.players) if (p !== taker && !p.busy) { p.moveDir.set(0, 0, 0); p.moveSpeed = 0; p.faceTarget = b.pos.clone(); }
    if ((sp.team === 1 || this.mode === 'demo') && sp.t > 1.4 && !sp.done) this.cpuSetPiece();
  }

  cpuSetPiece() {
    const sp = this.sp, t = sp.taker, b = this.ball, d = this.dir(sp.team);
    sp.done = true; const go = () => { this.state = 'play'; if (sp.type === 'freekick' || sp.type === 'penalty') this.teams[1 - sp.team].players.forEach(p => { p.wall = false; }); };
    if (sp.type === 'throw') { const r = this.nearestTo(sp.team, b.pos, t); this.throwIn(t, r ? r.pos.clone() : V(b.pos.x + d * 10, 0, b.pos.z * 0.6), 11); }
    else if (sp.type === 'corner') { this.setOwner(t); this.longPass(t, V(d * (HL - 6 - Math.random() * 7), 0, (Math.random() - 0.5) * 10), { cross: true, curve: (Math.random() - 0.5) * 2 }); }
    else if (sp.type === 'goalkick') { this.setOwner(t); this.longPass(t, V(d * (5 + Math.random() * 15), 0, (Math.random() - 0.5) * 40), { power: 0.8 }); }
    else if (sp.type === 'penalty') { this.setOwner(t); const z = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.6); this.shoot(t, 'penalty', { power: 0.6 + Math.random() * 0.3, aim: { z, y: 0.3 + Math.random() * 1.6 }, force: true }); }
    else if (sp.type === 'freekick') {
      this.setOwner(t);
      if (sp.direct) this.shoot(t, 'freekick', { power: 0.55 + Math.random() * 0.3, aim: { z: sp.aim.z + gauss() * 0.6, y: 1.5 + Math.random() * 0.6 }, curve: -Math.sign(sp.spot.z || 1) * (0.6 + Math.random() * 0.4) * this.dir(sp.team), force: true });
      else { const r = this.pickReceiver(t, sp.dir, true) || this.nearestTo(sp.team, b.pos, t); this.groundPass(t, r, {}); }
    }
    setTimeout(go, 50);
  }

  throwIn(t, spot, speed) {
    t.action('throwIn', { onContact: () => { const b = this.ball; if (b.held !== t) return; b.held = null; const hp = t.h.worldOf('head'); b.pos.set(hp.x, hp.y + 0.3, clamp(hp.z, -(HW - 0.2), HW - 0.2)); const v = Ball.aim(b.pos, V(spot.x, R + 0.3, spot.z), speed); b.kick(v, { by: t }); const r = this.nearestTo(t.team, spot, t); if (r) { this.teams[t.team].ai.receiver = r; if (t.team === 0 && this.mode !== 'demo') this.user = r; } this.state = 'play'; } });
  }

  controlSetPiece(dt) {
    const P = this.pad, sp = this.sp; if (!sp || !sp.ready || sp.team !== 0 || sp.done) return;
    const t = sp.taker, b = this.ball, stick = this.stickWorld(P.lx, P.ly), mag = stick.length();
    if (sp.type === 'throw') {
      const dir = mag > 0.25 ? stick.clone().normalize() : V(this.dir(0), 0, -Math.sign(b.pos.z) * 0.6).normalize();
      t.facing = Math.atan2(dir.x, dir.z); this.aimMarker.visible = true; this.aimMarker.position.set(b.pos.x + dir.x * 12, 0.04, b.pos.z + dir.z * 12);
      if (P.pressed('X')) { const r = this.pickReceiver(t, dir) || this.nearestTo(0, b.pos, t); sp.done = true; this.throwIn(t, r.pos.clone(), 10); }
      if (P.pressed('A')) { sp.done = true; this.throwIn(t, b.pos.clone().add(dir.multiplyScalar(22)), 15); }
      return;
    }
    if (sp.type === 'corner' || sp.type === 'goalkick' || (sp.type === 'freekick' && !sp.direct)) {
      if (!sp.aim.lengthSq()) sp.aim.copy(b.pos).add(sp.dir.clone().multiplyScalar(20));
      sp.aim.add(stick.clone().multiplyScalar(dt * 22)); sp.aim.x = clamp(sp.aim.x, -HL, HL); sp.aim.z = clamp(sp.aim.z, -HW, HW);
      this.aimMarker.visible = true; this.aimMarker.position.set(sp.aim.x, 0.04, sp.aim.z);
      sp.curve = P.rx;
      const go = () => { sp.done = true; this.aimMarker.visible = false; this.state = 'play'; };
      if (P.pressed('A') || P.pressed('B') || P.pressed('Y')) { this.setOwner(t); this.longPass(t, sp.aim.clone(), { cross: sp.type === 'corner', curve: sp.curve * 3, power: 0.8 }); go(); }
      if (P.pressed('X')) { this.setOwner(t); const r = this.pickReceiver(t, sp.aim.clone().sub(b.pos).normalize()) || this.nearestTo(0, b.pos, t); this.groundPass(t, r, {}); go(); }
      return;
    }
    // direct free kick or penalty: aim with the left stick on the goal mouth, curve with the right stick
    const goal = this.oppGoal(0);
    sp.aim.z = clamp(sp.aim.z - P.lx * dt * 7 * (sp.dir.x > 0 ? -1 : 1), -4.2, 4.2);
    sp.aim.y = clamp(sp.aim.y + P.ly * dt * 4.5, 0.15, 3.0);
    sp.curve = clamp(sp.curve + P.rx * dt * 2.5, -1.5, 1.5);
    if (Math.hypot(P.rx, P.ry) < 0.2 && sp.type === 'penalty') sp.curve *= 0.9;
    this.reticle.visible = true; this.reticle.position.set(goal.x - 0.05, sp.aim.y, sp.aim.z); this.reticle.rotation.y = Math.PI / 2;
    for (const btn of ['B', 'Y']) if (P.pressed(btn)) sp.charge = { btn, L1: P.down('L1') };
    if (sp.charge) {
      const held = P.heldFor(sp.charge.btn); this.power = clamp(held / 0.9, 0.1, 1);
      if (P.released(sp.charge.btn) || held > 1.1) {
        const c = sp.charge; sp.charge = null; sp.done = true; this.reticle.visible = false; const pw = this.power; this.power = 0;
        this.setOwner(t);
        const kind = sp.type === 'penalty' ? (c.btn === 'B' ? 'penalty' : c.L1 ? 'panenka' : 'placed') : (c.btn === 'B' ? 'freekick' : 'finesse');
        this.shoot(t, kind, { power: pw, aim: kind === 'panenka' ? { z: 0, y: 1.6 } : { z: sp.aim.z, y: sp.aim.y }, curve: sp.curve, force: true });
        setTimeout(() => { if (this.state === 'setpiece') this.state = 'play'; this.teams[1].players.forEach(p => { p.wall = false; }); }, 400);
      }
    }
    if (P.pressed('X') && sp.type === 'freekick') { sp.done = true; this.reticle.visible = false; this.setOwner(t); const r = this.nearestTo(0, b.pos, t); this.groundPass(t, r, {}); this.state = 'play'; }
    if (P.pressed('A') && sp.type === 'freekick') { sp.done = true; this.reticle.visible = false; this.setOwner(t); this.longPass(t, V(HL - 8, 0, (Math.random() - 0.5) * 10), { cross: true, curve: sp.curve * 3 }); this.state = 'play'; }
  }

  // ======================= penalty shootout & free-kick challenge =======================
  startShootout() {
    this.pk = { round: 0, turn: 0, res: [[], []], t: 0, phase: 'setup' };
    this.state = 'pk'; $('pkboard').classList.remove('hidden'); this.pkSetup();
  }
  pkSetup() {
    const pk = this.pk, team = pk.turn, d = this.dir(team), b = this.ball;
    for (const [ti, t] of this.teams.entries()) for (const p of t.players) { if (p.isKeeper) continue; const i = p.info.slot; p.place(-2 + (i % 5) * 1.2 + ti * 0.6, -3 + Math.floor(i / 5) * 1.5 + ti * 4, 0); p.act = null; }
    const order = [...this.teams[team].players].filter(p => !p.isKeeper).sort((a, c) => c.info.shoot - a.info.shoot);
    const taker = order[pk.res[team].length % order.length];
    b.reset(d * (HL - 11), 0);
    taker.place(d * (HL - 12.8), 0, d > 0 ? Math.PI / 2 : -Math.PI / 2);
    const k = this.keeperOf(1 - team); k.place(-this.dir(k.team) * (HL - 0.4), 0, this.dir(k.team) > 0 ? Math.PI / 2 : -Math.PI / 2); k.diveDone = false; k.keeperReady = true;
    const ok = this.keeperOf(team); ok.place(-d * 30, 4, 0);
    pk.taker = taker; pk.phase = 'aim'; pk.t = 0; pk.aim = V(0, 1, 0); pk.kicked = false; pk.guess = null; pk.guessUsed = false;
    for (const p of this.players) p.setTarget = p.pos.clone();
    this.sp = { type: 'penalty', team, taker, aim: pk.aim, dir: V(d, 0, 0), curve: 0, ready: true, t: 0, done: false };
    this.user = team === 0 ? taker : k;
    this.saveMoment = null; this.sfx.play('whistle', { vol: 0.5 });
    this.renderPk();
  }
  controlPenalty(dt) {
    const pk = this.pk, P = this.pad;
    if (pk.phase !== 'aim') return;
    if (pk.turn === 0) { this.state = 'setpiece'; this.controlSetPiece(dt); this.state = 'pk'; if (this.sp.done && !pk.kicked) { pk.kicked = true; pk.phase = 'flight'; pk.t = 0; } }
    else {
      // you are the keeper: X dive right, Y dive left, B stay middle — press during the run-up to commit
      const k = this.keeperOf(0);
      if (!pk.kicked) { if (P.pressed('X')) pk.guess = 'right'; else if (P.pressed('Y')) pk.guess = 'left'; else if (P.pressed('B')) pk.guess = 'mid'; if (pk.guess) this.say(`You'll go ${pk.guess === 'mid' ? 'down the middle' : pk.guess}`, 1); return; }
      if (!k.busy && !pk.guessUsed) {
        const est = this.incoming(k), diveTo = right => { const ok = est && (est.z - k.pos.z > 0) === right; this.keeperDive(k, ok ? est.z - k.pos.z : (right ? 2.6 : -2.6), est ? est.y : 0.9); };
        if (P.pressed('X')) diveTo(true); else if (P.pressed('Y')) diveTo(false); else if (P.pressed('B')) k.action('saveMid', { high: est ? est.y > 1.45 : false });
      }
    }
  }
  shootoutLogic(dt) {
    const pk = this.pk; pk.t += dt; const b = this.ball;
    if (pk.phase === 'aim' && pk.turn === 1 && pk.t > 1.6 && !pk.kicked) {
      pk.kicked = true; const t = pk.taker; this.setOwner(t);
      const z = (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 1.8);
      this.shoot(t, 'penalty', { power: 0.55 + Math.random() * 0.35, aim: { z, y: 0.3 + Math.random() * 1.5 }, force: true, aimErr: 0.8 });
      pk.phase = 'flight'; pk.t = 0; this.slow(0.45, 1.2);
    }
    if (pk.phase === 'aim' && pk.turn === 0 && pk.kicked) { pk.phase = 'flight'; pk.t = 0; }
    if (pk.phase === 'flight') {
      // your committed guess fires the moment the ball is struck
      if (pk.turn === 1 && pk.guess && !pk.guessUsed && b.loose && b.kickT > 0.02) {
        pk.guessUsed = true; const k0 = this.keeperOf(0), est = this.incoming(k0);
        if (pk.guess === 'mid') k0.action('saveMid', { high: est ? est.y > 1.45 : false });
        else { const right = pk.guess === 'right', ok = est && (est.z - k0.pos.z > 0) === right; this.keeperDive(k0, ok ? est.z - k0.pos.z : (right ? 2.6 : -2.6), est ? est.y : 0.9); }
      }
      // CPU keeper guesses as the ball is struck
      const k = this.keeperOf(1 - pk.turn);
      if (pk.turn === 0 && b.loose && b.kickT > 0.05 && !k.diveDone) {
        k.diveDone = true; const est = this.incoming(k), r = Math.random();
        const dz = r < 0.25 && est ? est.z - k.pos.z : r < 0.4 ? 0 : (Math.random() < 0.5 ? -1 : 1) * 2.4;   // 25 % reads it, 15 % stays, else guesses
        this.keeperDive(k, dz, est ? est.y : 0.8); this.slow(0.45, 1.0);
      }
      const s = this.dir(pk.turn), scored = s * b.pos.x > HL + R && Math.abs(b.pos.z) < GOAL_W / 2 && b.pos.y < GOAL_H;
      if (scored || pk.t > 3.2 || (b.speed < 1 && pk.t > 1) || (b.held && pk.t > 0.5)) {
        pk.res[pk.turn].push(scored ? 1 : 0); pk.phase = 'result'; pk.t = 0;
        if (scored) { this.sfx.play('net'); this.stadium.cheer = pk.turn === 0 ? 1.6 : 0.8; this.say(pk.turn === 0 ? 'Scored!' : 'They score.'); } else { this.say(pk.turn === 0 ? 'Saved!' : 'You saved it!'); this.stadium.cheer = pk.turn === 1 ? 1.6 : 0.5; }
        this.renderPk();
      }
    }
    if (pk.phase === 'result' && pk.t > 2.2) {
      const [a, c] = pk.res, na = a.length, nc = c.length, sa = a.reduce((x, y) => x + y, 0), sc = c.reduce((x, y) => x + y, 0);
      const regLeft = n => Math.max(0, 5 - n);
      let over = false;
      if (na <= 5 || nc <= 5) { if (sa + regLeft(na) < sc || sc + regLeft(nc) < sa) over = true; }
      if (na >= 5 && nc >= 5 && na === nc && sa !== sc) over = true;
      if (over) { this.ui = 'summary'; $('sumTitle').textContent = sa > sc ? 'You win the shootout!' : 'Shootout lost'; $('sumBody').innerHTML = `${this.teams[0].club.name} ${sa} – ${sc} ${this.teams[1].club.name}`; $('sumHint').innerHTML = `${this.pad.glyph('A')} Back to menu`; $('summary').classList.remove('hidden'); this.sfx.play(sa > sc ? 'win' : 'lose'); return; }
      pk.turn = 1 - pk.turn; this.pkSetup();
    }
  }
  renderPk() {
    const pk = this.pk, row = (t) => { const r = pk.res[t]; let s = ''; for (let i = 0; i < Math.max(5, r.length + (pk.turn === t ? 1 : 0)); i++) s += `<i class="${r[i] === 1 ? 'g' : r[i] === 0 ? 'm' : ''}"></i>`; return s; };
    $('pkboard').innerHTML = `${this.teams[0].club.id} ${row(0)}<br>${this.teams[1].club.id} ${row(1)}`;
  }
  startFkChallenge() { this.fk = { n: 0, goals: 0 }; this.nextFk(); }
  nextFk() {
    const fk = this.fk; if (fk.n >= 10) { this.ui = 'summary'; $('sumTitle').textContent = 'Free-kick challenge'; $('sumBody').innerHTML = `You scored <b>${fk.goals}</b> of 10`; $('sumHint').innerHTML = `${this.pad.glyph('A')} Back to menu`; $('summary').classList.remove('hidden'); return; }
    fk.n++; fk.t = 0; this.state = 'play'; this.ball.reset();
    const x = HL - 18 - Math.random() * 10, z = (Math.random() - 0.5) * 30;
    this.say(`Free kick ${fk.n} / 10`, 1.6);
    this.setPiece('freekick', 0, V(x, 0, z));
  }

  // ======================= camera & HUD =======================
  updateCamera(dt) {
    const b = this.ball.pos; let pos, look, fov = 36;
    const sp = this.sp, u = this.user;
    let mode = this.settings.camera;
    if (this.ui === 'menu') mode = 'menu';
    else if (this.saveMoment || (this.keeperMode && u?.isKeeper) || (this.state === 'pk' && this.pk?.turn === 1)) mode = 'keeper';
    else if (this.state === 'goal' && this.scorer && this.goalT > 0.6) mode = 'celebrate';
    else if ((this.state === 'setpiece' && sp?.ready && ['freekick', 'penalty', 'corner'].includes(sp.type) && (sp.direct || sp.type !== 'freekick')) || (this.state === 'pk' && this.pk?.turn === 0 && this.pk.phase === 'aim')) mode = 'setpiece';
    if (mode === 'broadcast') { look = V(clamp(b.x * 0.94, -44, 44), 0, b.z * 0.4); pos = V(look.x, 16.5, 35 + b.z * 0.18); fov = 40; }
    else if (mode === 'tele') { look = V(clamp(b.x * 0.95, -46, 46), 0, b.z * 0.55); pos = V(look.x, 11.5, b.z * 0.4 + 26); fov = 44; }
    else if (mode === 'behind') { pos = V(b.x - 14, 7, b.z * 0.65); look = V(b.x + 10, 0, b.z * 0.85); fov = 52; }
    else if (mode === 'keeper') { pos = V(-HL - 8.5, 3.4, b.z * 0.15); look = V(-HL + 14, 0.9, b.z * 0.3); fov = 56; }
    else if (mode === 'celebrate') { const s = this.scorer.pos; pos = V(s.x - this.dir(this.scorer.team) * 4, 2.2, s.z + 5); look = V(s.x, 1.2, s.z); fov = 45; }
    else if (mode === 'setpiece') { const dir = sp?.dir || V(1, 0, 0); pos = b.clone().sub(dir.clone().multiplyScalar(sp?.type === 'corner' ? 7 : 7.5)).add(V(0, 2.6, 0)); look = b.clone().add(dir.clone().multiplyScalar(16)).setY(1); fov = 52; }
    else { const t = performance.now() / 9000; pos = V(Math.sin(t) * 60, 24 + Math.sin(t * 1.7) * 6, Math.cos(t) * 55); look = V(b.x * 0.5, 0, b.z * 0.5); fov = 42; }
    if (this.debugCam) { pos = this.debugCam.pos(); look = this.debugCam.look(); fov = this.debugCam.fov || 40; }
    const k = this.debugCam ? 1 : 1 - Math.exp(-dt * (mode === 'keeper' || mode === 'setpiece' ? 10 : 3.2));
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k * 1.3);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * k; this.camera.updateProjectionMatrix(); }
  }

  say(text, t = 1.8) { const el = $('toast'); el.textContent = text; el.classList.add('show'); this.toastT = t; }

  hud(dt) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) $('toast').classList.remove('show');
    const show = this.mode !== 'demo' && this.ui !== 'menu';
    $('hud').classList.toggle('hidden', !show);
    const u = this.user, b = this.ball;
    this.marker.visible = show && !!u;
    if (u) { this.marker.position.set(u.pos.x, 0, u.pos.z); this.markerArrow.position.y = 2.25 * (u.info.height || 1) + u.jumpY + Math.sin(performance.now() / 160) * 0.06; const c = u.isKeeper ? 0xffd166 : 0x33e0ff; this.markerRing.material.color.setHex(c); this.markerArrow.material.color.setHex(c); }
    if (!show) { this.reticle.visible = false; this.aimMarker.visible = false; return; }
    if (this.state !== 'setpiece' && this.state !== 'pk') { this.reticle.visible = false; this.aimMarker.visible = false; }
    if (this.teams) { $('sHome').textContent = this.teams[0].score; $('sAway').textContent = this.teams[1].score; }
    const min = Math.floor(this.clock / 60) + (this.half === 2 ? 45 : 0);
    $('clock').textContent = this.mode === 'match' ? `${min}'` : this.mode === 'shootout' ? 'PENS' : `FK ${this.fk?.n || 0}/10 · ⚽ ${this.fk?.goals || 0}`;
    if (u) { $('pnum').textContent = u.info.number; $('pname').textContent = u.info.short + (this.keeperMode && u.isKeeper ? ' (keeper control)' : ''); $('stam').firstElementChild.style.width = `${u.stamina * 100}%`; }
    $('power').classList.toggle('hidden', !(this.power > 0));
    if (this.power > 0) { $('power').querySelector('i').style.width = `${this.power * 100}%`; $('powerLabel').textContent = this.charge ? { X: 'Pass', A: 'Long ball', B: 'Shot', Y: this.charge.L1 ? 'Chip' : this.charge.R1 ? 'Power shot' : 'Finesse' }[this.charge.btn] : this.sp?.charge ? 'Strike' : ''; }
    $('saveui').classList.toggle('hidden', !(this.saveMoment || (this.keeperMode && u?.isKeeper) || (this.state === 'pk' && this.pk?.turn === 1)));
    const m = this.teams?.[0]?.ai?.mentality || 0; $('tactic').textContent = m ? (m > 0 ? '▲ Attacking' : '▼ Defensive') + (Math.abs(m) > 1 ? '+' : '') : '';
    // prompts
    const P = this.pad, g = b => P.glyph(b), pr = [];
    if (this.state === 'kickoff' && this.kickTeam === 0) pr.push(`${g('X')} Kick off`);
    else if (this.state === 'setpiece' && this.sp?.team === 0 && this.sp.ready && !this.sp.done) {
      const t = this.sp.type;
      if (t === 'throw') pr.push(`${g('X')} Short throw`, `${g('A')} Long throw`, 'Aim: left stick');
      else if (t === 'penalty' || (t === 'freekick' && this.sp.direct)) pr.push(`${g('B')} Power`, `${g('Y')} ${t === 'penalty' ? 'Placed' : 'Curl'}`, ...(t === 'penalty' ? [`${g('L1')}+${g('Y')} Panenka`] : [`${g('X')} Pass`, `${g('A')} Cross`]), 'Aim: left stick · Curve: right stick');
      else pr.push(`${g('A')} Cross / long`, `${g('X')} Short`, 'Aim: left stick · Curve: right stick');
    } else if (this.state === 'pk' && this.pk?.turn === 0 && this.pk.phase === 'aim') pr.push(`${g('B')} Power`, `${g('Y')} Placed`, `${g('L1')}+${g('Y')} Panenka`, 'Aim: left stick');
    else if (this.state === 'play' && u) {
      const air = this.airBall(u);
      if (air && b.loose && !u.isKeeper) pr.push(air.h < 1.0 ? `${g('Y')} Volley` : air.h < 1.45 ? `${g('Y')} Chest` : `${g('Y')} Header`, `${g('B')} Shoot`, `${g('A')} Bicycle kick`);
      else if (b.owner === u) { /* no clutter while dribbling */ }
      else if (b.held === u) pr.push(`${g('X')} Throw`, `${g('A')} Punt`, `${g('B')} Drop to feet`);
      else if (b.owner && b.owner.team === 1 && !u.isKeeper) { if (u.pos.distanceTo(b.pos) < 5) pr.push(`${g('Y')} Tackle`, `${g('B')} Slide`, `${g('L1')} Switch`); }
    }
    $('prompt').innerHTML = pr.map(x => `<span class="p">${x}</span>`).join('');
    $('aimui').classList.add('hidden');
    // radar
    const cv = $('radar'); cv.style.display = this.settings.radar ? '' : 'none';
    if (this.settings.radar && this.teams) {
      const c = cv.getContext('2d'), W = cv.width, H = cv.height, sx = x => (x + HL) / (2 * HL) * (W - 10) + 5, sz = z => (z + HW) / (2 * HW) * (H - 10) + 5;
      c.clearRect(0, 0, W, H); c.strokeStyle = '#ffffff66'; c.lineWidth = 1; c.strokeRect(5, 5, W - 10, H - 10); c.beginPath(); c.moveTo(W / 2, 5); c.lineTo(W / 2, H - 5); c.stroke();
      c.strokeRect(5, sz(-20.16), sx(-HL + 16.5) - 5, sz(20.16) - sz(-20.16)); c.strokeRect(sx(HL - 16.5), sz(-20.16), W - 5 - sx(HL - 16.5), sz(20.16) - sz(-20.16));
      for (const [ti, t] of this.teams.entries()) for (const p of t.players) { c.fillStyle = t.club.color; c.beginPath(); c.arc(sx(p.pos.x), sz(p.pos.z), p === u ? 4.5 : 3, 0, 7); c.fill(); if (p === u) { c.strokeStyle = '#fff'; c.stroke(); } }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(sx(b.pos.x), sz(b.pos.z), 2.5, 0, 7); c.fill();
    }
  }

  // ======================= menus =======================
  buildMenu() {
    this.menuItems = [
      { label: 'Your team', get: () => CLUBS[this.settings.home].name, change: d => { this.settings.home = (this.settings.home + d + CLUBS.length) % CLUBS.length; } },
      { label: 'Opponent', get: () => CLUBS[this.settings.away].name, change: d => { this.settings.away = (this.settings.away + d + CLUBS.length) % CLUBS.length; } },
      { label: 'Half length', get: () => `${this.settings.half} min`, change: d => { this.settings.half = clamp(this.settings.half + d, 1, 10); } },
      { label: 'Difficulty', get: () => ({ amateur: 'Amateur', pro: 'Professional', legend: 'Legendary' })[this.settings.difficulty], change: d => { const a = ['amateur', 'pro', 'legend']; this.settings.difficulty = a[(a.indexOf(this.settings.difficulty) + d + 3) % 3]; } },
      { label: 'Keeper saves', get: () => this.settings.keeper === 'manual' ? 'You (X / Y / B)' : 'Automatic', change: () => { this.settings.keeper = this.settings.keeper === 'manual' ? 'auto' : 'manual'; } },
      { label: 'Camera', get: () => this.settings.camera, change: d => { const i = CAMS.indexOf(this.settings.camera); this.settings.camera = CAMS[(i + d + 3) % 3]; } },
      { label: '▶ Kick-off', act: () => this.start('match') },
      { label: '▶ Penalty shootout', act: () => this.start('shootout') },
      { label: '▶ Free-kick challenge', act: () => this.start('fk') },
      { label: 'Controls', act: () => this.overlay.show() },
      { label: 'Back to Arcade', act: () => goHome() },
    ];
    this.renderMenu();
  }
  renderMenu() {
    const items = this.ui === 'pause' ? this.pauseItems : this.menuItems;
    $('menuList').innerHTML = items.map((it, i) => `<div class="${i === this.menuSel ? 'sel' : ''}"><span>${it.label}</span>${it.get ? `<b>◀ ${it.get()} ▶</b>` : ''}</div>`).join('');
    $('menuHint').innerHTML = `${this.pad.glyph('A')} select · ◀ ▶ change · ${this.pad.glyph('TOUCH')} controls · ${this.pad.glyph('HOME')} Arcade`;
  }
  menuInput() {
    const P = this.pad, items = this.ui === 'pause' ? this.pauseItems : this.menuItems;
    let dy = 0, dx = 0;
    if (P.pressed('UP')) dy = -1; if (P.pressed('DOWN')) dy = 1; if (P.pressed('LEFT')) dx = -1; if (P.pressed('RIGHT')) dx = 1;
    const ly = Math.abs(P.ly) > Math.abs(P.ry) ? P.ly : -P.ry, lx = Math.abs(P.lx) > Math.abs(P.rx) ? P.lx : P.rx;
    const now = performance.now();
    if (!this.navT || now > this.navT) { if (ly > 0.6) { dy = -1; this.navT = now + 220; } else if (ly < -0.6) { dy = 1; this.navT = now + 220; } else if (lx > 0.6) { dx = 1; this.navT = now + 220; } else if (lx < -0.6) { dx = -1; this.navT = now + 220; } }
    if (Math.abs(ly) < 0.3 && Math.abs(lx) < 0.3) this.navT = 0;
    if (dy) { this.menuSel = (this.menuSel + dy + items.length) % items.length; this.sfx.play('ui'); this.renderMenu(); }
    const it = items[this.menuSel];
    if (dx && it.change) { it.change(dx); this.sfx.play('ui'); this.renderMenu(); this.saveSettings(); }
    if (P.pressed('A')) { this.sfx.init(); if (it.act) { this.sfx.play('select'); it.act(); } else if (it.change) { it.change(1); this.renderMenu(); this.saveSettings(); } }
    if (this.ui === 'pause' && (P.pressed('START') || P.pressed('B'))) this.closePause();
    if (this.ui === 'menu' && P.pressed('START') && it.act) it.act();
  }
  saveSettings() { try { localStorage.setItem('golazo-settings', JSON.stringify(this.settings)); } catch { /* ignore */ } }
  start(mode) {
    this.sfx.init(); this.saveSettings();
    $('menu').classList.add('hidden'); $('pkboard').classList.toggle('hidden', mode !== 'shootout'); this.ui = 'game';
    this.fadeCut(() => { this.newMatch(mode); this.sfx.crowd(0.35); });
  }
  toMenu() {
    this.ui = 'menu'; this.menuSel = 0; $('menu').classList.remove('hidden'); $('pkboard').classList.add('hidden');
    $('menu').querySelector('h1').innerHTML = 'GOLAZO <span>FOOTBALL</span>'; this.renderMenu();
    this.newMatch('demo');
  }
  openPause() {
    this.ui = 'pause'; this.menuSel = 0;
    this.pauseItems = [
      { label: 'Resume', act: () => this.closePause() },
      { label: 'Keeper saves', get: () => this.settings.keeper === 'manual' ? 'You (X / Y / B)' : 'Automatic', change: () => { this.settings.keeper = this.settings.keeper === 'manual' ? 'auto' : 'manual'; } },
      { label: 'Camera', get: () => this.settings.camera, change: d => { const i = CAMS.indexOf(this.settings.camera); this.settings.camera = CAMS[(i + d + 3) % 3]; } },
      { label: 'Controls', act: () => this.overlay.show() },
      { label: 'Restart', act: () => { this.closePause(); this.start(this.mode); } },
      { label: 'Main menu', act: () => { this.closePause(); this.toMenu(); } },
      { label: 'Back to Arcade', act: () => goHome() },
    ];
    $('menu').classList.remove('hidden'); $('menu').querySelector('h1').innerHTML = 'PAUSED'; this.renderMenu();
  }
  closePause() { this.ui = 'game'; $('menu').classList.add('hidden'); }
}

window.game = new Game();
