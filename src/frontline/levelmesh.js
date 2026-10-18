// Turns the map's boxes into a handful of merged meshes (one draw call per material), plus sky dome, sea and lamp glow.
import * as THREE from 'three';
import { Tex } from './textures.js';
import { mulberry32 } from './util.js';

const TILE = { concrete: 3.0, ground: 8.0, metal: 2.0, wood: 1.4, brick: 2.0, sheet: 1.2, drywall: 3.0, salt: 2.5, fence: 0.5, glass: 2, paint: 4, rail: 2, emissive: 1 };

function groupOf(b) { return b.group || b.mat; }

class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  quad(p0, p1, p2, p3, nx, ny, nz, uvs, c) {
    const base = this.n;
    for (const p of [p0, p1, p2, p3]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(c.r, c.g, c.b); }
    this.uv.push(...uvs);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); this.n += 4;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

function addBox(batch, b, tile, rnd) {
  const x0 = b.minx, x1 = b.maxx, y0 = b.miny, y1 = b.maxy, z0 = b.minz, z1 = b.maxz;
  const c = new THREE.Color(b.color); const v = 0.94 + rnd() * 0.12; c.multiplyScalar(v);
  const U = (a, bb) => [a / tile, bb / tile];
  if (b.shape === 'cyl') { addCyl(batch, b, tile, c); return; }
  const f = (m) => !(b.nofaces & m);
  // +X
  if (f(2)) batch.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, [...U(z1, y0), ...U(z0, y0), ...U(z0, y1), ...U(z1, y1)], c);
  // -X
  if (f(1)) batch.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, [...U(z0, y0), ...U(z1, y0), ...U(z1, y1), ...U(z0, y1)], c);
  // +Y
  if (f(8)) batch.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, [...U(x0, z1), ...U(x1, z1), ...U(x1, z0), ...U(x0, z0)], c);
  // -Y
  if (f(4)) batch.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, [...U(x0, z0), ...U(x1, z0), ...U(x1, z1), ...U(x0, z1)], c);
  // +Z
  if (f(32)) batch.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, [...U(x0, y0), ...U(x1, y0), ...U(x1, y1), ...U(x0, y1)], c);
  // -Z
  if (f(16)) batch.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, [...U(x1, y0), ...U(x0, y0), ...U(x0, y1), ...U(x1, y1)], c);
}

function addCyl(batch, b, tile, c) {
  const seg = 14, cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2, rx = (b.maxx - b.minx) / 2, rz = (b.maxz - b.minz) / 2, y0 = b.miny, y1 = b.maxy;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = [cx + Math.sin(a0) * rx, y0, cz + Math.cos(a0) * rz], p1 = [cx + Math.sin(a1) * rx, y0, cz + Math.cos(a1) * rz];
    const p2 = [p1[0], y1, p1[2]], p3 = [p0[0], y1, p0[2]];
    const u0 = i / seg * (rx * 2 * Math.PI) / tile, u1 = (i + 1) / seg * (rx * 2 * Math.PI) / tile;
    batch.quad(p0, p1, p2, p3, Math.sin(am), 0, Math.cos(am), [u0, y0 / tile, u1, y0 / tile, u1, y1 / tile, u0, y1 / tile], c);
    // top cap fan as quads (degenerate quad = triangle)
    batch.quad([cx, y1, cz], p3, p2, [cx, y1, cz], 0, 1, 0, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], c);
  }
}

const MATS = {};
function groupMaterial(g, whiteTint = true) {
  if (MATS[g]) return MATS[g];
  const common = { vertexColors: true };
  let m;
  switch (g) {
    case 'ground': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.ground(), roughness: 0.95, metalness: 0 }); break;
    case 'concrete': case 'salt': case 'drywall': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.concrete(), roughness: 0.92, metalness: 0 }); break;
    case 'brick': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.brick(), roughness: 0.9, metalness: 0 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.metal(), roughness: 0.55, metalness: 0.3 }); break;
    case 'sheet': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.sheet(), roughness: 0.6, metalness: 0.35 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.wood(), roughness: 0.85, metalness: 0 }); break;
    case 'rail': m = new THREE.MeshStandardMaterial({ ...common, roughness: 0.5, metalness: 0.5 }); break;
    case 'fence': m = new THREE.MeshStandardMaterial({ ...common, map: Tex.fence(), transparent: !!Tex.fence(), alphaTest: Tex.fence() ? 0.4 : 0, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, opacity: Tex.fence() ? 1 : 0.5 }); if (!Tex.fence()) m.transparent = true; break;
    case 'glass': m = new THREE.MeshStandardMaterial({ ...common, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1 }); break;
    case 'paint': m = new THREE.MeshStandardMaterial({ ...common, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); break;
    case 'emissive': m = new THREE.MeshBasicMaterial({ color: 0xfff2d0 }); break;
    default: m = new THREE.MeshStandardMaterial({ ...common, roughness: 0.9 });
  }
  MATS[g] = m; return m;
}

/** Build merged meshes for a map. Returns { group, meshes }. */
export function buildLevelMeshes(map) {
  const group = new THREE.Group(); group.name = 'level';
  const batches = new Map(); const rnd = mulberry32(99);
  const consume = (b) => {
    if (b.visible === false) return;
    const g = groupOf(b); let bt = batches.get(g); if (!bt) batches.set(g, bt = new Batch());
    addBox(bt, b, TILE[g] || 3, rnd);
  };
  for (const b of map.level.boxes) consume(b);
  for (const b of map.decor) consume(b);
  // lamps: small emissive panels
  if (map.lamps?.length) {
    const bt = new Batch(); const c = new THREE.Color(0xfff2d0);
    for (const l of map.lamps) addBox(bt, { minx: l.x - 0.45, maxx: l.x + 0.45, miny: l.y - 0.05, maxy: l.y + 0.05, minz: l.z - 0.15, maxz: l.z + 0.15, color: 0xfff2d0, shape: 'box', nofaces: 0 }, 1, () => 0.5);
    batches.set('emissive', bt);
  }
  const meshes = [];
  for (const [g, bt] of batches) {
    const mesh = new THREE.Mesh(bt.geometry(), groupMaterial(g));
    mesh.name = 'level:' + g;
    mesh.castShadow = !['paint', 'fence', 'glass', 'emissive', 'ground'].includes(g);
    mesh.receiveShadow = !['emissive', 'glass'].includes(g);
    mesh.matrixAutoUpdate = false;
    group.add(mesh); meshes.push(mesh);
  }
  return { group, meshes };
}

// ---------------------------------------------------------------------------------------------------------------
// Sky, sea, far scenery
// ---------------------------------------------------------------------------------------------------------------
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x3f86d4) }, uHorizon: { value: new THREE.Color(0xcfe3f2) }, uBottom: { value: new THREE.Color(0x8aa0b0) }, uSun: { value: new THREE.Vector3(-0.45, 0.7, 0.55).normalize() }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        c = mix(c, uBottom, 1.0 - smoothstep(-0.25, 0.0, h));
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.86, 0.62) * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.22);
        if (h > 0.02) { vec2 uv = d.xz / (h + 0.28) * 1.6 + vec2(uTime * 0.01, 0.0); float n = fbm(uv); float cl = smoothstep(0.52, 0.82, n) * smoothstep(0.02, 0.25, h); c = mix(c, vec3(1.0), cl * 0.55); }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 18), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.name = 'sky';
  return mesh;
}

export function makeSea(extra = {}) {
  const t = Tex.water();
  if (t) { t.repeat.set(60, 40); }
  const mat = new THREE.MeshStandardMaterial({ color: t ? 0xbfe6f4 : 0x2e7e9e, map: t, roughness: 0.18, metalness: 0.05, transparent: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(0, -1.1, -380); m.receiveShadow = true; m.name = 'sea';
  return m;
}

/** Far scenery: a moored ship and hills on the horizon (visual only). */
export function makeFarScenery() {
  const g = new THREE.Group(); g.name = 'far';
  const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.2 });
  const box = (w, h, d, x, y, z, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; };
  // ship moored beyond the quay
  box(120, 9, 22, 30, 2.5, -78, 0x2b3340); box(120, 1.2, 22.4, 30, 7.4, -78, 0x8f2f2a);
  box(26, 14, 16, 70, 15, -80, 0xdfe3e6); box(18, 8, 12, 70, 25, -80, 0xcfd3d6); box(4, 8, 4, 78, 33, -80, 0xb5382f);
  const cols = [0xb5382f, 0x2f5fa8, 0xd9822b, 0x3d7a4a, 0xd5d9dc, 0xd6b02f];
  for (let i = 0; i < 14; i++) for (let k = 0; k < 2; k++) box(6, 2.6, 2.5, -20 + i * 6.5, 9.8 + k * 2.6, -78 + (k ? 2 : -3), cols[(i * 3 + k) % cols.length]);
  // hills
  for (let i = 0; i < 9; i++) { const h = 20 + (i * 37 % 30), r = 55 + (i * 53 % 40); const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(0x7f9aa8 + (i % 3) * 0x050505, 1)); m.position.set(-300 + i * 80, h / 2 - 2, -420 - (i % 2) * 50); g.add(m); }
  // distant cranes
  for (const x of [-150, -60, 90, 170]) { box(3, 40, 3, x, 18, -240, 0xd6a31f); box(60, 3, 3, x + 18, 38, -240, 0xd6a31f); }
  return g;
}

/** Image-based light from the sky dome (browser only; needs a WebGL renderer). */
export function makeEnvironment(renderer, sky) {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene(); s.add(sky.clone());
    const rt = pm.fromScene(s, 0.04);
    pm.dispose();
    return rt.texture;
  } catch { return null; }
}
