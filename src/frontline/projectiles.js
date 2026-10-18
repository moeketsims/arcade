// Thrown and launched things: grenades (frag, sticky, flash, smoke, stun), throwing knives, ballistic-knife blades,
// proximity mines, rockets and the homing Skylock missile.
import * as THREE from 'three';
import { buildGrenade, buildThrowingKnife, MAT } from './guns.js';
import { rayShapes } from './actors.js';
import { TACTICALS, LETHALS } from './data.js';
import { clamp, rnd, lerp } from './util.js';

const G = 9.8;
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();

export class Projectiles {
  constructor(match) { this.match = match; this.list = []; }
  clear() { for (const p of this.list) this.match.scene.remove(p.mesh); this.list.length = 0; }

  _add(p) { this.match.scene.add(p.mesh); this.list.push(p); return p; }

  // ---------------------------------------------------------------------------------------------------------
  // grenades
  // ---------------------------------------------------------------------------------------------------------
  throwGrenade(owner, kindId, def, o, v, fuse) {
    const mesh = buildGrenade(kindId); mesh.scale.setScalar(1.5); mesh.position.set(o.x, o.y, o.z);
    const p = { type: 'grenade', kind: kindId, def, owner, mesh, x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, fuse, rest: false, spin: rnd(6, 14), stuck: null, age: 0, team: owner.team };
    if (kindId === 'sticky') p.fuse = Math.max(fuse, 3.5);   // fuse shortens once it sticks
    return this._add(p);
  }
  /** The cook timer ran out while the grenade was still in the hand. */
  detonateInHand(owner, def) {
    const m = this.match, b = owner.body;
    this.detonate({ kind: 'frag', def: LETHALS.frag, owner, x: b.x, y: b.y + 1.2, z: b.z, team: owner.team });
  }
  detonate(p) {
    const m = this.match, def = p.def;
    switch (p.kind) {
      case 'frag': case 'sticky': m.explode(p.x, p.y, p.z, def.radius, def.dmg, p.owner, { weapon: def.name, inner: def.radius * 0.3, min: 0.12 }); break;
      case 'flash': m.flashbang(p.x, p.y, p.z, def, p.owner); break;
      case 'smoke': m.fx.smokeCloud(p.x, p.y, p.z, def.radius, def.dur); m.sound.at('uav', p.x, p.y, p.z, { vol: 0.5, pitch: 0.5 }); m.sound.at('explosion', p.x, p.y, p.z, { vol: 0.25, pitch: 1.6, ref: 20 }); break;
      case 'stun': m.stunGrenade(p.x, p.y, p.z, def, p.owner); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // knives
  // ---------------------------------------------------------------------------------------------------------
  throwKnife(owner, o, v, def) {
    const mesh = buildThrowingKnife(); mesh.scale.setScalar(1.2); mesh.position.set(o.x, o.y, o.z);
    return this._add({ type: 'knife', def, owner, mesh, x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, dmg: def.dmg, gravity: 5, age: 0, team: owner.team, name: def.name, pickupKind: 'tknife' });
  }
  fireBlade(owner, o, d, def) {
    const r = def.ranged, mesh = buildThrowingKnife(); mesh.scale.setScalar(1.1); mesh.position.set(o.x, o.y, o.z);
    return this._add({ type: 'knife', def, owner, mesh, x: o.x, y: o.y, z: o.z, vx: d.x * r.speed, vy: d.y * r.speed, vz: d.z * r.speed, dmg: r.dmg, gravity: r.gravity, age: 0, maxDist: r.range, travelled: 0, team: owner.team, name: def.name, pickupKind: 'blade' });
  }

  // ---------------------------------------------------------------------------------------------------------
  // mines
  // ---------------------------------------------------------------------------------------------------------
  plantMine(owner, def, x, y, z) {
    const mesh = buildGrenade('mine'); mesh.position.set(x, y + 0.02, z); mesh.scale.setScalar(1.0);
    return this._add({ type: 'mine', def, owner, mesh, x, y, z, age: 0, armT: def.arm, armed: false, trig: 0, team: owner.team, life: 90, blink: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // rockets
  // ---------------------------------------------------------------------------------------------------------
  fireRocket(owner, o, d, weapon, lockTarget) {
    const m = this.match, s = weapon.stats;
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), MAT(0x5d6b45, 0.5, 0.4)); body.rotation.x = Math.PI / 2; mesh.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), MAT(s.id === 'skylock' ? 0x33e0ff : 0xc22b2b, 0.5, 0.3)); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.32; mesh.add(tip);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xffb040 })); flame.rotation.x = Math.PI / 2; flame.position.z = 0.36; mesh.add(flame);
    // start slightly ahead and below the eye so it appears from the launcher
    const right = { x: -Math.cos(owner.heading ?? 0), z: Math.sin(owner.heading ?? 0) };
    const sx = o.x + d.x * 0.9 + (owner.isPlayer ? right.x * 0.18 : 0), sy = o.y + d.y * 0.9 - (owner.isPlayer ? 0.14 : 0), sz = o.z + d.z * 0.9 + (owner.isPlayer ? right.z * 0.18 : 0);
    mesh.position.set(sx, sy, sz);
    const sp = s.projSpeed;
    const p = this._add({ type: 'rocket', owner, mesh, def: s, x: sx, y: sy, z: sz, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, speed: sp, target: lockTarget, age: 0, team: owner.team, homing: s.homing || 0 });
    m.sound.at('rocket', sx, sy, sz, { vol: 1.0, ref: 40 });
    m.fx.puff(sx - d.x * 0.5, sy - d.y * 0.5, sz - d.z * 0.5, 8, 1.4, 0xd0d0d0);
    if (owner.isPlayer) { m.fx.flashLight(sx, sy, sz, 4, 0.12, 0xffa040, 18); m.ui.rumble?.(0.8, 1, 160); }
    return p;
  }

  // ---------------------------------------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------------------------------------
  update(dt) {
    const m = this.match, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; let dead = false;
      p.age += dt;
      switch (p.type) {
        case 'grenade': dead = this.updateGrenade(p, dt); break;
        case 'knife': dead = this.updateKnife(p, dt); break;
        case 'mine': dead = this.updateMine(p, dt); break;
        case 'rocket': dead = this.updateRocket(p, dt); break;
        case 'pickupKnife': dead = this.updateStuckKnife(p, dt); break;
        default: dead = true;
      }
      if (dead) { m.scene.remove(p.mesh); L.splice(i, 1); }
    }
  }

  updateGrenade(p, dt) {
    const m = this.match;
    p.fuse -= dt;
    if (p.stuck) {
      const a = p.stuck.actor;
      if (a) { if (!a.alive) { p.stuck = null; p.rest = false; p.vy = 0; } else { p.x = a.body.x + p.stuck.ox; p.y = a.body.y + p.stuck.oy; p.z = a.body.z + p.stuck.oz; } }
    } else if (!p.rest) {
      let rem = dt;
      for (let it = 0; it < 3 && rem > 1e-5; it++) {
        p.vy -= G * rem;
        const dx = p.vx * rem, dy = p.vy * rem, dz = p.vz * rem, dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) break;
        const nx = dx / dist, ny = dy / dist, nz = dz / dist;
        const h = m.level.raycast(p.x, p.y, p.z, nx, ny, nz, dist + 0.05);
        // sticky grenades also stick to robots
        let hitActor = null, ht = 1e9;
        if (p.kind === 'sticky') for (const t of m.hostilesOf(p.owner)) { if (!t.alive || !(t.isActor || t.isTarget)) continue; const r = rayShapes(p.x, p.y, p.z, nx, ny, nz, t.shapes, dist + 0.1); if (r && r.t < ht) { ht = r.t; hitActor = t; } }
        if (hitActor && (!h || ht < h.t)) {
          p.x += nx * ht; p.y += ny * ht; p.z += nz * ht; p.stuck = { actor: hitActor, ox: p.x - hitActor.body.x, oy: p.y - hitActor.body.y, oz: p.z - hitActor.body.z };
          p.fuse = Math.min(p.fuse, 1.6); p.vx = p.vy = p.vz = 0; m.sound.at('stab', p.x, p.y, p.z, { vol: 0.5, pitch: 1.3 }); break;
        }
        if (h) {
          const t = Math.max(0, h.t - 0.04);
          p.x += nx * t; p.y += ny * t; p.z += nz * t;
          if (p.kind === 'sticky') { p.rest = true; p.vx = p.vy = p.vz = 0; p.fuse = Math.min(p.fuse, 2.0); p.stickN = { x: h.nx, y: h.ny, z: h.nz }; m.sound.at('pickup', p.x, p.y, p.z, { vol: 0.35, pitch: 0.6 }); break; }
          // bounce
          const vn = p.vx * h.nx + p.vy * h.ny + p.vz * h.nz, e = 0.42;
          p.vx -= (1 + e) * vn * h.nx; p.vy -= (1 + e) * vn * h.ny; p.vz -= (1 + e) * vn * h.nz;
          const fr = h.ny > 0.7 ? 0.72 : 0.9; p.vx *= fr; p.vz *= fr;
          if (Math.abs(vn) > 2.2) m.sound.bounce(p.x, p.y, p.z);
          if (h.ny > 0.7 && Math.hypot(p.vx, p.vy, p.vz) < 1.4) { p.rest = true; p.vx = p.vy = p.vz = 0; }
          p.spin *= 0.6;
          rem *= 0.5;
        } else { p.x += dx; p.y += dy; p.z += dz; rem = 0; }
      }
    }
    p.mesh.position.set(p.x, p.y + (p.rest ? 0.04 : 0), p.z);
    if (!p.rest && !p.stuck) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.7 * dt; }
    if (p.y < -10) return true;
    if (p.fuse <= 0) { this.detonate(p); return true; }
    return false;
  }

  updateKnife(p, dt) {
    const m = this.match;
    p.vy -= p.gravity * dt;
    const dx = p.vx * dt, dy = p.vy * dt, dz = p.vz * dt, dist = Math.hypot(dx, dy, dz);
    const nx = dx / dist, ny = dy / dist, nz = dz / dist;
    const h = m.level.raycast(p.x, p.y, p.z, nx, ny, nz, dist);
    let hit = null, ht = dist;
    for (const t of m.hostilesOf(p.owner)) {
      if (!t.alive || !t.shapes) continue;
      const r = rayShapes(p.x, p.y, p.z, nx, ny, nz, t.shapes, dist);
      if (r && r.t < ht) { ht = r.t; hit = t; }
    }
    if (p.maxDist != null) { p.travelled = (p.travelled || 0) + dist; }
    if (hit && (!h || ht <= h.t)) {
      p.x += nx * ht; p.y += ny * ht; p.z += nz * ht;
      m.damage(hit, p.dmg, p.owner, { weapon: p.name, head: false, melee: false, dist: Math.hypot(p.x - p.owner.body.x, p.z - p.owner.body.z), thrown: true, point: { x: p.x, y: p.y, z: p.z } });
      m.fx.robotHit(p.x, p.y, p.z, nx, ny, nz, false); m.sound.at('stab', p.x, p.y, p.z, { vol: 0.6 });
      this.dropKnife(p, hit.body.x, hit.body.y + 0.05, hit.body.z, null); return true;
    }
    if (h) {
      p.x += nx * h.t; p.y += ny * h.t; p.z += nz * h.t;
      m.fx.impact(p.x, p.y, p.z, h.nx, h.ny, h.nz, 'spark', 0.6); m.sound.at('pickaxe', p.x, p.y, p.z, { vol: 0.5 });
      // stick into the surface and wait to be picked up
      this.dropKnife(p, p.x - nx * 0.05, p.y - ny * 0.05, p.z - nz * 0.05, { x: nx, y: ny, z: nz }); return true;
    }
    p.x += dx; p.y += dy; p.z += dz;
    p.mesh.position.set(p.x, p.y, p.z);
    _q.setFromUnitVectors(_z, _d.set(nx, ny, nz).negate()); p.mesh.quaternion.copy(_q);
    if ((p.maxDist != null && p.travelled > p.maxDist) || p.y < -10) { this.dropKnife(p, p.x, Math.max(p.y, m.level.floorY(p.x, p.y, p.z, 0.3) + 0.04), p.z, null); return true; }
    return false;
  }
  /** Turn a landed knife into a retrievable pickup. */
  dropKnife(p, x, y, z, dir) {
    const m = this.match, mesh = buildThrowingKnife(); mesh.scale.setScalar(1.2);
    mesh.position.set(x, y, z);
    if (dir) { _q.setFromUnitVectors(_z, _d.set(dir.x, dir.y, dir.z).negate()); mesh.quaternion.copy(_q); } else mesh.rotation.set(Math.PI / 2, rnd(0, 6), 0);
    this._add({ type: 'pickupKnife', owner: p.owner, mesh, x, y, z, kind: p.pickupKind, age: 0, life: 60, team: p.owner.team });
  }
  updateStuckKnife(p, dt) {
    const m = this.match, o = p.owner;
    if (p.age > p.life) return true;
    if (o?.isPlayer && o.alive) {
      const dx = o.body.x - p.x, dz = o.body.z - p.z, dy = o.body.y + 0.9 - p.y;
      if (dx * dx + dz * dz + dy * dy < 1.5) {
        if (p.kind === 'tknife') { const max = LETHALS.tknife.count; if (o.lethal.id === 'tknife' && o.lethal.n < max) { o.lethal.n++; m.sound.ui('pickup', { vol: 0.7 }); m.ui.flashText?.('Throwing knife recovered'); return true; } }
        else if (p.kind === 'blade') { o.bladeReady = true; o.bladeT = 0; m.sound.ui('pickup', { vol: 0.7 }); m.ui.flashText?.('Blade recovered'); return true; }
      }
    }
    return false;
  }

  updateMine(p, dt) {
    const m = this.match;
    p.life -= dt; if (p.life <= 0) return true;
    p.blink += dt;
    const led = p.mesh.userData.led;
    if (p.armT > 0) { p.armT -= dt; if (p.armT <= 0) { p.armed = true; m.sound.mineBeep(p.x, p.y, p.z); } }
    if (led) led.visible = p.armed ? (Math.floor(p.blink * 2) % 2 === 0) : (Math.floor(p.blink * 8) % 2 === 0);
    if (p.trig > 0) { p.trig -= dt; if (p.trig <= 0) { m.explode(p.x, p.y + 0.3, p.z, p.def.radius, p.def.dmg, p.owner, { weapon: p.def.name, min: 0.15 }); return true; } return false; }
    if (!p.armed) return false;
    p.scan = (p.scan || 0) - dt; if (p.scan > 0) return false; p.scan = 0.1;
    for (const t of m.hostilesOf(p.owner)) {
      if (!t.alive || !(t.isActor || t.isTarget)) continue;
      const dx = t.body.x - p.x, dz = t.body.z - p.z, dy = t.body.y - p.y;
      if (dx * dx + dz * dz < p.def.trigger * p.def.trigger && dy > -0.5 && dy < 1.8) { p.trig = 0.35; m.sound.mineBeep(p.x, p.y, p.z); m.sound.at('ui', p.x, p.y, p.z, { vol: 0.8, pitch: 2.4 }); break; }
    }
    return false;
  }

  updateRocket(p, dt) {
    const m = this.match, d = p.def;
    // homing: steer towards the locked streak
    if (p.target && p.target.alive !== false && p.homing > 0) {
      const tx = p.target.lockX() - p.x, ty = p.target.lockY() - p.y, tz = p.target.lockZ() - p.z, tl = Math.hypot(tx, ty, tz) || 1;
      const vl = Math.hypot(p.vx, p.vy, p.vz) || 1, k = clamp(p.homing * dt, 0, 1);
      p.vx += (tx / tl * vl - p.vx) * k; p.vy += (ty / tl * vl - p.vy) * k; p.vz += (tz / tl * vl - p.vz) * k;
      const nl = Math.hypot(p.vx, p.vy, p.vz) || 1; p.vx *= vl / nl; p.vy *= vl / nl; p.vz *= vl / nl;
    }
    // proximity fuse for homing missiles: detonate on a streak that is about to be passed
    if (p.target && p.target.alive !== false && Math.hypot(p.target.lockX() - p.x, p.target.lockY() - p.y, p.target.lockZ() - p.z) < 2.2) {
      const sp = d.splash;
      m.damage(p.target, d.dmg[0][1], p.owner, { weapon: d.name, head: false, dist: Math.hypot(p.x - p.owner.body.x, p.z - p.owner.body.z), point: { x: p.x, y: p.y, z: p.z }, direct: true });
      m.explode(p.x, p.y, p.z, sp.radius, sp.dmg, p.owner, { weapon: d.name, inner: sp.inner, min: sp.min / sp.dmg, skip: p.target });
      return true;
    }
    const dx = p.vx * dt, dy = p.vy * dt, dz = p.vz * dt, dist = Math.hypot(dx, dy, dz), nx = dx / dist, ny = dy / dist, nz = dz / dist;
    const h = m.level.raycast(p.x, p.y, p.z, nx, ny, nz, dist + 0.1);
    let hit = null, ht = dist + 0.1;
    for (const t of m.hostilesOf(p.owner)) {
      if (!t.alive || !t.shapes) continue;
      const r = rayShapes(p.x, p.y, p.z, nx, ny, nz, t.shapes, dist + 0.1);
      if (r && r.t < ht) { ht = r.t; hit = t; }
    }
    m.fx.trail(p.x, p.y, p.z, true);
    let boom = false, bx = 0, by = 0, bz = 0, direct = null;
    if (hit && (!h || ht <= h.t)) { boom = true; bx = p.x + nx * ht; by = p.y + ny * ht; bz = p.z + nz * ht; direct = hit; }
    else if (h) { boom = true; bx = p.x + nx * Math.max(0, h.t - 0.1); by = p.y + ny * Math.max(0, h.t - 0.1); bz = p.z + nz * Math.max(0, h.t - 0.1); }
    else if (p.age > 8 || p.y < -5) return true;
    if (boom) {
      const sp = d.splash;
      if (direct) m.damage(direct, d.dmg[0][1], p.owner, { weapon: d.name, head: false, dist: Math.hypot(bx - p.owner.body.x, bz - p.owner.body.z), point: { x: bx, y: by, z: bz }, direct: true });
      m.explode(bx, by, bz, sp.radius, sp.dmg, p.owner, { weapon: d.name, inner: sp.inner, min: sp.min / sp.dmg, skip: direct });
      return true;
    }
    p.x += dx; p.y += dy; p.z += dz;
    p.mesh.position.set(p.x, p.y, p.z);
    _q.setFromUnitVectors(_z, _d.set(p.vx, p.vy, p.vz).normalize().negate()); p.mesh.quaternion.copy(_q);
    return false;
  }
}
