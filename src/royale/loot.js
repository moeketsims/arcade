// Loot: glowing chests (hold X), floor items, ammo boxes, material bundles, drops from eliminated players.
import * as THREE from 'three';
import { Parts } from './parts.js';
import { ITEMS, ORDER, makeItem, itemName } from './items.js';
import { AMMO, AMMO_TYPES, MATS, RARITY } from './config.js';
import { weaponModel } from './models.js';

const rnd = Math.random, pickW = (list, wf) => { let t = 0; for (const x of list) t += wf(x); let r = rnd() * t; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; };
const FLOOR_R = [0.45, 0.30, 0.15, 0.08, 0.02], CHEST_R = [0.14, 0.28, 0.30, 0.19, 0.09], CAMP_R = [0.08, 0.22, 0.30, 0.25, 0.15];
const rollRarity = tab => { let r = rnd(); for (let i = 0; i < 5; i++) { r -= tab[i]; if (r <= 0) return i; } return 0; };
const WEAPONS = ORDER.filter(i => { const d = ITEMS[i]; return (d.type === 'gun' || (d.type === 'melee' && i !== 'pickaxe') || d.type === 'throwknife') && d.w > 0; });
const CONSUMABLES = ORDER.filter(i => ITEMS[i].type === 'med' || ITEMS[i].type === 'throw');

/** A random weapon item respecting rarity limits. */
export function rollWeapon(tab = FLOOR_R) {
  const id = pickW(WEAPONS, i => ITEMS[i].w); const d = ITEMS[id], r = d.rarity ?? Math.max(d.rar[0], Math.min(d.rar[1], rollRarity(tab)));
  return makeItem(id, r);
}
export const rollConsumable = () => { const id = pickW(CONSUMABLES, i => ITEMS[i].w); return makeItem(id, 0); };

// ---------- geometry ----------
function chestGeos() {
  const wood = 0x8a5a2b, wood2 = 0x9e6a33, gold = 0xffc02e;
  const base = P => { P.box(wood, [0.95, 0.5, 0.62], [0, 0.25, 0]); P.box(0x6f4622, [0.97, 0.05, 0.64], [0, 0.03, 0]); for (const x of [-0.32, 0.32]) P.box(gold, [0.08, 0.52, 0.66], [x, 0.26, 0]); };
  const closed = new Parts(); base(closed);
  closed.box(wood2, [0.95, 0.16, 0.62], [0, 0.58, 0]); closed.box(wood2, [0.95, 0.1, 0.5], [0, 0.68, 0]); for (const x of [-0.32, 0.32]) { closed.box(gold, [0.08, 0.18, 0.66], [x, 0.58, 0]); closed.box(gold, [0.08, 0.1, 0.54], [x, 0.68, 0]); }
  closed.box(gold, [0.14, 0.18, 0.05], [0, 0.5, 0.33]); closed.box(0, [0.4, 0.04, 0.3], [0, 0.74, 0], [0, 0, 0], 'glow');
  const open = new Parts(); base(open);
  open.box(wood2, [0.95, 0.16, 0.62], [0, 0.79, -0.43], [-1.75, 0, 0]); for (const x of [-0.32, 0.32]) open.box(gold, [0.08, 0.18, 0.66], [x, 0.79, -0.43], [-1.75, 0, 0]);
  open.box(0xffe9a0, [0.84, 0.04, 0.52], [0, 0.5, 0], [0, 0, 0], 'glow');
  return { closed: closed.geom('main'), closedGlow: closed.geom('glow'), open: open.geom('main'), openGlow: open.geom('glow') };
}
const mkInst = (geo, mat, cap) => { const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.frustumCulled = false; m.castShadow = false; return m; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Open cylinder whose vertex colours fade from `color` at the base to black (= invisible when added) at the top. */
function beamGeo(color, h, rTop, rBot) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 8, 6, true); g.translate(0, h / 2, 0);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.min(1, Math.max(0, 1 - pos.getY(i) / h)), 1.8); cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); return g;
}
// additive beams skip fog: fogged additive pixels turn into pale pillars in the distance
const beamMat = opacity => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const beamCache = new Map();
function beamMesh(color, h = 4, r = 0.25) {
  const key = color + '|' + h + '|' + r; let m = beamCache.get(key);
  if (!m) { m = new THREE.Mesh(beamGeo(color, h, r * 0.55, r), beamMat(0.55)); beamCache.set(key, m); }
  return m.clone();
}
function ammoMesh(type) {
  const P = new Parts(), c = AMMO[type].color; P.box(0x77815a, [0.36, 0.2, 0.24], [0, 0.1, 0]); P.box(c, [0.38, 0.05, 0.26], [0, 0.2, 0], [0, 0, 0], 'acc');
  for (let i = 0; i < 3; i++) P.cyl(0xe9c468, 0.025, 0.12, [-0.08 + i * 0.08, 0.27, 0], 'y', { seg: 6 });
  const g = P.build(c); g.userData.h = 0.3; return g;
}
function matsMesh(mat) {
  const P = new Parts(), c = MATS[mat].color;
  if (mat === 0) { for (let i = 0; i < 4; i++) P.box(c, [0.7, 0.1, 0.16], [0, 0.05 + i * 0.1, -0.2 + (i % 2) * 0.1], [0, i * 0.2, 0]); P.box(0x8a6a40, [0.7, 0.1, 0.16], [0, 0.45, 0.1]); }
  else if (mat === 1) { for (let i = 0; i < 3; i++) P.box(c, [0.5, 0.18, 0.3], [(i - 1) * 0.1, 0.09 + i * 0.18, 0], [0, i * 0.4, 0]); }
  else { for (let i = 0; i < 3; i++) P.box(c, [0.7, 0.07, 0.12], [0, 0.04 + i * 0.07, -0.12 + i * 0.12], [0, 0.1 * i, 0]); P.cyl(0xaab6c6, 0.07, 0.5, [0.2, 0.1, 0.1], 'x', { seg: 8 }); }
  const g = P.build(c); g.userData.h = 0.4; return g;
}

let DID = 1;
export class Loot {
  constructor(G) {
    this.G = G; this.scene = G.scene; this.group = new THREE.Group(); this.scene.add(this.group);
    const gs = chestGeos(), lit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }), glow = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffd24a, emissiveIntensity: 0.9, roughness: 0.5 });
    this.mClosed = mkInst(gs.closed, lit, 100); this.mClosedGlow = mkInst(gs.closedGlow, glow, 100); this.mOpen = mkInst(gs.open, lit, 100); this.mOpenGlow = mkInst(gs.openGlow, glow, 100);
    this.mBeam = mkInst(beamGeo(0xffd24a, 9, 0.14, 0.3), beamMat(0.3), 100);
    for (const m of [this.mClosed, this.mClosedGlow, this.mOpen, this.mOpenGlow, this.mBeam]) this.group.add(m);
    this.chests = []; this.drops = []; this.grid = new Map(); this.active = new Map(); this.moving = []; this.visT = 0; this.pickT = 0; this.chimeT = 0; this.free = {};
    this.itemsGroup = new THREE.Group(); this.scene.add(this.itemsGroup);
  }
  reset() {
    this.chests.length = 0; this.drops.length = 0; this.grid.clear(); this.moving.length = 0;
    for (const [, v] of this.active) this.itemsGroup.remove(v.mesh); this.active.clear();
    for (const m of [this.mClosed, this.mClosedGlow, this.mOpen, this.mOpenGlow, this.mBeam]) m.count = 0;
  }

  // ---------- chests ----------
  addChest(s) {
    let dx = s.dx ?? 0, dz = s.dz ?? 1; const dl = Math.hypot(dx, dz); if (dl < 1e-6) { dx = 0; dz = 1; } else { dx /= dl; dz /= dl; }
    const c = { x: s.x, y: s.y, z: s.z, dx, dz, opened: false, tier: s.tier || 'house', house: s.house || null, id: DID++, idx: -1 };
    this.chests.push(c); return c;
  }
  rebuildChests() {
    let a = 0, b = 0;
    for (const c of this.chests) {
      const yaw = Math.atan2(c.dx, c.dz); _q.setFromAxisAngle(_up, yaw); _p.set(c.x, c.y, c.z); _s.set(1.15, 1.15, 1.15); _m.compose(_p, _q, _s);
      if (c.opened) { this.mOpen.setMatrixAt(b, _m); this.mOpenGlow.setMatrixAt(b, _m); b++; }
      else { this.mClosed.setMatrixAt(a, _m); this.mClosedGlow.setMatrixAt(a, _m); _s.set(1, 1, 1); this.mBeam.setMatrixAt(a, _m.compose(_p, _q, _s)); a++; }
    }
    this.mClosed.count = this.mClosedGlow.count = this.mBeam.count = a; this.mOpen.count = this.mOpenGlow.count = b;
    for (const m of [this.mClosed, this.mClosedGlow, this.mOpen, this.mOpenGlow, this.mBeam]) m.instanceMatrix.needsUpdate = true;
  }
  openChest(f, c) {
    if (c.opened) return; c.opened = true; this.rebuildChests();
    const G = this.G, p = new THREE.Vector3(c.x, c.y + 0.6, c.z); G.sfx3d('chest', p, 1.3, 40); G.fx.burst(p, 0xffd24a, 26); G.fx.column(p, 0xffd24a, 0.6, 6, 0.7);
    const tab = c.tier === 'house' ? CHEST_R : CAMP_R, items = [];
    const w = rollWeapon(tab); items.push({ item: w });
    const d = ITEMS[w.id]; if (d.type === 'gun') items.push({ ammo: d.ammo, n: Math.round(AMMO[d.ammo].pack * (1 + rnd())) });
    if (rnd() < 0.3) items.push({ item: rollWeapon(tab) });
    items.push({ item: rollConsumable() }); if (rnd() < 0.5) items.push({ item: rollConsumable() });
    if (rnd() < 0.45) items.push({ mats: Math.floor(rnd() * 3), n: 30 + Math.floor(rnd() * 3) * 10 });
    if (d.type !== 'gun' && rnd() < 0.7) { const t = AMMO_TYPES[Math.floor(rnd() * 4)]; items.push({ ammo: t, n: AMMO[t].pack }); }
    items.forEach((it, i) => { const a = (i / items.length) * Math.PI * 2 + rnd() * 0.5, sp = 2.2 + rnd() * 1.4, pos = new THREE.Vector3(c.x + c.dx * 0.6, c.y + 0.8, c.z + c.dz * 0.6); this.spawnDrop(pos, it, { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4.5 + rnd() * 1.5 }); });
    if (f?.isPlayer) G.pad?.rumble(0.4, 0.5, 160);
  }

  // ---------- drops ----------
  _key(x, z) { return Math.floor(x / 16) * 4096 + Math.floor(z / 16); }
  spawnDrop(pos, it, vel = null) {
    const d = { id: DID++, pos: pos.clone(), vy: vel?.vy ?? 0, vx: vel?.vx ?? 0, vz: vel?.vz ?? 0, settled: !vel, age: 0, dead: false, key: 0, rarity: 0 };
    if (it.item) { d.kind = 'item'; d.item = it.item; d.rarity = it.item.rarity; } else if (it.ammo) { d.kind = 'ammo'; d.type = it.ammo; d.n = it.n; } else { d.kind = 'mats'; d.mat = it.mats; d.n = it.n; }
    if (d.settled) d.pos.y = this.G.world.cw.supportAt(d.pos.x, d.pos.z, d.pos.y + 1, 1.2) + 0.05;
    d.key = this._key(d.pos.x, d.pos.z); this.drops.push(d); this._gridAdd(d); if (!d.settled) this.moving.push(d); return d;
  }
  dropItem(pos, item, vel = null) { return this.spawnDrop(pos, { item }, vel || { vy: 2.5 }); }
  _gridAdd(d) { let a = this.grid.get(d.key); if (!a) this.grid.set(d.key, a = []); a.push(d); }
  _gridRemove(d) { const a = this.grid.get(d.key); if (a) { const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); } }
  removeDrop(d) { if (d.dead) return; d.dead = true; this._gridRemove(d); const i = this.drops.indexOf(d); if (i >= 0) { this.drops[i] = this.drops[this.drops.length - 1]; this.drops.pop(); } const mi = this.moving.indexOf(d); if (mi >= 0) this.moving.splice(mi, 1); const a = this.active.get(d); if (a) { this.itemsGroup.remove(a.mesh); this._free(a); this.active.delete(d); } }
  near(x, z, r, fn) {
    const k0 = Math.floor((x - r) / 16), k1 = Math.floor((x + r) / 16), j0 = Math.floor((z - r) / 16), j1 = Math.floor((z + r) / 16);
    for (let i = k0; i <= k1; i++) for (let j = j0; j <= j1; j++) { const a = this.grid.get(i * 4096 + j); if (a) for (let m = 0; m < a.length; m++) fn(a[m]); }
  }

  /** Spawn the initial floor loot. */
  scatter(out, T, occ) {
    for (const s of out.lootSpots) { const r = rnd(); this.spawnDrop(new THREE.Vector3(s.x, s.y + 0.2, s.z), r < 0.6 ? { item: rollWeapon() } : r < 0.78 ? { ammo: AMMO_TYPES[Math.floor(rnd() * 4)], n: 20 } : { item: rollConsumable() }); }
    let n = 0, tries = 0;
    while (n < 90 && tries++ < 800) {
      const a = rnd() * Math.PI * 2, r = 20 + rnd() * 210, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!T.isLand(x, z, 1.8) || !occ.free(x, z) || T.slopeAt(x, z) > 0.4) continue;
      const q = rnd(); const it = q < 0.34 ? { item: rollWeapon() } : q < 0.62 ? { ammo: AMMO_TYPES[Math.floor(rnd() * 5)], n: 12 + Math.floor(rnd() * 18) } : q < 0.9 ? { item: rollConsumable() } : { mats: Math.floor(rnd() * 3), n: 40 };
      this.spawnDrop(new THREE.Vector3(x, T.heightAt(x, z) + 0.2, z), it); n++;
    }
  }
  dropAll(f) {
    const base = f.pos.clone(); base.y += 0.8; let i = 0; const ring = () => { const a = (i++ / 7) * Math.PI * 2 + rnd(), sp = 1.6 + rnd() * 1.5; return { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3.5 + rnd() * 2 }; };
    for (let k = 1; k < 6; k++) { const s = f.inv.slots[k]; if (s) { this.spawnDrop(base, { item: s }, ring()); f.inv.slots[k] = null; } }
    for (const t of AMMO_TYPES) { const have = f.inv.ammo[t]; if (have >= 8) { this.spawnDrop(base, { ammo: t, n: Math.ceil(have * 0.6) }, ring()); f.inv.ammo[t] = 0; } }
    for (let m = 0; m < 3; m++) if (f.inv.mats[m] >= 20) { this.spawnDrop(base, { mats: m, n: Math.ceil(f.inv.mats[m] * 0.5) }, ring()); f.inv.mats[m] = 0; }
  }

  // ---------- interaction ----------
  /** Best interactable (chest or pickup item) near a fighter. */
  findTarget(f) {
    let best = null, bd = 1e9; const px = f.pos.x, py = f.pos.y, pz = f.pos.z, fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    for (const c of this.chests) {
      if (c.opened) continue; const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz); if (d > 2.7 || Math.abs(c.y - py) > 2.2) continue;
      if (f.isPlayer && d > 1.2 && (dx * fx + dz * fz) / Math.max(d, 0.01) < 0.2) continue;
      if (d < bd) { bd = d; best = { kind: 'chest', obj: c, need: f.isPlayer ? 1.1 : 1.0, label: 'Open Chest', d }; }
    }
    this.near(px, pz, 2.4, dr => {
      if (dr.dead || dr.kind !== 'item' || !dr.settled) return; const dx = dr.pos.x - px, dz = dr.pos.z - pz, d = Math.hypot(dx, dz); if (d > 2.3 || Math.abs(dr.pos.y - py) > 2.2) return;
      if (f.isPlayer && d > 1.0 && (dx * fx + dz * fz) / Math.max(d, 0.01) < 0.15) return;
      if (d - 0.4 < bd) { bd = d - 0.4; best = { kind: 'item', obj: dr, need: 0.28, label: itemName(dr.item), d, item: dr.item }; }
    });
    return best;
  }
  interact(f, tgt) {
    if (tgt.kind === 'chest') { this.openChest(f, tgt.obj); return; }
    const dr = tgt.obj; if (dr.dead) return;
    const res = f.pickup(dr.item);
    if (!res.taken) { if (f.isPlayer) this.G.hud?.toast('Inventory full', 1); return; }
    this.G.sfx3d('pickup', f.pos, 0.9, 20); if (f.isPlayer) this.G.pad?.rumble(0.1, 0.2, 50);
    if (res.partial && dr.item.n > 0) { /* leave remainder */ } else this.removeDrop(dr);
    if (res.dropped) this.dropItem(f.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), res.dropped, { vy: 3, vx: Math.sin(f.yaw + 2) * 1.5, vz: Math.cos(f.yaw + 2) * 1.5 });
  }

  // ---------- visuals ----------
  _build(d) {
    const g = new THREE.Group(); let h = 0.2;
    if (d.kind === 'item') { const m = weaponModel(d.item.id, d.item.rarity); const sc = (m.userData.s ?? 1) < 1 ? 1.25 : 1.4; m.scale.setScalar(sc); m.position.y = 0.35; g.userData.model = m; g.add(m); h = 0.5; }
    else if (d.kind === 'ammo') { const m = ammoMesh(d.type); g.add(m); h = 0.3; } else { const m = matsMesh(d.mat); g.add(m); h = 0.4; }
    const col = d.kind === 'item' ? RARITY[d.item.rarity].color : d.kind === 'ammo' ? AMMO[d.type].color : MATS[d.mat].color;
    if (d.kind === 'item') { const b = beamMesh(col, 2.6 + d.item.rarity * 0.6, 0.16); g.add(b); const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ring.position.y = 0.03; g.add(ring); }
    else { const b = beamMesh(col, 1.2, 0.12); g.add(b); }
    return g;
  }
  _free(a) { const k = a.key; (this.free[k] || (this.free[k] = [])).push(a.mesh); }
  _acquire(d) {
    const key = d.kind === 'item' ? d.item.id + '|' + d.item.rarity : d.kind === 'ammo' ? 'a' + d.type : 'm' + d.mat; const list = this.free[key];
    const mesh = list && list.length ? list.pop() : this._build(d); this.itemsGroup.add(mesh); return { mesh, key };
  }
  update(dt, listener) {
    // moving drops (chest pops) fall to the ground
    const cw = this.G.world.cw;
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const d = this.moving[i]; d.age += dt; d.vy -= 20 * dt; const p = d.pos; p.x += d.vx * dt; p.z += d.vz * dt; p.y += d.vy * dt;
      const g = cw.supportAt(p.x, p.z, p.y + 0.3, 0.6) + 0.05;
      if (p.y <= g && d.vy <= 0) { p.y = g; if (d.vy < -4) { d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; } else { d.settled = true; d.vy = d.vx = d.vz = 0; this.moving.splice(i, 1); } }
      const nk = this._key(p.x, p.z); if (nk !== d.key) { this._gridRemove(d); d.key = nk; this._gridAdd(d); }
    }
    // auto pickups (ammo, materials) for every grounded fighter
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 0.12;
      for (const f of this.G.fighters) {
        if (!f.alive || f.state !== 'ground') continue;
        this.near(f.pos.x, f.pos.z, 1.7, d => {
          if (d.dead || d.kind === 'item' || !d.settled) return; const dx = d.pos.x - f.pos.x, dz = d.pos.z - f.pos.z; if (dx * dx + dz * dz > 2.4 || Math.abs(d.pos.y - f.pos.y) > 2) return;
          if (d.kind === 'ammo') { const got = f.addAmmo(d.type, d.n); if (got <= 0) return; d.n -= got; if (f.isPlayer) this.G.hud?.popup(`+${got} ${AMMO[d.type].name} ammo`, d.pos, AMMO[d.type].css); }
          else { f.addMats(d.mat, d.n); if (f.isPlayer) this.G.hud?.popup(`+${d.n} ${MATS[d.mat].name}`, d.pos, MATS[d.mat].css); d.n = 0; }
          this.G.sfx3d('pickup', f.pos, 0.7, 20); if (d.n <= 0) this.removeDrop(d);
        });
      }
    }
    // visuals for drops near the listener
    this.visT -= dt;
    if (this.visT <= 0 && listener) {
      this.visT = 0.25; const R = 75, want = new Set();
      this.near(listener.x, listener.z, R, d => { if (!d.dead && Math.hypot(d.pos.x - listener.x, d.pos.z - listener.z) < R) want.add(d); });
      for (const [d, a] of this.active) if (!want.has(d)) { this.itemsGroup.remove(a.mesh); this._free(a); this.active.delete(d); }
      for (const d of want) if (!this.active.has(d)) this.active.set(d, this._acquire(d));
    }
    const t = this.G.time;
    for (const [d, a] of this.active) { a.mesh.position.set(d.pos.x, d.pos.y + (d.settled ? 0.12 + Math.sin(t * 2.2 + d.id) * 0.06 : 0), d.pos.z); const m = a.mesh.userData.model; if (d.kind === 'item') a.mesh.rotation.y = t * 1.2 + d.id; else a.mesh.rotation.y = d.id; }
    // chest chime: faint sound when close, like a hint
    this.chimeT -= dt;
    if (listener && this.chimeT <= 0 && this.G.sfx.ready) {
      let bd = 1e9; for (const c of this.chests) { if (c.opened) continue; const d = Math.hypot(c.x - listener.x, c.z - listener.z); if (d < bd) bd = d; }
      if (bd < 26) { this.chimeT = 0.9 + bd / 14; this.G.sfx.play('chest', { vol: 0.09 + (1 - bd / 26) * 0.28, pitch: 1.0 + (1 - bd / 26) * 0.2 }); } else this.chimeT = 0.5;
    }
  }
}
