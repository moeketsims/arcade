// Robot soldiers: perception (sight cone, line of sight, reaction time, hearing), waypoint navigation, strafing / crouching /
// flanking / grenades, difficulty-scaled accuracy. Visuals use the shared jointed Humanoid with a held gun.
import * as THREE from 'three';
import { Humanoid, Poses, layer } from '../common/humanoid.js';
import { Actor, STANCE, HULL, EYE } from './actors.js';
import { moveBody, walkClear } from './collision.js';
import { Weapon, spreadDir } from './weapons.js';
import { buildGunMerged } from './guns.js';
import { WEAPONS, DIFFICULTY, LETHALS } from './data.js';
import { Tex } from './textures.js';
import { clamp, lerp, damp, rnd, chance, gauss, angDiff, wrapPI, pick, DEG, smooth } from './util.js';

const G = 20;
const _p = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
const _v3 = new THREE.Vector3();

const ROLES = [
  { w: 0.38, ids: ['vanguard4', 'kestrel47', 'ranger556', 'tempest'], pref: 22 },
  { w: 0.26, ids: ['viper9', 'hornet', 'wasp'], pref: 11 },
  { w: 0.07, ids: ['bulwark60'], pref: 26 },
  { w: 0.1, ids: ['longbow', 'sentinel14'], pref: 36 },
  { w: 0.05, ids: ['reconbolt', 'phantom50'], pref: 52 },
  { w: 0.15, ids: ['breacher12', 'riotauto'], pref: 6 },
];
export function pickBotWeapon() {
  let r = Math.random(), acc = 0;
  for (const role of ROLES) { acc += role.w; if (r <= acc) return pick(role.ids); }
  return 'vanguard4';
}
const PREF = { 'Assault Rifle': 22, 'SMG': 11, 'LMG': 26, 'Marksman Rifle': 36, 'Sniper Rifle': 52, 'Shotgun': 6, 'Pistol': 11 };

const TEAM_STYLE = [
  { torso: 0x2f6fd0, sleeve: 0x25508f, visor: 0x4ad6ff, helmet: 0x3b4658 },   // blue (player's team)
  { torso: 0xc8402a, sleeve: 0x8f2f20, visor: 0xff3344, helmet: 0x4a3b3b },   // red
];
const FFA_STYLES = [
  { torso: 0xd6a31f, sleeve: 0x8f6c14, visor: 0xffd84a, helmet: 0x4a4636 }, { torso: 0x3da35a, sleeve: 0x2b7240, visor: 0x7dff9a, helmet: 0x36463b },
  { torso: 0xa04fd0, sleeve: 0x70368f, visor: 0xd98aff, helmet: 0x41364a }, { torso: 0xd0622f, sleeve: 0x8f4420, visor: 0xffa05a, helmet: 0x4a3f36 },
  { torso: 0x2fb5b5, sleeve: 0x207f7f, visor: 0x6dfff2, helmet: 0x364646 }, { torso: 0xc83a7a, sleeve: 0x8f2a56, visor: 0xff6aa8, helmet: 0x4a3640 },
  { torso: 0x8a8f99, sleeve: 0x5e626b, visor: 0xffffff, helmet: 0x41434a }, { torso: 0x7aa02f, sleeve: 0x557020, visor: 0xd8ff6a, helmet: 0x434a36 },
];
export function styleFor(team, index, ffa) { return ffa ? FFA_STYLES[index % FFA_STYLES.length] : TEAM_STYLE[team] || TEAM_STYLE[1]; }

let GUN_ATTACH = null;
function gunAttach() {
  if (GUN_ATTACH) return GUN_ATTACH;
  const h = new Humanoid({ robot: true, shadows: false });
  h.pose(layer(Poses.idle(), Poses.rifle(1)));
  h.root.updateMatrixWorld(true);
  const qh = new THREE.Quaternion(); h.j.rHand.getWorldQuaternion(qh);
  const qg = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);   // barrel (-Z in gun space) -> body forward (+Z)
  GUN_ATTACH = { quat: qh.clone().invert().multiply(qg), pos: new THREE.Vector3(0.0, -0.02, 0.02) };
  return GUN_ATTACH;
}

let BLOB = null;
function blobMesh() {
  if (!BLOB) {
    const g = new THREE.CircleGeometry(0.45, 16); g.rotateX(-Math.PI / 2);
    BLOB = { geo: g, mat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }) };
  }
  const m = new THREE.Mesh(BLOB.geo, BLOB.mat); m.renderOrder = 1; return m;
}

export class Bot extends Actor {
  constructor(match, o = {}) {
    super(match, o);
    this.isBot = true; this.ally = !!o.ally; this.index = o.index ?? 0; this.ffa = !!o.ffa;
    this.diff = o.diff || DIFFICULTY.regular;
    this.style = styleFor(this.team, this.index, this.ffa); this.color = this.style.visor;
    // visuals
    this.rig = new Humanoid({ robot: true, skin: 0x7b8496, shirt: this.style.torso, shirt2: this.style.sleeve, shorts: 0x2a2f3a, socks: 0x2a2f3a, boots: 0x15171c, gloves: 0x20242c, helmet: this.style.helmet, visor: this.style.visor, longSleeves: true, shadows: false });
    this.group = new THREE.Group(); this.group.add(this.rig.root); this.blob = blobMesh(); this.group.add(this.blob);
    this.gun = null; this.weapon = null; this.pref = 20; this.equip(o.weaponId || pickBotWeapon());
    match.scene.add(this.group);
    // ai state
    this.state = 'patrol'; this.target = null; this.targetVisible = false; this.lastSeen = { x: 0, y: 0, z: 0, t: -99 }; this.seenT = -99; this.engagedT = 0; this.reactT = 0;
    this.path = null; this.pathI = 0; this.repathT = 0; this.goal = null; this.goalWait = 0; this.stuckT = 0; this.lastPos = { x: 0, z: 0, t: 0 };
    this.senseT = rnd(0, 0.2); this.strafeDir = chance(0.5) ? 1 : -1; this.strafeT = rnd(0.3, 1.2); this.crouchT = 0; this.wantCrouch = false;
    this.burstLeft = 0; this.burstT = 0; this.pauseT = rnd(0.2, 0.8); this.aimPos = { x: 0, y: 1, z: 0 }; this.aimYaw = 0; this.aimPitch = 0;
    this.blindT = 0; this.stunT = 0; this.investigate = null; this.nadeCool = rnd(8, 18); this.regenT = 0; this.flinchT = 0; this.faceT = 0; this.runPhase = rnd(0, 6); this.moveAmt = 0;
    this.wantV = { x: 0, z: 0, a: 30 }; this.throwT = 0; this.shotKick = 0;
    this.deadT = 0; this.vanished = true; this.nextDecide = 0; this.hurtDir = 0; this.stepAcc = 0; this.reloadT = 0; this.skillJitter = rnd(0.9, 1.15);
    this.group.visible = false; this.alive = false;
  }

  equip(id) {
    this.weaponId = id; const def = WEAPONS[id];
    this.weapon = new Weapon(def, null); this.weapon.reserve = 999;
    const ai = this.weapon.stats.modes.indexOf('auto'); if (ai >= 0) this.weapon.modeIdx = ai;
    this.pref = PREF[def.cls] ?? 20;
    if (this.gun) this.rig.j.rHand.remove(this.gun);
    this.gun = buildGunMerged(id);
    const A = gunAttach(); this.gun.quaternion.copy(A.quat); this.gun.position.copy(A.pos);
    this.rig.j.rHand.add(this.gun);
    // scope glint: a bright flare on sniper scopes when they point at you (lets the player spot snipers)
    this.glint = null;
    if (def.glint || id === 'reconbolt') {
      const tex = Tex.glint();
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: tex ? 0xffffff : 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.position.set(0, 0.085, -0.2); sp.scale.setScalar(0.1); sp.visible = false; sp.renderOrder = 6; this.gun.add(sp); this.glint = sp;
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // life cycle
  // ---------------------------------------------------------------------------------------------------------
  spawnAt(s) {
    const b = this.body; b.x = s.x; b.y = s.y; b.z = s.z; b.vx = b.vy = b.vz = 0; b.onGround = true;
    this.heading = s.h || 0; this.resetLife(); this.setStance(STANCE.STAND);
    this.equip(pickBotWeapon());
    this.state = 'patrol'; this.target = null; this.targetVisible = false; this.path = null; this.goal = null; this.goalWait = rnd(0, 1.5); this.burstLeft = 0; this.stuckT = 0; this.investigate = null;
    this.blindT = 0; this.stunT = 0; this.deadT = 0; this.vanished = false; this.group.visible = true; this.invulnT = 1.5; this.aimYaw = this.heading; this.aimPitch = 0; this.moveAmt = 0;
    this.nadeCool = rnd(6, 16); this.engagedT = 0; this.reactT = 0;
    this.rig.root.rotation.set(0, this.heading, 0); this.rig.pose(layer(Poses.idle(), Poses.rifle(1)));
    this.updateShapes();
  }
  onDamaged(amount, attacker, info) {
    this.flinchT = 0.18; this.regenT = 3.2;
    if (attacker && attacker.alive && attacker !== this && this.match.hostile(this, attacker)) {
      const ab = attacker.body || attacker;
      this.hurtDir = Math.atan2(ab.x - this.body.x, ab.z - this.body.z);
      if (!this.targetVisible || !this.target) { this.investigate = { x: ab.x, y: ab.y ?? this.body.y, z: ab.z, t: this.match.time }; this.faceT = 1.2; if (this.state === 'patrol') this.state = 'seek'; this.path = null; }
    }
  }
  onKilled(attacker, info) {
    const m = this.match;
    this.alive = false; this.state = 'dead'; this.deadT = 0; this.burstLeft = 0;
    this.stats.deaths++; this.stats.streak = 0;
    m.fx.robotDeath(this.body.x, this.body.y, this.body.z); m.sound.robotDie(this.body.x, this.body.y, this.body.z);
    m.dropWeapon(this);
  }

  // ---------------------------------------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------------------------------------
  update(dt) {
    const m = this.match;
    if (this.vanished) return;
    if (!this.alive) { this.updateDead(dt); return; }
    this.invulnT = Math.max(0, this.invulnT - dt); this.flinchT = Math.max(0, this.flinchT - dt);
    this.blindT = Math.max(0, this.blindT - dt); this.stunT = Math.max(0, this.stunT - dt);
    this.weapon.update(dt); this.nadeCool -= dt; this.faceT = Math.max(0, this.faceT - dt);
    if (!this.weapon.reload && (this.weapon.ammo <= 0 || (!this.targetVisible && this.weapon.ammo < this.weapon.capacity * 0.4))) this.weapon.startReload();
    // slow regen out of combat
    this.regenT -= dt; if (this.regenT <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 14 * dt);
    this.perceive(dt);
    this.think(dt);
    this.updateShapes();
    this.animate(dt);
  }

  // ---- perception --------------------------------------------------------------------------------------------
  perceive(dt) {
    const m = this.match; this.senseT -= dt;
    if (this.senseT > 0) return;
    this.senseT = 0.15 + Math.random() * 0.08;
    if (this.blindT > 0.2) { this.targetVisible = false; return; }
    const eyeY = this.eyeY(), ex = this.body.x, ez = this.body.z, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const sight = this.diff.sight * (this.weapon.def.cls === 'Sniper Rifle' ? 1.5 : 1);
    let best = null, bestScore = 0, bestPt = null;
    for (const t of m.hostilesOf(this)) {
      if (!t.alive || t.invulnT > 0.5) continue;
      const tp = t.shapes[1], hp = t.shapes[0];
      const cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2;
      const dx = cx - ex, dy = cy - eyeY, dz = cz - ez, d = Math.hypot(dx, dy, dz);
      let range = sight;
      if (t.isPlayer) { range *= t.stance === STANCE.PRONE ? 0.65 : t.stance === STANCE.CROUCH ? 0.85 : t.sprinting ? 1.15 : 1; if (t.glintT > 0 || (t.scoped && t.weapon?.def.glint)) range *= 1.4; if (m.time - t.firedT < 1.2) range *= 1.35; }
      if (m.time - (t.firedT ?? -99) < 0.8 && d < 120) range = Math.max(range, 90);
      if (d > range) continue;
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < 0.25 && d > 7 && !(this.target === t && m.time - this.seenT < 1.2)) continue;      // outside ~75 degree cone
      if (!m.los(ex, eyeY, ez, cx, cy, cz) && !m.los(ex, eyeY, ez, hp.ax, hp.ay, hp.az)) continue;
      const score = (1 / (d + 3)) * (t === this.target ? 1.6 : 1) * (t.isActor ? 1 : 0.55) * (t === this.match.player ? 1.15 : 1) * (this.lastAttacker === t ? 1.4 : 1);
      if (score > bestScore) { bestScore = score; best = t; bestPt = [cx, cy, cz]; }
    }
    if (best) {
      if (best !== this.target) { this.target = best; this.reactT = lerp(this.diff.react[0], this.diff.react[1], Math.random()) * this.skillJitter; this.engagedT = 0; if (m.nav) this.path = null; }
      this.targetVisible = true; this.seenT = m.time;
      this.lastSeen.x = bestPt[0]; this.lastSeen.y = best.body ? best.body.y : bestPt[1] - 1; this.lastSeen.z = bestPt[2]; this.lastSeen.t = m.time;
      this.investigate = null;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || m.time - this.seenT > 5)) { this.target = null; }
    }
  }
  hear(x, y, z, loud) {
    if (!this.alive || this.targetVisible || this.blindT > 0) return;
    const err = loud ? 2.5 : 4;
    this.investigate = { x: x + rnd(-err, err), y, z: z + rnd(-err, err), t: this.match.time };
    this.faceT = 0.9;
    if (this.state === 'patrol' || this.state === 'seek') { this.state = 'seek'; this.path = null; }
  }

  // ---- decisions ---------------------------------------------------------------------------------------------
  think(dt) {
    const m = this.match, b = this.body;
    // choose state
    if (this.targetVisible && this.target) { if (this.state !== 'engage') { this.state = 'engage'; this.engagedT = 0; } }
    else if (this.state === 'engage') { this.state = 'seek'; this.path = null; this.investigate = { x: this.lastSeen.x, y: this.lastSeen.y, z: this.lastSeen.z, t: m.time }; if (chance(0.35)) this.tryFlank(); }
    switch (this.state) {
      case 'engage': this.doEngage(dt); break;
      case 'seek': this.doSeek(dt); break;
      default: this.doPatrol(dt); break;
    }
    this.integrate(dt);
  }

  /** Request a ground velocity (direction vx,vz in -1..1 times speed); integrate() eases towards it. */
  setWant(vx, vz, speed, accel = 30) { const w = this.wantV; w.x = vx * speed; w.z = vz * speed; w.a = accel; }
  integrate(dt) {
    const b = this.body, w = this.wantV;
    const slow = this.stunT > 0 ? 0.5 : 1;
    const tx = w.x * slow, tz = w.z * slow, dx = tx - b.vx, dz = tz - b.vz, dl = Math.hypot(dx, dz), st = w.a * dt;
    if (dl <= st) { b.vx = tx; b.vz = tz; } else { b.vx += dx / dl * st; b.vz += dz / dl * st; }
    // separation from nearby robots so they do not stack
    for (const o of this.match.bots) {
      if (o === this || !o.alive) continue;
      const ox = b.x - o.body.x, oz = b.z - o.body.z, d2 = ox * ox + oz * oz;
      if (d2 < 0.8 && d2 > 1e-4) { const d = Math.sqrt(d2), f = (0.9 - d) * 3 * dt; b.vx += ox / d * f * 6; b.vz += oz / d * f * 6; }
    }
    const n = Math.max(1, Math.ceil(dt / 0.02)), h = dt / n;
    for (let i = 0; i < n; i++) { b.vy -= G * h; if (b.onGround && b.vy < 0) b.vy = -0.5; moveBody(this.match.level, b, h); }
    if (b.y < -8) { this.match.onFell?.(this); }
    this.wantV.x = 0; this.wantV.z = 0;
    // stuck detection
    const m = this.match;
    if (m.time - this.lastPos.t > 0.6) {
      const moved = Math.hypot(b.x - this.lastPos.x, b.z - this.lastPos.z), wanted = Math.hypot(tx, tz) > 0.5;
      this.stuckT = wanted && moved < 0.2 ? this.stuckT + 0.6 : 0;
      this.lastPos.x = b.x; this.lastPos.z = b.z; this.lastPos.t = m.time;
    }
  }

  faceToward(x, z, rate, dt) {
    const want = Math.atan2(x - this.body.x, z - this.body.z);
    this.heading = wrapPI(this.heading + clamp(angDiff(this.heading, want), -rate * dt, rate * dt));
  }

  // ---- patrol ------------------------------------------------------------------------------------------------
  doPatrol(dt) {
    const m = this.match, nav = m.nav, b = this.body;
    const speed = 3.6 * this.diff.speed;
    if (!nav) { this.moveAmt = damp(this.moveAmt, 0, 8, dt); return; }
    if (this.goalWait > 0) {   // look around at a stop
      this.goalWait -= dt; this.moveAmt = damp(this.moveAmt, 0, 8, dt);
      this.heading = wrapPI(this.heading + Math.sin(m.time * 1.3 + this.id) * 0.8 * dt);
      return;
    }
    if (!this.path || this.pathI >= this.path.length || this.stuckT >= 1.2) { this.stuckT = 0; if (!this.pickGoal()) { this.goalWait = 0.5; return; } }
    this.followPath(dt, speed * 1.25, true);
    if (this.path && this.pathI >= this.path.length) { this.goalWait = rnd(0.4, 2.2); this.path = null; }
  }
  pickGoal() {
    const m = this.match, nav = m.nav, b = this.body; if (!nav) return false;
    // team bias: head for the enemy half, allies sometimes stay near the player
    let gx, gz;
    const r = Math.random();
    if (this.ally && m.player?.alive && r < 0.3) { gx = m.player.body.x + rnd(-12, 12); gz = m.player.body.z + rnd(-12, 12); }
    else if (!this.ffa && r < 0.62) { const dir = this.team === 0 ? 1 : -1; gx = dir * rnd(5, 40) + rnd(-6, 6); gz = rnd(m.map.bounds.z0 + 4, m.map.bounds.z1 - 4); }
    else { gx = rnd(m.map.bounds.x0 + 4, m.map.bounds.x1 - 4); gz = rnd(m.map.bounds.z0 + 4, m.map.bounds.z1 - 4); }
    let goal = null;
    if (nav.zoneNodes && Math.random() < 0.42) {   // head inside a building (or up the tower): interiors and upper floors matter
      const zs = m.map.zones; let tot = 0; for (const z of zs) tot += z.weight; let rr = Math.random() * tot, zone = zs[0];
      for (const z of zs) { rr -= z.weight; if (rr <= 0) { zone = z; break; } }
      const list = nav.zoneNodes[zone.name]; if (list && list.length) goal = pick(list);
    }
    if (!goal) { const cand = nav.near(gx, gz, 14, b.y, 6); goal = cand.length ? pick(cand) : nav.nodes[Math.floor(Math.random() * nav.nodes.length)]; }
    if (!goal) return false;
    return this.planTo(goal);
  }
  planTo(goalNode) {
    const nav = this.match.nav, b = this.body;
    const start = nav.nearest(b.x, b.y, b.z); if (!start) return false;
    const p = nav.path(start.id, goalNode.id); if (!p) return false;
    this.path = p; this.pathI = 0; this.goal = goalNode; this.repathT = 1.2;
    // skip the first node if we are already past it
    if (p.length > 1) { const n0 = nav.nodes[p[0]], n1 = nav.nodes[p[1]]; if (Math.hypot(n1.x - b.x, n1.z - b.z) < Math.hypot(n1.x - n0.x, n1.z - n0.z)) this.pathI = 1; }
    return true;
  }
  planToPos(x, y, z) {
    const nav = this.match.nav; if (!nav) return false;
    const g = nav.nearest(x, y, z, 14); if (!g) return false;
    return this.planTo(g);
  }
  followPath(dt, speed, face) {
    const nav = this.match.nav, b = this.body; if (!this.path) return;
    // skip ahead when a straight walk to a later node is clear
    this._skipT = (this._skipT || 0) - dt;
    if (this._skipT <= 0) {
      this._skipT = 0.2;
      for (let k = Math.min(this.path.length - 1, this.pathI + 3); k > this.pathI; k--) { const n = nav.nodes[this.path[k]]; if (Math.abs(n.y - b.y) < 0.6 && walkClear(this.match.level, b.x, b.y, b.z, n.x, n.y, n.z, 0.34, 1.8)) { this.pathI = k; break; } }
    }
    let n = nav.nodes[this.path[this.pathI]];
    if (!n) { this.path = null; return; }
    let dx = n.x - b.x, dz = n.z - b.z, d = Math.hypot(dx, dz);
    if (d < 0.7 && Math.abs(n.y - b.y) < 1.2) { this.pathI++; if (this.pathI >= this.path.length) { this.moveAmt = damp(this.moveAmt, 0, 8, dt); return; } n = nav.nodes[this.path[this.pathI]]; dx = n.x - b.x; dz = n.z - b.z; d = Math.hypot(dx, dz); }
    const inv = d > 0.001 ? 1 / d : 0;
    this.setWant(dx * inv, dz * inv, speed, 34);
    if (face) this.faceToward(b.x + dx, b.z + dz, 7, dt);
    this.moveAmt = damp(this.moveAmt, speed > 4.2 ? 1 : 0.7, 8, dt);
  }

  // ---- seek (investigate a sound or the last known position) -------------------------------------------------------
  doSeek(dt) {
    const m = this.match, b = this.body, inv = this.investigate;
    if (!inv || m.time - inv.t > 9) { this.state = 'patrol'; this.path = null; this.goalWait = 0.3; return; }
    if (!this.path) { if (!this.planToPos(inv.x, inv.y, inv.z)) { this.state = 'patrol'; return; } }
    const speed = 3.8 * this.diff.speed;
    if (this.faceT > 0 && !this.path) this.faceToward(inv.x, inv.z, 6, dt);
    this.followPath(dt, speed, this.faceT <= 0);
    if (this.faceT > 0) this.faceToward(inv.x, inv.z, 5, dt);
    if (!this.path || this.pathI >= this.path.length || Math.hypot(inv.x - b.x, inv.z - b.z) < 2.0 || this.stuckT >= 1.2) { this.investigate = null; this.state = 'patrol'; this.path = null; this.goalWait = rnd(0.3, 1.2); this.stuckT = 0; }
  }
  tryFlank() {
    const m = this.match, nav = m.nav; if (!nav || !this.target) return;
    const t = this.lastSeen, b = this.body, base = Math.atan2(t.x - b.x, t.z - b.z);
    const cand = nav.near(t.x, t.z, 26, t.y, 5).filter(n => { const d = Math.hypot(n.x - t.x, n.z - t.z); if (d < 9) return false; const ang = Math.atan2(t.x - n.x, t.z - n.z); return Math.abs(angDiff(base, ang)) > 1.0; });
    if (!cand.length) return;
    for (let i = 0; i < 4; i++) { const n = pick(cand); if (m.los(n.x, n.y + 1.6, n.z, t.x, t.y + 1.2, t.z)) { this.planTo(n); this.investigate = { x: t.x, y: t.y, z: t.z, t: m.time }; return; } }
  }

  // ---- engage ------------------------------------------------------------------------------------------------
  doEngage(dt) {
    const m = this.match, b = this.body, t = this.target, w = this.weapon;
    this.engagedT += dt; this.reactT -= dt;
    const tx = this.lastSeen.x, tz = this.lastSeen.z, dx = tx - b.x, dz = tz - b.z, dist = Math.hypot(dx, dz);
    // turn to face (aim lag grows turn time on Recruit)
    this.faceToward(tx, tz, 9 * clamp(this.diff.aimLag / 8, 0.6, 1.4), dt);
    // posture: crouch while reloading or when firing at long range, if the stance fits
    this.crouchT -= dt;
    if (this.crouchT <= 0) { this.crouchT = rnd(1.0, 2.6); this.wantCrouch = (w.reload || dist > 24 || (this.hp < 50 && chance(0.6))) && chance(0.7); }
    const wantStance = this.wantCrouch || w.reload ? STANCE.CROUCH : STANCE.STAND;
    if (wantStance !== this.stance) { if (wantStance === STANCE.STAND && m.level.overlaps(b.x - 0.3, b.y + 0.02, b.z - 0.3, b.x + 0.3, b.y + 1.8, b.z + 0.3)) { /* cannot stand */ } else this.setStance(wantStance); }
    const speed = (this.stance === STANCE.CROUCH ? 1.7 : 2.7) * this.diff.speed;
    // movement relative to the target
    const rx = -dz / (dist || 1), rz = dx / (dist || 1), fx = dx / (dist || 1), fz = dz / (dist || 1);
    this.strafeT -= dt;
    if (this.strafeT <= 0 || this.stuckT >= 0.6) { this.strafeT = rnd(0.6, 1.7); this.strafeDir = this.stuckT >= 0.6 ? -this.strafeDir : (chance(0.5) ? 1 : -1); this.stuckT = 0; }
    let adv = 0;
    if (dist > this.pref * 1.35) adv = 1; else if (dist < this.pref * 0.5) adv = -0.8; else if (dist > this.pref) adv = 0.4;
    if (w.reload) adv = Math.min(adv, 0);
    // shotgunners push in, snipers hold position
    if (this.weapon.def.cls === 'Shotgun') adv = dist > 4 ? 1 : 0; if (this.weapon.def.cls === 'Sniper Rifle') adv = dist < 25 ? -0.8 : 0;
    const sv = this.weapon.def.cls === 'Sniper Rifle' ? 0.15 : this.stance === STANCE.CROUCH ? 0.2 : 0.8;
    const vx = rx * this.strafeDir * sv + fx * adv, vz = rz * this.strafeDir * sv + fz * adv;
    // avoid strafing into a wall: probe a short step
    const px = b.x + vx * 0.7, pz = b.z + vz * 0.7;
    if (m.level.overlaps(px - 0.35, b.y + 0.55, pz - 0.35, px + 0.35, b.y + 1.5, pz + 0.35)) { this.strafeDir = -this.strafeDir; this.setWant(0, 0, 0); } else this.setWant(vx, vz, speed, 26);
    this.moveAmt = damp(this.moveAmt, Math.hypot(vx, vz) > 0.1 ? 0.55 : 0, 6, dt);
    // pathing when far: use the graph so the approach goes around obstacles
    if (adv > 0.5 && dist > 18) { this._pt = (this._pt || 0) - dt; if (this._pt <= 0) { this._pt = 1.0; if (this.planToPos(tx, b.y, tz)) { this._follow = true; } } if (this.path) this.followPath(dt, 3.2 * this.diff.speed, false); }
    // grenade
    if (this.nadeCool <= 0 && dist > 9 && dist < 28 && chance(dt * 0.4 * this.diff.grenade)) this.throwGrenade(tx, this.lastSeen.y, tz);
    // shooting
    this.shoot(dt, t, dist);
  }

  throwGrenade(tx, ty, tz) {
    const m = this.match, b = this.body, def = LETHALS.frag;
    this.nadeCool = rnd(14, 30) / Math.max(0.4, this.diff.grenade);
    const ox = b.x, oy = b.y + 1.5, oz = b.z, dx = tx - ox, dz = tz - oz, d = Math.hypot(dx, dz), sp = 15.5;
    // solve the launch angle for range d (flat ground, ignore small height difference)
    const k = clamp(9.8 * d / (sp * sp), 0, 0.98), ang = 0.5 * Math.asin(k) + 0.06;
    const vx = dx / d * Math.cos(ang) * sp, vz = dz / d * Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
    // check the first part of the arc is not blocked by a wall right in front
    if (m.level.blocked(ox, oy, oz, ox + dx / d * 2, oy + 0.4, oz + dz / d * 2)) return;
    m.proj.throwGrenade(this, 'frag', def, { x: ox + dx / d * 0.5, y: oy, z: oz + dz / d * 0.5 }, { x: vx, y: vy, z: vz }, 2.4 + Math.random() * 0.8);
    m.sound.at('knife', ox, oy, oz, { vol: 0.4, pitch: 0.9 });
    this.throwT = 0.5;
  }

  shoot(dt, t, dist) {
    const m = this.match, w = this.weapon, b = this.body, s = w.stats, diff = this.diff;
    if (w.reload || this.blindT > 0.5 || this.reactT > 0 || this.flinchT > 0.1 && chance(0.3)) { this.burstLeft = 0; return; }
    if (dist > (s.dmg[s.dmg.length - 1][0] + 25) * (s.rangeMul || 1) + 15) return;
    // smoothed aim point: lags behind a moving target, which is what makes drop-shots and strafing work
    const pt = t.shapes[1], hp = t.shapes[0];
    const tx = (pt.ax + pt.bx) / 2, ty = (pt.ay + pt.by) / 2, tz = (pt.az + pt.bz) / 2;
    if (this.engagedT < 0.05) { this.aimPos.x = tx; this.aimPos.y = ty; this.aimPos.z = tz; }
    const k = 1 - Math.exp(-diff.aimLag * (this.blindT > 0 ? 0.3 : 1) * dt);
    this.aimPos.x += (tx - this.aimPos.x) * k; this.aimPos.y += (ty - this.aimPos.y) * k; this.aimPos.z += (tz - this.aimPos.z) * k;
    // burst control
    this.burstT -= dt; this.pauseT -= dt;
    const auto = w.mode === 'auto';
    if (this.burstLeft <= 0) {
      if (this.pauseT <= 0) { this.burstLeft = auto ? lerp(diff.burst[0], diff.burst[1], Math.random()) : 1 + Math.floor(Math.random() * 3); this.pauseT = 0; }
    }
    if (this.burstLeft <= 0) return;
    const eyeY = this.eyeY();
    const wantFire = auto ? true : w.cool <= 0;
    if (auto) this.burstLeft -= dt;
    const shots = w.trigger(!auto && wantFire, auto, BOT_SHOTS);
    if (shots.length) {
      for (const ev of shots) this.fireShot(ev, t, dist, eyeY);
      if (!auto) { this.burstLeft -= 1; }
      if (this.burstLeft <= 0) this.pauseT = lerp(diff.pause[0], diff.pause[1], Math.random()) * (s.bolt ? 3 : 1);
    } else if (auto && this.burstLeft <= 0) this.pauseT = lerp(diff.pause[0], diff.pause[1], Math.random());
    if (w.empty) { w.empty = false; w.startReload(); this.burstLeft = 0; }
  }
  fireShot(ev, t, dist, eyeY) {
    const m = this.match, w = this.weapon, s = w.stats, diff = this.diff, b = this.body;
    const head = chance(diff.head);
    let ax = this.aimPos.x, ay = this.aimPos.y, az = this.aimPos.z;
    if (head) { const hh = t.shapes[0]; ay = hh.ay; }
    let dx = ax - b.x, dy = ay - eyeY, dz = az - b.z; const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    // angular error in degrees, scaled by distance, target speed, our own movement and status effects
    const tv = t.body ? Math.hypot(t.body.vx, t.body.vz) : 0;
    const settle = 1 + Math.max(0, 1 - this.engagedT / 1.1) * 1.5;
    let err = diff.err * (0.55 + d / 38) * (1 + tv / 7) * settle * (this.stance === STANCE.CROUCH ? 0.85 : 1) * (Math.hypot(b.vx, b.vz) > 1.5 ? 1.3 : 1);
    if (this.blindT > 0) err *= 3.5; if (this.stunT > 0) err *= 2; if (this.flinchT > 0) err *= 1.5;
    if (s.bolt) err *= 0.5;
    if (s.pellets > 1) err = s.pelletSpread;
    const gun = this.gun; this.group.updateMatrixWorld(true);
    _v3.set(0, gun.userData.muzzleY ?? 0.02, gun.userData.muzzleZ ?? -0.7); gun.localToWorld(_v3);
    const mx = _v3.x, my = _v3.y, mz = _v3.z;
    for (let p = 0; p < ev.pellets; p++) {
      spreadDir(dx, dy, dz, s.pellets > 1 ? err : Math.abs(gauss()) * err + 0.15, _d);
      m.fireBullet(this, b.x, eyeY, b.z, _d.x, _d.y, _d.z, w, { mx, my, mz, tracer: p === 0 || s.pellets > 1, dmgMul: diff.dmg * (this.ally ? 1 : 1), botShot: true });
    }
    m.fx.muzzleFlash(mx, my, mz, 0.8 * s.flash * (s.suppressed ? 0.2 : 1));
    m.sound.gun(s.snd, b.x, eyeY, b.z, 0.9);
    m.noise(b.x, eyeY, b.z, 42, this, true);
    this.firedT = m.time; this.shotKick = 0.12;
  }

  // ---------------------------------------------------------------------------------------------------------
  // animation
  // ---------------------------------------------------------------------------------------------------------
  animate(dt) {
    const b = this.body, rig = this.rig, m = this.match;
    const sp = Math.hypot(b.vx, b.vz);
    this.runPhase += sp * dt * 2.1;
    // aim pitch toward the target
    let pitchTarget = 0;
    if (this.state === 'engage' && this.target) { const tp = this.target.shapes[1], eyeY = this.eyeY(); const dy = (tp.ay + tp.by) / 2 - eyeY, dd = Math.hypot((tp.ax + tp.bx) / 2 - b.x, (tp.az + tp.bz) / 2 - b.z) || 1; pitchTarget = clamp(Math.atan2(dy, dd), -0.7, 0.7); }
    this.aimPitch = damp(this.aimPitch, pitchTarget, 10, dt);
    this.shotKick = Math.max(0, (this.shotKick || 0) - dt * 1.2);
    const amount = clamp(sp / 4.5, 0, 1) * (this.stance === STANCE.CROUCH ? 0.5 : 1);
    const aim = this.state === 'engage' ? 1 : 0.55;
    const rifle = Poses.rifle(aim);
    const up = -this.aimPitch;
    const arms = { ...rifle, rShoulder: [rifle.rShoulder[0] + up, rifle.rShoulder[1], rifle.rShoulder[2]], lShoulder: [rifle.lShoulder[0] + up, rifle.lShoulder[1], rifle.lShoulder[2]] };
    let pose;
    if (this.stance === STANCE.CROUCH) pose = layer(Poses.crouch(), arms, { spine: [0.28 - this.aimPitch * 0.3, 0, 0] });
    else pose = layer(sp > 0.3 ? Poses.run(this.runPhase, amount) : Poses.idle(m.time + this.id), arms);
    if (this.flinchT > 0 && pose.spine) pose.spine = [pose.spine[0] - 0.12 * (this.flinchT / 0.18), pose.spine[1], pose.spine[2]];
    if (this.shotKick > 0) { pose.rShoulder = [pose.rShoulder[0] + this.shotKick * 0.25, pose.rShoulder[1], pose.rShoulder[2]]; }
    if (this.throwT > 0) { this.throwT -= dt; const k = 1 - this.throwT / 0.5; const th = Poses.throwArm(clamp(k, 0, 1)); pose = layer(pose, th); }
    rig.pose(pose);
    rig.root.position.set(b.x, b.y, b.z); rig.root.rotation.y = this.heading;
    this.blob.scale.setScalar(this.stance === STANCE.CROUCH ? 0.85 : 1);
    this.blob.position.set(b.x, b.y + 0.03, b.z);
    if (this.glint) {
      const pl = m.player, dx = pl.body.x - b.x, dz = pl.body.z - b.z, dd = Math.hypot(dx, dz) || 1, facing = (dx * Math.sin(this.heading) + dz * Math.cos(this.heading)) / dd;
      const on = this.state === 'engage' && facing > 0.9 && dd > 14 && pl.alive;
      this.glint.visible = on; if (on) { const k = 0.5 + 0.5 * Math.sin(m.time * 14 + this.id); this.glint.scale.setScalar((0.5 + dd * 0.012) * (0.6 + 0.6 * k)); }
    }
    // footsteps
    if (sp > 1.2 && b.onGround) { this.stepAcc += sp * dt; if (this.stepAcc > 2.3) { this.stepAcc = 0; m.sound.at('footstep', b.x, b.y, b.z, { vol: 0.5, ref: 9, pitch: rnd(0.8, 1.1) }); } }
    // damaged robots smoke and spark
    if (this.hp < 35 && Math.random() < dt * 4) m.fx.sparkTrickle(b.x + rnd(-0.1, 0.1), b.y + rnd(0.8, 1.5), b.z + rnd(-0.1, 0.1));
  }

  updateDead(dt) {
    const m = this.match, b = this.body, rig = this.rig;
    this.deadT += dt;
    b.vx *= Math.max(0, 1 - 5 * dt); b.vz *= Math.max(0, 1 - 5 * dt); b.vy -= G * dt; moveBody(m.level, b, dt);
    const k = smooth(clamp(this.deadT / 0.7, 0, 1));
    rig.pose(layer(Poses.fallen(k), { rShoulder: [-1.2, 0, -0.5], lShoulder: [-1.0, 0, 0.5] }));
    rig.root.position.set(b.x, b.y, b.z); rig.root.rotation.y = this.heading;
    this.blob.position.set(b.x, b.y + 0.03, b.z);
    // sparking husk, then it flickers out
    if (this.deadT < 1.6 && Math.random() < dt * 14) m.fx.sparkTrickle(b.x + rnd(-0.3, 0.3), b.y + 0.2, b.z + rnd(-0.4, 0.4));
    if (this.deadT > 1.7) this.group.visible = Math.floor(this.deadT * 24) % 2 === 0;
    if (this.deadT > 2.2) { this.group.visible = false; this.vanished = true; m.fx.burst(b.x, b.y + 0.3, b.z, 8, 0x9fd8ff, 2); }
  }
  dispose() { this.match.scene.remove(this.group); }
}
const BOT_SHOTS = [];
