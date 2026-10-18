// Game modes: Team Deathmatch, Free-for-All and the Firing Range (targets, recoil wall, timed obstacle course).
import * as THREE from 'three';
import { Humanoid, Poses, layer } from '../common/humanoid.js';
import { makeShapes, fillShapes, STANCE } from './actors.js';
import { BOT_NAMES, MODES, PROFILE_KEY } from './data.js';
import { clamp, rnd, fmtTime, pick, damp, smooth } from './util.js';

const blankStats = () => ({ kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, headshots: 0, bestStreak: 0 });

class BaseMode {
  constructor(match) { this.match = match; this.respawnAt = new Map(); this.isRange = false; this.names = [...BOT_NAMES].sort(() => Math.random() - 0.5); this.endAt = 0; }
  init() {}
  start() {}
  dispose() {}
  playerDelay() { return 3.0; }
  botDelay() { return 3.5 + Math.random() * 2.5; }
  onKill(victim, attacker, info) {
    const m = this.match;
    if (!victim.isActor) return;
    this.respawnAt.set(victim, m.time + (victim.isPlayer ? this.playerDelay() : this.botDelay()));
  }
  update(dt) {
    const m = this.match;
    for (const [a, t] of this.respawnAt) {
      if (a.isPlayer) a.respawnIn = Math.max(0, t - m.time);
      if (m.time >= t && !this.finished) { this.respawnAt.delete(a); m.respawn(a); }
    }
  }
  rows() { return []; }
}

// ---------------------------------------------------------------------------------------------------------------
// Team Deathmatch: you + 5 allies (blue) vs 6 robots (red). First to 40 kills or 8 minutes.
// ---------------------------------------------------------------------------------------------------------------
export class TDM extends BaseMode {
  constructor(m) {
    super(m); this.def = MODES.tdm; this.score = [0, 0]; this.timeLeft = this.def.time; this.finished = false; this.result = null;
    this.cmd = { id: -9, name: 'Enemy', team: 1, stats: blankStats(), body: { x: 25, y: 0, z: 0 }, alive: true, heading: 0, isCommander: true, invulnT: 0 };
    this.enemyCalls = 0; this.callAt = [4, 9, 14, 20, 27]; this.callKinds = ['uav', 'airstrike', 'sentry', 'drone', 'airstrike'];
  }
  init() {
    const m = this.match;
    let i = 0;
    for (let k = 0; k < this.def.allies; k++) m.addBot({ team: 0, ally: true, name: this.names[i++ % this.names.length], index: i });
    for (let k = 0; k < this.def.enemies; k++) m.addBot({ team: 1, ally: false, name: this.names[i++ % this.names.length], index: i });
    m.respawn(m.player, true);
    for (const b of m.bots) m.respawn(b, true);
  }
  onKill(victim, attacker, info) {
    super.onKill(victim, attacker, info);
    if (attacker && attacker !== victim && attacker.team !== victim.team && (victim.isActor)) {
      this.score[attacker.team]++;
      if (this.score[0] >= this.def.limit || this.score[1] >= this.def.limit) this.finish();
    }
  }
  update(dt) {
    if (this.finished) { return; }
    const m = this.match;
    this.timeLeft -= dt;
    super.update(dt);
    // enemy commander follows the centre of mass of the red team, calls streaks as their kills accumulate
    let sx = 0, sz = 0, n = 0; for (const b of m.bots) if (b.alive && b.team === 1) { sx += b.body.x; sz += b.body.z; n++; }
    if (n) { this.cmd.body.x = sx / n; this.cmd.body.z = sz / n; }
    if (this.enemyCalls < this.callAt.length && this.score[1] >= this.callAt[this.enemyCalls] && m.state === 'playing') {
      const kind = this.callKinds[this.enemyCalls++]; this.callEnemy(kind);
    }
    if (this.timeLeft <= 0) this.finish();
  }
  callEnemy(kind) {
    const m = this.match, p = m.player, cmd = this.cmd;
    if (kind === 'airstrike') {
      const ang = Math.random() * 6.28, x = p.body.x + rnd(-5, 5), z = p.body.z + rnd(-5, 5);
      m.streaks.deploy(cmd, 'airstrike', { x, y: m.level.floorY(x, 60, z, 70), z, dx: Math.sin(ang), dz: Math.cos(ang) });
    } else if (kind === 'sentry' && m.nav) {
      const cand = m.nav.near(rnd(10, 30), rnd(-15, 15), 12, 0, 0.5);
      const n = cand.length ? pick(cand) : null;
      if (n) m.streaks.deploy(cmd, 'sentry', { x: n.x, y: n.y, z: n.z });
    } else m.streaks.deploy(cmd, kind, {});
  }
  finish() {
    if (this.finished) return; this.finished = true; const m = this.match;
    const [a, b] = this.score; const outcome = a === b ? 'draw' : a > b ? 'victory' : 'defeat';
    this.result = { outcome, scoreA: a, scoreB: b };
    m.state = 'over'; m.over = true; this.endAt = m.time;
    m.ui.matchOver?.(this.getResults());
    m.sound.ui(outcome === 'victory' ? 'win' : outcome === 'defeat' ? 'lose' : 'select');
  }
  hud() { return { kind: 'tdm', left: this.score[0], right: this.score[1], limit: this.def.limit, time: Math.max(0, this.timeLeft), leftLabel: 'ALLIES', rightLabel: 'ENEMY' }; }
  rows() {
    const m = this.match;
    return m.actors.map(a => ({ name: a.name, team: a.team, kills: a.stats.kills, deaths: a.stats.deaths, assists: a.stats.assists, score: a.stats.score, you: a.isPlayer })).sort((x, y) => y.score - x.score);
  }
  getResults() { const m = this.match; return { mode: 'Team Deathmatch', ...this.result, rows: this.rows(), xp: m.player.sessionXp, player: m.player.stats, teams: true }; }
}

// ---------------------------------------------------------------------------------------------------------------
// Free-for-all: you vs 8 robots. First to 30 kills or 8 minutes.
// ---------------------------------------------------------------------------------------------------------------
export class FFA extends BaseMode {
  constructor(m) { super(m); this.def = MODES.ffa; this.timeLeft = this.def.time; this.finished = false; this.result = null; }
  init() {
    const m = this.match; m.player.team = 1000;
    for (let k = 0; k < this.def.bots; k++) m.addBot({ team: 2000 + k, ally: false, ffa: true, name: this.names[k % this.names.length], index: k });
    m.respawn(m.player, true);
    for (const b of m.bots) m.respawn(b, true);
  }
  onKill(victim, attacker, info) {
    super.onKill(victim, attacker, info);
    if (attacker && attacker !== victim && victim.isActor && attacker.stats.kills >= this.def.limit) this.finish();
  }
  update(dt) { if (this.finished) return; this.timeLeft -= dt; super.update(dt); if (this.timeLeft <= 0) this.finish(); }
  finish() {
    if (this.finished) return; this.finished = true; const m = this.match;
    const rows = this.rows(), rank = rows.findIndex(r => r.you) + 1;
    this.result = { outcome: rank === 1 ? 'victory' : rank <= 3 ? 'podium' : 'defeat', rank, total: rows.length };
    m.state = 'over'; m.over = true; this.endAt = m.time;
    m.ui.matchOver?.(this.getResults());
    m.sound.ui(rank === 1 ? 'win' : rank <= 3 ? 'select' : 'lose');
  }
  hud() {
    const m = this.match, rows = this.rows(); const me = rows.findIndex(r => r.you) + 1;
    return { kind: 'ffa', left: m.player.stats.kills, right: rows[0]?.kills ?? 0, limit: this.def.limit, time: Math.max(0, this.timeLeft), leftLabel: `YOU  #${me}`, rightLabel: `LEADER ${rows[0]?.name ?? ''}` };
  }
  rows() {
    return this.match.actors.map(a => ({ name: a.name, team: a.isPlayer ? 0 : 1, kills: a.stats.kills, deaths: a.stats.deaths, assists: a.stats.assists, score: a.stats.score, you: a.isPlayer })).sort((x, y) => y.kills - x.kills || y.score - x.score);
  }
  getResults() { const m = this.match; return { mode: 'Free-for-All', ...this.result, rows: this.rows(), xp: m.player.sessionXp, player: m.player.stats, teams: false }; }
}

// ---------------------------------------------------------------------------------------------------------------
// Range targets: pop-up and sliding robot dummies
// ---------------------------------------------------------------------------------------------------------------
class RangeTarget {
  constructor(mode, o) {
    this.mode = mode; this.match = mode.match; this.team = 9; this.isTarget = true; this.isActor = false; this.alive = false; this.hp = 100; this.maxHp = 100; this.invulnT = 0;
    this.kind = o.kind; this.dist = o.dist; this.name = o.kind === 'popup' ? 'Pop-up target' : 'Moving target';
    this.x = o.x; this.z = o.z; this.y = 0; this.heading = o.h ?? 0; this.shapes = makeShapes(); this.body = { x: this.x, y: 0, z: this.z, vx: 0, vz: 0, vy: 0 };
    this.rig = new Humanoid({ robot: true, skin: 0xb0b6c2, shirt: 0xe07a1f, shirt2: 0xb25a12, shorts: 0x40454e, socks: 0x40454e, boots: 0x20232a, gloves: 0x30343c, helmet: 0xe07a1f, visor: 0xffcc33, longSleeves: true, shadows: false });
    this.rig.pose(layer(Poses.idle(), Poses.rifle(0.6)));
    this.group = new THREE.Group(); this.group.add(this.rig.root); this.match.scene.add(this.group);
    this.state = 'down'; this.t = 0; this.up = 0; this.upT = 0; this.fall = 0; this.dir = 1; this.speed = o.speed || 0; this.x0 = o.x0; this.x1 = o.x1;
    this.lastZone = ''; this.group.visible = this.kind === 'moving';
    this.rig.root.position.set(this.x, -2, this.z); this.rig.root.rotation.y = this.heading;
    this.hitFlash = 0; this.update(0);
  }
  popUp(dur) { if (this.state !== 'down') return; this.state = 'rising'; this.t = 0; this.upT = dur; this.hp = this.maxHp; this.group.visible = true; this.match.sound.at('pickup', this.x, 0.5, this.z, { vol: 0.6, pitch: 0.5, ref: 30 }); }
  spawnMoving() { this.state = 'moving'; this.alive = true; this.hp = this.maxHp; this.group.visible = true; this.fall = 0; this.x = this.dir > 0 ? this.x0 : this.x1; }
  onDamaged(amount, att, info) { this.lastZone = info?.zone || ''; this.hitFlash = 0.12; this.mode.registerHit(this, info?.zone, info); }
  onKilled(att, info) {
    this.alive = false; this.state = 'dying'; this.t = 0; this.match.fx.robotDeath(this.x, 0, this.z); this.match.sound.robotDie(this.x, 0.5, this.z);
    this.mode.registerKill(this, info);
  }
  update(dt) {
    const rig = this.rig; this.t += dt; this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.state === 'rising') { this.up = clamp(this.t / 0.22, 0, 1); if (this.up >= 1) { this.state = 'up'; this.alive = true; this.t = 0; } }
    else if (this.state === 'up') { this.up = 1; if (this.t >= this.upT) { this.state = 'falling'; this.t = 0; this.alive = false; } }
    else if (this.state === 'falling') { this.up = 1 - clamp(this.t / 0.2, 0, 1); if (this.up <= 0) { this.state = 'down'; this.group.visible = false; this.mode.registerMiss?.(this); } }
    else if (this.state === 'moving') {
      this.x += this.dir * this.speed * dt; if (this.x > this.x1) { this.x = this.x1; this.dir = -1; } else if (this.x < this.x0) { this.x = this.x0; this.dir = 1; }
      this.up = 1; this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2; this.heading = 0;   // always faces the shooter
      this.body.vx = this.dir * this.speed; this.body.vz = 0;
    } else if (this.state === 'dying') {
      this.fall = clamp(this.t / 0.7, 0, 1);
      if (this.t > 1.3) { if (this.kind === 'moving') { this.state = 'moving'; this.dir = Math.random() < 0.5 ? 1 : -1; this.spawnMoving(); } else { this.state = 'down'; this.group.visible = false; this.up = 0; } }
    }
    this.body.x = this.x; this.body.z = this.z;
    const live = this.state === 'dying';
    const pose = live ? layer(Poses.fallen(smooth(this.fall)), { rShoulder: [-1.2, 0, -0.5] }) : layer(Poses.idle(this.match.time), Poses.rifle(0.6));
    rig.pose(pose);
    rig.root.position.set(this.x, -2 + 2 * smooth(this.up) * (this.state === 'dying' ? 1 : 1), this.z); if (this.state === 'dying') rig.root.position.y = 0;
    rig.root.rotation.y = this.heading;
    this.body.y = rig.root.position.y; this.y = this.body.y;
    fillShapes(this.shapes, this.x, rig.root.position.y, this.z, this.heading, STANCE.STAND);
    // shapes only matter while alive; keep them under the floor otherwise
    if (!this.alive) for (const s of this.shapes) { s.ay = s.by = -50; }
  }
  dispose() { this.match.scene.remove(this.group); }
}

// ---------------------------------------------------------------------------------------------------------------
// Firing Range
// ---------------------------------------------------------------------------------------------------------------
export class Range extends BaseMode {
  constructor(m) {
    super(m); this.isRange = true; this.def = MODES.range; this.targets = []; this.popTimer = 1.5;
    this.s = { shots: 0, hits: 0, heads: 0, kills: 0, score: 0, streak: 0, best: 0 };
    this.course = { state: 'idle', t: 0, next: 1, last: 0, best: this.loadBest(), done: 0, resetAt: 0, lastCheckpoint: null, fell: 0 };
    this.gateMeshes = []; this.finished = false; this.signs = [];
  }
  loadBest() { try { const v = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); return v.courseBest || 0; } catch { return 0; } }
  saveBest(t) { try { const v = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); v.courseBest = t; localStorage.setItem(PROFILE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  init() {
    const m = this.match, R = m.map.range;
    for (const t of R.targets) { const rt = new RangeTarget(this, { kind: 'popup', x: t.x, z: t.z, dist: t.dist, h: 0 }); this.targets.push(rt); m.hittables.push(rt); }
    for (const mv of R.moving) { const rt = new RangeTarget(this, { kind: 'moving', x: (mv.x0 + mv.x1) / 2, z: mv.z, dist: mv.dist, speed: mv.speed, x0: mv.x0, x1: mv.x1 }); rt.spawnMoving(); this.targets.push(rt); m.hittables.push(rt); }
    this.buildGates();
    m.respawn(m.player, true);
    const p = m.player; for (const s of p.streakSlots) { s.prog = s.cost; s.ready = true; }
  }
  buildGates() {
    const m = this.match, R = m.map.range;
    for (const g of R.gates) {
      const grp = new THREE.Group(), col = g.kind === 'start' ? 0x39d36a : g.kind === 'finish' ? 0xffffff : 0xffd34d;
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 });
      const h = 3.6, w = g.w - 0.6;
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.25), mat), r = l.clone(), top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.25), mat);
      l.position.set(-w / 2, h / 2, 0); r.position.set(w / 2, h / 2, 0); top.position.set(0, h, 0);
      grp.add(l, r, top); grp.position.set(g.x, 0, g.z); m.scene.add(grp); this.gateMeshes.push({ grp, mat, g });
    }
    // floating signs (browser only)
    for (const lab of R.course.labels) { const s = this.makeSign(lab.text); if (s) { s.position.set(R.course.startX + 5.5, 2.4, lab.z); m.scene.add(s); this.signs.push(s); } }
  }
  makeSign(text) {
    try {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); if (!x || !x.fillText) return null;
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#ffd34d'; x.font = 'bold 44px Segoe UI, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 50);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(4, 1.5, 1); return s;
    } catch { return null; }
  }
  start() {}
  dispose() { for (const t of this.targets) t.dispose(); for (const g of this.gateMeshes) this.match.scene.remove(g.grp); for (const s of this.signs) this.match.scene.remove(s); }
  playerDelay() { return 1.0; }
  onKill(victim, attacker, info) { if (victim.isPlayer) super.onKill(victim, attacker, info); }
  onFell(actor) {
    if (!actor.isPlayer) return;
    const c = this.course, R = this.match.map.range, m = this.match;
    const g = c.lastCheckpoint ? R.gates[c.lastCheckpoint] : R.gates[0];
    m.player.spawnAt({ x: g.x, y: 0, z: g.z + 2.0, h: Math.PI }, true); m.player.invulnT = 0;
    c.fell++; m.ui.toast?.('Back to the last checkpoint');
  }
  registerHit(t, zone, info) {
    const s = this.s; s.hits++; s.streak++; s.best = Math.max(s.best, s.streak);
    const pts = zone === 'head' ? 100 : zone === 'limb' ? 30 : 50; s.score += pts + (t.kind === 'moving' ? 25 : 0) + Math.floor(t.dist / 20) * 5;
    if (zone === 'head') s.heads++;
    this.match.ui.rangeHit?.(pts, zone, t.dist);
  }
  registerKill(t, info) { this.s.kills++; this.s.score += 50; }
  registerMiss(t) { /* a pop-up went down untouched */ if (t.hp >= t.maxHp) this.s.streak = 0; }
  onShot() { this.s.shots++; }
  onPlayerHit() {}
  update(dt) {
    super.update(dt);
    const m = this.match, p = m.player;
    // keep the player stocked
    for (const w of p.weapons) { w.reserve = Math.max(w.reserve, Math.round(w.def.reserve)); }
    if (p.lethal.n < 1) p.lethal.n = 2; if (p.tactical.n < 1) p.tactical.n = 2;
    for (const s of p.streakSlots) if (!s.ready) { s.regen = (s.regen || 0) + dt; if (s.regen > 7) { s.regen = 0; s.prog = s.cost; s.ready = true; } }
    // pop-ups: raise a few at random
    this.popTimer -= dt;
    if (this.popTimer <= 0) {
      this.popTimer = rnd(0.7, 1.5);
      const up = this.targets.filter(t => t.kind === 'popup' && t.state !== 'down').length;
      if (up < 5) { const down = this.targets.filter(t => t.kind === 'popup' && t.state === 'down'); if (down.length) pick(down).popUp(rnd(2.4, 4.6)); }
    }
    this.updateCourse(dt);
  }
  updateWorld(dt) { for (const t of this.targets) t.update(dt); }
  updateCourse(dt) {
    const m = this.match, p = m.player, R = m.map.range, c = this.course, b = p.body;
    if (!p.alive) return;
    const gates = R.gates, w = gates[0].w;
    if (c.state === 'running') c.t += dt;
    if (c.state === 'done' && m.time > c.resetAt) {
      c.state = 'idle'; p.spawnAt({ x: R.course.startX, y: 0, z: R.course.startZ, h: R.course.startH }, true); p.invulnT = 0;
    }
    // crossing detection: the course runs north (z decreasing)
    const prevZ = this._pz ?? b.z; this._pz = b.z;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (Math.abs(b.x - g.x) > g.w / 2 + 0.4) continue;
      if (prevZ > g.z && b.z <= g.z) {
        if (g.kind === 'start' && c.state !== 'running') { c.state = 'running'; c.t = 0; c.next = 1; c.lastCheckpoint = null; m.ui.toast?.('GO!'); m.sound.countdown(true); }
        else if (c.state === 'running') {
          if (i === c.next) {
            c.next++;
            if (g.kind === 'finish') this.finishLap();
            else { c.lastCheckpoint = i; m.ui.toast?.(`Checkpoint ${fmtTime(c.t, true)}`); m.sound.ui('select'); }
          }
        }
      }
    }
    // highlight the next gate
    for (const gm of this.gateMeshes) { const idx = gates.indexOf(gm.g); const isNext = c.state === 'running' ? idx === c.next : idx === 0; gm.mat.opacity = isNext ? 0.9 : 0.25; }
    // leaving the course lane sideways cancels a running lap; walking back across the start line restarts it
    if (c.state === 'running' && (b.z > gates[0].z + 6 || Math.abs(b.x - gates[0].x) > w / 2 + 2)) { c.state = 'idle'; m.ui.toast?.('Lap cancelled'); }
  }
  finishLap() {
    const m = this.match, c = this.course; c.state = 'done'; c.last = c.t; c.done++; c.resetAt = m.time + 3.5;
    const best = !c.best || c.t < c.best; if (best) { c.best = c.t; this.saveBest(c.t); }
    m.ui.toast?.(`Course ${fmtTime(c.t, true)}${best ? '  NEW BEST!' : ''}`); m.sound.ui(best ? 'win' : 'medal');
    m.player.sessionXp += best ? 300 : 150; m.ui.xp?.(best ? 300 : 150, 'Course complete');
  }
  hud() {
    const c = this.course, s = this.s;
    return { kind: 'range', stats: { ...s, acc: s.shots ? Math.round(s.hits / s.shots * 100) : 0 }, course: { state: c.state, t: c.t, best: c.best, last: c.last, next: c.next, done: c.done } };
  }
  rows() { const s = this.s; return [{ name: 'You', team: 0, kills: s.kills, deaths: 0, assists: 0, score: s.score, you: true }]; }
  restartStats() { this.s = { shots: 0, hits: 0, heads: 0, kills: 0, score: 0, streak: 0, best: 0 }; }
}

export function makeMode(match, id) {
  if (id === 'tdm') return new TDM(match);
  if (id === 'ffa') return new FFA(match);
  return new Range(match);
}
