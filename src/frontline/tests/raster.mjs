// Tiny software rasteriser + PNG writer used ONLY by the Node tests, so layouts and viewmodels can be eyeballed without a browser.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function writePNG(path, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

export class Canvas {
  constructor(w, h, bg = [24, 28, 36]) {
    this.w = w; this.h = h; this.px = new Uint8Array(w * h * 4); this.z = new Float32Array(w * h).fill(Infinity);
    for (let i = 0; i < w * h; i++) { this.px[i * 4] = bg[0]; this.px[i * 4 + 1] = bg[1]; this.px[i * 4 + 2] = bg[2]; this.px[i * 4 + 3] = 255; }
  }
  set(x, y, r, g, b) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = 255; }
  rect(x0, y0, x1, y1, col, edge = null) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const e = edge && (x === x0 || x === x1 || y === y0 || y === y1); const c = e ? edge : col; this.set(x, y, c[0], c[1], c[2]); }
  }
  dot(x, y, r, col) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) this.set(x + dx, y + dy, col[0], col[1], col[2]); }
  line(x0, y0, x1, y1, col) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0; for (let i = 0; i <= n; i++) { const k = n ? i / n : 0; this.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, col[0], col[1], col[2]); } }
  save(path) { writePNG(path, this.w, this.h, this.px); }
  /** Filled triangle with z-buffer, vertices in pixel coordinates + depth. */
  tri(a, b, c, col) {
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxx = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxy = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-9) return;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2];
      const i = y * this.w + x; if (z >= this.z[i]) continue; this.z[i] = z;
      this.px[i * 4] = col[0]; this.px[i * 4 + 1] = col[1]; this.px[i * 4 + 2] = col[2]; this.px[i * 4 + 3] = 255;
    }
  }
}

/** Top-down plan of the level boxes (higher boxes lighter), spawns, nodes. */
export function plotTopDown(path, map, opt = {}) {
  const s = opt.scale || 9, b = map.bounds, pad = 4;
  const x0 = b.x0 - pad, z0 = b.z0 - pad, w = Math.ceil((b.x1 - b.x0 + pad * 2) * s), h = Math.ceil((b.z1 - b.z0 + pad * 2) * s);
  const cv = new Canvas(w, h, [30, 36, 46]);
  const P = (x, z) => [(x - x0) * s, (z - z0) * s];
  const boxes = [...map.level.boxes].filter(bx => bx.tag !== 'ground' && bx.tag !== 'ceiling' && bx.tag !== 'perimeter').sort((p, q) => p.maxy - q.maxy);
  if (opt.floorMax != null) { /* filter by floor */ }
  for (const bx of boxes) {
    if (opt.maxY != null && bx.miny > opt.maxY) continue;
    if (opt.cutY != null && !(bx.miny <= opt.cutY && bx.maxy >= opt.cutY)) continue;
    const k = Math.min(1, bx.maxy / 9);
    const base = [(bx.color >> 16) & 255, (bx.color >> 8) & 255, bx.color & 255];
    const sh = 0.45 + 0.55 * k;
    const [px0, pz0] = P(bx.minx, bx.minz), [px1, pz1] = P(bx.maxx, bx.maxz);
    cv.rect(px0, pz0, px1, pz1, base.map(v => Math.min(255, v * sh)), [10, 12, 16]);
  }
  for (const sp of map.spawns) { const [px, pz] = P(sp.x, sp.z); cv.dot(px, pz, 4, sp.team === 'A' ? [60, 140, 255] : sp.team === 'B' ? [255, 90, 70] : [255, 220, 60]); cv.line(px, pz, px + Math.sin(sp.h) * 12, pz + Math.cos(sp.h) * 12, [255, 255, 255]); }
  if (opt.nodes) for (const n of opt.nodes) { const [px, pz] = P(n.x, n.z); const c = n.y > 3.5 ? [255, 120, 255] : n.y > 0.4 ? [255, 160, 60] : [90, 255, 140]; cv.dot(px, pz, 1, c); }
  if (opt.edges) for (const [a, bb] of opt.edges) { const [ax, az] = P(a.x, a.z), [bx2, bz2] = P(bb.x, bb.z); cv.line(ax, az, bx2, bz2, [80, 90, 110]); }
  cv.save(path);
  return { w, h };
}

/** Render a THREE scene with flat shading + z-buffer. Handles Mesh (BufferGeometry), skips Points/Sprites/Instanced. */
export function renderScene(path, scene, camera, w = 640, h = 360, opt = {}) {
  const cv = opt.canvas || new Canvas(w, h, opt.bg || [120, 160, 200]);
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const view = new THREE.Matrix4().copy(camera.matrixWorldInverse), proj = camera.projectionMatrix;
  const vp = new THREE.Matrix4().multiplyMatrices(proj, view);
  const light = (opt.light || new THREE.Vector3(0.4, 0.8, 0.5)).clone().normalize();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const col = new THREE.Color();
  let tris = 0;
  scene.traverse(o => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; } if (!vis) return;
    const g = o.geometry; if (!g || !g.attributes.position) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = mats[0]; if (!m || m.visible === false) return;
    const pos = g.attributes.position, idx = g.index, colA = g.attributes.color;
    const base = new THREE.Color(m.color ? m.color : 0x888888);
    const emis = m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1) : null;
    const world = o.matrixWorld, cnt = idx ? idx.count : pos.count;
    for (let i = 0; i < cnt; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      const ids = [ia, ib, ic];
      let clipOut = true;
      for (let k = 0; k < 3; k++) {
        v[k].fromBufferAttribute(pos, ids[k]).applyMatrix4(world);
      }
      e1.subVectors(v[1], v[0]); e2.subVectors(v[2], v[0]); n.crossVectors(e1, e2).normalize();
      if (!(m.side === THREE.DoubleSide) && n.dot(v[0].clone().sub(camera.position)) > 0) { continue; }
      // transform to clip space and clip against the near plane (z >= -w)
      let poly = [];
      for (let k = 0; k < 3; k++) { const c4 = new THREE.Vector4(v[k].x, v[k].y, v[k].z, 1).applyMatrix4(vp); poly.push(c4); }
      const clipped = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length], da = A.z + A.w, db = B.z + B.w;
        if (da >= 0) clipped.push(A);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); clipped.push(new THREE.Vector4(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t, A.w + (B.w - A.w) * t)); }
      }
      if (clipped.length < 3) continue;
      const scr = clipped.map(c4 => { const nx = c4.x / c4.w, ny = c4.y / c4.w, nz = c4.z / c4.w; clipOut = false; return [(nx * 0.5 + 0.5) * w, (1 - (ny * 0.5 + 0.5)) * h, nz]; });
      if (clipOut) continue;
      let r, gg, b;
      if (colA) { col.setRGB(colA.getX(ia), colA.getY(ia), colA.getZ(ia)); r = base.r * col.r; gg = base.g * col.g; b = base.b * col.b; } else { r = base.r; gg = base.g; b = base.b; }
      const lam = 0.38 + 0.62 * Math.max(0, n.dot(light));
      r = r * lam + (emis ? emis.r : 0); gg = gg * lam + (emis ? emis.g : 0); b = b * lam + (emis ? emis.b : 0);
      const toS = c => Math.max(0, Math.min(255, Math.round(Math.pow(Math.min(1, c), 1 / 2.2) * 255)));
      for (let k = 1; k + 1 < scr.length; k++) cv.tri(scr[0], scr[k], scr[k + 1], [toS(r), toS(gg), toS(b)]);
      tris++;
    }
  });
  if (path) cv.save(path);
  return { tris, cv };
}
export function blit(dst, src, x0, y0) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 4; dst.set(x0 + x, y0 + y, src.px[i], src.px[i + 1], src.px[i + 2]); } }
