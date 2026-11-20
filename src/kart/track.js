// Track geometry without rendering: a closed centripetal Catmull-Rom loop resampled every STEP metres, with the
// road edges, shoulders, barriers, drops, ice, ramps, boost pads, item boxes and moving obstacles laid along it.
// Everything the race simulation needs to ask about the ground is here, so it runs headless in the tests.

export const STEP = 1.5;

function catmull(p0, p1, p2, p3, t) {
  // centripetal parameterisation: no loops or cusps on tight control points
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t, out = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const a1 = (t1 - u) / (t1 - t0) * p0[i] + (u - t0) / (t1 - t0) * p1[i];
    const a2 = (t2 - u) / (t2 - t1) * p1[i] + (u - t1) / (t2 - t1) * p2[i];
    const a3 = (t3 - u) / (t3 - t2) * p2[i] + (u - t2) / (t3 - t2) * p3[i];
    const b1 = (t2 - u) / (t2 - t0) * a1 + (u - t0) / (t2 - t0) * a2;
    const b2 = (t3 - u) / (t3 - t1) * a2 + (u - t1) / (t3 - t1) * a3;
    out[i] = (t2 - u) / (t2 - t1) * b1 + (u - t1) / (t2 - t1) * b2;
  }
  return out;
}

const inRanges = (s, ranges) => ranges.some(([a, b]) => s >= a && s <= b);

export class Track {
  constructor(def) {
    this.def = def; this.id = def.id; this.name = def.name; this.theme = def.theme;
    // control points are [x, z, y]; work in [x, y, z]
    const P = def.pts.map(([x, z, y]) => [x, y, z]), n = P.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const segs = Math.ceil(Math.hypot(p2[0] - p1[0], p2[2] - p1[2]) / 0.25);
      for (let k = 0; k < segs; k++) dense.push(catmull(p0, p1, p2, p3, k / segs));
    }
    // resample by arc length
    const cum = [0]; for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
    const total = cum[dense.length]; const N = this.n = Math.round(total / STEP); this.length = total; this.step = total / N;
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.z = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    this.curv = new Float32Array(N); this.half = new Float32Array(N); this.wall = new Float32Array(N);
    this.flags = new Uint8Array(N);   // 1 drop edge, 2 gap (no ground), 4 ice, 8 ramp, 16 boost
    let j = 0;
    for (let i = 0; i < N; i++) {
      const d = i * this.step; while (j < dense.length - 1 && cum[j + 1] < d) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length], f = (d - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      this.x[i] = a[0] + (b[0] - a[0]) * f; this.y[i] = a[1] + (b[1] - a[1]) * f; this.z[i] = a[2] + (b[2] - a[2]) * f;
    }
    // smooth heights so hills ramp gently
    for (let pass = 0; pass < 3; pass++) { const y2 = Float32Array.from(this.y); for (let i = 0; i < N; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += y2[(i + k + N) % N]; this.y[i] = s / 13; } }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], m = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / m; this.tz[i] = dz / m; this.rx[i] = -this.tz[i]; this.rz[i] = this.tx[i];   // right-hand normal (x,z) = (-tz, tx)
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const ha = Math.atan2(this.tx[a], this.tz[a]), hb = Math.atan2(this.tx[b], this.tz[b]);
      let dh = hb - ha; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      this.curv[i] = dh / (6 * this.step);   // signed: > 0 turns toward -right (left)…  sign only used relatively
      const s = i / N;
      this.half[i] = def.half; this.wall[i] = def.half + def.shoulder;
      let f = 0;
      if (inRanges(s, def.drops || [])) f |= 1;
      if (inRanges(s, def.gaps || [])) f |= 2 | 1;
      if (inRanges(s, def.ice || [])) f |= 4;
      this.flags[i] = f;
    }
    // ramps: a short strip just before the given fraction
    this.ramps = (def.ramps || []).map(r => ({ i: Math.round(r.s * N) % N, v: r.v }));
    for (const r of this.ramps) for (let k = -3; k <= 0; k++) this.flags[(r.i + k + N) % N] |= 8;
    this.boosts = (def.boosts || []).map(b => ({ i: Math.round(b.s * N) % N, lat: b.lat * def.half, len: 4, w: 2.2 }));
    for (const b of this.boosts) for (let k = 0; k < b.len; k++) this.flags[(b.i + k) % N] |= 16;
    this.itemRows = (def.items || []).map(s => Math.round(s * N) % N);
    this.boxes = [];
    for (const i of this.itemRows) for (const l of [-0.6, -0.2, 0.2, 0.6]) {
      const lat = l * this.half[i]; this.boxes.push({ i, lat, x: this.x[i] + this.rx[i] * lat, y: this.y[i], z: this.z[i] + this.rz[i] * lat, t: 0 });
    }
    this.movers = (def.movers || []).map(m => ({ ...m, i: Math.round(m.s * N) % N, phase: m.phase || 0, x: 0, y: 0, z: 0, r: m.kind === 'boulder' || m.kind === 'snowman' ? 2.2 : 1.6 }));
    this.updateMovers(0);
    // a coarse grid of sample indices for global lookups
    this.cell = 20; this.grid = new Map();
    for (let i = 0; i < N; i++) { const k = this._key(this.x[i], this.z[i]); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(i); }
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) { minY = Math.min(minY, this.y[i]); maxY = Math.max(maxY, this.y[i]); minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]); minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]); }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
  }

  _key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  wrap(i) { return ((i % this.n) + this.n) % this.n; }

  /** Nearest sample to (x, z) searched over the whole track (spawns, projectiles that lost their hint). */
  nearestGlobal(x, z) {
    let best = 0, bd = Infinity;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let r = 1; r <= 4 && bd === Infinity; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const list = this.grid.get(`${cx + a},${cz + b}`); if (!list) continue;
        for (const i of list) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
    }
    if (bd === Infinity) for (let i = 0; i < this.n; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }

  /**
   * Where (x, z) is relative to the track, searching around a previous sample index. Fills and returns out:
   * { i, f (0..1 toward i+1), lat (metres right of centre), y (road height), s (lap fraction) }.
   */
  locate(x, z, hint, out = {}) {
    let i0 = hint == null || hint < 0 ? this.nearestGlobal(x, z) : hint, best = i0, bd = Infinity;
    for (let k = -14; k <= 14; k++) { const i = this.wrap(i0 + k), d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    if (bd > 30 * 30) { best = this.nearestGlobal(x, z); }
    // project onto the segment best -> best+1 (or best-1 -> best)
    let i = best, dx = x - this.x[i], dz = z - this.z[i], along = dx * this.tx[i] + dz * this.tz[i];
    if (along < 0) { i = this.wrap(best - 1); dx = x - this.x[i]; dz = z - this.z[i]; along = dx * this.tx[i] + dz * this.tz[i]; }
    const f = Math.max(0, Math.min(1, along / this.step)), j = this.wrap(i + 1);
    const rx = this.rx[i] + (this.rx[j] - this.rx[i]) * f, rz = this.rz[i] + (this.rz[j] - this.rz[i]) * f;
    const cx = this.x[i] + (this.x[j] - this.x[i]) * f, cz = this.z[i] + (this.z[j] - this.z[i]) * f;
    out.i = i; out.f = f; out.lat = (x - cx) * rx + (z - cz) * rz; out.y = this.y[i] + (this.y[j] - this.y[i]) * f; out.s = (i + f) / this.n;
    return out;
  }

  /** World point at sample i (fractional ok) with a lateral offset. */
  point(i, lat = 0, out = {}) {
    const a = this.wrap(Math.floor(i)), b = this.wrap(a + 1), f = i - Math.floor(i);
    const rx = this.rx[a] + (this.rx[b] - this.rx[a]) * f, rz = this.rz[a] + (this.rz[b] - this.rz[a]) * f;
    out.x = this.x[a] + (this.x[b] - this.x[a]) * f + rx * lat; out.z = this.z[a] + (this.z[b] - this.z[a]) * f + rz * lat;
    out.y = this.y[a] + (this.y[b] - this.y[a]) * f; out.h = Math.atan2(this.tx[a], this.tz[a]);
    return out;
  }
  heading(i) { i = this.wrap(Math.round(i)); return Math.atan2(this.tx[i], this.tz[i]); }
  /** Is there ground under a point at this sample and lateral offset? */
  hasGround(i, lat) { const f = this.flags[i]; if (f & 2) return false; if (f & 1) return Math.abs(lat) <= this.half[i] + 2.5; return true; }
  isDrop(i) { return !!(this.flags[i] & 1); }
  isIce(i) { return !!(this.flags[i] & 4); }
  onRoad(i, lat) { return Math.abs(lat) <= this.half[i] + 0.4; }

  /** Moving obstacles sweep across the road on a timer (deterministic, so replays match). */
  updateMovers(time) {
    for (const m of this.movers) {
      const lat = Math.sin(time * m.speed + m.phase) * m.amp * this.half[m.i];
      const p = this.point(m.i, lat); m.x = p.x; m.z = p.z; m.y = p.y; m.lat = lat; m.h = p.h;
      m.dir = Math.cos(time * m.speed + m.phase) >= 0 ? 1 : -1;
    }
  }

  /** Grid slot k (0 = pole) behind the start line. */
  gridSlot(k) {
    const row = Math.floor(k / 2), side = k % 2 ? 1 : -1;
    const i = this.wrap(-6 - row * 5 - (side > 0 ? 2 : 0));
    const lat = side * this.half[i] * 0.42;
    const p = this.point(i, lat); return { x: p.x, y: p.y, z: p.z, h: p.h, i };
  }
}

const cache = new Map();
export function getTrack(def) { if (!cache.has(def.id)) cache.set(def.id, new Track(def)); return cache.get(def.id); }
