// Small math / helper toolbox for Frontline Ops (no DOM, no WebGL: safe to import in Node tests).
export const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const invLerp = (a, b, v) => (a === b ? 0 : clamp01((v - a) / (b - a)));
export const smooth = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
export const sign = v => (v < 0 ? -1 : v > 0 ? 1 : 0);
/** Frame-rate independent exponential smoothing toward a target. */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
/** Move `cur` toward `target` by at most `step`. */
export const approach = (cur, target, step) => (cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step));
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const chance = p => Math.random() < p;
/** Approximate gaussian in [-1, 1] (sum of uniforms). */
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Wrap an angle to (-PI, PI]. */
export function wrapPI(a) { a %= TAU; if (a > PI) a -= TAU; else if (a <= -PI) a += TAU; return a; }
/** Shortest signed difference b - a. */
export const angDiff = (a, b) => wrapPI(b - a);
/** Heading convention used everywhere: forward = (sin h, cos h) on the XZ plane (h = 0 faces +Z). */
export const headingTo = (dx, dz) => Math.atan2(dx, dz);
export const fwdX = h => Math.sin(h);
export const fwdZ = h => Math.cos(h);
/** Right-hand vector of heading h on XZ: (-cos h, sin h). */
export const rightX = h => -Math.cos(h);
export const rightZ = h => Math.sin(h);

export function fmtTime(sec, ms = false) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  const base = `${m}:${String(s).padStart(2, '0')}`;
  return ms ? `${base}.${String(Math.floor((sec % 1) * 100)).padStart(2, '0')}` : base;
}

/** Piecewise-linear lookup in a [[x, y], ...] table (x ascending). */
export function table(t, x) {
  if (x <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0)); }
  }
  return t[t.length - 1][1];
}

/** Keyframe interpolation: frames = [[t, value|array], ...], smoothstepped; returns number or array. */
export function kf(frames, t) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (t <= frames[i][0]) {
      const [t0, a] = frames[i - 1], [t1, b] = frames[i], k = smooth((t - t0) / Math.max(1e-6, t1 - t0));
      if (Array.isArray(a)) return a.map((v, j) => lerp(v, b[j], k));
      return lerp(a, b, k);
    }
  }
  return frames[frames.length - 1][1];
}

/** Critically-damped-ish spring used for viewmodel kick / sway. */
export class Spring {
  constructor(k = 90, d = 12, x = 0) { this.k = k; this.d = d; this.x = x; this.v = 0; }
  kick(impulse) { this.v += impulse; }
  update(dt, target = 0) {
    // sub-step for stability at low frame rates
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = -this.k * (this.x - target) - this.d * this.v; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
}

/** Escape text for innerHTML. */
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
