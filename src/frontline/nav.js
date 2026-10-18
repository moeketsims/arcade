// Waypoint graph for the robot AI: nodes are sampled on every walkable floor (ground, mezzanine, stairs...),
// links are validated by actually walking the straight line with the same collision rules the bodies use.
import { walkClear } from './collision.js';

const HW = 0.4, H = 1.8;

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, id) { const a = this.a; a.push([f, id]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

export class NavGraph {
  constructor(level) { this.level = level; this.nodes = []; this.cell = 6; this.hash = new Map(); this._g = []; this._from = []; this._mark = []; this._stamp = 0; }

  /** Build from the level. opts: bounds {x0,x1,z0,z1}, extra [{x,y,z,tag}], seeds [{x,y,z}] (reachability roots), step (grid spacing). */
  static build(level, opts) {
    const g = new NavGraph(level), step = opts.step || 3, b = opts.bounds;
    const raw = [];
    const tmp = [];
    for (let x = b.x0 + 1; x <= b.x1 - 1; x += step) for (let z = b.z0 + 1; z <= b.z1 - 1; z += step) {
      level.standHeights(x, z, HW, H, tmp);
      for (const y of tmp) if (y < 6) raw.push({ x, y, z, tag: '' });
    }
    for (const e of opts.extra || []) {
      if (level.overlaps(e.x - HW, e.y + (e.tag === 'stairs' ? 0.58 : 0.05), e.z - HW, e.x + HW, e.y + H, e.z + HW)) continue;
      const t = level.topBetween(e.x, e.z, 0.1, e.y - 0.3, e.y + 0.3); if (t === -Infinity) continue;
      raw.push({ x: e.x, y: t, z: e.z, tag: e.tag || '' });
    }
    // de-duplicate nodes that are nearly the same place
    const kept = [];
    for (const r of raw) {
      if (r.tag === '' && kept.some(k => Math.abs(k.y - r.y) < 0.6 && Math.hypot(k.x - r.x, k.z - r.z) < 1.2)) continue;
      kept.push(r);
    }
    kept.forEach((n, i) => { n.id = i; n.links = []; n.cover = 0; });
    g.nodes = kept;
    g._hashAll();
    // links
    const Rgrid = step * 1.45, Rx = Math.max(3.6, step * 1.8);
    for (const a of g.nodes) {
      const R = a.tag ? Rx : Rgrid;
      const near = g.near(a.x, a.z, Rx, a.y, 3.2).filter(n => n !== a && Math.hypot(n.x - a.x, n.z - a.z) <= (n.tag ? Rx : R)).sort((p, q) => (Math.hypot(p.x - a.x, p.z - a.z)) - (Math.hypot(q.x - a.x, q.z - a.z)));
      let count = 0;
      for (const n of near) {
        if (count >= 12) break;
        if (a.links.some(l => l.to === n.id)) { count++; continue; }
        const dyAbs = Math.abs(n.y - a.y);
        if (walkClear(level, a.x, a.y, a.z, n.x, n.y, n.z, 0.33, H) && (dyAbs < 0.3 || walkClear(level, n.x, n.y, n.z, a.x, a.y, a.z, 0.33, H))) {
          const d = Math.hypot(n.x - a.x, n.z - a.z), dy = n.y - a.y;
          const cost = d + Math.abs(dy) * 1.5;
          a.links.push({ to: n.id, cost }); n.links.push({ to: a.id, cost }); count++;
        }
      }
    }
    // reachable component from the seeds
    if (opts.seeds?.length) {
      const seen = new Uint8Array(g.nodes.length), q = [];
      for (const s of opts.seeds) { const n = g.nearest(s.x, s.y, s.z, 6); if (n && !seen[n.id]) { seen[n.id] = 1; q.push(n.id); } }
      while (q.length) { const id = q.pop(); for (const l of g.nodes[id].links) if (!seen[l.to]) { seen[l.to] = 1; q.push(l.to); } }
      const map = new Int32Array(g.nodes.length).fill(-1); const out = [];
      g.nodes.forEach(n => { if (seen[n.id]) { map[n.id] = out.length; out.push(n); } });
      for (const n of out) { n.links = n.links.filter(l => map[l.to] >= 0).map(l => ({ to: map[l.to], cost: l.cost })); }
      out.forEach((n, i) => { n.id = i; });
      g.dropped = g.nodes.length - out.length; g.nodes = out; g._hashAll();
    }
    // cover score: blocked sight lines at hip height in 8 directions within 3 m
    for (const n of g.nodes) {
      let c = 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (level.blocked(n.x, n.y + 0.9, n.z, n.x + Math.sin(a) * 3, n.y + 0.9, n.z + Math.cos(a) * 3)) c++; }
      n.cover = c;
    }
    g._g = new Float32Array(g.nodes.length); g._from = new Int32Array(g.nodes.length); g._mark = new Int32Array(g.nodes.length);
    return g;
  }

  _hashAll() {
    this.hash.clear();
    for (const n of this.nodes) { const k = this._key(n.x, n.z); let a = this.hash.get(k); if (!a) this.hash.set(k, a = []); a.push(n); }
  }
  _key(x, z) { return (Math.floor(x / this.cell) + 512) * 1024 + (Math.floor(z / this.cell) + 512); }
  /** Nodes within radius r (horizontal) and |dy| <= dyMax of a point. */
  near(x, z, r, y = 0, dyMax = 99, out = []) {
    out.length = 0;
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.hash.get((ix + 512) * 1024 + (iz + 512)); if (!a) continue;
      for (const n of a) if (Math.abs(n.y - y) <= dyMax && Math.hypot(n.x - x, n.z - z) <= r) out.push(n);
    }
    return out;
  }
  /** Closest node to a position that can be walked to in a straight line (falls back to the closest). */
  nearest(x, y, z, maxR = 12) {
    let best = null, bd = Infinity; const cands = [];
    for (let r = 4; r <= maxR + 0.1; r += 4) {
      this.near(x, z, r, y, 2.6, cands);
      if (cands.length >= 3 || r >= maxR) break;
    }
    cands.sort((p, q) => (Math.hypot(p.x - x, p.z - z) + Math.abs(p.y - y) * 2) - (Math.hypot(q.x - x, q.z - z) + Math.abs(q.y - y) * 2));
    for (let i = 0; i < Math.min(5, cands.length); i++) {
      const n = cands[i];
      if (walkClear(this.level, x, y, z, n.x, n.y, n.z, 0.3, H)) return n;
    }
    if (cands.length) return cands[0];
    for (const n of this.nodes) { const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3; if (d < bd) { bd = d; best = n; } }
    return best;
  }

  /** A* between node ids. Returns an array of node ids (inclusive), or null. */
  path(from, to) {
    if (from === to) return [from];
    const nodes = this.nodes, g = this._g, came = this._from, mark = this._mark, stamp = ++this._stamp;
    const heap = new Heap(), goal = nodes[to];
    const h = n => Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y);
    g[from] = 0; came[from] = -1; mark[from] = stamp; heap.push(h(nodes[from]), from);
    const closed = new Set();
    while (heap.size) {
      const [, id] = heap.pop();
      if (id === to) { const out = [id]; let c = came[id]; while (c !== -1) { out.push(c); c = came[c]; } return out.reverse(); }
      if (closed.has(id)) continue; closed.add(id);
      const n = nodes[id];
      for (const l of n.links) {
        const ng = g[id] + l.cost;
        if (mark[l.to] !== stamp || ng < g[l.to]) { mark[l.to] = stamp; g[l.to] = ng; came[l.to] = id; heap.push(ng + h(nodes[l.to]), l.to); }
      }
    }
    return null;
  }
  pathLength(ids) { let d = 0; for (let i = 1; i < ids.length; i++) { const a = this.nodes[ids[i - 1]], b = this.nodes[ids[i]]; d += Math.hypot(a.x - b.x, a.z - b.z); } return d; }
}
