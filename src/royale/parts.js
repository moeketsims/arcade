// Small helper for building merged, vertex-coloured models out of primitives (one draw call per bucket).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();

const gcache = new Map();
function geo(key, fn) { let g = gcache.get(key); if (!g) { g = fn(); gcache.set(key, g); } return g; }

export const matCache = new Map();
export function stdMat(key, make) { let m = matCache.get(key); if (!m) { m = make(); matCache.set(key, m); } return m; }
export const bodyMat = () => stdMat('body', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 }));
export const flatMat = () => stdMat('flat', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0 }));
export const glowMat = hex => stdMat('glow' + hex, () => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0 }));
export const glowVC = () => stdMat('glowvc', () => new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5 }));

function colorize(g, color) {
  _c.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

export class Parts {
  constructor() { this.b = {}; }
  _add(bucket, g, color, pos, rot, scl) {
    _p.set(pos[0], pos[1], pos[2]); _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e); _s.set(scl[0], scl[1], scl[2]);
    _m.compose(_p, _q, _s);
    const c = g.clone(); c.applyMatrix4(_m); colorize(c, color);
    (this.b[bucket] || (this.b[bucket] = [])).push(c); return this;
  }
  /** size [w,h,d], pos [x,y,z], rot [rx,ry,rz] */
  box(color, size, pos = [0, 0, 0], rot = [0, 0, 0], bucket = 'main') {
    return this._add(bucket, geo('box', () => new THREE.BoxGeometry(1, 1, 1)), color, pos, rot, size);
  }
  /** cylinder along an axis ('x'|'y'|'z'); r = radius (r2 optional for tapered), len = length */
  cyl(color, r, len, pos = [0, 0, 0], axis = 'z', o = {}) {
    const seg = o.seg || 10, ratio = (o.r2 ?? r) / r, g = geo(`cyl${seg}|${ratio}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg));
    // CylinderGeometry(radiusTop, radiusBottom): top = +Y end. For axis z, +Y maps to +Z (rotation.x = +90deg).
    const rot = axis === 'z' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, 0, -Math.PI / 2] : [0, 0, 0];
    return this._add(o.bucket || 'main', g, color, pos, o.rot || rot, [r, len, r]);
  }
  sph(color, r, pos = [0, 0, 0], scl = [1, 1, 1], o = {}) {
    return this._add(o.bucket || 'main', geo('sph' + (o.seg || 12), () => new THREE.SphereGeometry(1, o.seg || 12, (o.seg || 12) - 2)), color, pos, [0, 0, 0], [r * scl[0], r * scl[1], r * scl[2]]);
  }
  /** cone pointing along +axis */
  cone(color, r, len, pos = [0, 0, 0], axis = 'z', o = {}) {
    const seg = o.seg || 8, g = geo('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg));
    const rot = axis === 'z' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, 0, -Math.PI / 2] : axis === '-x' ? [0, 0, Math.PI / 2] : axis === '-z' ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
    return this._add(o.bucket || 'main', g, color, pos, o.rot || rot, [r * (o.sx ?? 1), len, r * (o.sz ?? 1)]);
  }
  torus(color, R, tube, pos = [0, 0, 0], rot = [0, 0, 0], o = {}) {
    const g = geo(`tor${o.seg || 14}|${tube / R}|${o.arc || 6.2832}`, () => new THREE.TorusGeometry(1, tube / R, 6, o.seg || 14, o.arc || Math.PI * 2));
    return this._add(o.bucket || 'main', g, color, pos, rot, [R, R, R]);
  }
  /** thin box between two points */
  seg(color, thick, a, b, o = {}) {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _d.length(); if (len < 1e-6) return this;
    _d.normalize(); _q.setFromUnitVectors(_up, _d);
    const e = new THREE.Euler().setFromQuaternion(_q);
    return this._add(o.bucket || 'main', geo('box', () => new THREE.BoxGeometry(1, 1, 1)), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z], [thick, o.thickY ?? thick, len]);
  }
  /** Merged geometry of one bucket (for instancing). */
  geom(bucket = 'main') { const g = mergeGeometries(this.b[bucket], false); return g; }
  /** Merge each bucket into a mesh. buckets named 'acc' use the accent material, 'glass' a glowing cyan, others the body material. */
  build(accent = 0xffffff, mats = {}) {
    const grp = new THREE.Group();
    for (const [name, list] of Object.entries(this.b)) {
      const g = mergeGeometries(list, false); list.forEach(x => x.dispose());
      let m;
      if (name === 'acc') m = glowMat(accent);
      else if (name === 'glow') m = glowVC();
      else if (name === 'flat') m = flatMat();
      else m = mats[name] || bodyMat();
      const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = false; grp.add(mesh);
    }
    return grp;
  }
}
