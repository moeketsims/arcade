// Navigation grid for bots: 1 m cells (centres on integer coordinates, so 1.6 m door gaps are exactly one free cell) + A* with path smoothing.
import { SEA } from './config.js';

const R = 320, N = R * 2 + 1;
const SQ2 = 1.41421356;

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.v.length = 0; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val); while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length; if (!n) return top;
    let i = 0; while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv; return top;
  }
}

export class NavGrid {
  constructor() {
    this.blocked = new Uint8Array(N * N); this.g = new Float32Array(N * N); this.parent = new Int32Array(N * N); this.stamp = new Uint32Array(N * N); this.closed = new Uint32Array(N * N); this.sid = 0; this.heap = new Heap();
  }
  idx(x, z) { return (Math.round(z) + R) * N + (Math.round(x) + R); }
  inRange(ix, iz) { return ix >= 0 && iz >= 0 && ix < N && iz < N; }
  isBlockedAt(x, z) { const ix = Math.round(x) + R, iz = Math.round(z) + R; return !this.inRange(ix, iz) || this.blocked[iz * N + ix] === 1; }

  /** Rebuild from the collision world and terrain. */
  build(cw, T) {
    const b = this.blocked; b.fill(0);
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const x = ix - R, z = iz - R; if (Math.abs(x) > 300 || Math.abs(z) > 300 || T.heightAt(x, z) < SEA + 0.35) b[iz * N + ix] = 1;
    }
    const pad = 0.28; let count = 0;
    cw.forEachSolid(s => {
      if (s.block === false) return;
      const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2, gy = T.heightAt(cx, cz);
      if (!(s.maxY > gy + 0.7 && s.minY < gy + 1.9)) return;
      const i0 = Math.ceil(s.minX - pad), i1 = Math.floor(s.maxX + pad), j0 = Math.ceil(s.minZ - pad), j1 = Math.floor(s.maxZ + pad);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (i < -R || j < -R || i > R || j > R) continue; b[(j + R) * N + (i + R)] = 1; }
      count++;
    });
    this.count = count;
  }

  /** Nearest free cell to (x,z) within r cells, or null. */
  freeNear(x, z, r = 4) {
    const cx = Math.round(x), cz = Math.round(z);
    if (!this.isBlockedAt(cx, cz)) return [cx, cz];
    for (let d = 1; d <= r; d++) {
      let best = null, bd = 1e9;
      for (let dz = -d; dz <= d; dz++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue; if (this.isBlockedAt(cx + dx, cz + dz)) continue; const dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = [cx + dx, cz + dz]; } }
      if (best) return best;
    }
    return null;
  }

  /** Straight-line check over grid cells (supercover Bresenham). */
  los(x0, z0, x1, z1) {
    let dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1, err = dx - dz, x = x0, z = z0;
    for (let n = 0; n < 2000; n++) {
      if (this.isBlockedAt(x, z)) return false; if (x === x1 && z === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) { // diagonal step: both orthogonal neighbours must be free (no corner cutting)
        if (this.isBlockedAt(x + sx, z) || this.isBlockedAt(x, z + sz)) return false; err -= dz; err += dx; x += sx; z += sz;
      } else if (e2 > -dz) { err -= dz; x += sx; } else { err += dx; z += sz; }
    }
    return false;
  }

  /** A* from (x0,z0) to (x1,z1). Returns [[x,z],...] (smoothed, ending exactly at the goal) or null. */
  find(x0, z0, x1, z1, maxNodes = 9000) {
    const s = this.freeNear(x0, z0, 3), e = this.freeNear(x1, z1, 5); if (!s || !e) return null;
    const sId = ++this.sid, gScore = this.g, parent = this.parent, stamp = this.stamp, closed = this.closed, heap = this.heap; heap.clear();
    const start = (s[1] + R) * N + (s[0] + R), goal = (e[1] + R) * N + (e[0] + R), gx = e[0], gz = e[1];
    const h = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); };
    stamp[start] = sId; gScore[start] = 0; parent[start] = -1; heap.push(h(s[0], s[1]), start);
    let nodes = 0, found = false; const b = this.blocked;
    while (heap.size) {
      const cur = heap.pop(); if (closed[cur] === sId) continue; closed[cur] = sId;
      if (cur === goal) { found = true; break; } if (++nodes > maxNodes) break;
      const cz = (cur / N) | 0, cx = cur - cz * N;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx; if (b[ni] || closed[ni] === sId) continue;
        if (dx && dz && (b[cz * N + nx] || b[nz * N + cx])) continue;   // no corner cutting
        const ng = gScore[cur] + (dx && dz ? SQ2 : 1);
        if (stamp[ni] !== sId || ng < gScore[ni]) { stamp[ni] = sId; gScore[ni] = ng; parent[ni] = cur; heap.push(ng + h(nx - R, nz - R), ni); }
      }
    }
    if (!found) return null;
    const cells = []; for (let c = goal; c !== -1; c = parent[c]) { const z = (c / N) | 0; cells.push([c - z * N - R, z - R]); } cells.reverse();
    // string pulling
    const out = [cells[0]]; let anchor = 0;
    for (let i = 2; i < cells.length; i++) { if (!this.los(cells[anchor][0], cells[anchor][1], cells[i][0], cells[i][1])) { out.push(cells[i - 1]); anchor = i - 1; } }
    out.push(cells[cells.length - 1]);
    out.shift(); // drop the start cell
    if (out.length) out[out.length - 1] = [x1, z1];
    return out;
  }
}
