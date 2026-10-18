// Combat resolution: hitscan, projectiles (sniper/rocket/arrow/knife), grenades, explosions, melee and harvesting.
import * as THREE from 'three';
import { ITEMS, damageOf, makeItem } from './items.js';
import { MATS, RARITY } from './config.js';
import { weaponModel } from './models.js';
import { Parts } from './parts.js';

const clamp = THREE.MathUtils.clamp;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

/** iq's ray-capsule intersection. Returns entry t (>0) or -1. */
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba;
  if (a > 1e-9) {
    const h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
      if (y > 0 && y < baba) return t > 0 ? t : -1;
      const px = y <= 0 ? oax : ox - bx, py = y <= 0 ? oay : oy - by, pz = y <= 0 ? oaz : oz - bz;
      const b2 = dx * px + dy * py + dz * pz, c2 = px * px + py * py + pz * pz - r * r, h2 = b2 * b2 - c2;
      if (h2 > 0) { const t2 = -b2 - Math.sqrt(h2); return t2 > 0 ? t2 : -1; }
    }
    return -1;
  }
  return -1;
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz, b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r, h = b * b - c;
  if (h < 0) return -1; const t = -b - Math.sqrt(h); return t > 0 ? t : (c < 0 ? 0 : -1);
}
/** Ray vs a fighter's hit volumes. Returns {t, head} or null. */
export function rayFighter(o, d, maxT, f) {
  const h = f.height(), cx = f.pos.x, cz = f.pos.z, y0 = f.pos.y;
  const vx = cx - o.x, vy = y0 + h * 0.5 - o.y, vz = cz - o.z, t0 = vx * d.x + vy * d.y + vz * d.z;
  if (t0 < -1.5 || t0 > maxT + 1.5) return null;
  const perp2 = vx * vx + vy * vy + vz * vz - t0 * t0; if (perp2 > 1.9 * 1.9) return null;
  const hy = y0 + h - 0.2;
  const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, cx, hy, cz, 0.2);
  const tb = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, cx, y0 + 0.32, cz, cx, Math.max(y0 + 0.4, y0 + h - 0.42), cz, 0.33);
  let t = -1, head = false;
  if (th >= 0 && (tb < 0 || th <= tb + 0.02)) { t = th; head = true; } else if (tb >= 0) t = tb;
  return t >= 0 && t <= maxT ? { t, head } : null;
}

function cone(dir, deg, out) {
  const r = Math.sqrt(Math.random()) * Math.tan(deg * Math.PI / 180), a = Math.random() * 6.283;
  _u.set(Math.abs(dir.y) < 0.95 ? 0 : 1, Math.abs(dir.y) < 0.95 ? 1 : 0, 0).cross(dir).normalize(); _w.copy(dir).cross(_u);
  return out.copy(dir).addScaledVector(_u, Math.cos(a) * r).addScaledVector(_w, Math.sin(a) * r).normalize();
}
const falloff = (d, dist) => { const f = d.falloff; if (!f) return 1; if (dist <= f[0]) return 1; if (dist >= f[1]) return f[2]; return 1 + (f[2] - 1) * (dist - f[0]) / (f[1] - f[0]); };

// ---------- projectile meshes ----------
function makeMesh(kind, rarity = 0) {
  if (kind === 'knife') { const m = weaponModel('tknives', rarity); m.scale.setScalar(1.5); const g = new THREE.Group(); g.add(m); return g; }
  const P = new Parts();
  if (kind === 'rocket') { P.cyl(0x8a949e, 0.1, 0.62, [0, 0, 0], 'z', { seg: 8 }); P.cone(0xd33a3a, 0.1, 0.24, [0, 0, 0.42], 'z', { seg: 8 }); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; P.box(0x3a4048, [0.02, 0.2, 0.18], [Math.cos(a) * 0.11, Math.sin(a) * 0.11, -0.25], [0, 0, a]); } P.cone(0xffc060, 0.1, 0.4, [0, 0, -0.5], '-z', { seg: 6, bucket: 'glow' }); }
  else if (kind === 'gl') { P.sph(0x55604a, 0.13, [0, 0, 0], [1, 1, 1.3]); P.cyl(0x2a2f36, 0.06, 0.08, [0, 0, 0.18], 'z'); P.cone(0xffc060, 0.08, 0.3, [0, 0, -0.25], '-z', { seg: 6, bucket: 'glow' }); }
  else if (kind === 'arrow') { P.seg(0xe6d8b8, 0.03, [0, 0, -0.4], [0, 0, 0.3]); P.cone(0xaab2bd, 0.045, 0.14, [0, 0, 0.37], 'z', { seg: 4 }); P.box(0xd33a3a, [0.18, 0.01, 0.12], [0, 0, -0.38]); P.box(0xd33a3a, [0.01, 0.18, 0.12], [0, 0, -0.38]); }
  else { P.box(0xffffff, [0.05, 0.05, 1.4], [0, 0, 0], [0, 0, 0], 'glow'); }
  return P.build(0xffffff);
}

export class Combat {
  constructor(G) { this.G = G; this.projs = []; this.nades = []; this.free = {}; this.group = new THREE.Group(); G.scene.add(this.group); this.smokes = []; }
  reset() { for (const p of this.projs) this._drop(p); this.projs.length = 0; for (const n of this.nades) this.group.remove(n.mesh); this.nades.length = 0; this.smokes.length = 0; this.G.world.cw.smokes.length = 0; }

  // ============ firing ============
  shoot(f, d, it, o, dir, spreadDeg, charge = 1) {
    const G = this.G, rarity = it.rarity, dmg = damageOf(d, rarity);
    // sound + flash
    if (f.isPlayer) G.sfx.play(d.sound, { vol: d.sound === 'suppressed' ? 0.8 : 0.9 }); else G.sfx3d(d.sound, o, 1, Math.max(14, d.noise * 0.35));
    G.fx.muzzle(o, d.sound === 'suppressed' ? 0.35 : d.cls === 'Shotgun' || d.cls === 'Sniper' ? 1.5 : 1.0, d.sound === 'suppressed' ? 0xb9f1ff : 0xffe0a0);
    if (f.isPlayer) G.pad?.rumble(d.cls === 'Shotgun' || d.id === 'rocket' ? 0.3 : 0.12, d.cls === 'Shotgun' || d.cls === 'Sniper' || d.id === 'rocket' ? 0.8 : 0.35, d.mode === 'auto' ? 40 : 90);
    G.onNoise?.(f, o, d.noise);
    if (d.proj) {
      const p = d.proj, dd = cone(dir, spreadDeg * (d.bloom ? 1 : 0.3), new THREE.Vector3());
      let speed = p.speed, dm = dmg;
      if (d.mode === 'charge') { speed = p.speedMin + (p.speed - p.speedMin) * charge; dm = (d.dmgMin + (d.dmg - d.dmgMin) * charge) * RARITY[rarity].dmg; }
      const kind = d.id === 'rocket' ? 'rocket' : d.id === 'grenadel' ? 'gl' : p.arrow ? 'arrow' : 'bullet';
      this._spawn({ kind, owner: f, def: d, rarity, pos: o.clone(), vel: dd.multiplyScalar(speed).add(f.vel.clone().multiplyScalar(0)), grav: p.grav, life: p.life, dmg: dm, explode: p.explode || null, bounce: !!p.bounce, bounces: 0, head: d.head });
      return;
    }
    const pellets = d.pellets || 1, results = new Map(), tmp = new THREE.Vector3();
    for (let i = 0; i < pellets; i++) this._pellet(f, d, it, o, cone(dir, spreadDeg + (pellets > 1 ? d.spread : 0), tmp), dmg, results);
    for (const [t, r] of results) {
      f.damageDealt += r.sh + r.hp;
      G.onHitConfirmed?.(f, t, r, r.pos);
    }
  }

  _pellet(f, d, it, o, dir, dmg, results) {
    const G = this.G, cw = G.world.cw, range = d.range || 300;
    const hit = cw.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, range, null);
    let bestT = hit ? hit.t : range, tf = null;
    for (const t of G.fighters) {
      if (t === f || !t.alive || t.state === 'bus') continue;
      const r = rayFighter(o, dir, bestT, t); if (r && r.t < bestT) { bestT = r.t; tf = { f: t, head: r.head, t: r.t }; }
    }
    _a.copy(o).addScaledVector(dir, bestT);
    if (d.tracer && d.sound !== 'suppressed' || d.sound === 'suppressed' && bestT > 4) G.fx.tracer(o, _a, d.tracer, d.cls === 'Sniper' ? 0.07 : 0.035, 6 + (d.cls === 'Sniper' ? 6 : 0));
    if (tf) {
      const mul = falloff(d, tf.t) * (tf.head ? d.head : 1), amount = dmg * mul;
      const res = tf.f.damage(amount, { attacker: f, head: tf.head, weapon: d.name, point: _a.clone(), dir: dir.clone() });
      let r = results.get(tf.f); if (!r) { r = { sh: 0, hp: 0, head: false, pos: _a.clone() }; results.set(tf.f, r); }
      r.sh += res.shield; r.hp += res.hp; r.head = r.head || tf.head; r.pos.copy(_a);
      G.fx.spark(_a, 3, 0x9fe8ff, 3, -dir.x, 0.5, -dir.z);
    } else if (hit) this._impact(f, hit, dir, dmg * falloff(d, hit.t) * (d.struct ?? 1), d.id === 'pickaxe' ? 1 : 0);
  }

  /** Bullet/blast hit the world. */
  _impact(f, hit, dir, structDmg, harvest = 0) {
    const G = this.G, p = _b.set(hit.x, hit.y, hit.z), n = _c.set(hit.nx, hit.ny, hit.nz);
    if (hit.water) { G.fx.splash(p, 6); G.sfx3d('land', p, 0.4, 20); return; }
    const s = hit.solid, owner = s ? s.owner : null;
    if (owner && owner.isPiece) {
      const col = owner.tint.getHex(); G.fx.spark(p, 3, 0xffe0a0, 4, n.x, n.y, n.z); G.fx.debris(p, col, 2, 2.5);
      G.world.pieces.damage(owner, structDmg, f, p.clone());
    } else if (owner && owner.isHarv) { G.fx.spark(p, 3, 0xffe0a0, 4, n.x, n.y, n.z); G.fx.debris(p, owner.kind === 'rock' ? 0x9a9a9a : 0x8a6a40, 2, 2); }
    else if (!hit.terrain) { G.fx.spark(p, 3, 0xffe0a0, 4, n.x, n.y, n.z); G.fx.dust(p, 1, 0xaaaaaa, 0.4, n.x, n.y, n.z); }
    else { G.fx.dust(p, 3, 0xa89066, 0.6, n.x, n.y, n.z); G.fx.spark(p, 2, 0xffe0a0, 3, n.x, n.y, n.z); }
  }

  // ============ projectiles ============
  _spawn(p) {
    p.mesh = this._mesh(p.kind, p.rarity); p.mesh.position.copy(p.pos); p.age = 0; this.projs.push(p); this.group.add(p.mesh); return p;
  }
  _mesh(kind, rarity) { const k = kind + (kind === 'knife' ? rarity : ''); const list = this.free[k]; if (list && list.length) { const m = list.pop(); m.visible = true; return m; } const m = makeMesh(kind, rarity); m.userData.k = k; return m; }
  _drop(p) { this.group.remove(p.mesh); (this.free[p.mesh.userData.k] || (this.free[p.mesh.userData.k] = [])).push(p.mesh); }

  update(dt) {
    const G = this.G, cw = G.world.cw;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i]; p.age += dt; let dead = false;
      const speed = p.vel.length(), steps = Math.max(1, Math.ceil(speed * dt / 5)), sdt = dt / steps;
      for (let s = 0; s < steps && !dead; s++) {
        _a.copy(p.pos); p.vel.y -= p.grav * sdt; _b.copy(p.vel).multiplyScalar(sdt); const L = _b.length(); if (L < 1e-6) continue; _n.copy(_b).divideScalar(L);
        const hit = cw.raycast(_a.x, _a.y, _a.z, _n.x, _n.y, _n.z, L, null);
        let bestT = hit ? hit.t : L, tf = null;
        for (const t of G.fighters) {
          if (!t.alive || t.state === 'bus' || (t === p.owner && p.kind !== 'rocket' && p.kind !== 'gl')) continue; if (t === p.owner && p.age < 0.2) continue;
          const r = rayFighter(_a, _n, bestT, t); if (r && r.t < bestT) { bestT = r.t; tf = { f: t, head: r.head, t: r.t }; }
        }
        p.pos.copy(_a).addScaledVector(_n, bestT);
        if (tf) { this._projHitFighter(p, tf); dead = true; }
        else if (hit) { dead = this._projHitWorld(p, hit, _n); if (!dead) { p.pos.addScaledVector(_n, -0.02); } }
        if (p.kind === 'rocket' && !dead && s === steps - 1) { G.fx.smokePuff(p.pos, 0.9, 0.9, 0.7, 0.5, 0.2); G.fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.5, 0.1, 0.12, 1, 0.7, 0.3, 0.9); }
        if (p.kind === 'bullet' && s === steps - 1) G.fx.glow.emit(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.12, 0.02, 0.35, 1, 0.9, 0.55, 0.5);
        if (p.pos.y < -30 || p.age > p.life) { if (p.explode && p.kind !== 'rocket') { this.explode(p.pos, p.explode, p.owner, p.def.name); } dead = true; }
      }
      if (dead) { this._drop(p); this.projs.splice(i, 1); continue; }
      p.mesh.position.copy(p.pos); _w.copy(p.pos).add(p.vel); p.mesh.lookAt(_w);
    }
    // grenades
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i]; n.t += dt;
      const steps = Math.max(1, Math.ceil(n.vel.length() * dt / 3)), sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        n.vel.y -= 22 * sdt; _b.copy(n.vel).multiplyScalar(sdt); const L = _b.length(); if (L < 1e-7) continue; _n.copy(_b).divideScalar(L);
        const hit = cw.raycast(n.pos.x, n.pos.y, n.pos.z, _n.x, _n.y, _n.z, L + 0.1, null);
        if (hit && hit.t <= L + 0.08) {
          const nx = hit.nx, ny = hit.ny, nz = hit.nz, dn = n.vel.x * nx + n.vel.y * ny + n.vel.z * nz;
          n.vel.x -= 1.35 * dn * nx; n.vel.y -= 1.35 * dn * ny; n.vel.z -= 1.35 * dn * nz; const fr = ny > 0.5 ? 0.36 : 0.75; n.vel.x *= fr; n.vel.z *= fr; if (ny > 0.5 && Math.abs(n.vel.y) < 2.5) n.vel.y = 0;
          n.pos.set(hit.x + nx * 0.12, hit.y + ny * 0.12, hit.z + nz * 0.12); if (Math.abs(dn) > 4) G.sfx3d('footstep', n.pos, 0.8, 20);
        } else n.pos.addScaledVector(_n, L);
      }
      n.mesh.position.copy(n.pos); n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6;
      if (n.t >= n.def.fuse) { this._detonate(n); this.group.remove(n.mesh); this.nades.splice(i, 1); }
    }
    // smoke clouds
    const cws = G.world.cw.smokes;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t += dt; s.puff -= dt;
      if (s.puff <= 0 && s.t < s.time - 4) { s.puff = 0.22; for (let k = 0; k < 2; k++) G.fx.smokePuff({ x: s.x + (Math.random() - 0.5) * s.r * 1.4, y: s.y + 0.4 + Math.random() * s.r * 0.8, z: s.z + (Math.random() - 0.5) * s.r * 1.4 }, s.r * 0.95, 4.5, 0.82, 0.55, 0.08); }
      if (s.t >= s.time) { this.smokes.splice(i, 1); const j = cws.indexOf(s.cloud); if (j >= 0) cws.splice(j, 1); }
    }
  }

  _projHitFighter(p, tf) {
    const G = this.G, f = p.owner, d = p.def;
    if (p.explode) { this.explode(p.pos, p.explode, f, d.name, tf.f); return; }
    const mul = tf.head ? (d.head || 1) : 1, amount = p.dmg * mul;
    const res = tf.f.damage(amount, { attacker: f, head: tf.head, weapon: d.name, point: p.pos.clone(), dir: p.vel.clone().normalize() });
    f.damageDealt += res.shield + res.hp; G.onHitConfirmed?.(f, tf.f, { sh: res.shield, hp: res.hp, head: tf.head }, p.pos);
    G.fx.spark(p.pos, 5, 0x9fe8ff, 4); if (p.kind === 'knife') { G.sfx3d('stab', p.pos, 1, 25); G.loot.dropItem(p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), makeItem('tknives', p.rarity, 1), { vy: 2 }); }
    else G.sfx3d('hit', p.pos, 1, 25);
  }
  _projHitWorld(p, hit, dir) {
    const G = this.G;
    if (p.explode) {
      _a.set(hit.x + hit.nx * 0.3, hit.y + hit.ny * 0.3, hit.z + hit.nz * 0.3); this.explode(_a, p.explode, p.owner, p.def.name); return true;
    }
    this._impact(p.owner, hit, dir, p.dmg * (p.def.struct ?? 1) * (p.kind === 'knife' ? 0.3 : 1));
    if (p.kind === 'knife') { _a.set(hit.x + hit.nx * 0.25, hit.y + hit.ny * 0.25, hit.z + hit.nz * 0.25); if (hit.water) { return true; } G.loot.dropItem(_a.clone(), makeItem('tknives', p.rarity, 1), { vy: 1 }); G.sfx3d('stab', _a, 0.7, 20); }
    return true;
  }

  // ============ throwables ============
  throwItem(f, id, hand, dir, aimPoint) {
    const d = ITEMS[id], G = this.G;
    _w.copy(aimPoint).sub(hand); const dist = _w.length(); const dd = dist > 2 ? _w.divideScalar(dist) : dir.clone();
    if (id === 'tknives') {
      const rarity = f.inv.slots.find(s => s && s.id === 'tknives')?.rarity ?? 1;
      const v = dd.clone().multiplyScalar(d.proj.speed); this._spawn({ kind: 'knife', owner: f, def: d, rarity, pos: hand.clone(), vel: v, grav: d.proj.grav, life: d.proj.life, dmg: damageOf(d, rarity), head: d.head, explode: null });
      G.sfx3d('knife', hand, 1, 20); if (f.isPlayer) G.pad?.rumble(0.1, 0.2, 60); return;
    }
    const mesh = weaponModel(id, d.rarity ?? 0); mesh.scale.setScalar(1.6); const g = new THREE.Group(); g.add(mesh); g.position.copy(hand); this.group.add(g);
    // ballistic throw that lands near the aim point (fixed 29 degree launch angle)
    const G0 = 22, th = 0.5, dx = aimPoint.x - hand.x, dz = aimPoint.z - hand.z, gy = G.world.cw.supportAt(aimPoint.x, aimPoint.z, aimPoint.y + 0.5, 1.2), dy = Math.min(aimPoint.y, gy + 0.25) - hand.y; let R = Math.hypot(dx, dz); const hx = R > 0.01 ? dx / R : Math.sin(f.yaw), hz = R > 0.01 ? dz / R : Math.cos(f.yaw);
    R = clamp(R, 2.5, 34); const den = 2 * Math.cos(th) ** 2 * (R * Math.tan(th) - dy); let sp = den > 1 ? Math.sqrt(G0 * R * R / den) : 20; sp = clamp(sp, 8, 30);
    const v = new THREE.Vector3(hx * sp * Math.cos(th), sp * Math.sin(th), hz * sp * Math.cos(th)); v.x += f.vel.x * 0.35; v.z += f.vel.z * 0.35;
    this.nades.push({ id, def: d, owner: f, pos: hand.clone(), vel: v, t: 0, mesh: g });
    if (f.isPlayer) G.pad?.rumble(0.1, 0.25, 70);
  }
  _detonate(n) {
    const G = this.G, d = n.def;
    if (d.explode) { this.explode(n.pos, d.explode, n.owner, d.name, null, d.kind); if (d.kind === 'impulse') { G.fx.ring(n.pos, 0x5fb4ff, d.explode.r * 1.4, 0.5); G.fx.ring({ x: n.pos.x, y: n.pos.y + 0.2, z: n.pos.z }, 0x9fe8ff, d.explode.r * 0.9, 0.4); } }
    else if (d.smoke) {
      const cloud = { x: n.pos.x, y: n.pos.y + 1.6, z: n.pos.z, r: d.smoke.r, until: 0 }; G.world.cw.smokes.push(cloud);
      this.smokes.push({ x: n.pos.x, y: n.pos.y, z: n.pos.z, r: d.smoke.r, t: 0, time: d.smoke.time, puff: 0, cloud });
      for (let i = 0; i < 28; i++) G.fx.smokePuff({ x: n.pos.x + (Math.random() - 0.5) * 3, y: n.pos.y + 0.3 + Math.random() * 2.5, z: n.pos.z + (Math.random() - 0.5) * 3 }, d.smoke.r * 0.9, 5, 0.8, 0.6, 0.15);
      G.sfx3d('wind', n.pos, 1, 40);
    }
  }

  // ============ explosions ============
  /** spec: {r, dmg, self, struct, knock}. */
  explode(pos, spec, owner, name, direct = null, kind = 'frag') {
    const G = this.G, p = pos.clone(), r = spec.r;
    const lis = G.listenerPos, dl = lis ? lis.distanceTo(p) : 50;
    if (kind !== 'impulse') G.fx.explosion(p, r * 0.9, clamp(1.4 - dl / 60, 0, 1.4)); else G.fx.glow.emit(p.x, p.y, p.z, 0, 0, 0, r, r * 1.2, 0.3, 0.5, 0.8, 1, 0.8);
    G.sfx3d(kind === 'impulse' ? 'shieldBreak' : 'explosion', p, 1.3, 60); G.onNoise?.(owner, p, 150);
    if (dl < 40 && G.pad) G.pad.rumble(0.8, 1, 260);
    for (const t of G.fighters) {
      if (!t.alive || t.state === 'bus') continue;
      t.center(_c); const dx = _c.x - p.x, dy = _c.y - p.y + 0.3, dz = _c.z - p.z, dist = Math.hypot(dx, dy, dz);
      if (dist > r + 0.6) continue;
      let k = Math.pow(clamp(1 - Math.max(0, dist - 0.6) / r, 0, 1), 0.8);
      if (t !== direct && G.world.cw.raycast(p.x, p.y + 0.3, p.z, dx / dist, dy / dist, dz / dist, Math.max(0.1, dist - 0.4), null)) k *= 0.35;
      let dmg = spec.dmg * k * (t === owner ? spec.self : 1);
      if (dmg > 0.5) { const res = t.damage(dmg, { attacker: owner, weapon: name, point: _c.clone(), kind: 'explosion' }); if (owner && owner !== t) { owner.damageDealt += res.shield + res.hp; G.onHitConfirmed?.(owner, t, { sh: res.shield, hp: res.hp, head: false }, _c.clone()); } }
      if (spec.knock && k > 0.05) { const m = spec.knock * k / Math.max(0.5, dist); t.vel.x += dx * m; t.vel.z += dz * m; t.vel.y = Math.max(t.vel.y, 0) + (3 + spec.knock * 0.25) * k; t.grounded = false; if (t.state === 'ground') t.dashT = 0; }
    }
    // structures
    if (spec.struct) {
      for (const pc of [...G.world.pieces.all]) {
        const dx = pc.x - p.x, dz = pc.z - p.z, dy = pc.y + 1.2 - p.y, dist = Math.hypot(dx, dy, dz); if (dist > r + 2.2) continue;
        G.world.pieces.damage(pc, spec.dmg * spec.struct * clamp(1 - Math.max(0, dist - 2) / (r + 1), 0.15, 1), owner, p.clone());
      }
      for (const h of G.world.props.harvs) {
        if (h.dead || (h.kind !== 'crate' && h.kind !== 'hay' && h.kind !== 'barrel' && h.kind !== 'car')) continue;
        const dist = Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z); if (dist < r) G.world.props.hit(h, spec.dmg * spec.struct * (1 - dist / r) * 0.5, owner, p.clone());
      }
    }
  }

  // ============ melee / harvesting ============
  melee(f, d, it) {
    const G = this.G, cw = G.world.cw, rarity = it.rarity, dmg = damageOf(d, rarity);
    const [fx, fz] = [Math.sin(f.yaw), Math.cos(f.yaw)], eye = f.eye(_a), fwdv = _b.set(fx, 0, fz);
    let hitSomething = false;
    // fighters in a cone
    const cands = [];
    for (const t of G.fighters) {
      if (t === f || !t.alive || t.state === 'bus') continue;
      t.center(_c); const dx = _c.x - f.pos.x, dz = _c.z - f.pos.z, dist = Math.hypot(dx, dz); if (dist > d.reach + 0.45 || Math.abs(_c.y - (f.pos.y + 0.9)) > 2.2) continue;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / Math.max(dist, 1e-4), -1, 1)) * 180 / Math.PI; if (ang > d.arc / 2 + (dist < 1 ? 60 : 0)) continue;
      if (cw.blocked(eye.x, eye.y, eye.z, _c.x, _c.y, _c.z, false)) continue; cands.push({ t, dist });
    }
    cands.sort((a, b) => a.dist - b.dist);
    const maxTargets = d.arc > 100 ? 3 : 1;
    for (let i = 0; i < Math.min(maxTargets, cands.length); i++) {
      const t = cands[i].t; let amount = dmg; if (d.backstab) { const [tx, tz] = [Math.sin(t.bodyYaw), Math.cos(t.bodyYaw)], vx = f.pos.x - t.pos.x, vz = f.pos.z - t.pos.z; if (tx * vx + tz * vz < -0.2) amount *= d.backstab; }
      const res = t.damage(amount, { attacker: f, weapon: d.name, point: t.center(new THREE.Vector3()), dir: new THREE.Vector3(fx, 0, fz) });
      f.damageDealt += res.shield + res.hp; G.onHitConfirmed?.(f, t, { sh: res.shield, hp: res.hp, head: false }, t.center(new THREE.Vector3()));
      G.fx.spark(t.center(_c), 6, 0xffffff, 5); G.sfx3d('stab', t.pos, 1, 20); hitSomething = true; t.vel.x += fx * 3; t.vel.z += fz * 3;
    }
    // world (structures / harvestables) via a small fan of rays
    if (!(d.arc > 100 && hitSomething) || d.harvest) {
      let best = null;
      // the crosshair ray wins; the surrounding fan only helps when it misses
      for (const [yo, po] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.35], [0, -0.35], [0, -0.7]]) {
        const yaw = f.yaw + yo, pitch = clamp(f.pitch + po - 0.1, -1.2, 1.2), dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
        const h = cw.raycast(eye.x, eye.y - 0.1, eye.z, dx, dy, dz, d.reach + 0.3, { bullet: false });
        if (h && (!best || h.t < best.t)) best = h;
        if (best && yo === 0 && po === 0) break;
      }
      if (best && !(hitSomething && !d.harvest)) {
        const s = best.solid, owner = s ? s.owner : null, p = new THREE.Vector3(best.x, best.y, best.z), n = new THREE.Vector3(best.nx, best.ny, best.nz);
        if (owner && owner.isHarv && d.harvest) {
          const r = G.world.props.hit(owner, d.dmg * d.harvest, f, p); this.gather(f, r.mat, r.amount, p);
          G.sfx3d('pickaxe', p, 1, 25); G.fx.spark(p, 4, 0xffe9b0, 4, n.x, n.y, n.z); if (owner.kind === 'tree') G.fx.leaves(p, 4); else G.fx.debris(p, owner.kind === 'rock' ? 0x9a9a9a : 0x8a6a40, 4, 3);
          hitSomething = true;
        } else if (owner && owner.isPiece) {
          const col = owner.tint.getHex(), amount = dmg * (d.struct || 1); const wasStatic = owner.isStatic, mat = owner.mat;
          const destroyed = G.world.pieces.damage(owner, amount, f, p);
          if (d.harvest && (wasStatic)) this.gather(f, mat, destroyed ? 20 : 8, p);
          G.sfx3d('pickaxe', p, 1, 25); G.fx.spark(p, 4, 0xffe9b0, 4, n.x, n.y, n.z); G.fx.debris(p, col, 4, 3); hitSomething = true;
        } else if (owner && owner.isHarv) { G.sfx3d('pickaxe', p, 0.8, 25); G.fx.spark(p, 3, 0xffe9b0, 4, n.x, n.y, n.z); hitSomething = true; }
        else if (best.terrain || s) { G.sfx3d('pickaxe', p, 0.6, 25); G.fx.dust(p, 3, 0xa89066, 0.5, n.x, n.y, n.z); hitSomething = true; }
      }
    }
    if (f.isPlayer && hitSomething) G.pad?.rumble(0.3, 0.5, 90);
    return hitSomething;
  }
  gather(f, mat, n, p) {
    if (!n) return; f.addMats(mat, n);
    if (f.isPlayer) { this.G.hud?.popup(`+${n} ${MATS[mat].name}`, p, MATS[mat].css); this.G.sfx.play('pickup', { vol: 0.35 }); }
  }
  dashSlash(f, d, it) {
    const G = this.G, dmg = d.dash.dmg * RARITY[it.rarity].dmg, [fx, fz] = [Math.sin(f.yaw), Math.cos(f.yaw)];
    for (const t of G.fighters) {
      if (t === f || !t.alive || t.state === 'bus') continue;
      const dx = t.pos.x - f.pos.x, dz = t.pos.z - f.pos.z, along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx);
      if (along < -0.5 || along > d.dash.dist + 1 || side > 1.7) continue;
      const res = t.damage(dmg, { attacker: f, weapon: d.name, point: t.center(new THREE.Vector3()) });
      f.damageDealt += res.shield + res.hp; G.onHitConfirmed?.(f, t, { sh: res.shield, hp: res.hp, head: false }, t.center(new THREE.Vector3())); G.fx.spark(t.center(_c), 8, 0x9fe8ff, 6);
    }
    for (let i = 0; i < 10; i++) { const k = i / 9 * d.dash.dist; G.fx.glow.emit(f.pos.x + fx * k, f.pos.y + 1.1, f.pos.z + fz * k, 0, 0.5, 0, 0.6, 0.1, 0.35, 0.5, 0.9, 1, 0.8); }
  }
}
