// Scorestreaks: UAV, Precision Airstrike, Sentry Gun, Attack Drone (player and enemy-team versions) + placement markers.
import * as THREE from 'three';
import { MAT, GLOW } from './guns.js';
import { STREAKS } from './data.js';
import { clamp, lerp, rnd, damp, wrapPI, angDiff } from './util.js';

const _v = new THREE.Vector3();

function weaponLike(dmg, pen = 0.2, name = '', extra = {}) {
  return { name, stats: { pen, headMul: 2, rangeMul: 1, pellets: 1, dmg: [[0, dmg]], name, ...extra }, damage: () => dmg };
}
// entities have a single hit sphere; it is listed twice so code that reads shapes[0] (head) and shapes[1] (torso) works unchanged
function sphereShape(r = 0.6) { const s = { zone: 'torso', type: 'sphere', ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r }; return [s, s]; }

class Entity {
  constructor(match, owner, hp, name) {
    this.match = match; this.owner = owner; this.team = owner.team; this.hp = hp; this.maxHp = hp; this.alive = true; this.name = name;
    this.isEntity = true; this.shapes = sphereShape(); this.group = new THREE.Group(); this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.age = 0; this.invulnT = 0;
    this.lockable = true;
  }
  get body() { return this; }
  lockX() { return this.x; } lockY() { return this.y; } lockZ() { return this.z; }
  place(x, y, z) { this.x = x; this.y = y; this.z = z; this.group.position.set(x, y, z); }
  setShape(x, y, z, r) { const s = this.shapes[0]; s.ax = s.bx = x; s.ay = s.by = y; s.az = s.bz = z; s.r = r; }
  onDamaged(amount, attacker) { this.match.fx.burst(this.x, this.y, this.z, 4, 0xfff0b0, 3); this.flashT = 0.1; }
  onKilled(attacker) {
    const m = this.match; this.alive = false;
    m.fx.explosion(this.x, this.y, this.z, 2.6); m.sound.at('explosion', this.x, this.y, this.z, { vol: 0.8, ref: 30 });
    m.scene.remove(this.group);
    if (attacker && attacker.isPlayer) m.ui.flashText?.(`${this.name} destroyed`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
class UAV extends Entity {
  constructor(match, owner) {
    super(match, owner, 60, 'UAV');
    const g = this.group, c = owner.team === 0 ? 0x6fe3ff : 0xff6a6a;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 4.2), MAT(0xb8bcc4, 0.4, 0.5)); g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 1.4), MAT(0x9aa0aa, 0.4, 0.5)); wing.position.z = 0.4; g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.9), MAT(0x9aa0aa, 0.4, 0.5)); tail.position.z = 1.9; g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.9), MAT(c, 0.4, 0.3)); fin.position.set(0, 0.6, 1.9); g.add(fin);
    match.scene.add(g);
    this.dur = STREAKS.uav.dur; this.ang = Math.random() * 6.28; this.R = 52; this.alt = 46; this.t = 0; this.pingT = 3;
    this.shapes[0].r = 2.6;
  }
  update(dt) {
    const m = this.match; this.age += dt;
    if (this.age > this.dur) { this.alive = false; m.scene.remove(this.group); return; }
    this.ang += dt * 0.28;
    const cx = (m.map.bounds.x0 + m.map.bounds.x1) / 2, cz = (m.map.bounds.z0 + m.map.bounds.z1) / 2;
    const x = cx + Math.cos(this.ang) * this.R, z = cz + Math.sin(this.ang) * this.R * 0.7, y = this.alt;
    this.place(x, y, z); this.setShape(x, y, z, 2.6);
    this.group.rotation.y = Math.atan2(-Math.sin(this.ang) * this.R * 0.7, Math.cos(this.ang) * this.R) + Math.PI;
    this.group.rotation.z = 0.12;
    // enemy UAVs reveal the player to their robots
    if (this.team !== 0) { this.pingT -= dt; if (this.pingT <= 0 && m.player.alive) { this.pingT = 4.5; for (const b of m.bots) if (b.alive && b.team === this.team) b.hear(m.player.body.x, m.player.body.y, m.player.body.z, false); } }
  }
}

// ---------------------------------------------------------------------------------------------------------------
class Sentry extends Entity {
  constructor(match, owner, x, y, z) {
    super(match, owner, STREAKS.sentry.hp, 'Sentry Gun');
    const g = this.group, c = owner.team === 0 ? 0x5ad1ff : 0xff5a5a;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 10), MAT(0x3b4048, 0.5, 0.6)); base.position.y = 0.09; g.add(base);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), MAT(0x2b2f36, 0.5, 0.6)); leg.position.set(Math.cos(a) * 0.35, 0.4, Math.sin(a) * 0.35); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); g.add(leg); }
    this.turret = new THREE.Group(); this.turret.position.y = 0.85; g.add(this.turret);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.6), MAT(0x4a5236, 0.55, 0.4)); this.turret.add(head);
    this.barrelG = new THREE.Group(); this.barrelG.position.y = 0.0; this.turret.add(this.barrelG);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), MAT(0x15171a, 0.4, 0.7)); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.55; this.barrelG.add(barrel);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), GLOW(c)); eye.position.set(0, 0.08, -0.31); this.turret.add(eye); this.eye = eye;
    this.place(x, y, z); match.scene.add(g);
    this.dur = STREAKS.sentry.dur; this.yaw = owner.heading ?? 0; this.cool = 0; this.senseT = 0.3; this.target = null; this.burst = 0; this.pause = 0; this.wpn = weaponLike(STREAKS.sentry.dmg, 0.25, 'Sentry Gun');
    this.setShape(x, y + 0.7, z, 0.55);
    this.spawnT = 0.8;
  }
  lockY() { return this.y + 0.8; }
  update(dt) {
    const m = this.match; this.age += dt; this.cool -= dt; this.senseT -= dt;
    if (this.age > this.dur) { this.onKilled(null); return; }
    this.setShape(this.x, this.y + 0.75, this.z, 0.55);
    if (this.spawnT > 0) { this.spawnT -= dt; this.turret.position.y = 0.85 - this.spawnT * 0.5; return; }
    const S = STREAKS.sentry, ey = this.y + 0.95;
    if (this.senseT <= 0) {
      this.senseT = 0.18; let best = null, bd = 1e9;
      for (const t of m.hostilesOf(this)) {
        if (!t.alive || !t.shapes || t.invulnT > 0.5) continue;
        const tp = t.shapes[1], cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2, d = Math.hypot(cx - this.x, cy - ey, cz - this.z);
        if (d > S.range || d >= bd) continue;
        if (m.los(this.x, ey, this.z, cx, cy, cz)) { best = t; bd = d; }
      }
      this.target = best;
    }
    const t = this.target;
    if (t && t.alive) {
      const tp = t.shapes[1], cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2;
      const want = Math.atan2(cx - this.x, cz - this.z), dxz = Math.hypot(cx - this.x, cz - this.z), pit = Math.atan2(cy - ey, dxz);
      this.yaw = wrapPI(this.yaw + clamp(angDiff(this.yaw, want), -4 * dt, 4 * dt));
      this.turret.rotation.y = this.yaw + Math.PI; this.barrelG.rotation.x = -pit * -1;
      this.barrelG.rotation.x = pit;
      const aligned = Math.abs(angDiff(this.yaw, want)) < 0.12;
      if (aligned && this.cool <= 0) {
        if (this.burst <= 0 && this.pause <= 0) { this.burst = 6 + Math.floor(Math.random() * 5); }
        if (this.burst > 0) {
          this.cool = 60 / S.rpm; this.burst--; if (this.burst === 0) this.pause = 0.35;
          const dx = cx - this.x, dy = cy - ey, dz = cz - this.z, d = Math.hypot(dx, dy, dz);
          const sp = 1.6 + d * 0.012; const dir = { x: dx / d, y: dy / d, z: dz / d };
          // small random spread
          const jx = (Math.random() - 0.5) * sp * 0.035, jy = (Math.random() - 0.5) * sp * 0.035, jz = (Math.random() - 0.5) * sp * 0.035;
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          m.fireBullet(this, this.x + fx * 0.9, ey, this.z + fz * 0.9, dir.x + jx, dir.y + jy, dir.z + jz, this.wpn, { mx: this.x + fx * 0.9, my: ey, mz: this.z + fz * 0.9, tracer: true, tracerColor: 0xffe0a0, sentry: true });
          m.fx.muzzleFlash(this.x + fx * 0.95, ey, this.z + fz * 0.95, 0.7);
          m.sound.at('smg', this.x, ey, this.z, { vol: 0.7, ref: 24, pitch: 0.85 });
          m.noise(this.x, ey, this.z, 38, this, true);
        }
      }
      this.pause -= dt;
    } else { this.yaw += dt * 0.5 * Math.sin(this.age * 0.8); this.turret.rotation.y = this.yaw + Math.PI + Math.sin(this.age * 1.3) * 0.5; this.pause = Math.max(0, this.pause - dt); this.burst = 0; }
    this.eye.visible = (Math.floor(this.age * 3) % 2 === 0) || !!t;
  }
}

// ---------------------------------------------------------------------------------------------------------------
class Drone extends Entity {
  constructor(match, owner) {
    super(match, owner, STREAKS.drone.hp, 'Attack Drone');
    const g = this.group, c = owner.team === 0 ? 0x5ad1ff : 0xff5a5a;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.2), MAT(0x2b2f36, 0.45, 0.6)));
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8), MAT(0x15171a, 0.4, 0.7)); gun.rotation.x = Math.PI / 2; gun.position.set(0, -0.2, -0.7); g.add(gun);
    this.rotors = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.07), MAT(0x3b4048, 0.5, 0.5)); arm.position.set(sx * 0.55, 0.05, sz * 0.5); arm.rotation.y = sx * sz * 0.8; g.add(arm);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.015, 14), new THREE.MeshBasicMaterial({ color: 0xcfd4dc, transparent: true, opacity: 0.35 })); r.position.set(sx * 0.95, 0.14, sz * 0.8); g.add(r); this.rotors.push(r);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), GLOW(c)); eye.position.set(0, -0.05, -0.62); g.add(eye);
    match.scene.add(g);
    this.dur = STREAKS.drone.dur; this.orbit = Math.random() * 6.28; this.alt = 9 + Math.random() * 2; this.vx = 0; this.vy = 0; this.vz = 0;
    this.target = null; this.senseT = 0.4; this.cool = 0; this.burst = 0; this.pause = 0; this.rocketCool = 5; this.yaw = 0; this.wpn = weaponLike(STREAKS.drone.dmg, 0.15, 'Attack Drone');
    const o = owner.body || { x: 0, y: 0, z: 0 }; this.place(o.x, o.y + 3, o.z);
  }
  update(dt) {
    const m = this.match, S = STREAKS.drone; this.age += dt; this.cool -= dt; this.senseT -= dt; this.rocketCool -= dt;
    if (this.age > this.dur) { this.onKilled(null); return; }
    const o = this.owner.body && (this.owner.alive !== false) ? this.owner.body : m.player.body;
    this.orbit += dt * 0.55;
    // desired station: orbit above the owner (or above the target when engaging)
    let hx = o.x + Math.cos(this.orbit) * 7, hz = o.z + Math.sin(this.orbit) * 7;
    if (this.target && this.target.alive) { const tp = this.target.shapes[1]; hx = (tp.ax + tp.bx) / 2 + Math.cos(this.orbit * 1.3) * 9; hz = (tp.az + tp.bz) / 2 + Math.sin(this.orbit * 1.3) * 9; }
    hx = clamp(hx, m.map.bounds.x0 + 2, m.map.bounds.x1 - 2); hz = clamp(hz, m.map.bounds.z0 + 2, m.map.bounds.z1 - 2);
    const hy = (m.level.floorY(hx, 60, hz, 70)) + this.alt + Math.sin(this.age * 1.7) * 0.4;
    const ax = (hx - this.x) * 1.4 - this.vx * 1.8, ay = (hy - this.y) * 1.8 - this.vy * 2.2, az = (hz - this.z) * 1.4 - this.vz * 1.8;
    this.vx += ax * dt; this.vy += ay * dt; this.vz += az * dt;
    const spd = Math.hypot(this.vx, this.vz); if (spd > 9) { this.vx *= 9 / spd; this.vz *= 9 / spd; }
    this.place(this.x + this.vx * dt, this.y + this.vy * dt, this.z + this.vz * dt); this.setShape(this.x, this.y, this.z, 0.75);
    for (let i = 0; i < 4; i++) this.rotors[i].rotation.y += dt * (40 + i * 3);
    this.group.rotation.z = -this.vx * 0.03; this.group.rotation.x = this.vz * 0.03;
    // target selection
    if (this.senseT <= 0) {
      this.senseT = 0.3; let best = null, bd = 1e9;
      for (const t of m.hostilesOf(this)) {
        if (!t.alive || !t.shapes || t.invulnT > 0.5 || t === this) continue;
        const tp = t.shapes[1], cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2, d = Math.hypot(cx - this.x, cy - this.y, cz - this.z);
        if (d > S.range || d >= bd) continue;
        if (m.los(this.x, this.y - 0.2, this.z, cx, cy, cz)) { best = t; bd = d; }
      }
      this.target = best;
    }
    const t = this.target;
    if (t && t.alive) {
      const tp = t.shapes[1], cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2;
      const want = Math.atan2(cx - this.x, cz - this.z); this.yaw = wrapPI(this.yaw + clamp(angDiff(this.yaw, want), -5 * dt, 5 * dt)); this.group.rotation.y = this.yaw + Math.PI;
      const aligned = Math.abs(angDiff(this.yaw, want)) < 0.2;
      if (aligned && this.cool <= 0 && this.pause <= 0) {
        if (this.burst <= 0) this.burst = 5 + Math.floor(Math.random() * 4);
        this.cool = 60 / S.rpm; this.burst--; if (this.burst <= 0) this.pause = 0.7;
        const dx = cx - this.x, dy = cy - this.y, dz = cz - this.z, d = Math.hypot(dx, dy, dz), sp = 2.4;
        const jx = (Math.random() - 0.5) * sp * 0.04, jy = (Math.random() - 0.5) * sp * 0.04, jz = (Math.random() - 0.5) * sp * 0.04;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        m.fireBullet(this, this.x + fx * 0.7, this.y - 0.2, this.z + fz * 0.7, dx / d + jx, dy / d + jy, dz / d + jz, this.wpn, { mx: this.x + fx * 0.7, my: this.y - 0.2, mz: this.z + fz * 0.7, tracer: true, tracerColor: 0xffb0b0, drone: true });
        m.sound.at('smg', this.x, this.y, this.z, { vol: 0.55, ref: 26, pitch: 1.2 });
        m.noise(this.x, this.y, this.z, 40, this, true);
      }
      this.pause -= dt;
      if (this.rocketCool <= 0 && Math.hypot(cx - this.x, cz - this.z) > 8) {
        this.rocketCool = 7 + Math.random() * 3;
        const dx = cx - this.x, dy = cy - this.y, dz = cz - this.z, d = Math.hypot(dx, dy, dz);
        m.proj.fireRocket(this, { x: this.x, y: this.y - 0.3, z: this.z }, { x: dx / d, y: dy / d, z: dz / d }, { stats: { projSpeed: 34, splash: { radius: 3.4, inner: 1, dmg: 95, min: 25 }, id: 'drone-rocket', dmg: [[0, 100]], name: 'Attack Drone' } }, null);
      }
    } else { this.group.rotation.y += dt * 0.5; }
  }
  onKilled(attacker) {
    super.onKilled(attacker);
    this.match.fx.puff(this.x, this.y, this.z, 10, 1.6, 0x303030);
  }
}

// ---------------------------------------------------------------------------------------------------------------
class AirstrikeRun {
  constructor(match, owner, p) {
    this.match = match; this.owner = owner; this.alive = true; this.t = 0;
    const S = STREAKS.airstrike; this.S = S; this.x = p.x; this.y = p.y; this.z = p.z;
    const l = Math.hypot(p.dx, p.dz) || 1; this.dx = p.dx / l; this.dz = p.dz / l;
    this.delay = S.delay; this.bombs = []; this.jets = null; this.started = false; this.done = 0; this.name = S.name; this.callout = false;
    for (let i = 0; i < S.bombs; i++) {
      const k = i - (S.bombs - 1) / 2; this.bombs.push({ x: p.x + this.dx * k * S.spacing, z: p.z + this.dz * k * S.spacing, at: this.delay + 0.9 + i * 0.17, done: false });
    }
    this.runLen = (S.bombs - 1) * S.spacing;
  }
  update(dt) {
    const m = this.match; this.t += dt;
    if (!this.started && this.t >= this.delay - 1.6) { this.started = true; this.makeJets(); m.sound.at('airstrike', this.x, 30, this.z, { vol: 1.1, ref: 80 }); if (this.owner.team !== 0) m.ui.warn?.('Enemy airstrike inbound!'); }
    if (this.jets) {
      const k = (this.t - (this.delay - 1.6)) / 3.4, span = 150, sx = this.x - this.dx * span * 0.5, sz = this.z - this.dz * span * 0.5;
      for (let i = 0; i < this.jets.length; i++) {
        const j = this.jets[i], off = (i - 0.5) * 9;
        j.position.set(sx + this.dx * span * k - this.dz * off, 38 + i * 3, sz + this.dz * span * k + this.dx * off);
        j.rotation.y = Math.atan2(this.dx, this.dz) + Math.PI;
      }
    }
    for (const b of this.bombs) {
      if (b.done || this.t < b.at) continue;
      b.done = true; this.done++;
      const y = m.level.floorY(b.x, 80, b.z, 90);
      m.explode(b.x, y + 0.1, b.z, this.S.radius, this.S.dmg, this.owner, { weapon: this.S.name, inner: this.S.radius * 0.45, min: 0.2 });
    }
    if (this.done >= this.bombs.length && this.t > this.bombs[this.bombs.length - 1].at + 1.8) { this.alive = false; if (this.jets) for (const j of this.jets) m.scene.remove(j); }
  }
  makeJets() {
    this.jets = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 9), MAT(0x6b7480, 0.4, 0.6)));
      const w = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 3), MAT(0x59616c, 0.4, 0.6)); w.position.z = 0.6; g.add(w);
      const t = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.6), MAT(0x59616c, 0.4, 0.6)); t.position.z = 3.6; g.add(t);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.8), MAT(0x59616c, 0.4, 0.6)); f.position.set(0, 0.9, 3.5); g.add(f);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.5, 8), new THREE.MeshBasicMaterial({ color: 0xffb060 })); fl.rotation.x = Math.PI / 2; fl.position.z = 5.6; g.add(fl);
      this.match.scene.add(g); this.jets.push(g);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
export class Streaks {
  constructor(match) {
    this.match = match; this.entities = []; this.runs = []; this.marker = null;
  }
  clear() {
    const sc = this.match.scene;
    for (const e of this.entities) sc.remove(e.group); for (const r of this.runs) if (r.jets) for (const j of r.jets) sc.remove(j);
    this.entities.length = 0; this.runs.length = 0; this.hideMarker();
  }
  /** owner: Actor or team commander. */
  deploy(owner, id, p) {
    const m = this.match; let e = null;
    switch (id) {
      case 'uav': e = new UAV(m, owner); break;
      case 'drone': e = new Drone(m, owner); break;
      case 'sentry': e = new Sentry(m, owner, p.x, p.y, p.z); break;
      case 'airstrike': { const r = new AirstrikeRun(m, owner, p); this.runs.push(r); if (owner.isPlayer) m.ui.toast?.('Airstrike inbound'); m.sound.streakCall(); return r; }
      default: return null;
    }
    this.entities.push(e); m.addHittable(e);
    if (owner.isPlayer) { m.ui.toast?.(`${STREAKS[id].name} online`); m.sound.streakCall(); }
    else { m.ui.warn?.(`Enemy ${STREAKS[id].name} deployed`); m.sound.warning(); }
    return e;
  }
  update(dt) {
    const m = this.match;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.alive) e.update(dt);
      if (!e.alive) { this.entities.splice(i, 1); m.removeHittable(e); }
    }
    for (let i = this.runs.length - 1; i >= 0; i--) { const r = this.runs[i]; r.update(dt); if (!r.alive) this.runs.splice(i, 1); }
    // hum of the nearest friendly drone
    if (m.sound.hum) { let near = 99; for (const e of this.entities) if (e.rotors && e.alive) near = Math.min(near, Math.hypot(e.x - m.player.body.x, e.z - m.player.body.z)); m.sound.hum(near < 60 ? 0.07 / (1 + near / 14) : 0, 700); }
  }
  uavActive(team) { return this.entities.some(e => e instanceof UAV && e.alive && e.team === team); }
  lockables(owner) { return this.entities.filter(e => e.alive && e.team !== owner.team && e.lockable); }

  // ---- placement marker --------------------------------------------------------------------------------------
  _buildMarker() {
    const g = new THREE.Group(); g.visible = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 28), new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 8; g.add(this.ring);
    this.dots = []; for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, depthTest: false })); d.renderOrder = 8; g.add(d); this.dots.push(d); }
    this.ghost = new THREE.Group(); const gb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.35, depthTest: false })); gb.position.y = 0.55; this.ghost.add(gb); g.add(this.ghost);
    this.match.scene.add(g); this.marker = g;
  }
  showMarker(T) {
    if (!this.marker) this._buildMarker();
    const m = this.marker; m.visible = true; m.position.set(T.x, T.y + 0.06, T.z);
    const col = T.valid ? (T.id === 'sentry' ? 0x66ff99 : 0xffb347) : 0xff4444;
    this.ring.material.color.setHex(T.valid ? 0x33ff88 : 0xff4444);
    if (T.id === 'airstrike') {
      const S = STREAKS.airstrike, n = S.bombs;
      this.ring.scale.setScalar(S.radius * 0.6); this.ghost.visible = false;
      this.dots.forEach((d, i) => { d.visible = true; const k = i - (n - 1) / 2; d.position.set(T.dirx * k * S.spacing, 0, T.dirz * k * S.spacing); d.scale.setScalar(S.radius * 0.5); d.material.color.setHex(col); });
    } else {
      this.ring.scale.setScalar(0.9); this.dots.forEach(d => { d.visible = false; }); this.ghost.visible = true; this.ghost.rotation.y = Math.atan2(T.dirx, T.dirz); this.ghost.children[0].material.color.setHex(col);
    }
  }
  hideMarker() { if (this.marker) this.marker.visible = false; }
}
