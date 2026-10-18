// Build pieces (wall, door-wall, window-wall, floor, ramp, roof): geometry, instanced rendering, collision, HP, build animation.
// Houses and player/bot-built pieces use exactly the same system; a "level" is 3 m, the grid cell is 4 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, STORY, MATS } from './config.js';
import { makeBox, makeRamp, makePyramid } from './colliders.js';

const HALF = GRID / 2, T = 0.3;          // half cell, wall thickness
const ROOF_H = 1.8;

// ---------- geometry ----------
function boxG(w, h, d, x, y, z, shade = 1) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(shade); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
/** Convex polyhedron from polygons (arrays of [x,y,z]); winding is fixed to face outward from `center`. Flat shaded, vertex-coloured. */
function convexG(polys, center, shades = []) {
  const pos = [], col = [];
  polys.forEach((poly, pi) => {
    for (let i = 1; i < poly.length - 1; i++) {
      let a = poly[0], b = poly[i], c = poly[i + 1];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const cx = (a[0] + b[0] + c[0]) / 3 - center[0], cy = (a[1] + b[1] + c[1]) / 3 - center[1], cz = (a[2] + b[2] + c[2]) / 3 - center[2];
      if (n[0] * cx + n[1] * cy + n[2] * cz < 0) { const t = b; b = c; c = t; }
      pos.push(...a, ...b, ...c);
      const s = shades[pi] ?? 1; col.push(s, s, s, s, s, s, s, s, s);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
const merge = parts => { const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p), false); parts.forEach(p => p.dispose()); const uv = new Float32Array(g.attributes.position.count * 2); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };

export function makeGeometries() {
  const W = HALF - 0.01, G = {};
  // plain wall: skirt below ground line, planks, top cap
  const wall = (x0 = -W, x1 = W, y0 = -0.2, y1 = 3.0, shade = 1) => boxG(x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, 0, shade);
  const trim = (x0, x1, y0, y1) => boxG(x1 - x0 + 0.06, y1 - y0 + 0.06, T + 0.05, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0.62);
  const planks = (x0, x1, y0, y1) => { const a = []; for (let y = y0 + 0.6; y < y1 - 0.2; y += 0.6) a.push(boxG(x1 - x0, 0.03, T + 0.03, (x0 + x1) / 2, y, 0, 0.78)); return a; };
  const common = [boxG(2 * W, 0.5, T + 0.04, 0, -0.25, 0, 0.55), boxG(2 * W + 0.02, 0.1, T + 0.1, 0, 2.97, 0, 0.8)];
  G.wall = merge([wall(), ...planks(-W, W, 0, 3), ...common]);
  G.door = merge([wall(-W, -0.8, -0.2, 3.0), wall(0.8, W, -0.2, 3.0), wall(-0.8, 0.8, 2.4, 3.0), trim(-0.82, -0.74, 0, 2.4), trim(0.74, 0.82, 0, 2.4), trim(-0.8, 0.8, 2.36, 2.44), ...planks(-W, -0.8, 0, 3), ...planks(0.8, W, 0, 3), ...common]);
  G.window = merge([wall(-W, -0.7, -0.2, 3.0), wall(0.7, W, -0.2, 3.0), wall(-0.7, 0.7, -0.2, 1.0), wall(-0.7, 0.7, 2.2, 3.0), trim(-0.7, 0.7, 0.96, 1.04), trim(-0.7, 0.7, 2.16, 2.24), trim(-0.74, -0.66, 1.0, 2.2), trim(0.66, 0.74, 1.0, 2.2), ...planks(-W, -0.7, 0, 3), ...planks(0.7, W, 0, 3), ...common]);
  G.floor = merge([boxG(2 * W, 0.4, 2 * W, 0, -0.2, 0, 1), boxG(2 * W, 0.05, 0.08, 0, 0.0, W - 0.04, 0.7), boxG(2 * W, 0.05, 0.08, 0, 0.0, -W + 0.04, 0.7), boxG(0.08, 0.05, 2 * W, W - 0.04, 0.0, 0, 0.7), boxG(0.08, 0.05, 2 * W, -W + 0.04, 0.0, 0, 0.7)]);
  const R = W; // ramp: rises toward +Z
  const pts = { a: [-R, 0, -R], b: [R, 0, -R], c: [R, STORY, R], d: [-R, STORY, R], e: [-R, -0.4, -R], f: [R, -0.4, -R], g: [R, -0.4, R], h: [-R, -0.4, R] };
  G.ramp = merge([convexG([[pts.a, pts.b, pts.c, pts.d], [pts.h, pts.d, pts.c, pts.g], [pts.e, pts.f, pts.b, pts.a], [pts.e, pts.a, pts.d, pts.h], [pts.f, pts.g, pts.c, pts.b], [pts.e, pts.f, pts.g, pts.h]], [0, 1.0, 0], [1, 0.7, 0.6, 0.75, 0.75, 0.5]),
    ...[-1, -0.5, 0, 0.5, 1].map(k => { const z = k * R * 0.9, y = (k * 0.9 + 1) / 2 * STORY; return boxG(2 * R, 0.05, 0.1, 0, y + 0.015, z, 0.78); })]);
  const o = HALF + 0.12;
  G.roof = convexG([[[-o, 0, -o], [o, 0, -o], [0, ROOF_H, 0]], [[o, 0, -o], [o, 0, o], [0, ROOF_H, 0]], [[o, 0, o], [-o, 0, o], [0, ROOF_H, 0]], [[-o, 0, o], [-o, 0, -o], [0, ROOF_H, 0]], [[-o, -0.15, -o], [o, -0.15, -o], [o, -0.15, o], [-o, -0.15, o]]], [0, 0.5, 0], [1, 0.82, 1, 0.82, 2.6]);
  G.roof.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(G.roof.attributes.position.count * 2), 2));
  return G;
}

const KINDS = ['wall', 'door', 'window', 'floor', 'ramp', 'roof'];
const CAP = { wall: 1800, door: 200, window: 300, floor: 1300, ramp: 600, roof: 900 };
const WALLISH = new Set(['wall', 'door', 'window']);

class InstSet {
  constructor(name, geo, mat, cap) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.name = name;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.owners = []; this.dirty = false; this.cap = cap;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  add(piece, matrix, color) {
    if (this.mesh.count >= this.cap) return -1;
    const i = this.mesh.count++; this.owners[i] = piece; this.mesh.setMatrixAt(i, matrix); this.mesh.setColorAt(i, color); this.dirty = true; return i;
  }
  set(i, matrix, color) { if (matrix) this.mesh.setMatrixAt(i, matrix); if (color) this.mesh.setColorAt(i, color); this.dirty = true; }
  remove(piece) {
    const i = piece.inst, last = this.mesh.count - 1; if (i < 0 || i > last) return;
    if (i !== last) {
      const m = new THREE.Matrix4(), c = new THREE.Color(); this.mesh.getMatrixAt(last, m); this.mesh.getColorAt(last, c); this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, c);
      const mv = this.owners[last]; this.owners[i] = mv; mv.inst = i;
    }
    this.owners[last] = null; this.mesh.count--; piece.inst = -1; this.dirty = true;
  }
  flush() { if (!this.dirty) return; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; this.dirty = false; }
}

let PID = 1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);

export class Pieces {
  constructor(scene, cw, detailTex = null) {
    this.scene = scene; this.cw = cw; this.G = makeGeometries();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, map: detailTex, flatShading: false });
    this.sets = {}; this.group = new THREE.Group(); this.group.name = 'pieces';
    for (const k of KINDS) { this.sets[k] = new InstSet(k, this.G[k], mat, CAP[k]); this.group.add(this.sets[k].mesh); }
    scene.add(this.group);
    this.byKey = new Map(); this.all = new Set(); this.building = []; this.onBreak = null; this.onDamage = null;
  }
  reset() {
    for (const p of [...this.all]) this._detach(p);
    this.byKey.clear(); this.all.clear(); this.building.length = 0;
    for (const k of KINDS) { this.sets[k].mesh.count = 0; this.sets[k].owners.length = 0; this.sets[k].dirty = true; }
  }
  flush() { for (const k of KINDS) this.sets[k].flush(); }

  static slotKey(kind, x, y, z, rot) {
    const ly = Math.round(y / 1.5);
    if (WALLISH.has(kind)) { return (rot & 1) === 0 ? `WX:${Math.floor(x / GRID)}:${Math.round(z / GRID)}:${ly}` : `WZ:${Math.round(x / GRID)}:${Math.floor(z / GRID)}:${ly}`; }
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    return `${kind === 'roof' ? 'R' : kind === 'ramp' ? 'S' : 'F'}:${gx}:${gz}:${ly}`;
  }
  canPlace(kind, x, y, z, rot) { return !this.byKey.has(Pieces.slotKey(kind, x, y, z, rot)); }
  pieceAt(kind, x, y, z, rot) { return this.byKey.get(Pieces.slotKey(kind, x, y, z, rot)) || null; }

  _solids(p) {
    const { kind, x, y, z } = p, rot = p.rot, s = [];
    const add = (a, b, c, d, e, f) => s.push(makeBox(a, b, c, d, e, f, p));
    if (WALLISH.has(kind)) {
      const alongX = (rot & 1) === 0, t = T / 2, lo = y - 0.5, hi = y + STORY;
      const seg = (u0, u1, y0, y1) => alongX ? add(x + u0, y0, z - t, x + u1, y1, z + t) : add(x - t, y0, z + u0, x + t, y1, z + u1);
      if (kind === 'wall') seg(-HALF, HALF, lo, hi);
      else if (kind === 'door') { seg(-HALF, -0.8, lo, hi); seg(0.8, HALF, lo, hi); seg(-0.8, 0.8, y + 2.4, hi); }
      else { seg(-HALF, -0.7, lo, hi); seg(0.7, HALF, lo, hi); seg(-0.7, 0.7, lo, y + 1.0); seg(-0.7, 0.7, y + 2.2, hi); }
    } else if (kind === 'floor') add(x - HALF, y - 0.4, z - HALF, x + HALF, y, z + HALF);
    else if (kind === 'ramp') s.push(makeRamp(x - HALF, y - 0.4, z - HALF, x + HALF, 0, z + HALF, rot & 3, y, y + STORY, p));
    else s.push(makePyramid(x - HALF, y, z - HALF, x + HALF, y + ROOF_H, z + HALF, p));
    return s;
  }
  _matrix(p, scale = 1, rise = 1) {
    const rotY = p.kind === 'ramp' ? [0, Math.PI / 2, Math.PI, -Math.PI / 2][p.rot & 3] : WALLISH.has(p.kind) ? ((p.rot & 1) ? Math.PI / 2 : 0) : 0;
    _q.setFromAxisAngle(_up, rotY); _p.set(p.x, p.y, p.z);
    if (p.kind === 'wall' || p.kind === 'door' || p.kind === 'window') _s.set(1, rise, 1);
    else _s.set(scale, scale, scale);
    return _m.compose(_p, _q, _s);
  }
  matrixFor(p) { return this._matrix({ kind: p.kind, x: p.x, y: p.y, z: p.z, rot: p.rot || 0 }, 1, 1); }
  _color(p) { const f = 0.45 + 0.55 * Math.max(0, p.hp / p.maxHp); return _c.copy(p.tint).multiplyScalar(f); }

  /** Add a piece. spec: {kind, mat(0..2), x,y,z, rot, owner, isStatic, tint(hex), hpMul}. Returns null when the slot is taken. */
  add(spec) {
    const key = Pieces.slotKey(spec.kind, spec.x, spec.y, spec.z, spec.rot || 0);
    if (this.byKey.has(key)) return null;
    const M = MATS[spec.mat ?? 0];
    const p = { id: PID++, isPiece: true, kind: spec.kind, mat: spec.mat ?? 0, x: spec.x, y: spec.y, z: spec.z, rot: spec.rot || 0, owner: spec.owner ?? null, isStatic: !!spec.isStatic,
      maxHp: M.hp * (spec.hpMul ?? 1) * (spec.kind === 'door' || spec.kind === 'window' ? 0.8 : 1), hp: 0, tint: new THREE.Color(spec.tint ?? M.color), key, dead: false, inst: -1, solids: [], buildT: spec.isStatic || spec.instant ? 1 : 0, buildTime: M.time };
    p.hp = p.maxHp * (p.buildT >= 1 ? 1 : 0.3);
    p.solids = this._solids(p); for (const s of p.solids) this.cw.add(s);
    const set = this.sets[p.kind];
    p.inst = set.add(p, this._matrix(p, p.buildT >= 1 ? 1 : 0.7, p.buildT >= 1 ? 1 : 0.1), this._color(p));
    if (p.inst < 0) { for (const s of p.solids) this.cw.remove(s); return null; }
    this.byKey.set(key, p); this.all.add(p); if (p.buildT < 1) this.building.push(p);
    return p;
  }
  _detach(p) { for (const s of p.solids) this.cw.remove(s); p.solids = []; if (p.inst >= 0) this.sets[p.kind].remove(p); }
  remove(p) { if (p.dead) return; p.dead = true; this._detach(p); this.byKey.delete(p.key); this.all.delete(p); const i = this.building.indexOf(p); if (i >= 0) this.building.splice(i, 1); }

  /** Returns true if destroyed. */
  damage(p, amount, attacker = null, point = null) {
    if (p.dead) return false;
    p.hp -= amount;
    if (p.hp <= 0) { this.remove(p); this.onBreak?.(p, attacker, point); return true; }
    if (p.inst >= 0) this.sets[p.kind].set(p.inst, null, this._color(p));
    this.onDamage?.(p, amount, attacker, point);
    return false;
  }
  update(dt) {
    for (let i = this.building.length - 1; i >= 0; i--) {
      const p = this.building[i]; p.buildT = Math.min(1, p.buildT + dt / p.buildTime);
      const e = 1 - (1 - p.buildT) * (1 - p.buildT);
      p.hp = Math.min(p.maxHp, Math.max(p.hp, p.maxHp * (0.3 + 0.7 * p.buildT)));
      if (p.inst >= 0) this.sets[p.kind].set(p.inst, this._matrix(p, 0.7 + 0.3 * e, 0.1 + 0.9 * e), this._color(p));
      if (p.buildT >= 1) this.building.splice(i, 1);
    }
    this.flush();
  }
  /** Pieces whose centre is within r of (x,z) — for AI cover logic. */
  near(x, z, r) { const out = []; for (const p of this.all) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p); return out; }
}
export { KINDS, ROOF_H };
