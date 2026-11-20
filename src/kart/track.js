// Sparkplug GP: track geometry. A track is a closed Catmull-Rom spline through hand-placed control points
// [x, z, y, width], resampled every STEP metres. Pure maths (no Three.js), so the race simulation and the headless
// tests can use it directly.
export const STEP = 2;

const lerp = (a, b, t) => a + (b - a) * t;

/** Centripetal Catmull-Rom point between p1 and p2 (each [x, z, y, w]). */
function cr(p0, p1, p2, p3, t) {
  const d = (a, b) => Math.max(1e-3, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0.5));
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), u = lerp(t1, t2, t);
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a1 = (t1 - u) / (t1 - t0) * p0[k] + (u - t0) / (t1 - t0) * p1[k];
    const a2 = (t2 - u) / (t2 - t1) * p1[k] + (u - t1) / (t2 - t1) * p2[k];
    const a3 = (t3 - u) / (t3 - t2) * p2[k] + (u - t2) / (t3 - t2) * p3[k];
    const b1 = (t2 - u) / (t2 - t0) * a1 + (u - t0) / (t2 - t0) * a2;
    const b2 = (t3 - u) / (t3 - t1) * a2 + (u - t1) / (t3 - t1) * a3;
    out.push((t2 - u) / (t2 - t1) * b1 + (u - t1) / (t2 - t1) * b2);
  }
  return out;
}

export class Track {
  /** @param def one entry of TRACKS in data.js */
  constructor(def) {
    this.def = def;
    const P = def.points, n = P.length, dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < 40; k++) dense.push(cr(p0, p1, p2, p3, k / 40));
    }
    // arc-length resample
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) { const a = dense[i - 1], b = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const total = cum[dense.length], N = Math.round(total / STEP);
    this.length = total; this.n = N; this.step = total / N;
    const X = this.x = new Float32Array(N), Z = this.z = new Float32Array(N), Y = this.y = new Float32Array(N), W = this.w = new Float32Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step; while (cum[j + 1] < s) j++;
      const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]), a = dense[j], b = dense[(j + 1) % dense.length];
      X[i] = lerp(a[0], b[0], t); Z[i] = lerp(a[1], b[1], t); Y[i] = lerp(a[2], b[2], t); W[i] = lerp(a[3], b[3], t);
    }
    // tangents (tx, tz), left normal (nx, nz) = tangent rotated +90° (points to the driver's left), curvature, banking
    this.tx = new Float32Array(N); this.tz = new Float32Array(N); this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    this.curv = new Float32Array(N); this.grade = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N, dx = X[b] - X[a], dz = Z[b] - Z[a], m = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / m; this.tz[i] = dz / m; this.nx[i] = this.tz[i]; this.nz[i] = -this.tx[i];
      this.grade[i] = (Y[b] - Y[a]) / (2 * this.step);
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const h1 = Math.atan2(this.tz[a], this.tx[a]), h2 = Math.atan2(this.tz[b], this.tx[b]);
      let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      this.curv[i] = d / (6 * this.step);   // signed: + = turning towards +normal side? see turnSign()
    }
    // per-sample flags from the feature list
    this.edge = new Uint8Array(N);        // 0 wall, 1 void (fall off)
    this.surface = new Uint8Array(N);     // 0 normal, 1 ice
    for (const r of def.voids || []) this._range(r, i => { this.edge[i] = 1; });
    for (const r of def.ice || []) this._range(r, i => { this.surface[i] = 1; });
    this.shoulder = def.shoulder ?? 7;
    this.pads = (def.pads || []).map(([f, lat, len = 8]) => ({ i: this.idx(f), lat, len }));
    this.ramps = (def.ramps || []).map(([f, power = 1]) => ({ i: this.idx(f), power }));
    this.boxes = [];
    for (const [f, count = 5] of def.boxes || []) {
      const i = this.idx(f), hw = this.w[i] / 2 - 2.2;
      for (let k = 0; k < count; k++) {
        const lat = count === 1 ? 0 : -hw + (2 * hw) * k / (count - 1), p = this.at(i, lat);
        this.boxes.push({ x: p.x, z: p.z, y: this.y[i] + 1.2, i, t: 0 });
      }
    }
  }

  idx(f) { return ((Math.round(f * this.n) % this.n) + this.n) % this.n; }
  _range([a, b], fn) { const i0 = this.idx(a), i1 = this.idx(b); for (let i = i0; i !== i1; i = (i + 1) % this.n) fn(i); }
  wrap(i) { return ((i % this.n) + this.n) % this.n; }
  /** World position of sample i offset `lat` metres to the left (negative = right). */
  at(i, lat = 0) { i = this.wrap(i); return { x: this.x[i] + this.nx[i] * lat, z: this.z[i] + this.nz[i] * lat, y: this.y[i] }; }
  heading(i) { i = this.wrap(i); return Math.atan2(this.tz[i], this.tx[i]); }

  /**
   * Nearest sample to (x, z). With a hint index only a window around it is searched (fast, and it never jumps
   * to a different part of the track that happens to pass nearby). Returns { i, s, lat, f } where f is the
   * fraction (0..1) of the way between sample i and i+1.
   */
  project(x, z, hint = -1, win = 30) {
    let best = -1, bd = Infinity;
    if (hint < 0) { for (let i = 0; i < this.n; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } }
    else for (let k = -win; k <= win; k++) { const i = this.wrap(hint + k), d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    let i = best, dx = x - this.x[i], dz = z - this.z[i], along = dx * this.tx[i] + dz * this.tz[i];
    if (along < 0) { i = this.wrap(i - 1); dx = x - this.x[i]; dz = z - this.z[i]; along = dx * this.tx[i] + dz * this.tz[i]; }
    const f = Math.max(0, Math.min(1, along / this.step)), lat = dx * this.nx[i] + dz * this.nz[i];
    return { i, f, s: (i + f) * this.step, lat };
  }
  /** Road height at sample i + fraction f. */
  height(i, f = 0) { return lerp(this.y[i], this.y[this.wrap(i + 1)], f); }
  halfWidth(i) { return this.w[i] / 2; }

  /** Quick sanity data used by the tests: shortest turn radius and the closest approach of two distant parts. */
  stats() {
    let minR = Infinity; for (let i = 0; i < this.n; i++) minR = Math.min(minR, 1 / Math.max(1e-6, Math.abs(this.curv[i])));
    let minGap = Infinity, gapAt = null; const skip = Math.ceil(60 / this.step);
    for (let i = 0; i < this.n; i += 2) for (let j = i + skip; j < this.n; j += 2) {
      if (this.n - (j - i) < skip) continue;
      const d = Math.hypot(this.x[i] - this.x[j], this.z[i] - this.z[j]) - (this.w[i] + this.w[j]) / 2 - 2 * this.shoulder;
      const dy = Math.abs(this.y[i] - this.y[j]);
      if (dy < 6 && d < minGap) { minGap = d; gapAt = [i, j]; }
    }
    return { length: this.length, minR, minGap, gapAt };
  }
}
