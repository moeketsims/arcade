// Dash Derby track rendering: road, kerbs, shoulders, barriers, embankments or floating-island cliffs, start gantry,
// boost pads, ramps, sky, water and themed scenery, all generated from the Track samples and canvas textures.
import * as THREE from 'three';
import { mat, mesh } from './models.js';

export const THEMES = {
  meadow: { skyTop: 0x5fb8ff, skyBot: 0xdff4ff, fog: 0xcfe9ff, fogFar: 520, ground: '#5fae45', shoulder: '#6fbf52', road: '#56595f', line: '#ffffff', kerb: ['#e63946', '#ffffff'], barrier: 'fence', sun: 0xfff1d6, sunI: 2.6, hemi: [0xdcefff, 0x5a7a3a, 1.1], props: ['tree', 'tree', 'bush', 'flower', 'barn', 'windmill'] },
  beach: { skyTop: 0x3fb4ff, skyBot: 0xfff2d2, fog: 0xd9f0ff, fogFar: 560, ground: '#efd29a', shoulder: '#f2d9a6', road: '#66625e', line: '#ffffff', kerb: ['#2f7de1', '#ffffff'], barrier: 'rope', sun: 0xfff3dc, sunI: 2.9, hemi: [0xe6f6ff, 0xb59a6a, 1.15], water: 0x1fa2d6, props: ['palm', 'palm', 'umbrella', 'rock', 'lighthouse', 'hut'] },
  canyon: { skyTop: 0xff9a5c, skyBot: 0xffe1bd, fog: 0xf5c9a0, fogFar: 600, ground: '#c4643a', shoulder: '#b8693f', road: '#7f5640', line: '#ffe8c8', kerb: ['#ffd166', '#5a3a2a'], barrier: 'rock', sun: 0xffd2a1, sunI: 2.7, hemi: [0xffe0c0, 0x7a3a1f, 1.0], props: ['mesa', 'cactus', 'cactus', 'rock', 'skull'] },
  snow: { skyTop: 0x8db8ea, skyBot: 0xeef5ff, fog: 0xe4eefa, fogFar: 460, ground: '#f3f7fd', shoulder: '#eef4fb', road: '#5f6874', line: '#ffffff', kerb: ['#e63946', '#ffffff'], barrier: 'snowbank', sun: 0xffffff, sunI: 2.3, hemi: [0xeaf3ff, 0x8a9ab5, 1.25], props: ['pine', 'pine', 'pine', 'mountain', 'cabin', 'snowrock'], snow: true },
  city: { skyTop: 0x070a1e, skyBot: 0x2a1446, fog: 0x1a1030, fogFar: 420, ground: '#15161f', shoulder: '#262838', road: '#24252f', line: '#ffd166', kerb: ['#ff3df2', '#33e0ff'], barrier: 'neon', sun: 0x9fa8ff, sunI: 0.7, hemi: [0x5a5aa0, 0x221a33, 0.9], props: ['tower', 'tower', 'tower', 'lamp', 'billboard'], night: true },
  sky: { skyTop: 0x5ab8ff, skyBot: 0xfdf6ff, fog: 0xeaf4ff, fogFar: 640, ground: null, shoulder: '#7ccf5c', road: '#c9bfae', line: '#ffffff', kerb: ['#7a5cff', '#ffffff'], barrier: 'hedge', sun: 0xfff6e0, sunI: 2.6, hemi: [0xffffff, 0x8fb8ff, 1.2], props: ['cloud', 'cloud', 'island', 'island', 'balloon'] },
};

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function speckle(x, w, h, base, n = 900, amt = 18) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const c = new THREE.Color(base);
  for (let i = 0; i < n; i++) { const k = (Math.random() - 0.5) * amt / 255; x.fillStyle = `rgb(${Math.round(255 * Math.min(1, Math.max(0, c.r + k)))},${Math.round(255 * Math.min(1, Math.max(0, c.g + k)))},${Math.round(255 * Math.min(1, Math.max(0, c.b + k)))})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}

/** Builds a ribbon along the track between two lateral offsets. f(i) → {a, b, ya, yb} or null to skip that sample. */
function ribbon(T, f, uvV = 12, uvU = [0, 1]) {
  const pos = [], uv = [], idx = [], col = []; let prev = -1, dist = 0;
  const N = T.n;
  for (let k = 0; k <= N; k++) {
    const i = k % N, r = f(i);
    if (k > 0) dist += T.step;
    if (!r) { prev = -1; continue; }
    const ax = T.x[i] + T.rx[i] * r.a, az = T.z[i] + T.rz[i] * r.a, bx = T.x[i] + T.rx[i] * r.b, bz = T.z[i] + T.rz[i] * r.b;
    pos.push(ax, T.y[i] + (r.ya || 0), az, bx, T.y[i] + (r.yb || 0), bz);
    uv.push(uvU[0], dist / uvV, uvU[1], dist / uvV);
    const c = r.c || [1, 1, 1]; col.push(...c, ...c);
    const v = pos.length / 3 - 2;
    if (prev >= 0) idx.push(prev, prev + 1, v, prev + 1, v + 1, v);
    prev = v;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Scatter positions around the course that keep clear of the road. */
function scatter(T, n, minClear, maxDist, rand) {
  const out = [], b = T.bounds;
  for (let t = 0; t < n * 6 && out.length < n; t++) {
    const x = b.minX - maxDist + rand() * (b.maxX - b.minX + maxDist * 2), z = b.minZ - maxDist + rand() * (b.maxZ - b.minZ + maxDist * 2);
    const i = T.nearestGlobal(x, z), d = Math.hypot(x - T.x[i], z - T.z[i]);
    if (d < T.wall[i] + minClear || d > T.wall[i] + maxDist) continue;
    out.push({ x, z, y: T.y[i], d, i });
  }
  return out;
}

function instanced(group, parts, mats) {
  for (const p of parts) {
    const im = new THREE.InstancedMesh(p.geo, p.mat, mats.length);
    mats.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = !!p.shadow; im.receiveShadow = false;
    im.instanceMatrix.needsUpdate = true; group.add(im);
  }
}
const M4 = (x, y, z, s = 1, ry = 0, sy = s) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, sy, s));

export function buildTrackScene(T, scene, opts = {}) {
  const th = THEMES[T.theme] || THEMES.meadow, root = new THREE.Group(); root.name = 'track';
  let seed = 1234; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lowFx = !!opts.low;
  // ---- sky dome and fog ----
  const skyGeo = new THREE.SphereGeometry(900, 24, 16), cols = [], top = new THREE.Color(th.skyTop), bot = new THREE.Color(th.skyBot);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) { const y = skyGeo.attributes.position.getY(i) / 900; const c = bot.clone().lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.15))); cols.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -1; root.add(sky);
  scene.fog = new THREE.Fog(th.fog, 120, th.fogFar); scene.background = new THREE.Color(th.skyBot);
  if (th.night) {
    const sp = []; for (let i = 0; i < 700; i++) { const a = rand() * Math.PI * 2, e = 0.1 + rand() * 1.3, r = 850; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    root.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })));
  }
  // ---- textures ----
  const roadTex = canvasTex(128, 256, (x, w, h) => {
    speckle(x, w, h, th.road, 1400, 26);
    x.fillStyle = th.line; x.fillRect(5, 0, 4, h); x.fillRect(w - 9, 0, 4, h);
    if (T.theme !== 'sky') { x.globalAlpha = 0.85; x.fillRect(w / 2 - 2, 0, 4, h * 0.45); x.globalAlpha = 1; }
    if (T.theme === 'sky') { x.strokeStyle = '#0002'; x.lineWidth = 2; for (let y = 0; y < h; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); for (let c = (y / 32) % 2 * 16; c < w; c += 32) { x.beginPath(); x.moveTo(c, y); x.lineTo(c, y + 32); x.stroke(); } } }
  });
  const kerbTex = canvasTex(16, 64, (x, w, h) => { x.fillStyle = th.kerb[0]; x.fillRect(0, 0, w, h / 2); x.fillStyle = th.kerb[1]; x.fillRect(0, h / 2, w, h / 2); });
  const groundTex = th.ground ? canvasTex(128, 128, (x, w, h) => speckle(x, w, h, th.ground, 1600, 30)) : null;
  const shoulderTex = canvasTex(128, 128, (x, w, h) => speckle(x, w, h, th.shoulder, 1600, 34));
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, vertexColors: true });
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 });
  const shoulderMat = new THREE.MeshStandardMaterial({ map: shoulderTex, roughness: 1, vertexColors: true });
  // ---- road (skips gaps), ice tinted ----
  const ice = [0.78, 0.92, 1.15];
  const road = new THREE.Mesh(ribbon(T, i => (T.flags[i] & 2) ? null : { a: -T.half[i], b: T.half[i], ya: 0.02, yb: 0.02, c: (T.flags[i] & 4) ? ice : null }, 16), roadMat);
  road.receiveShadow = true; root.add(road);
  for (const s of [-1, 1]) {
    const k = new THREE.Mesh(ribbon(T, i => (T.flags[i] & 2) ? null : s < 0 ? { a: -T.half[i] - 1.1, b: -T.half[i], ya: 0.06, yb: 0.06 } : { a: T.half[i], b: T.half[i] + 1.1, ya: 0.06, yb: 0.06 }, 4), kerbMat);
    k.receiveShadow = true; root.add(k);
    const sh = new THREE.Mesh(ribbon(T, i => (T.flags[i] & 2) ? null : (T.flags[i] & 1) ? (s < 0 ? { a: -T.half[i] - 3, b: -T.half[i] - 1.1, ya: 0, yb: 0 } : { a: T.half[i] + 1.1, b: T.half[i] + 3, ya: 0, yb: 0 }) : s < 0 ? { a: -T.wall[i] - 0.5, b: -T.half[i] - 1.1, ya: 0, yb: 0 } : { a: T.half[i] + 1.1, b: T.wall[i] + 0.5, ya: 0, yb: 0 }, 10, [0, 2]), shoulderMat);
    sh.receiveShadow = true; root.add(sh);
  }
  const baseY = T.bounds.minY - 0.3;
  if (th.ground) {
    // embankments from the barrier down to the ground, then a big ground plane
    const embMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
    for (const s of [-1, 1]) {
      const g = ribbon(T, i => { const drop = T.y[i] - baseY, o = T.wall[i] + 0.5; return s < 0 ? { a: -o - 6 - drop * 2.5, b: -o, ya: -drop, yb: 0 } : { a: o, b: o + 6 + drop * 2.5, ya: 0, yb: -drop }; }, 10, [0, 3]);
      const e = new THREE.Mesh(g, embMat); e.receiveShadow = true; root.add(e);
    }
    groundTex.repeat.set(140, 140);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((T.bounds.minX + T.bounds.maxX) / 2, baseY - 0.05, (T.bounds.minZ + T.bounds.maxZ) / 2); ground.receiveShadow = true; root.add(ground);
  } else {
    // floating islands: rock cliffs under every edge
    const rockTex = canvasTex(128, 128, (x, w, h) => { speckle(x, w, h, '#9a8a7a', 1800, 50); x.fillStyle = '#7ccf5c'; x.fillRect(0, 0, w, 10); });
    const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const g = ribbon(T, i => { if (T.flags[i] & 2) return null; const o = (T.flags[i] & 1) ? T.half[i] + 3 : T.wall[i] + 0.5; const depth = 10 + 6 * Math.sin(i * 0.05); return s < 0 ? { a: -o * 0.45, b: -o, ya: -depth, yb: 0 } : { a: o, b: o * 0.45, ya: 0, yb: -depth }; }, 10, [0, 1]);
      root.add(new THREE.Mesh(g, rockMat));
    }
  }
  if (th.water) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.y = baseY + 0.02; root.add(water);
    // the land is an island: shrink the ground plane to a disc around the course
    const ground = root.children.find(c => c.geometry?.type === 'PlaneGeometry' && c.material.map === groundTex);
    if (ground) { ground.geometry.dispose(); ground.geometry = new THREE.CircleGeometry(Math.max(T.bounds.maxX - T.bounds.minX, T.bounds.maxZ - T.bounds.minZ) * 0.62 + 40, 48); ground.position.y = baseY + 0.12; }
  }
  // ---- barriers ----
  const barrierH = { fence: 1.1, rope: 0.9, rock: 5, snowbank: 1.6, neon: 1.0, hedge: 1.4 }[th.barrier] || 1;
  const barTex = canvasTex(64, 64, (x, w, h) => {
    if (th.barrier === 'fence') { x.fillStyle = '#00000000'; x.clearRect(0, 0, w, h); x.fillStyle = '#9c6b3e'; x.fillRect(0, 8, w, 12); x.fillRect(0, 36, w, 12); x.fillRect(4, 0, 10, h); x.fillRect(36, 0, 10, h); }
    else if (th.barrier === 'rope') { x.clearRect(0, 0, w, h); x.fillStyle = '#f5f0e6'; x.fillRect(0, 10, w, 6); x.fillRect(0, 34, w, 6); x.fillStyle = '#e63946'; x.fillRect(28, 0, 8, h); }
    else if (th.barrier === 'rock') speckle(x, w, h, '#a4532c', 600, 60);
    else if (th.barrier === 'snowbank') speckle(x, w, h, '#ffffff', 300, 14);
    else if (th.barrier === 'neon') { x.fillStyle = '#3a3c4a'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff3df2'; x.fillRect(0, 6, w, 7); }
    else { speckle(x, w, h, '#3f8f3a', 900, 40); }
  });
  const barMat = new THREE.MeshStandardMaterial({ map: barTex, transparent: th.barrier === 'fence' || th.barrier === 'rope', alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, emissive: th.barrier === 'neon' ? 0xffffff : 0x000000, emissiveMap: th.barrier === 'neon' ? barTex : null, emissiveIntensity: th.barrier === 'neon' ? 0.9 : 0 });
  for (const s of [-1, 1]) {
    const lean = th.barrier === 'rock' ? 2 : th.barrier === 'snowbank' ? 1.2 : 0;
    const g = ribbon(T, i => (T.flags[i] & 1) ? null : s < 0 ? { a: -T.wall[i] - 0.2 - lean, b: -T.wall[i] - 0.2, ya: barrierH, yb: 0 } : { a: T.wall[i] + 0.2, b: T.wall[i] + 0.2 + lean, ya: 0, yb: barrierH }, th.barrier === 'rock' ? 8 : 3, [0, 1]);
    // ribbon UVs run across; swap so the texture runs along the wall
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, v, s < 0 ? u : 1 - u); }
    const b = new THREE.Mesh(g, barMat); b.castShadow = !lowFx && th.barrier === 'rock'; b.receiveShadow = true; root.add(b);
  }
  // ---- start line, gantry ----
  const chk = canvasTex(64, 16, (x, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } }, false);
  const line = new THREE.Mesh(ribbon(T, i => i === 0 || i === 1 || i === 2 ? { a: -T.half[i], b: T.half[i], ya: 0.05, yb: 0.05 } : null, 1e9), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8 }));
  root.add(line);
  {
    const p = T.point(1, 0), g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.h; root.add(g);
    const w = T.half[0] + 2.2, post = mat(0xe9ecf2, { metal: 0.4, rough: 0.4 });
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 12), post, sx * w, 4, 0));
    const ban = canvasTex(512, 96, (x, W, H) => { const gr = x.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#ff7eb6'); gr.addColorStop(0.5, '#ffd166'); gr.addColorStop(1, '#46f0ff'); x.fillStyle = gr; x.fillRect(0, 0, W, H); x.fillStyle = '#141826'; x.font = 'italic 900 64px Segoe UI, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('DASH DERBY', W / 2, H / 2 + 4); }, false);
    const beam = mesh(new THREE.BoxGeometry(w * 2 + 0.8, 1.8, 0.5), [mat(0x2b3550), mat(0x2b3550), mat(0x2b3550), mat(0x2b3550), new THREE.MeshStandardMaterial({ map: ban, emissive: 0xffffff, emissiveMap: ban, emissiveIntensity: th.night ? 0.8 : 0.15 }), new THREE.MeshStandardMaterial({ map: ban, emissive: 0xffffff, emissiveMap: ban, emissiveIntensity: th.night ? 0.8 : 0.15 })], 0, 8.2, 0);
    g.add(beam);
    // start lights
    const lights = [];
    for (let k = 0; k < 4; k++) { const l = mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0x000000 }), -1.8 + k * 1.2, 6.6, 0.1, false); g.add(l); lights.push(l); }
    root.userData.startLights = lights;
    // flags along the start straight
    const flagCols = [0xff7eb6, 0xffd166, 0x46f0ff, 0x7ddf3a];
    for (let k = -14; k <= 14; k += 4) for (const sx of [-1, 1]) {
      const i = T.wrap(k * 3), q = T.point(i, sx * (T.wall[i] + 1.5));
      if (T.flags[i] & 1) continue;
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), mat(0xdddddd), q.x, q.y + 2.1, q.z); root.add(pole);
      const fl = mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: flagCols[(k + 20 + sx) % 4], side: THREE.DoubleSide }), q.x, q.y + 3.6, q.z); fl.rotation.y = q.h + Math.PI / 2; fl.position.x += Math.sin(q.h + Math.PI / 2) * 0.7; fl.position.z += Math.cos(q.h + Math.PI / 2) * 0.7; root.add(fl);
    }
  }
  // ---- boost pads and ramps ----
  const arrowTex = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#ff8a00'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffe14d'; for (let k = 0; k < 2; k++) { const y = k * 32; x.beginPath(); x.moveTo(6, y + 26); x.lineTo(32, y + 6); x.lineTo(58, y + 26); x.lineTo(58, y + 32); x.lineTo(32, y + 14); x.lineTo(6, y + 32); x.fill(); } });
  const padMat = new THREE.MeshStandardMaterial({ map: arrowTex, emissive: 0xffffff, emissiveMap: arrowTex, emissiveIntensity: 0.8 });
  root.userData.padTex = arrowTex;
  for (const b of T.boosts) {
    const set = new Set(); for (let k = 0; k < b.len + 1; k++) set.add(T.wrap(b.i + k));
    const g = ribbon(T, i => set.has(i) ? { a: b.lat - b.w, b: b.lat + b.w, ya: 0.08, yb: 0.08 } : null, -6);
    root.add(new THREE.Mesh(g, padMat));
  }
  const rampTex = canvasTex(64, 64, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#111' : '#ffd166'; x.beginPath(); x.moveTo(k * 16 - 32, 0); x.lineTo(k * 16 - 16, 0); x.lineTo(k * 16 + 48, h); x.lineTo(k * 16 + 32, h); x.fill(); } });
  for (const r of T.ramps) {
    const set = new Map(); for (let k = -4; k <= 0; k++) set.set(T.wrap(r.i + k), (k + 4) / 4);
    const g = ribbon(T, i => set.has(i) ? { a: -T.half[i], b: T.half[i], ya: 0.05 + set.get(i) * 1.0, yb: 0.05 + set.get(i) * 1.0 } : null, 3);
    root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6 })));
    const p = T.point(r.i, 0); const lip = mesh(new THREE.BoxGeometry(T.half[r.i] * 2, 1.05, 0.4), mat(0x22252c), p.x, p.y + 0.5, p.z); lip.rotation.y = p.h; root.add(lip);
  }
  // ---- scenery ----
  buildProps(T, th, root, rand, lowFx);
  scene.add(root);
  return root;
}

function buildProps(T, th, root, rand, lowFx) {
  const n = lowFx ? 0.55 : 1;
  const counts = {}; for (const p of th.props) counts[p] = (counts[p] || 0) + 1;
  const total = th.props.length;
  const near = scatter(T, Math.round(230 * n), 4, 90, rand);
  const far = scatter(T, Math.round(60 * n), 110, 320, rand);
  const pick = () => th.props[Math.floor(rand() * total)];
  const groups = {};
  for (const p of near) { const k = pick(); (groups[k] = groups[k] || []).push(p); }
  const big = ['mesa', 'mountain', 'tower', 'island', 'cloud', 'lighthouse', 'windmill'];
  for (const p of far) { const k = th.props.find(x => big.includes(x)) || pick(); (groups[k] = groups[k] || []).push({ ...p, far: true }); }
  const baseY = T.bounds.minY - 0.3;
  const gy = p => th.ground ? baseY : p.y;   // props stand on the ground plane (or float at track height in the sky)
  for (const [kind, list] of Object.entries(groups)) {
    const M = list.map(p => M4(p.x, gy(p), p.z, (p.far ? 2.2 : 1) * (0.7 + rand() * 0.7), rand() * 6.28));
    switch (kind) {
      case 'tree': instanced(root, [{ geo: new THREE.CylinderGeometry(0.35, 0.5, 3, 7).translate(0, 1.5, 0), mat: mat(0x7a5232), shadow: true }, { geo: new THREE.IcosahedronGeometry(2.4, 0).translate(0, 4.4, 0), mat: mat(0x3f9a3a, { flat: true }), shadow: true }], M); break;
      case 'bush': instanced(root, [{ geo: new THREE.IcosahedronGeometry(1.2, 0).translate(0, 0.8, 0), mat: mat(0x4caf50, { flat: true }) }], M); break;
      case 'flower': instanced(root, [{ geo: new THREE.CylinderGeometry(0.04, 0.04, 0.6, 4).translate(0, 0.3, 0), mat: mat(0x2e7d32) }, { geo: new THREE.SphereGeometry(0.25, 6, 4).translate(0, 0.65, 0), mat: mat([0xff7eb6, 0xffd166, 0xffffff][Math.floor(rand() * 3)]) }], M); break;
      case 'barn': instanced(root, [{ geo: new THREE.BoxGeometry(8, 5, 10).translate(0, 2.5, 0), mat: mat(0xb23a2e), shadow: true }, { geo: new THREE.ConeGeometry(7.2, 3.5, 4).rotateY(Math.PI / 4).translate(0, 6.7, 0).scale(0.8, 1, 1.0), mat: mat(0x5a4636), shadow: true }], M.slice(0, 3)); break;
      case 'windmill': {
        for (const m of M.slice(0, 3)) {
          const g = new THREE.Group(); g.applyMatrix4(m); root.add(g);
          g.add(mesh(new THREE.CylinderGeometry(1.2, 2.2, 12, 8), mat(0xf4f1ea), 0, 6, 0));
          const hub = new THREE.Group(); hub.position.set(0, 11.5, 1.6); g.add(hub);
          for (let k = 0; k < 4; k++) { const bl = mesh(new THREE.BoxGeometry(0.8, 6, 0.1), mat(0xe9ecf2), 0, 3, 0); const a = new THREE.Group(); a.rotation.z = k * Math.PI / 2; a.add(bl); hub.add(a); }
          (root.userData.spinners = root.userData.spinners || []).push(hub);
        }
        break;
      }
      case 'palm': {
        const trunk = new THREE.CylinderGeometry(0.25, 0.4, 7, 6).translate(0, 3.5, 0); trunk.rotateZ(0.12);
        const leaves = new THREE.BufferGeometry(); const parts = [];
        for (let k = 0; k < 6; k++) { const l = new THREE.ConeGeometry(0.6, 4, 3).rotateX(Math.PI / 2).translate(0, 0, 2).rotateX(0.35).rotateY(k * Math.PI / 3).translate(0.8, 7, 0); parts.push(l); }
        instanced(root, [{ geo: trunk, mat: mat(0x9c7a4a), shadow: true }, ...parts.map(p => ({ geo: p, mat: mat(0x2fa84f, { flat: true }), shadow: true }))], M);
        leaves.dispose(); break;
      }
      case 'umbrella': instanced(root, [{ geo: new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).translate(0, 1.3, 0), mat: mat(0xffffff) }, { geo: new THREE.ConeGeometry(1.6, 0.7, 8).translate(0, 2.6, 0), mat: mat([0xff7eb6, 0xffd166, 0x46f0ff][Math.floor(rand() * 3)]), shadow: true }], M); break;
      case 'rock': case 'snowrock': instanced(root, [{ geo: new THREE.DodecahedronGeometry(1.4, 0).translate(0, 0.7, 0), mat: mat(kind === 'snowrock' ? 0xdfe8f5 : th.ground === '#efd29a' ? 0x9a8f80 : 0x9c4a2a, { flat: true }), shadow: true }], M); break;
      case 'lighthouse': {
        for (const m of M.slice(0, 1)) {
          const g = new THREE.Group(); g.applyMatrix4(m); root.add(g);
          for (let k = 0; k < 5; k++) g.add(mesh(new THREE.CylinderGeometry(2.2 - k * 0.25, 2.4 - k * 0.25, 4, 14), mat(k % 2 ? 0xe63946 : 0xffffff), 0, 2 + k * 4, 0));
          g.add(mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 12), mat(0xffffcc, { emissive: 0xffee88, ei: 1.5 }), 0, 21.2, 0), mesh(new THREE.ConeGeometry(1.8, 2, 12), mat(0x222222), 0, 23.4, 0));
        }
        break;
      }
      case 'hut': instanced(root, [{ geo: new THREE.BoxGeometry(4, 3, 4).translate(0, 1.5, 0), mat: mat(0xd9b38c), shadow: true }, { geo: new THREE.ConeGeometry(3.6, 2.4, 4).rotateY(Math.PI / 4).translate(0, 4.2, 0), mat: mat(0xc9a23a, { flat: true }), shadow: true }], M.slice(0, 6)); break;
      case 'mesa': instanced(root, [{ geo: new THREE.CylinderGeometry(9, 12, 26, 7).translate(0, 13, 0), mat: mat(0xb5532e, { flat: true }), shadow: !lowFx }, { geo: new THREE.CylinderGeometry(9.2, 9.2, 1.2, 7).translate(0, 26, 0), mat: mat(0xd9824f, { flat: true }) }], M); break;
      case 'cactus': instanced(root, [{ geo: new THREE.CapsuleGeometry(0.45, 3.2, 4, 8).translate(0, 2, 0), mat: mat(0x3f8f4a), shadow: true }, { geo: new THREE.CapsuleGeometry(0.28, 1.2, 4, 6).rotateZ(Math.PI / 2).translate(0.8, 2.2, 0), mat: mat(0x3f8f4a) }, { geo: new THREE.CapsuleGeometry(0.28, 1.0, 4, 6).translate(1.35, 2.9, 0), mat: mat(0x3f8f4a) }], M); break;
      case 'skull': instanced(root, [{ geo: new THREE.SphereGeometry(0.8, 8, 6).translate(0, 0.6, 0), mat: mat(0xf2e8d5) }], M.slice(0, 8)); break;
      case 'pine': instanced(root, [{ geo: new THREE.CylinderGeometry(0.3, 0.4, 2, 6).translate(0, 1, 0), mat: mat(0x6b4a2e) }, { geo: new THREE.ConeGeometry(2.4, 4.5, 8).translate(0, 3.8, 0), mat: mat(0x2f6b45, { flat: true }), shadow: true }, { geo: new THREE.ConeGeometry(1.7, 3.4, 8).translate(0, 6.0, 0), mat: mat(0x2f6b45, { flat: true }), shadow: true }, { geo: new THREE.ConeGeometry(1.0, 1.6, 8).translate(0, 7.9, 0), mat: mat(0xffffff, { flat: true }) }], M); break;
      case 'mountain': instanced(root, [{ geo: new THREE.ConeGeometry(40, 70, 7).translate(0, 35, 0), mat: mat(0x8a9ab5, { flat: true }) }, { geo: new THREE.ConeGeometry(16.5, 29, 7).translate(0, 55.6, 0), mat: mat(0xffffff, { flat: true }) }], M.filter((_, k) => k % 2 === 0)); break;
      case 'cabin': instanced(root, [{ geo: new THREE.BoxGeometry(6, 4, 5).translate(0, 2, 0), mat: mat(0x7a4a2a), shadow: true }, { geo: new THREE.ConeGeometry(5, 2.6, 4).rotateY(Math.PI / 4).translate(0, 5.3, 0), mat: mat(0xffffff, { flat: true }) }], M.slice(0, 5)); break;
      case 'tower': {
        const win = canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#0e1020'; x.fillRect(0, 0, w, h); const c = ['#ffd166', '#33e0ff', '#ff3df2', '#ffffff']; for (let r = 0; r < 16; r++) for (let q = 0; q < 6; q++) if (Math.random() < 0.55) { x.fillStyle = c[(r * 7 + q) % 4]; x.globalAlpha = 0.5 + Math.random() * 0.5; x.fillRect(4 + q * 10, 4 + r * 8, 6, 4); } x.globalAlpha = 1; });
        const tm = new THREE.MeshStandardMaterial({ map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 1.1, roughness: 0.6 });
        const ms = list.map(p => { const h = 20 + rand() * 50; return new THREE.Matrix4().compose(new THREE.Vector3(p.x, gy(p) + h / 2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 1.6, 0)), new THREE.Vector3(8 + rand() * 6, h, 8 + rand() * 6)); });
        instanced(root, [{ geo: new THREE.BoxGeometry(1, 1, 1), mat: tm }], ms);
        break;
      }
      case 'lamp': {
        // street lights right beside the barrier
        const ms = []; for (let i = 0; i < T.n; i += 18) for (const s of [-1, 1]) { const q = T.point(i, s * (T.wall[i] + 1.2)); ms.push(M4(q.x, q.y, q.z, 1, 0)); }
        instanced(root, [{ geo: new THREE.CylinderGeometry(0.12, 0.15, 6, 6).translate(0, 3, 0), mat: mat(0x3a3c4a) }, { geo: new THREE.SphereGeometry(0.45, 10, 8).translate(0, 6.2, 0), mat: mat(0xfff1c4, { emissive: 0xffe08a, ei: 2.2 }) }], ms);
        break;
      }
      case 'billboard': {
        const tex = canvasTex(256, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff3df2'); gr.addColorStop(1, '#33e0ff'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '900 40px Segoe UI, sans-serif'; x.textAlign = 'center'; x.fillText('NEON', w / 2, 56); x.font = '700 26px Segoe UI'; x.fillText('BOULEVARD', w / 2, 92); }, false);
        const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1, side: THREE.DoubleSide });
        instanced(root, [{ geo: new THREE.PlaneGeometry(10, 5).translate(0, 9, 0), mat: m }, { geo: new THREE.CylinderGeometry(0.25, 0.25, 7, 6).translate(0, 3.5, 0), mat: mat(0x3a3c4a) }], M.slice(0, 10));
        break;
      }
      case 'cloud': instanced(root, [{ geo: new THREE.IcosahedronGeometry(4, 1).scale(1.6, 0.7, 1).translate(0, -18, 0), mat: mat(0xffffff, { rough: 1 }) }, { geo: new THREE.IcosahedronGeometry(3, 1).scale(1.4, 0.7, 1).translate(4, -16.5, 1), mat: mat(0xffffff, { rough: 1 }) }], list.map(p => M4(p.x, p.y - rand() * 30, p.z, (p.far ? 3 : 1.4) * (0.7 + rand()), rand() * 6.28))); break;
      case 'island': instanced(root, [{ geo: new THREE.ConeGeometry(9, 14, 7).rotateX(Math.PI).translate(0, -7, 0), mat: mat(0x9a8a7a, { flat: true }) }, { geo: new THREE.CylinderGeometry(9, 9, 1.2, 7).translate(0, 0.6, 0), mat: mat(0x7ccf5c, { flat: true }) }, { geo: new THREE.IcosahedronGeometry(2.5, 0).translate(2, 4, 1), mat: mat(0x3f9a3a, { flat: true }) }], list.map(p => M4(p.x, p.y - 8 + rand() * 30, p.z, (p.far ? 2.5 : 1) * (0.6 + rand() * 0.6), rand() * 6.28))); break;
      case 'balloon': {
        for (const p of list.slice(0, 8)) {
          const g = new THREE.Group(); g.position.set(p.x, p.y + 15 + rand() * 25, p.z); root.add(g);
          g.add(mesh(new THREE.SphereGeometry(4, 14, 12), mat([0xff7eb6, 0xffd166, 0x46f0ff, 0x7a5cff][Math.floor(rand() * 4)]), 0, 0, 0), mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), mat(0x9c6b3e), 0, -6, 0));
          (root.userData.floaters = root.userData.floaters || []).push(g);
        }
        break;
      }
      default: break;
    }
  }
}
