// Dev tool: tiny software rasteriser so scenes can be inspected as PNGs without a browser/GPU.
// usage: import { render, writePNG } from './raster.mjs'; const img = render(scene, camera, 800, 450); writePNG('out.png', img);
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';

export function writePNG(path, img) {
  const { w, h, rgba } = img;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = buf => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const SUN = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
export function render(scene, camera, W = 800, H = 450, opts = {}) {
  const sky = new THREE.Color(opts.sky ?? 0x9ccbee), fogCol = new THREE.Color(opts.fog ?? 0xbcd8ee), fogFar = opts.fogFar ?? 0;
  const rgba = new Uint8ClampedArray(W * H * 4), depth = new Float32Array(W * H).fill(1e9);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = (y * W + x) * 4, t = y / H; rgba[k] = (sky.r * (1 - t * 0.35) + 0.2 * t) * 255; rgba[k + 1] = (sky.g * (1 - t * 0.3) + 0.2 * t) * 255; rgba[k + 2] = (sky.b * (1 - t * 0.2) + 0.15 * t) * 255; rgba[k + 3] = 255; }
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const view = camera.matrixWorldInverse, vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, view);
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const opaque = [], trans = [];
  scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    let p = o; while (p) { if (p.visible === false) return; p = p.parent; }
    if (opts.filter && !opts.filter(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material; if (!m) return;
    ((m.transparent && m.opacity < 1) || m.blending === THREE.AdditiveBlending ? trans : opaque).push(o);
  });
  const mw = new THREE.Matrix4(), mvp = new THREE.Matrix4(), im = new THREE.Matrix4(), v = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
  const wp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let tris = 0;
  function drawMesh(o, pass) {
    const g = o.geometry, pos = g.attributes.position, idx = g.index, colA = g.attributes.color;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const base = new THREE.Color(m.color ?? 0xffffff), emis = m.emissive ? new THREE.Color(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1) : null;
    const unlit = m.isMeshBasicMaterial, useVC = !!m.vertexColors && !!colA;
    const alpha = pass === 'trans' ? (m.opacity ?? 1) : 1, additive = m.blending === THREE.AdditiveBlending, dbl = m.side === THREE.DoubleSide;
    const count = o.isInstancedMesh ? o.count : 1, triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let ii = 0; ii < count; ii++) {
      if (o.isInstancedMesh) { o.getMatrixAt(ii, im); mw.multiplyMatrices(o.matrixWorld, im); } else mw.copy(o.matrixWorld);
      mvp.multiplyMatrices(vp, mw);
      const ic = o.isInstancedMesh && o.instanceColor ? new THREE.Color().fromArray(o.instanceColor.array, ii * 3) : null;
      for (let t = 0; t < triCount; t++) {
        const ia = idx ? idx.getX(t * 3) : t * 3, ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, ic2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2, ids = [ia, ib, ic2];
        for (let k = 0; k < 3; k++) { wp[k].fromBufferAttribute(pos, ids[k]).applyMatrix4(mw); v[k].set(pos.getX(ids[k]), pos.getY(ids[k]), pos.getZ(ids[k]), 1).applyMatrix4(mvp); }
        e1.subVectors(wp[1], wp[0]); e2.subVectors(wp[2], wp[0]); nrm.crossVectors(e1, e2); const nl = nrm.length(); if (nl < 1e-12) continue; nrm.divideScalar(nl);
        const toCam = new THREE.Vector3().subVectors(camPos, wp[0]);
        const facing = nrm.dot(toCam) > 0;
        if (!facing && !dbl) continue;
        const nn = facing ? nrm : nrm.clone().negate();
        let r = base.r, g2 = base.g, b = base.b;
        if (ic) { r *= ic.r; g2 *= ic.g; b *= ic.b; }
        if (useVC) { const cr = (colA.getX(ia) + colA.getX(ib) + colA.getX(ic2)) / 3, cg = (colA.getY(ia) + colA.getY(ib) + colA.getY(ic2)) / 3, cb = (colA.getZ(ia) + colA.getZ(ib) + colA.getZ(ic2)) / 3; r *= cr; g2 *= cg; b *= cb; }
        if (!unlit) { const l = 0.38 + 0.1 * nn.y + 0.7 * Math.max(0, nn.dot(SUN)); r *= l; g2 *= l; b *= l; }
        if (emis) { r += emis.r; g2 += emis.g; b += emis.b; }
        if (fogFar) { const d = toCam.length(), f = Math.min(1, Math.max(0, (d - fogFar * 0.2) / (fogFar * 0.8))); r += (fogCol.r - r) * f; g2 += (fogCol.g - g2) * f; b += (fogCol.b - b) * f; }
        // clip polygon against near plane (w > 0.05)
        const poly = [v[0].clone(), v[1].clone(), v[2].clone()]; const out = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], c = poly[(i + 1) % poly.length], ain = a.w > 0.05, cin = c.w > 0.05;
          if (ain) out.push(a);
          if (ain !== cin) { const k = (0.05 - a.w) / (c.w - a.w); out.push(new THREE.Vector4(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k, 0.05)); }
        }
        if (out.length < 3) continue;
        const sp = out.map(q => [(q.x / q.w * 0.5 + 0.5) * W, (1 - (q.y / q.w * 0.5 + 0.5)) * H, q.z / q.w]);
        for (let k = 1; k < sp.length - 1; k++) {
          const A = sp[0], B = sp[k], C = sp[k + 1];
          const minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxx = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
          const miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxy = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
          if (minx > maxx || miny > maxy) continue;
          const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(den) < 1e-9) continue;
          tris++;
          for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
            const px = x + 0.5, py = y + 0.5;
            const l1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den, l2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den, l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            const z = l1 * A[2] + l2 * B[2] + l3 * C[2]; const di = y * W + x;
            if (z < -1 || z > depth[di]) continue;
            const q = di * 4;
            if (pass === 'opaque') { depth[di] = z; rgba[q] = r * 255; rgba[q + 1] = g2 * 255; rgba[q + 2] = b * 255; }
            else if (additive) { rgba[q] += r * 255 * alpha; rgba[q + 1] += g2 * 255 * alpha; rgba[q + 2] += b * 255 * alpha; }
            else { rgba[q] = rgba[q] * (1 - alpha) + r * 255 * alpha; rgba[q + 1] = rgba[q + 1] * (1 - alpha) + g2 * 255 * alpha; rgba[q + 2] = rgba[q + 2] * (1 - alpha) + b * 255 * alpha; }
          }
        }
      }
    }
  }
  for (const o of opaque) drawMesh(o, 'opaque');
  for (const o of trans) drawMesh(o, 'trans');
  // linear -> sRGB
  const lut = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(i / 255, 1 / 2.2);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = lut[Math.min(255, rgba[i] | 0)]; rgba[i + 1] = lut[Math.min(255, rgba[i + 1] | 0)]; rgba[i + 2] = lut[Math.min(255, rgba[i + 2] | 0)]; }
  return { w: W, h: H, rgba, tris };
}
