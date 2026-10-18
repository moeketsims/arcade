// Collision world: axis-aligned boxes, ramps and pyramids in a 2D bucket grid + terrain.
// Everything is world-axis aligned (houses, build pieces, props) so character collision stays cheap and robust.
import { SEA } from './config.js';

export const BOX = 0, RAMP = 1, PYR = 2;
let UID = 1;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeBox(minX, minY, minZ, maxX, maxY, maxZ, owner = null, o = {}) {
  return { id: UID++, kind: BOX, minX, minY, minZ, maxX, maxY, maxZ, owner, bullet: o.bullet !== false, walk: o.walk !== false, block: o.block !== false, stamp: 0, cells: null };
}
/** dir 0: rises toward +Z, 1: +X, 2: -Z, 3: -X. yLow/yHigh = surface heights at the low and high edges. */
export function makeRamp(minX, minY, minZ, maxX, minTop, maxZ, dir, yLow, yHigh, owner = null) {
  const s = makeBox(minX, minY, minZ, maxX, Math.max(yLow, yHigh), maxZ, owner); s.kind = RAMP; s.dir = dir; s.yLow = yLow; s.yHigh = yHigh; return s;
}
/** Square-based pyramid: base at minY, peak at maxY over the box footprint. */
export function makePyramid(minX, minY, minZ, maxX, maxY, maxZ, owner = null) { const s = makeBox(minX, minY, minZ, maxX, maxY, maxZ, owner); s.kind = PYR; return s; }

/** Surface height of a solid at (x,z) (clamped to its footprint). */
export function topAt(s, x, z) {
  if (s.kind === BOX) return s.maxY;
  if (s.kind === RAMP) {
    let t;
    switch (s.dir) {
      case 0: t = (z - s.minZ) / (s.maxZ - s.minZ); break;
      case 1: t = (x - s.minX) / (s.maxX - s.minX); break;
      case 2: t = (s.maxZ - z) / (s.maxZ - s.minZ); break;
      default: t = (s.maxX - x) / (s.maxX - s.minX);
    }
    return s.yLow + (s.yHigh - s.yLow) * clamp(t, 0, 1);
  }
  const hx = (s.maxX - s.minX) / 2, hz = (s.maxZ - s.minZ) / 2, cx = s.minX + hx, cz = s.minZ + hz;
  const k = 1 - Math.max(Math.abs(x - cx) / hx, Math.abs(z - cz) / hz);
  return s.minY + (s.maxY - s.minY) * clamp(k, 0, 1);
}

// planes for convex solids: [nx,ny,nz,d] meaning n·p <= d
function planesOf(s, out) {
  out.length = 0;
  out.push([1, 0, 0, s.maxX], [-1, 0, 0, -s.minX], [0, 0, 1, s.maxZ], [0, 0, -1, -s.minZ], [0, -1, 0, -s.minY]);
  if (s.kind === RAMP) {
    const L = s.dir === 0 || s.dir === 2 ? s.maxZ - s.minZ : s.maxX - s.minX, rise = (s.yHigh - s.yLow) / L; // top: y <= yLow + rise * t*L
    let nx = 0, nz = 0, d;
    switch (s.dir) {
      case 0: nz = -rise; d = s.yLow - rise * s.minZ; break;           // y + rise*(-?) ... y - rise*(z-minZ) <= yLow
      case 1: nx = -rise; d = s.yLow - rise * s.minX; break;
      case 2: nz = rise; d = s.yLow + rise * s.maxZ; break;
      default: nx = rise; d = s.yLow + rise * s.maxX;
    }
    // plane: y + nx*x + nz*z <= d  (nx,nz are coefficients of x,z on the left side)
    const len = Math.hypot(nx, 1, nz); out.push([nx / len, 1 / len, nz / len, d / len]);
  } else if (s.kind === PYR) {
    const hx = (s.maxX - s.minX) / 2, hz = (s.maxZ - s.minZ) / 2, cx = s.minX + hx, cz = s.minZ + hz, H = s.maxY - s.minY;
    // y <= minY + H*(1 - (x-cx)/hx)  -> y + (H/hx) x <= minY + H + (H/hx) cx   (and the other three sides)
    const ax = H / hx, az = H / hz;
    const add = (px, pz, d) => { const len = Math.hypot(px, 1, pz); out.push([px / len, 1 / len, pz / len, d / len]); };
    add(ax, 0, s.minY + H + ax * cx); add(-ax, 0, s.minY + H - ax * cx); add(0, az, s.minY + H + az * cz); add(0, -az, s.minY + H - az * cz);
  }
  return out;
}
const _pl = [];

/** Ray vs solid. Returns entry t (>=0) or -1; writes the entry normal into hitN when given. Rays starting inside are ignored. */
export function rayVsSolid(s, ox, oy, oz, dx, dy, dz, maxT, hitN) {
  if (s.kind === BOX) {
    let t0 = 0, t1 = maxT, nx = 0, ny = 0, nz = 0;
    // x slab
    if (Math.abs(dx) < 1e-12) { if (ox < s.minX || ox > s.maxX) return -1; }
    else { let a = (s.minX - ox) / dx, b = (s.maxX - ox) / dx, n = -1; if (a > b) { const t = a; a = b; b = t; n = 1; } if (a > t0) { t0 = a; nx = n; ny = 0; nz = 0; } if (b < t1) t1 = b; if (t0 > t1) return -1; }
    if (Math.abs(dy) < 1e-12) { if (oy < s.minY || oy > s.maxY) return -1; }
    else { let a = (s.minY - oy) / dy, b = (s.maxY - oy) / dy, n = -1; if (a > b) { const t = a; a = b; b = t; n = 1; } if (a > t0) { t0 = a; nx = 0; ny = n; nz = 0; } if (b < t1) t1 = b; if (t0 > t1) return -1; }
    if (Math.abs(dz) < 1e-12) { if (oz < s.minZ || oz > s.maxZ) return -1; }
    else { let a = (s.minZ - oz) / dz, b = (s.maxZ - oz) / dz, n = -1; if (a > b) { const t = a; a = b; b = t; n = 1; } if (a > t0) { t0 = a; nx = 0; ny = 0; nz = n; } if (b < t1) t1 = b; if (t0 > t1) return -1; }
    if (t0 <= 0 || t0 > maxT) return -1;
    if (hitN) { hitN.x = nx; hitN.y = ny; hitN.z = nz; }
    return t0;
  }
  const pl = planesOf(s, _pl);
  let t0 = 0, t1 = maxT, bn = null;
  for (let i = 0; i < pl.length; i++) {
    const p = pl[i], den = p[0] * dx + p[1] * dy + p[2] * dz, num = p[3] - (p[0] * ox + p[1] * oy + p[2] * oz);
    if (Math.abs(den) < 1e-12) { if (num < 0) return -1; continue; }
    const t = num / den;
    if (den < 0) { if (t > t0) { t0 = t; bn = p; } } else if (t < t1) t1 = t;
    if (t0 > t1) return -1;
  }
  if (t0 <= 0 || !bn || t0 > maxT) return -1;
  if (hitN) { hitN.x = bn[0]; hitN.y = bn[1]; hitN.z = bn[2]; }
  return t0;
}

export class CollisionWorld {
  constructor(terrain, cell = 8, half = 352) {
    this.terrain = terrain; this.cs = cell; this.half = half; this.n = Math.ceil((half * 2) / cell);
    this.cells = new Array(this.n * this.n); this.stampCtr = 1; this._q = []; this.count = 0;
    this.smokes = [];   // {x,y,z,r,until} clouds that block line of sight
  }
  reset() { this.cells = new Array(this.n * this.n); this.count = 0; this.smokes.length = 0; }
  _ci(v) { const i = Math.floor((v + this.half) / this.cs); return i < 0 ? 0 : i >= this.n ? this.n - 1 : i; }
  add(s) {
    const i0 = this._ci(s.minX), i1 = this._ci(s.maxX), j0 = this._ci(s.minZ), j1 = this._ci(s.maxZ), cells = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * this.n + i; (this.cells[k] || (this.cells[k] = [])).push(s); cells.push(k); }
    s.cells = cells; this.count++; return s;
  }
  remove(s) {
    if (!s.cells) return;
    for (const k of s.cells) { const a = this.cells[k]; if (!a) continue; const i = a.indexOf(s); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } }
    s.cells = null; this.count--;
  }
  forEachSolid(fn) {
    const st = ++this.stampCtr;
    for (const a of this.cells) { if (!a) continue; for (let m = 0; m < a.length; m++) { const s = a[m]; if (s.stamp !== st) { s.stamp = st; fn(s); } } }
  }
  /** Unique solids overlapping an XZ rectangle. The returned array is reused: consume it before the next query. */
  query(minX, minZ, maxX, maxZ, out = this._q) {
    out.length = 0; const st = ++this.stampCtr;
    const i0 = this._ci(minX), i1 = this._ci(maxX), j0 = this._ci(minZ), j1 = this._ci(maxZ);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this.cells[j * this.n + i]; if (!a) continue;
      for (let m = 0; m < a.length; m++) { const s = a[m]; if (s.stamp !== st) { s.stamp = st; out.push(s); } }
    }
    return out;
  }

  /** Highest walkable surface under (x,z) that is reachable from height y (surface <= y + step). Returns height; this.standOn = solid or null. */
  supportAt(x, z, y, step = 0.55) {
    let best = this.terrain.groundAt(x, z); this.standOn = null;
    const q = this.query(x, z, x, z);
    for (let i = 0; i < q.length; i++) {
      const s = q[i];
      if (!s.walk || x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const t = topAt(s, x, z);
      if (t <= y + step && t > best) { best = t; this.standOn = s; }
    }
    return best;
  }
  /** Lowest solid underside above a head height at (x,z) within `reach`, or Infinity. */
  ceilingAt(x, z, headY, reach = 3) {
    let best = Infinity; const q = this.query(x, z, x, z);
    for (let i = 0; i < q.length; i++) {
      const s = q[i]; if (!s.block || x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.minY >= headY - 0.05 && s.minY < headY + reach && s.minY < best) best = s.minY;
    }
    return best;
  }

  /**
   * Push a vertical cylinder (feet y, height h, radius r) out of solids. Mutates pos {x,z}; returns true if it was pushed.
   * Solids whose surface is within `step` of the feet are walkable (no push); solids above the head or below the feet are ignored.
   */
  collide(pos, y, h, r, step = 0.55) {
    let pushed = false;
    for (let iter = 0; iter < 2; iter++) {
      const q = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      let any = false;
      for (let i = 0; i < q.length; i++) {
        const s = q[i]; if (!s.block) continue;
        const px = clamp(pos.x, s.minX, s.maxX), pz = clamp(pos.z, s.minZ, s.maxZ), dx = pos.x - px, dz = pos.z - pz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const top = topAt(s, px, pz);
        if (y + step >= top || y + h <= s.minY) continue;
        if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
        else {
          const l = pos.x - s.minX, rr = s.maxX - pos.x, b = pos.z - s.minZ, f = s.maxZ - pos.z, m = Math.min(l, rr, b, f);
          if (m === l) pos.x = s.minX - r; else if (m === rr) pos.x = s.maxX + r; else if (m === b) pos.z = s.minZ - r; else pos.z = s.maxZ + r;
        }
        any = pushed = true;
      }
      if (!any) break;
    }
    return pushed;
  }

  /** Nearest hit of a ray against solids (and terrain / water). Returns {t,x,y,z,nx,ny,nz,solid,terrain,water} or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxT, o = null) {
    if (!(maxT > 0) || !Number.isFinite(ox + oy + oz + dx + dy + dz + maxT)) { if (globalThis.__ROYALE_DEBUG__) throw new Error(`raycast bad input ${ox},${oy},${oz} d ${dx},${dy},${dz} max ${maxT}`); return null; }
    const wantSolids = !o || o.solids !== false, wantTerrain = !o || o.terrain !== false, bulletOnly = !o || o.bullet !== false;
    let bestT = maxT, best = null; const hn = { x: 0, y: 0, z: 0 };
    if (wantSolids) {
      const cs = this.cs, H = this.half, n = this.n, st = ++this.stampCtr;
      let cx = Math.floor((ox + H) / cs), cz = Math.floor((oz + H) / cs);
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      let tx = Math.abs(dx) > 1e-12 ? (((cx + (sx > 0 ? 1 : 0)) * cs - H) - ox) / dx : Infinity, tz = Math.abs(dz) > 1e-12 ? (((cz + (sz > 0 ? 1 : 0)) * cs - H) - oz) / dz : Infinity;
      const ddx = Math.abs(dx) > 1e-12 ? cs / Math.abs(dx) : Infinity, ddz = Math.abs(dz) > 1e-12 ? cs / Math.abs(dz) : Infinity;
      for (let it = 0; it < 600; it++) {
        if (cx >= 0 && cx < n && cz >= 0 && cz < n) {
          const a = this.cells[cz * n + cx];
          if (a) for (let m = 0; m < a.length; m++) {
            const s = a[m]; if (s.stamp === st) continue; s.stamp = st;
            if (bulletOnly && !s.bullet) continue;
            if (o && o.ignore && o.ignore(s)) continue;
            const t = rayVsSolid(s, ox, oy, oz, dx, dy, dz, bestT, hn);
            if (t >= 0 && t < bestT) { bestT = t; best = { t, solid: s, nx: hn.x, ny: hn.y, nz: hn.z, terrain: false, water: false }; }
          }
        }
        const tn = Math.min(tx, tz);
        if (tn > bestT) break;
        if (tx < tz) { cx += sx; tx += ddx; } else { cz += sz; tz += ddz; }
        if (cx < -1 || cz < -1 || cx > n || cz > n) break;
      }
    }
    if (wantTerrain) {
      const T = this.terrain; let prevT = 0, prevD = oy - Math.max(T.heightAt(ox, oz), SEA);
      const stepLen = 2.0;
      for (let t = stepLen, guard = 0; guard < 400; t += stepLen, guard++) {
        const tt = Math.min(t, bestT), x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
        const ground = Math.max(T.heightAt(x, z), SEA), d = y - ground;
        if (d < 0 && prevD >= 0) {
          let a = prevT, b = tt;
          for (let k = 0; k < 7; k++) { const m = (a + b) / 2, gm = Math.max(T.heightAt(ox + dx * m, oz + dz * m), SEA); if (oy + dy * m - gm >= 0) a = m; else b = m; }
          if (b < bestT) {
            const x2 = ox + dx * b, z2 = oz + dz * b, water = T.heightAt(x2, z2) < SEA;
            const nrm = water ? { x: 0, y: 1, z: 0 } : T.normalAt(x2, z2);
            bestT = b; best = { t: b, solid: null, nx: nrm.x, ny: nrm.y, nz: nrm.z, terrain: true, water };
          }
          break;
        }
        prevT = tt; prevD = d;
        if (tt >= bestT) break;
      }
    }
    if (best) { best.x = ox + dx * best.t; best.y = oy + dy * best.t; best.z = oz + dz * best.t; }
    return best;
  }

  /** True when solids/terrain (or smoke) block the straight line between two points. */
  blocked(ax, ay, az, bx, by, bz, withSmoke = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return false;
    const ix = dx / L, iy = dy / L, iz = dz / L;
    if (this.raycast(ax, ay, az, ix, iy, iz, L - 0.05)) return true;
    if (withSmoke && this.smokes.length) {
      for (const sm of this.smokes) {
        const wx = sm.x - ax, wy = sm.y - ay, wz = sm.z - az, t = clamp(wx * ix + wy * iy + wz * iz, 0, L);
        const px = ax + ix * t - sm.x, py = ay + iy * t - sm.y, pz = az + iz * t - sm.z;
        if (px * px + py * py + pz * pz < sm.r * sm.r * 0.6) return true;
      }
    }
    return false;
  }
}
