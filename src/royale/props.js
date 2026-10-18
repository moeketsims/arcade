// Instanced world props: trees, rocks, bushes, flowers, cars, plus a generic box "decor" set. Trees/rocks/cars/crates are harvestable.
import * as THREE from 'three';
import { Parts } from './parts.js';
import { fbm, smoothstep, mulberry32, hash2 } from './noise.js';
import { makeBox } from './colliders.js';

// ---------- coarse occupancy grid so props stay out of buildings ----------
export class Occupancy {
  constructor(half = 330, cell = 2) { this.half = half; this.cell = cell; this.n = Math.ceil(half * 2 / cell); this.g = new Uint8Array(this.n * this.n); }
  mark(minX, minZ, maxX, maxZ, margin = 0, v = 1) {
    const i0 = Math.max(0, Math.floor((minX - margin + this.half) / this.cell)), i1 = Math.min(this.n - 1, Math.floor((maxX + margin + this.half) / this.cell));
    const j0 = Math.max(0, Math.floor((minZ - margin + this.half) / this.cell)), j1 = Math.min(this.n - 1, Math.floor((maxZ + margin + this.half) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.g[j * this.n + i] = v;
  }
  markCircle(cx, cz, r, v = 1) { this.mark(cx - r, cz - r, cx + r, cz + r, 0, v); }
  free(x, z) { const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell); return i < 0 || j < 0 || i >= this.n || j >= this.n ? false : this.g[j * this.n + i] === 0; }
  /** True when every cell overlapping the rectangle is free. */
  freeRect(minX, minZ, maxX, maxZ) {
    const i0 = Math.floor((minX + this.half) / this.cell), i1 = Math.floor((maxX + this.half) / this.cell), j0 = Math.floor((minZ + this.half) / this.cell), j1 = Math.floor((maxZ + this.half) / this.cell);
    if (i0 < 0 || j0 < 0 || i1 >= this.n || j1 >= this.n) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.g[j * this.n + i]) return false;
    return true;
  }
  reset() { this.g.fill(0); }
}

// ---------- geometry ----------
const c3 = hex => new THREE.Color(hex);
function treeGeos() {
  const pine = new Parts(); pine.cyl(0x6b4a2c, 0.24, 2.4, [0, 1.2, 0], 'y', { seg: 6, r2: 0.18 });
  [[1.9, 2.6, 2.0, 0x2f7d3a], [1.5, 2.4, 3.5, 0x2a7034], [1.05, 2.2, 5.0, 0x276a31], [0.6, 1.4, 6.4, 0x2f7d3a]].forEach(([r, h, y, c]) => pine.cone(c, r, h, [0, y + h / 2, 0], 'y', { seg: 7 }));
  const oak = new Parts(); oak.cyl(0x6e4b2e, 0.3, 3.0, [0, 1.5, 0], 'y', { seg: 6, r2: 0.22 });
  [[2.0, [0, 4.1, 0], 0x4aa04a], [1.5, [1.1, 3.4, 0.5], 0x3f9444], [1.4, [-1.0, 3.6, -0.6], 0x55ab4e], [1.3, [0.2, 5.0, -0.2], 0x4aa04a]].forEach(([r, p, c]) => oak.sph(c, r, p, [1, 0.85, 1], { seg: 8 }));
  const palm = new Parts(); const pts = [[0, 0, 0], [0.15, 1.6, 0.05], [0.4, 3.2, 0.1], [0.8, 4.6, 0.1], [1.3, 5.6, 0.1]];
  for (let i = 0; i < pts.length - 1; i++) palm.seg(i % 2 ? 0x8a6a46 : 0x7a5a3a, 0.34 - i * 0.04, pts[i], pts[i + 1]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); palm.seg(i % 2 ? 0x3f9a45 : 0x3a8f40, 0.3, [1.3, 5.7, 0.1], [1.3 + dx * 2.3, 5.1, 0.1 + dz * 2.3], { thickY: 0.05 }); }
  const bush = new Parts(); [[0.7, [0, 0.45, 0], 0x3a8f3e], [0.55, [0.6, 0.35, 0.2], 0x439a45], [0.5, [-0.5, 0.33, -0.2], 0x358a3b]].forEach(([r, p, c]) => bush.sph(c, r, p, [1, 0.8, 1], { seg: 6 }));
  const flower = new Parts(); flower.cyl(0x3b8a3a, 0.04, 1.1, [0, 0.55, 0], 'y', { seg: 4 }); flower.cyl(0xf7c52a, 0.26, 0.07, [0, 1.12, 0.06], 'z', { seg: 8 }); flower.cyl(0x5a3a1a, 0.11, 0.09, [0, 1.12, 0.07], 'z', { seg: 6 });
  return { pine: pine.geom(), oak: oak.geom(), palm: palm.geom(), bush: bush.geom(), flower: flower.geom() };
}
function rockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail); const rng = mulberry32(seed), pos = g.attributes.position;
  const disp = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`; if (!disp.has(k)) disp.set(k, 0.78 + rng() * 0.4);
    const d = disp.get(k); pos.setXYZ(i, pos.getX(i) * d * 1.15, pos.getY(i) * d * 0.8, pos.getZ(i) * d);
  }
  g.computeVertexNormals();
  const n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = 0.78 + 0.22 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g;
}
function carGeos() {
  const body = new Parts(); body.box(0xffffff, [4.2, 0.75, 1.9], [0, 0.78, 0]); body.box(0xffffff, [2.3, 0.7, 1.75], [-0.2, 1.45, 0]); body.box(0xdddddd, [0.3, 0.2, 1.9], [2.1, 0.62, 0]);
  const parts = new Parts();
  for (const [x, z] of [[1.35, 0.95], [-1.35, 0.95], [1.35, -0.95], [-1.35, -0.95]]) parts.cyl(0x15181d, 0.42, 0.32, [x, 0.42, z], 'z', { seg: 10 });
  parts.box(0x7fc8ff, [2.0, 0.5, 1.8], [-0.2, 1.47, 0]); parts.box(0xfff1b0, [0.1, 0.18, 0.4], [2.12, 0.85, 0.6]); parts.box(0xfff1b0, [0.1, 0.18, 0.4], [2.12, 0.85, -0.6]); parts.box(0xcc2222, [0.1, 0.16, 0.4], [-2.12, 0.85, 0.6]); parts.box(0xcc2222, [0.1, 0.16, 0.4], [-2.12, 0.85, -0.6]);
  return { body: body.geom(), parts: parts.geom() };
}

class Inst {
  constructor(geo, mat, cap, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = shadow; this.mesh.receiveShadow = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); this.cap = cap;
  }
  add(matrix, color = null) { if (this.mesh.count >= this.cap) return -1; const i = this.mesh.count++; this.mesh.setMatrixAt(i, matrix); this.mesh.setColorAt(i, color || c3(0xffffff)); return i; }
  finish() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const mat4 = (x, y, z, ry, sx, sy = sx, sz = sx) => _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, ry), _s.set(sx, sy, sz));

export class Props {
  constructor(scene, cw, terrain) {
    this.scene = scene; this.cw = cw; this.T = terrain; this.group = new THREE.Group(); scene.add(this.group); this.sets = {}; this.harvs = []; this.onHit = null; this.onBreak = null;
    const lit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const g = treeGeos(), rg = [rockGeo(11), rockGeo(23), rockGeo(37, 2)], cg = carGeos();
    const add = (name, geo, cap, mat = lit, shadow = true) => { const s = new Inst(geo, mat, cap, shadow); this.sets[name] = s; this.group.add(s.mesh); return s; };
    add('pine', g.pine, 900); add('oak', g.oak, 500); add('palm', g.palm, 120); add('bush', g.bush, 420, lit, false); add('flower', g.flower, 700, lit, false);
    add('rock0', rg[0], 160); add('rock1', rg[1], 160); add('rock2', rg[2], 120);
    add('carBody', cg.body, 24, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 })); add('carParts', cg.parts, 24, lit);
    this.cars = [];
  }
  reset() {
    for (const s of Object.values(this.sets)) { s.mesh.count = 0; }
    for (const h of this.harvs) if (h.solid) this.cw.remove(h.solid);
    this.harvs.length = 0; this.cars.length = 0;
  }
  finish() { for (const s of Object.values(this.sets)) s.finish(); }

  _harv(o) { const h = { isHarv: true, hp: o.hp, maxHp: o.hp, dead: false, ...o }; this.harvs.push(h); if (h.solid) h.solid.owner = h; return h; }

  /** Generate the natural props. occ = Occupancy of building footprints. */
  generate(rng, occ) {
    const T = this.T, taken = new Set();
    const spot = (x, z, cell) => { const k = Math.floor(x / cell) * 4096 + Math.floor(z / cell); if (taken.has(k)) return false; taken.add(k); return true; };
    const okGround = (x, z, minH, maxSlope) => { const h = T.heightAt(x, z); return h > minH && T.slopeAt(x, z) < maxSlope; };
    const nearPoi = (x, z, k = 1) => T.pois.some(p => Math.hypot(p.x - x, p.z - z) < p.flat * k);
    // trees
    let trees = 0, tries = 0;
    while (trees < 760 && tries++ < 9000) {
      const x = (rng() - 0.5) * 520, z = (rng() - 0.5) * 520;
      const f = fbm(x * 0.011 + 40, z * 0.011 - 20, 3, 77), dens = 0.1 + 0.9 * smoothstep(0.46, 0.62, f);
      if (rng() > dens) continue;
      const h = T.heightAt(x, z);
      if (h < 1.9 || h > 17 || T.slopeAt(x, z) > 0.42) continue;
      if (T.roadDist(x, z) < 5.5 || !occ.free(x, z) || T.fieldAt(x, z)) continue;
      const poiD = Math.min(...T.pois.map(p => Math.hypot(p.x - x, p.z - z) - p.flat));
      if (poiD < 4 && rng() < 0.97) continue;
      if (T.sites.some(s => Math.hypot(s.x - x, s.z - z) < 12)) continue;
      if (!spot(x, z, 4.5)) continue;
      const pine = h > 7 ? rng() < 0.75 : rng() < 0.5, s = 0.8 + rng() * 0.8, name = pine ? 'pine' : 'oak';
      const idx = this.sets[name].add(mat4(x, h - 0.15, z, rng() * 6.28, s, s * (0.9 + rng() * 0.3), s), c3(0xffffff).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.12));
      const solid = makeBox(x - 0.32 * s, h - 0.2, z - 0.32 * s, x + 0.32 * s, h + 6, z + 0.32 * s, null, { walk: false });
      this.cw.add(solid); this._harv({ kind: 'tree', mat: 0, per: 12, hp: 100, solid, set: name, idx, x, y: h + 1.5, z, size: s }); trees++;
    }
    // palms on the beaches
    let palms = 0; tries = 0;
    while (palms < 70 && tries++ < 6000) {
      const a = rng() * 6.283, r = 140 + rng() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r, h = T.heightAt(x, z);
      if (h < 0.55 || h > 1.6 || !occ.free(x, z) || !spot(x, z, 6)) continue;
      const s = 0.9 + rng() * 0.5, idx = this.sets.palm.add(mat4(x, h - 0.1, z, rng() * 6.28, s));
      const solid = makeBox(x - 0.3, h, z - 0.3, x + 0.3, h + 5, z + 0.3, null, { walk: false }); this.cw.add(solid); this._harv({ kind: 'tree', mat: 0, per: 12, hp: 100, solid, set: 'palm', idx, x, y: h + 1.5, z, size: s }); palms++;
    }
    // rocks
    const rock = (x, z, s, big = false) => {
      const h = T.heightAt(x, z), v = Math.floor(rng() * 3), name = 'rock' + v, idx = this.sets[name].add(mat4(x, h + s * 0.2, z, rng() * 6.28, s * (0.9 + rng() * 0.4), s * (0.8 + rng() * 0.5), s), c3(0xffffff).offsetHSL(0, 0, (rng() - 0.5) * 0.15));
      const e = s * 0.75, solid = makeBox(x - e, h - 0.3, z - e, x + e, h + s * 0.95, z + e); this.cw.add(solid);
      this._harv({ kind: 'rock', mat: 1, per: big ? 18 : 12, hp: big ? 220 : 140, solid, set: name, idx, x, y: h + s * 0.6, z, size: s });
    };
    // a rock only fits where its whole footprint (plus a walking margin) is clear of buildings, doorways and other props
    const rockFits = (x, z, s) => { const e = s * 0.75 + 1.4; return occ.freeRect(x - e, z - e, x + e, z + e); };
    const rockMark = (x, z, s) => { const e = s * 0.75; occ.mark(x - e, z - e, x + e, z + e, 0.4); };
    let rocks = 0; tries = 0;
    while (rocks < 100 && tries++ < 6000) {
      const x = (rng() - 0.5) * 520, z = (rng() - 0.5) * 520, s = 1 + rng() * rng() * 2.4;
      if (!okGround(x, z, 0.9, 0.7) || !rockFits(x, z, s) || T.roadDist(x, z) < 4 || !spot(x, z, 6)) continue;
      const nr = Math.min(...T.pois.map(p => Math.hypot(p.x - x, p.z - z) - p.flat)); if (nr < 3) continue;
      rock(x, z, s); rockMark(x, z, s); rocks++;
    }
    const q = T.poi('quarry');
    if (q) for (let i = 0, placedQ = 0; i < 90 && placedQ < 22; i++) { const a = rng() * 6.283, r = 12 + rng() * (q.flat - 8), x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r, s = 2.2 + rng() * 3.4; if (!rockFits(x, z, s) || !spot(x, z, 3)) continue; rock(x, z, s, true); rockMark(x, z, s); placedQ++; }
    // bushes
    let bushes = 0; tries = 0;
    while (bushes < 330 && tries++ < 5000) {
      const x = (rng() - 0.5) * 520, z = (rng() - 0.5) * 520, h = T.heightAt(x, z);
      if (h < 1.8 || T.slopeAt(x, z) > 0.5 || !occ.free(x, z) || T.fieldAt(x, z)) continue;
      this.sets.bush.add(mat4(x, h - 0.05, z, rng() * 6.28, 0.8 + rng() * 0.7), c3(0xffffff).offsetHSL((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.1)); bushes++;
    }
    // sunflowers
    for (const f of T.fields) {
      if (f.kind !== 'sun') continue;
      for (let x = f.x0 + 1; x < f.x1; x += 2.2) for (let z = f.z0 + 0.8; z < f.z1; z += 1.6) {
        const h = T.heightAt(x, z), a = hash2(Math.floor(x * 7), Math.floor(z * 7), 5) * 6.28;
        this.sets.flower.add(mat4(x + Math.cos(a) * 0.3, h, z + Math.sin(a) * 0.3, a, 0.9 + hash2(Math.floor(x), Math.floor(z), 8) * 0.5));
      }
    }
  }

  /** A car at (x,z); rot 0 = along X, 1 = along Z. */
  car(x, z, rot, colorHex, rng) {
    const T = this.T, h = Math.max(T.heightAt(x, z), T.heightAt(x + 2, z), T.heightAt(x - 2, z), T.heightAt(x, z + 2), T.heightAt(x, z - 2)), ry = rot ? Math.PI / 2 : 0;
    const body = this.sets.carBody.add(mat4(x, h, z, ry, 1), c3(colorHex)), parts = this.sets.carParts.add(mat4(x, h, z, ry, 1));
    const hx = rot ? 1.05 : 2.15, hz = rot ? 2.15 : 1.05, solid = makeBox(x - hx, h, z - hz, x + hx, h + 2.0, z + hz); this.cw.add(solid);
    const hv = this._harv({ kind: 'car', mat: 2, per: 15, hp: 240, solid, sets: ['carBody', 'carParts'], idxs: [body, parts], x, y: h + 1, z, size: 2 }); this.cars.push(hv); return hv;
  }

  /** A harvestable crate / barrel / hay bale made of a decor box. */
  crate(decor, x, y, z, sx, sy, sz, color, kind = 'crate', mat = 0) {
    const r = decor.add(x, y, z, sx, sy, sz, color, { solid: true });
    return this._harv({ kind, mat, per: 10, hp: 60, solid: r.solid, decor, decorIdx: r.idx, x, y: y + sy / 2, z, size: Math.max(sx, sz) });
  }

  /** Remove a harvestable (collider + visuals) without any callbacks. */
  _kill(h) {
    h.dead = true; if (h.solid) this.cw.remove(h.solid);
    if (h.set) { this.sets[h.set].mesh.setMatrixAt(h.idx, ZERO); this.sets[h.set].mesh.instanceMatrix.needsUpdate = true; }
    if (h.decor) { h.decor.set.mesh.setMatrixAt(h.decorIdx, ZERO); h.decor.set.mesh.instanceMatrix.needsUpdate = true; }
    if (h.sets) h.sets.forEach((s, i) => { this.sets[s].mesh.setMatrixAt(h.idxs[i], ZERO); this.sets[s].mesh.instanceMatrix.needsUpdate = true; });
  }

  /** Safety net after generation: trees, rocks, cars and crates may never block the strip in front of a doorway. Returns how many were removed. */
  clearDoorways(houses) {
    let n = 0;
    for (const hs of houses) for (const d of hs.doors) {
      const alongX = Math.abs(d.nx) > 0.5, a = alongX ? d.ox - d.nx * 2.7 : d.oz - d.nz * 2.7, b = alongX ? d.ox + d.nx * 3.4 : d.oz + d.nz * 3.4;
      const minX = alongX ? Math.min(a, b) : d.ox - 1.6, maxX = alongX ? Math.max(a, b) : d.ox + 1.6, minZ = alongX ? d.oz - 1.6 : Math.min(a, b), maxZ = alongX ? d.oz + 1.6 : Math.max(a, b);
      for (const h of this.harvs) { const s = h.solid; if (h.dead || !s) continue; if (s.maxX > minX && s.minX < maxX && s.maxZ > minZ && s.minZ < maxZ) { this._kill(h); n++; } }
    }
    return n;
  }

  /** Hit a harvestable. Returns {mat, amount, destroyed}. */
  hit(h, dmg, attacker = null, point = null) {
    if (h.dead) return { mat: h.mat, amount: 0, destroyed: false };
    h.hp -= dmg; const destroyed = h.hp <= 0;
    if (destroyed) { this._kill(h); this.onBreak?.(h, attacker, point); } else this.onHit?.(h, attacker, point);
    return { mat: h.mat, amount: h.per, destroyed };
  }
}

// ---------- generic decor boxes ----------
export class Decor {
  constructor(scene, cw, cap = 3000) {
    this.cw = cw; const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    this.set = new Inst(geo, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }), cap, true); this.set.mesh.receiveShadow = true; scene.add(this.set.mesh);
    this.harvs = [];
  }
  reset() { this.set.mesh.count = 0; }
  /** Box with its bottom-centre at (x,y,z). */
  add(x, y, z, sx, sy, sz, color, o = {}) {
    const ry = o.ry || 0, idx = this.set.add(mat4(x, y, z, ry, sx, sy, sz), c3(color)); let solid = null;
    if (o.solid) { solid = makeBox(x - sx / 2, y, z - sz / 2, x + sx / 2, y + sy, z + sz / 2, o.owner || null, { walk: o.walk !== false }); this.cw.add(solid); }
    return { solid, idx };
  }
  finish() { this.set.finish(); }
}
