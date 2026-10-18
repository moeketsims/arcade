// Island terrain: a sampled heightfield (bilinear-exact with the rendered mesh), POI definitions, roads, colours.
import * as THREE from 'three';
import { fbm, vnoise, smoothstep, clamp, lerp, mulberry32 } from './noise.js';
import { SEA } from './config.js';

export const HALF = 320;          // terrain covers [-HALF, HALF]
export const STEP = 2.5;
export const N = Math.round((HALF * 2) / STEP) + 1;   // 257 samples per side

const POI_DEFS = [
  { id: 'pinecrest', name: 'Pinecrest Village', x: -118, z: -100, flat: 42, kind: 'village' },
  { id: 'docks', name: 'Rusty Docks', coast: Math.atan2(75, 170), flat: 32, kind: 'docks' },
  { id: 'farm', name: 'Sunflower Farm', x: -158, z: 122, flat: 42, kind: 'farm' },
  { id: 'quarry', name: 'Granite Quarry', x: 128, z: -152, flat: 38, kind: 'quarry' },
  { id: 'beacon', name: 'Beacon Heights', x: 14, z: 12, flat: 32, kind: 'hills' },
  { id: 'lodge', name: 'Lakeshore Lodge', x: 82, z: 112, flat: 30, kind: 'lodge' },
];

export class Terrain {
  constructor(seed = 7) {
    this.seed = seed;
    this.h = new Float32Array(N * N);
    this.pois = []; this.sites = []; this.roads = []; this.fields = [];
    this.lake = { x: 14, z: 130, r: 40 };
    this.bump = { x: 14, z: 12, r: 70, a: 15 };
    // 1) raw terrain
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) this.h[iz * N + ix] = this.rawHeight(-HALF + ix * STEP, -HALF + iz * STEP);
    // 2) POI positions (docks sit on the coast) + plateaus
    for (const d of POI_DEFS) {
      const p = { ...d, r: d.flat + 12 };
      if (d.coast !== undefined) {
        const dx = Math.cos(d.coast), dz = Math.sin(d.coast);
        let rr = 120; while (rr < 300 && this.rawHeight(dx * rr, dz * rr) > 1.0) rr += 1;
        p.shoreR = rr; p.x = dx * (rr - 16); p.z = dz * (rr - 16); p.outX = dx; p.outZ = dz;
      }
      const ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => this.rawHeight(p.x + a * d.flat * 0.5, p.z + b * d.flat * 0.5));
      p.y = d.kind === 'docks' ? 2.3 : clamp(ring.reduce((s, v) => s + v, 0) / ring.length, 2.8, 24);
      this.pois.push(p);
      this.flatten(p.x, p.z, d.flat, d.flat + 22, p.y);
    }
    // 3) lone cabin sites
    const rng = mulberry32(seed * 977 + 13);
    let tries = 0;
    while (this.sites.length < 12 && tries++ < 400) {
      const a = rng() * Math.PI * 2, r = 50 + rng() * 190, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.rawHeight(x, z) < 3.0 || this.slopeAt(x, z) > 0.18) continue;
      if (this.pois.some(p => Math.hypot(p.x - x, p.z - z) < p.flat + 45)) continue;
      if (this.sites.some(s => Math.hypot(s.x - x, s.z - z) < 70)) continue;
      if (Math.hypot(x - this.lake.x, z - this.lake.z) < this.lake.r + 20) continue;
      const y = clamp(this.heightAt(x, z), 3.0, 22);
      this.sites.push({ x: Math.round(x / 4) * 4, z: Math.round(z / 4) * 4, y });
      this.flatten(x, z, 11, 20, y);
    }
    // 4) roads between POIs (dirt paths, also used to keep trees off them)
    const P = id => this.pois.find(p => p.id === id);
    const link = (a, b) => this.roads.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    link(P('pinecrest'), P('beacon')); link(P('beacon'), P('quarry')); link(P('beacon'), P('lodge')); link(P('lodge'), P('docks'));
    link(P('beacon'), P('farm')); link(P('pinecrest'), P('farm')); link(P('beacon'), P('docks'));
    // 5) farm fields
    const f = P('farm');
    this.fields.push({ x0: f.x + 12, z0: f.z - 34, x1: f.x + 52, z1: f.z + 4, kind: 'sun' }, { x0: f.x - 52, z0: f.z + 10, x1: f.x - 12, z1: f.z + 48, kind: 'wheat' }, { x0: f.x - 6, z0: f.z + 16, x1: f.x + 36, z1: f.z + 50, kind: 'soil' });
  }

  rawHeight(x, z) {
    const s = this.seed;
    const r = Math.hypot(x, z);
    const edge = 276 + 34 * (fbm(x * 0.009 + 3.1, z * 0.009 - 1.7, 3, s) - 0.5) * 2 + 9 * (fbm(x * 0.03, z * 0.03, 2, s + 5) - 0.5) * 2;
    const m = smoothstep(-0.12, 1.0, (edge - r) / 66);
    let base = 4.6 + (fbm(x * 0.0085 + 11, z * 0.0085 + 4, 4, s + 1) - 0.5) * 24;
    base += (fbm(x * 0.03 + 5, z * 0.03 + 9, 3, s + 2) - 0.5) * 4.5;
    const b = this.bump; if (b) { const d2 = ((x - b.x) ** 2 + (z - b.z) ** 2) / (2 * b.r * b.r); base += b.a * Math.exp(-d2); }
    let h = lerp(-9.5, Math.max(base, 1.4), m);
    const L = this.lake; if (L) h -= 15 * Math.exp(-((x - L.x) ** 2 + (z - L.z) ** 2) / (2 * (L.r * 0.55) ** 2));
    return h;
  }

  flatten(cx, cz, r0, r1, y) {
    const i0 = Math.max(0, Math.floor((cx - r1 + HALF) / STEP)), i1 = Math.min(N - 1, Math.ceil((cx + r1 + HALF) / STEP));
    const j0 = Math.max(0, Math.floor((cz - r1 + HALF) / STEP)), j1 = Math.min(N - 1, Math.ceil((cz + r1 + HALF) / STEP));
    for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const x = -HALF + ix * STEP, z = -HALF + iz * STEP, d = Math.hypot(x - cx, z - cz);
      if (d >= r1) continue;
      const w = 1 - smoothstep(r0, r1, d), k = iz * N + ix;
      this.h[k] = lerp(this.h[k], y, w);
    }
  }

  /** Height at (x,z): triangle-exact with the rendered mesh. */
  heightAt(x, z) {
    let fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    fx = fx < 0 ? 0 : fx > N - 1.0001 ? N - 1.0001 : fx; fz = fz < 0 ? 0 : fz > N - 1.0001 ? N - 1.0001 : fz;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, h = this.h, k = iz * N + ix;
    const a = h[k], d = h[k + 1], b = h[k + N], c = h[k + N + 1];
    return tx + tz <= 1 ? a + tx * (d - a) + tz * (b - a) : c + (1 - tx) * (b - c) + (1 - tz) * (d - c);
  }
  slopeAt(x, z) { const e = 2.5; return Math.hypot(this.heightAt(x + e, z) - this.heightAt(x - e, z), this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e); }
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 1.25; return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }
  isLand(x, z, margin = 0.3) { return this.heightAt(x, z) > SEA + margin; }
  /** Walkable ground level (wading floor is capped so characters never sink below the waist). */
  groundAt(x, z) { return Math.max(this.heightAt(x, z), SEA - 1.0); }
  poi(id) { return this.pois.find(p => p.id === id); }
  nearestPoi(x, z) { let b = null, bd = 1e9; for (const p of this.pois) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b; }
  roadDist(x, z) {
    let best = 1e9;
    for (const r of this.roads) {
      const vx = r.bx - r.ax, vz = r.bz - r.az, wx = x - r.ax, wz = z - r.az, t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(wx - vx * t, wz - vz * t));
    }
    return best;
  }
  fieldAt(x, z) { for (const f of this.fields) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return f; return null; }

  /** Ground colour (r,g,b 0..1) for terrain vertices and the minimap. */
  colorAt(x, z, h, slope, out) {
    let r, g, b;
    const n = vnoise(x * 0.09, z * 0.09, 3), n2 = vnoise(x * 0.5, z * 0.5, 9);
    if (h < -4) { r = 0.10; g = 0.28; b = 0.40; }
    else if (h < 0.3) { const t = clamp((h + 4) / 4.3, 0, 1); r = lerp(0.12, 0.74, t * t); g = lerp(0.40, 0.70, t); b = lerp(0.52, 0.58, t); }
    else if (h < 1.7 + n * 0.9) { r = 0.90 - n2 * 0.05; g = 0.82 - n2 * 0.05; b = 0.58; }
    else {
      const gr = 0.5 + n * 0.5;
      r = lerp(0.28, 0.43, gr); g = lerp(0.56, 0.68, gr); b = lerp(0.21, 0.26, gr);
      if (h > 14) { const t = clamp((h - 14) / 10, 0, 1) * 0.6; r = lerp(r, 0.55, t); g = lerp(g, 0.60, t); b = lerp(b, 0.50, t); }
      if (slope > 0.42) { const t = clamp((slope - 0.42) / 0.3, 0, 1); r = lerp(r, 0.52, t); g = lerp(g, 0.50, t); b = lerp(b, 0.47, t); }
    }
    if (h > 0.5) {
      const rd = this.roadDist(x, z);
      if (rd < 3.2) { const t = 1 - smoothstep(1.8, 3.2, rd); r = lerp(r, 0.62, t); g = lerp(g, 0.50, t); b = lerp(b, 0.34, t); }
      const f = this.fieldAt(x, z);
      if (f) {
        const row = Math.floor((f.kind === 'wheat' ? x : z) / 3.2) & 1;
        if (f.kind === 'sun') { r = row ? 0.44 : 0.38; g = row ? 0.60 : 0.54; b = 0.20; }
        else if (f.kind === 'wheat') { r = row ? 0.86 : 0.78; g = row ? 0.70 : 0.62; b = 0.30; }
        else { r = row ? 0.40 : 0.34; g = row ? 0.27 : 0.22; b = 0.17; }
      }
      for (const p of this.pois) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.flat - 6 && (p.kind === 'docks' || p.kind === 'quarry')) { const t = 0.55 * (1 - smoothstep(p.flat - 14, p.flat - 6, d)); r = lerp(r, 0.60, t); g = lerp(g, 0.58, t); b = lerp(b, 0.55, t); }
        else if (d < 9 && p.kind === 'village') { const t = 1 - smoothstep(5, 9, d); r = lerp(r, 0.66, t); g = lerp(g, 0.63, t); b = lerp(b, 0.58, t); }
      }
    }
    out[0] = r; out[1] = g; out[2] = b; return out;
  }

  /** Terrain mesh (vertex-coloured). */
  buildMesh(detailTex = null) {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), tmp = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.h[i];
      pos.setY(i, h);
      this.colorAt(x, z, h, this.slopeAt(x, z), tmp);
      col[i * 3] = Math.pow(tmp[0], 1.8); col[i * 3 + 1] = Math.pow(tmp[1], 1.8); col[i * 3 + 2] = Math.pow(tmp[2], 1.8);   // palette is in display (sRGB-ish) values; vertex colours are linear
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: detailTex || null });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.name = 'terrain';
    return mesh;
  }

  /** RGBA bytes (size×size) of the whole island for the minimap, with simple hill shading. */
  minimapPixels(size = 256, span = 560) {
    const px = new Uint8ClampedArray(size * size * 4), tmp = [0, 0, 0];
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * span, z = (j / (size - 1) - 0.5) * span, h = this.heightAt(x, z);
      this.colorAt(x, z, h, this.slopeAt(x, z), tmp);
      const sh = clamp(1 + (this.heightAt(x - 3, z - 3) - this.heightAt(x + 3, z + 3)) * 0.07, 0.7, 1.25);
      const k = (j * size + i) * 4;
      px[k] = tmp[0] * 255 * sh; px[k + 1] = tmp[1] * 255 * sh; px[k + 2] = tmp[2] * 255 * sh; px[k + 3] = 255;
    }
    return px;
  }
}
