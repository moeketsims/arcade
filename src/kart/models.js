// Dash Derby 3D models, all built from primitives in code: the eight racers, four kart bodies, item boxes, items,
// moving obstacles and small props. Models face +Z (three.js rotation.y = heading).
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, o = {}) {
  const key = `${color}|${o.rough ?? 0.6}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.ei ?? 1}|${o.opacity ?? 1}|${o.flat ? 1 : 0}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, flatShading: !!o.flat });
    if (o.emissive != null) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
    if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}
export function mesh(geo, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; return o;
}
const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const C = (r1, r2, h, n = 14) => new THREE.CylinderGeometry(r1, r2, h, n);
const K = (r, h, n = 12) => new THREE.ConeGeometry(r, h, n);

// ---------------------------------------------------------------------------------------------------------------
// racers: a body, head and species details, seated (origin at the seat)
// ---------------------------------------------------------------------------------------------------------------
export function makeDriver(r) {
  const g = new THREE.Group(), col = mat(r.color), acc = mat(r.accent), dark = mat(0x151821, { rough: 0.3 });
  const eyeW = mat(0xffffff, { rough: 0.2 }), pupil = mat(0x111111, { rough: 0.2 });
  const torso = mesh(S(0.36), col, 0, 0.42, -0.05); torso.scale.set(1, 1.15, 0.9); g.add(torso);
  const head = new THREE.Group(); head.position.set(0, 1.0, 0.02); g.add(head);
  const eyes = (y, z, sp = 0.13, s = 0.075) => { for (const sx of [-1, 1]) { head.add(mesh(S(s, 10, 8), eyeW, sx * sp, y, z)); head.add(mesh(S(s * 0.55, 8, 6), pupil, sx * sp, y, z + s * 0.6)); } };
  // arms reaching to the wheel
  for (const sx of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.08, 0.36, 4, 8), col, sx * 0.3, 0.5, 0.25); a.rotation.x = 1.2; a.rotation.z = sx * -0.25; g.add(a); g.add(mesh(S(0.1, 8, 6), acc, sx * 0.24, 0.48, 0.52)); }
  switch (r.kind) {
    case 'robot': {
      const white = mat(0xf4f6fb, { rough: 0.3 }), glow = mat(0x46f0ff, { emissive: 0x46f0ff, ei: 1.6 });
      torso.material = white;
      head.add(mesh(S(0.36, 20, 16), white));
      const visor = mesh(new THREE.SphereGeometry(0.31, 20, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.42), dark, 0, 0, 0.07); head.add(visor);
      head.add(mesh(B(0.07, 0.13, 0.04), glow, -0.1, 0.02, 0.36), mesh(B(0.07, 0.13, 0.04), glow, 0.1, 0.02, 0.36));
      head.add(mesh(C(0.02, 0.02, 0.25, 6), mat(0xc9d1de), 0, 0.45, 0), mesh(S(0.07, 8, 6), mat(0xff8a2b, { emissive: 0xff8a2b, ei: 0.8 }), 0, 0.6, 0));
      break;
    }
    case 'fox': {
      head.add(mesh(S(0.34, 18, 14), col));
      const snout = mesh(K(0.17, 0.34, 12), acc, 0, -0.08, 0.36); snout.rotation.x = Math.PI / 2; head.add(snout);
      head.add(mesh(S(0.05, 8, 6), dark, 0, -0.08, 0.53));
      for (const sx of [-1, 1]) { const e = mesh(K(0.12, 0.3, 4), col, sx * 0.2, 0.33, -0.02); e.rotation.z = sx * -0.35; head.add(e); }
      eyes(0.08, 0.27, 0.13, 0.06);
      const tail = mesh(S(0.22, 12, 10), col, 0, 0.35, -0.55); tail.scale.set(0.8, 0.8, 1.7); g.add(tail); g.add(mesh(S(0.13, 10, 8), acc, 0, 0.42, -0.85));
      break;
    }
    case 'rhino': {
      head.add(mesh(S(0.38, 18, 14), col)); head.scale.set(1.1, 1, 1.15);
      const muzzle = mesh(S(0.26, 14, 10), col, 0, -0.1, 0.28); muzzle.scale.set(1, 0.85, 1); head.add(muzzle);
      const horn = mesh(K(0.09, 0.32, 10), acc, 0, 0.1, 0.5); horn.rotation.x = 0.5; head.add(horn);
      for (const sx of [-1, 1]) head.add(mesh(S(0.08, 8, 6), col, sx * 0.25, 0.32, -0.05));
      eyes(0.1, 0.27, 0.17, 0.055);
      torso.scale.set(1.25, 1.2, 1);
      break;
    }
    case 'cat': {
      head.add(mesh(S(0.32, 18, 14), col));
      for (const sx of [-1, 1]) { const e = mesh(K(0.1, 0.2, 4), col, sx * 0.19, 0.3, 0); e.rotation.z = sx * -0.3; head.add(e); }
      eyes(0.04, 0.26, 0.12, 0.08);
      head.add(mesh(S(0.04, 8, 6), mat(0xff7eb6), 0, -0.06, 0.32));
      head.add(mesh(S(0.46, 20, 16), mat(0xbfe8ff, { rough: 0.05, opacity: 0.28 }), 0, 0.03, 0));   // space helmet
      head.add(mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), acc, 0, -0.25, 0)).rotation.x = Math.PI / 2;
      break;
    }
    case 'crow': {
      head.add(mesh(S(0.32, 18, 14), col));
      const beak = mesh(K(0.11, 0.38, 4), mat(0xffd166), 0, -0.04, 0.42); beak.rotation.x = Math.PI / 2; head.add(beak);
      eyes(0.08, 0.24, 0.13, 0.06);
      for (let i = 0; i < 3; i++) { const f = mesh(K(0.05, 0.22, 4), col, (i - 1) * 0.08, 0.36, -0.08); f.rotation.x = -0.4; head.add(f); }
      const goggles = mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 20), mat(0xffd166, { metal: 0.6, rough: 0.3 }), 0, 0.14, 0); goggles.rotation.x = Math.PI / 2 - 0.25; head.add(goggles);
      break;
    }
    case 'tortoise': {
      head.add(mesh(S(0.28, 16, 12), mat(0x8fbf6a))); head.position.z = 0.12;
      eyes(0.06, 0.22, 0.12, 0.06);
      const cap = mesh(new THREE.SphereGeometry(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), acc, 0, 0.06, 0); head.add(cap);
      head.add(mesh(B(0.3, 0.03, 0.18), acc, 0, 0.08, 0.28));
      const shell = mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), col, 0, 0.35, -0.3); shell.rotation.x = -1.2; shell.scale.set(1, 1, 0.7); g.add(shell);
      torso.material = mat(0x8fbf6a);
      break;
    }
    case 'axolotl': {
      head.add(mesh(S(0.36, 18, 14), col)); head.scale.set(1.2, 0.95, 1);
      eyes(0.06, 0.28, 0.17, 0.06);
      const gill = mat(0xff3d8b);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const f = mesh(C(0.03, 0.05, 0.3, 6), gill, sx * (0.36 + i * 0.03), 0.08 + i * 0.12 - 0.1, -0.05); f.rotation.z = sx * (-1.1 + i * 0.45); head.add(f); }
      head.add(mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI), dark, 0, -0.06, 0.32)).rotation.z = Math.PI;
      break;
    }
    case 'otter': {
      head.add(mesh(S(0.32, 18, 14), col));
      const m2 = mesh(S(0.18, 12, 10), acc, 0, -0.1, 0.24); m2.scale.set(1.2, 0.8, 1); head.add(m2);
      head.add(mesh(S(0.05, 8, 6), dark, 0, -0.04, 0.4));
      for (const sx of [-1, 1]) { head.add(mesh(S(0.08, 8, 6), col, sx * 0.25, 0.24, -0.02)); for (let i = 0; i < 2; i++) { const w = mesh(C(0.006, 0.006, 0.26, 4), mat(0xffffff), sx * 0.2, -0.08 - i * 0.04, 0.3, false); w.rotation.z = Math.PI / 2 + sx * (0.15 - i * 0.2); head.add(w); } }
      eyes(0.08, 0.26, 0.12, 0.055);
      const sc = mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 18), mat(0xe63946), 0, 0.72, 0); sc.rotation.x = Math.PI / 2; g.add(sc);
      break;
    }
    default: head.add(mesh(S(0.33), col));
  }
  g.userData.head = head;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// kart bodies
// ---------------------------------------------------------------------------------------------------------------
function wheel(r, w, rimCol) {
  const g = new THREE.Group();
  const tyre = mesh(C(r, r, w, 16), mat(0x1b1d22, { rough: 0.9 })); tyre.rotation.z = Math.PI / 2; g.add(tyre);
  const rim = mesh(C(r * 0.55, r * 0.55, w + 0.02, 10), mat(rimCol, { metal: 0.5, rough: 0.35 }), 0, 0, 0, false); rim.rotation.z = Math.PI / 2; g.add(rim);
  const spoke = mesh(B(w + 0.04, r * 1.1, r * 0.18), mat(0x444a55), 0, 0, 0, false); g.add(spoke);
  return g;
}

export function makeKart(racer, kartDef) {
  const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
  const body = new THREE.Group(); tilt.add(body);
  const col = mat(racer.color, { rough: 0.35, metal: 0.25 }), acc = mat(racer.accent, { rough: 0.4 }), dark = mat(0x22252c, { rough: 0.6 }), chrome = mat(0xd8dde6, { metal: 0.8, rough: 0.25 });
  const wheels = [];
  const addWheels = (fr, rr, fw, rw, fx, rx, fz, rz) => {
    for (const [r, w, x, z, front] of [[fr, fw, fx, fz, 1], [fr, fw, -fx, fz, 1], [rr, rw, rx, rz, 0], [rr, rw, -rx, rz, 0]]) {
      const wh = wheel(r, w, racer.accent); wh.position.set(x, r, z); wh.userData.front = !!front; wh.userData.r = r; body.add(wh); wheels.push(wh);
    }
  };
  let seatZ = -0.15, exhaust = [];
  switch (kartDef.id) {
    case 'zipper': {
      body.add(mesh(B(0.9, 0.16, 2.0), col, 0, 0.3, 0));
      const nose = mesh(K(0.45, 0.8, 4), col, 0, 0.32, 1.25); nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.scale.set(1, 1, 0.4); body.add(nose);
      body.add(mesh(B(1.5, 0.08, 0.3), dark, 0, 0.32, 1.0), mesh(B(1.5, 0.08, 0.3), dark, 0, 0.32, -0.9));
      body.add(mesh(B(1.4, 0.06, 0.32), acc, 0, 1.05, -1.0), mesh(B(0.06, 0.6, 0.12), dark, -0.5, 0.75, -1.0), mesh(B(0.06, 0.6, 0.12), dark, 0.5, 0.75, -1.0));
      addWheels(0.28, 0.32, 0.22, 0.3, 0.78, 0.8, 0.95, -0.85);
      exhaust = [[0, 0.5, -1.15]];
      break;
    }
    case 'bruiser': {
      body.add(mesh(B(1.5, 0.55, 2.3), col, 0, 0.55, 0));
      body.add(mesh(B(1.3, 0.3, 0.6), col, 0, 0.9, 0.75));
      const bar = mesh(C(0.07, 0.07, 1.7, 8), chrome, 0, 0.45, 1.3); bar.rotation.z = Math.PI / 2; body.add(bar);
      for (const sx of [-0.5, 0.5]) { const b2 = mesh(C(0.06, 0.06, 0.4, 8), chrome, sx, 0.45, 1.15); b2.rotation.x = Math.PI / 2; body.add(b2); }
      body.add(mesh(B(1.55, 0.12, 2.35), acc, 0, 0.32, 0));
      for (const sx of [-0.45, 0.45]) { const p = mesh(C(0.1, 0.12, 0.7, 10), chrome, sx, 1.0, -1.05); p.rotation.x = -1.1; body.add(p); exhaust.push([sx, 1.25, -1.35]); }
      addWheels(0.36, 0.48, 0.3, 0.42, 0.85, 0.9, 0.95, -0.85);
      seatZ = -0.3;
      break;
    }
    case 'slider': {
      const wedge = new THREE.Shape(); wedge.moveTo(-1.15, 0); wedge.lineTo(1.3, 0); wedge.lineTo(1.3, 0.12); wedge.lineTo(-0.9, 0.42); wedge.lineTo(-1.15, 0.4);
      const wg = new THREE.ExtrudeGeometry(wedge, { depth: 1.5, bevelEnabled: false }); wg.translate(0, 0, -0.75); wg.rotateY(-Math.PI / 2);
      const w = mesh(wg, col, 0, 0.18, 0); body.add(w);
      for (const sx of [-1, 1]) { const fin = mesh(B(0.05, 0.45, 0.6), acc, sx * 0.62, 0.7, -0.85); fin.rotation.x = -0.4; body.add(fin); }
      body.add(mesh(B(1.7, 0.05, 0.45), acc, 0, 0.22, 1.3));
      addWheels(0.26, 0.3, 0.32, 0.4, 0.86, 0.88, 0.85, -0.8);
      exhaust = [[-0.3, 0.45, -1.2], [0.3, 0.45, -1.2]];
      break;
    }
    default: {   // roadster
      const hull = mesh(new THREE.CapsuleGeometry(0.55, 1.3, 6, 14), col, 0, 0.48, 0.05); hull.rotation.x = Math.PI / 2; hull.scale.set(1.25, 1, 0.75); body.add(hull);
      for (const sx of [-1, 1]) body.add(mesh(B(0.3, 0.3, 1.1), acc, sx * 0.72, 0.42, -0.05));
      body.add(mesh(B(1.4, 0.07, 0.36), dark, 0, 0.42, 1.25));
      body.add(mesh(B(1.3, 0.08, 0.3), col, 0, 0.98, -0.98), mesh(B(0.08, 0.4, 0.1), dark, 0, 0.78, -0.98));
      addWheels(0.3, 0.36, 0.26, 0.34, 0.82, 0.86, 0.9, -0.82);
      exhaust = [[0, 0.55, -1.2]];
    }
  }
  // steering wheel and seat
  body.add(mesh(B(0.7, 0.5, 0.12), dark, 0, 0.7, seatZ - 0.42));
  const sw = mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14), dark, 0, 0.82, seatZ + 0.62); sw.rotation.x = -0.9; body.add(sw);
  const driver = makeDriver(racer); driver.position.set(0, 0.32, seatZ); driver.scale.setScalar(0.92); body.add(driver);
  // number plate disc with the racer's colour
  // boost flames
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, y, z] of exhaust) {
    body.add(mesh(C(0.09, 0.11, 0.25, 10), chrome, x, y, z + 0.1, false)).rotation.x = Math.PI / 2;
    const f = new THREE.Mesh(K(0.16, 0.9, 10), flameMat); f.rotation.x = -Math.PI / 2; f.position.set(x, y, z - 0.45); f.visible = false; body.add(f);
    const c2 = new THREE.Mesh(K(0.08, 0.55, 8), coreMat); c2.rotation.x = -Math.PI / 2; c2.position.set(x, y, z - 0.3); c2.visible = false; body.add(c2);
    flames.push(f, c2);
  }
  // shield bubble and star glow
  const shield = new THREE.Mesh(S(1.7, 20, 16), new THREE.MeshStandardMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.22, emissive: 0x3fb8ff, emissiveIntensity: 0.6, depthWrite: false, roughness: 0.1 }));
  shield.position.y = 0.8; shield.visible = false; tilt.add(shield);
  // fake contact shadow (cheap on phones; the sun shadow adds detail where enabled)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.scale.set(0.85, 1.25, 1); root.add(blob);
  root.userData = { tilt, body, wheels, flames, shield, driver, blob, flameMat };
  return root;
}

// ---------------------------------------------------------------------------------------------------------------
// item box, items, obstacles
// ---------------------------------------------------------------------------------------------------------------
let boxTex = null;
function itemBoxTexture() {
  if (boxTex || typeof document === 'undefined') return boxTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#ff7eb6'); g.addColorStop(0.5, '#ffd166'); g.addColorStop(1, '#46f0ff');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); x.fillStyle = '#ffffffcc'; x.fillRect(8, 8, 112, 112); x.fillStyle = g; x.fillRect(14, 14, 100, 100);
  x.fillStyle = '#fff'; x.font = '900 86px Segoe UI, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeStyle = '#0006'; x.lineWidth = 6; x.strokeText('?', 64, 68); x.fillText('?', 64, 68);
  boxTex = new THREE.CanvasTexture(c); boxTex.colorSpace = THREE.SRGBColorSpace; return boxTex;
}
export function makeItemBox() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ map: itemBoxTexture(), transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: itemBoxTexture(), roughness: 0.2 });
  const cube = new THREE.Mesh(B(1.3, 1.3, 1.3), m); cube.castShadow = true; g.add(cube);
  g.userData.cube = cube; return g;
}

export function makePuddle() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x7ddf3a, roughness: 0.15, emissive: 0x2a6a10, emissiveIntensity: 0.4 });
  const d = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18), m); d.rotation.x = -Math.PI / 2; d.position.y = 0.06; g.add(d);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(S(0.22 + i * 0.05, 10, 8), m); b.position.set(Math.cos(i * 1.7) * 0.8, 0.08, Math.sin(i * 1.7) * 0.8); b.scale.y = 0.4; g.add(b); }
  return g;
}
export function makePuck() {
  const g = new THREE.Group();
  g.add(mesh(C(0.55, 0.55, 0.32, 18), mat(0xe5383b, { rough: 0.3 }), 0, 0.35, 0));
  g.add(mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 20), mat(0xffffff), 0, 0.35, 0)).rotation.x = Math.PI / 2;
  g.add(mesh(S(0.2, 10, 8), mat(0xffd166, { emissive: 0xffd166, ei: 0.8 }), 0, 0.55, 0));
  return g;
}
export function makeComet() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(S(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })));
  const halo = new THREE.Mesh(S(0.95, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(halo);
  const tail = new THREE.Mesh(K(0.75, 3.2, 14), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  tail.rotation.x = -Math.PI / 2; tail.position.z = -1.9; g.add(tail);
  return g;
}
export function makeLob() { const g = new THREE.Group(); g.add(mesh(S(0.5, 12, 10), mat(0x7ddf3a, { rough: 0.15 }))); return g; }

export function makeMover(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'sheep': {
      const wool = mat(0xf7f3ea, { rough: 1, flat: true });
      for (let i = 0; i < 7; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.6, 0), wool, Math.cos(i) * 0.5, 1.1 + (i % 2) * 0.25, Math.sin(i * 2) * 0.6));
      g.add(mesh(B(0.45, 0.5, 0.6), mat(0x222222), 0, 1.1, 1.0));
      for (const [x, z] of [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.5], [0.4, 0.5]]) g.add(mesh(C(0.08, 0.08, 0.7, 6), mat(0x222222), x, 0.35, z));
      break;
    }
    case 'crab': {
      const red = mat(0xff4d3a, { rough: 0.4 });
      const b = mesh(S(1.0, 16, 10), red, 0, 0.8, 0); b.scale.set(1.3, 0.55, 0.9); g.add(b);
      for (const sx of [-1, 1]) {
        g.add(mesh(S(0.45, 10, 8), red, sx * 1.5, 1.1, 0.6)); g.add(mesh(C(0.05, 0.05, 0.5, 6), red, sx * 0.3, 1.4, 0.5)); g.add(mesh(S(0.14, 8, 6), mat(0xffffff), sx * 0.3, 1.7, 0.5));
        for (let i = 0; i < 3; i++) { const l = mesh(C(0.07, 0.05, 1.0, 6), red, sx * 1.1, 0.4, -0.4 + i * 0.4); l.rotation.z = sx * 0.9; g.add(l); }
      }
      break;
    }
    case 'boulder': { const r = mesh(new THREE.DodecahedronGeometry(2.1, 1), mat(0xa0522d, { rough: 1, flat: true }), 0, 2.1, 0); g.add(r); g.userData.spin = r; break; }
    case 'snowball': { const r = mesh(new THREE.IcosahedronGeometry(1.6, 2), mat(0xffffff, { rough: 0.9 }), 0, 1.6, 0); g.add(r); g.userData.spin = r; break; }
    case 'snowman': {
      const w = mat(0xffffff, { rough: 0.9 });
      g.add(mesh(S(1.4, 16, 12), w, 0, 1.3, 0), mesh(S(1.0, 16, 12), w, 0, 3.1, 0), mesh(S(0.7, 16, 12), w, 0, 4.5, 0));
      const nose = mesh(K(0.12, 0.6, 8), mat(0xff8a2b), 0, 4.5, 0.85); nose.rotation.x = Math.PI / 2; g.add(nose);
      g.add(mesh(C(0.5, 0.5, 0.6, 14), mat(0x222222), 0, 5.3, 0), mesh(C(0.75, 0.75, 0.06, 14), mat(0x222222), 0, 5.0, 0));
      for (const sx of [-1, 1]) g.add(mesh(S(0.08, 6, 6), mat(0x111111), sx * 0.25, 4.7, 0.6));
      break;
    }
    case 'hovercar': {
      const neon = [0xff3df2, 0x33e0ff, 0xffd166][Math.floor(Math.random() * 3)];
      g.add(mesh(B(2.4, 0.9, 4.2), mat(0x1c1f2e, { metal: 0.6, rough: 0.3 }), 0, 1.2, 0));
      g.add(mesh(B(2.0, 0.7, 2.2), mat(0x3a3f5c, { metal: 0.4, rough: 0.2 }), 0, 1.9, -0.3));
      g.add(mesh(B(2.5, 0.12, 4.3), mat(neon, { emissive: neon, ei: 2 }), 0, 0.7, 0, false));
      for (const sx of [-0.8, 0.8]) g.add(mesh(B(0.5, 0.2, 0.1), mat(0xffffff, { emissive: 0xffffff, ei: 2 }), sx, 1.3, 2.11, false));
      break;
    }
    case 'bumper': {
      const base = mesh(C(1.6, 1.8, 1.0, 20), mat(0x7a5cff, { metal: 0.3, rough: 0.3 }), 0, 0.5, 0); g.add(base);
      g.add(mesh(C(1.2, 1.2, 0.8, 20), mat(0xffffff, { emissive: 0xffd166, ei: 0.8 }), 0, 1.3, 0));
      g.add(mesh(new THREE.TorusGeometry(1.5, 0.2, 8, 24), mat(0xff3df2, { emissive: 0xff3df2, ei: 1.2 }), 0, 1.0, 0)).rotation.x = Math.PI / 2;
      g.userData.spin = g;
      break;
    }
    default: g.add(mesh(S(1.4), mat(0xff00ff), 0, 1.4, 0));
  }
  return g;
}

/** Small square portrait of a racer for menus and the HUD: an SVG face in the racer's colours. */
export function portraitSVG(r, size = 64) {
  const feat = {
    robot: `<path d="M18 30a14 12 0 0 1 28 0v6H18z" fill="#151821"/><rect x="24" y="28" width="5" height="9" rx="2" fill="#46f0ff"/><rect x="35" y="28" width="5" height="9" rx="2" fill="#46f0ff"/><line x1="32" y1="12" x2="32" y2="4" stroke="#c9d1de" stroke-width="2"/><circle cx="32" cy="4" r="3" fill="#ff8a2b"/>`,
    fox: `<path d="M14 18l6-12 8 9zM50 18l-6-12-8 9z" fill="${r.color}"/><path d="M22 40q10 12 20 0l-10 8z" fill="${r.accent}"/><circle cx="32" cy="44" r="3" fill="#151821"/>`,
    rhino: `<path d="M30 40l2-16 4 16z" fill="${r.accent}"/><ellipse cx="32" cy="44" rx="13" ry="8" fill="${r.color}" stroke="#0003"/>`,
    cat: `<path d="M16 20l4-12 8 8zM48 20l-4-12-8 8z" fill="${r.color}"/><circle cx="32" cy="34" r="27" fill="#bfe8ff44" stroke="#fff8" stroke-width="2"/><circle cx="32" cy="41" r="2.5" fill="#ff7eb6"/>`,
    crow: `<path d="M26 38l6 14 6-14z" fill="#ffd166"/><path d="M28 10l4-6 4 6z" fill="${r.color}"/><ellipse cx="32" cy="24" rx="20" ry="4" fill="none" stroke="#ffd166" stroke-width="3"/>`,
    tortoise: `<path d="M12 28a20 18 0 0 1 40 0z" fill="${r.accent}"/><rect x="28" y="24" width="20" height="4" rx="2" fill="${r.accent}"/>`,
    axolotl: `<path d="M8 26l8 4M6 34l10 0M8 42l8-4M56 26l-8 4M58 34l-10 0M56 42l-8-4" stroke="#ff3d8b" stroke-width="3.5" stroke-linecap="round"/><path d="M26 42q6 5 12 0" stroke="#151821" stroke-width="2" fill="none"/>`,
    otter: `<circle cx="14" cy="18" r="5" fill="${r.color}"/><circle cx="50" cy="18" r="5" fill="${r.color}"/><ellipse cx="32" cy="42" rx="9" ry="6" fill="${r.accent}"/><circle cx="32" cy="39" r="2.5" fill="#151821"/>`,
  }[r.kind] || '';
  const face = r.kind === 'robot' ? '#f4f6fb' : r.kind === 'tortoise' ? '#8fbf6a' : r.color;
  const eyes = r.kind === 'robot' ? '' : `<circle cx="25" cy="32" r="4" fill="#fff"/><circle cx="39" cy="32" r="4" fill="#fff"/><circle cx="25.5" cy="33" r="2" fill="#111"/><circle cx="39.5" cy="33" r="2" fill="#111"/>`;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}"><circle cx="32" cy="34" r="22" fill="${face}"/>${feat}${eyes}</svg>`;
}

/** Item icons for the HUD (inline SVG, original art). */
export const ITEM_ICON = {
  pepper: `<svg viewBox="0 0 64 64"><path d="M20 22c10-6 26 2 28 18 1 9-6 16-14 12C22 46 14 32 20 22z" fill="#e5383b"/><path d="M22 22c-2-6 2-11 8-12" stroke="#2fbf4f" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M28 28c6 0 10 4 11 10" stroke="#fff8" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
  puddle: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="40" rx="24" ry="12" fill="#7ddf3a"/><circle cx="18" cy="30" r="6" fill="#7ddf3a"/><circle cx="44" cy="28" r="8" fill="#7ddf3a"/><ellipse cx="28" cy="36" rx="8" ry="3" fill="#fff6"/></svg>`,
  puck: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="22" ry="10" fill="#9b2427"/><ellipse cx="32" cy="32" rx="22" ry="10" fill="#e5383b" stroke="#fff" stroke-width="3"/><circle cx="32" cy="30" r="5" fill="#ffd166"/></svg>`,
  shield: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#7fd8ff55" stroke="#bff0ff" stroke-width="4"/><path d="M20 24a14 14 0 0 1 14-8" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  comet: `<svg viewBox="0 0 64 64"><path d="M8 52L36 24l8 8z" fill="#ff7a1a88"/><circle cx="42" cy="22" r="13" fill="#fff1a8" stroke="#ff7a1a" stroke-width="4"/></svg>`,
  nova: `<svg viewBox="0 0 64 64"><path d="M32 6l7 17 18 2-14 12 5 18-16-10-16 10 5-18L7 25l18-2z" fill="#ffd166" stroke="#ff7eb6" stroke-width="3"/></svg>`,
  storm: `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="24" rx="20" ry="12" fill="#5a6b8c"/><path d="M34 30l-10 14h8l-4 14 14-18h-8l4-10z" fill="#ffd166"/></svg>`,
};
ITEM_ICON.pepper3 = ITEM_ICON.pepper; ITEM_ICON.puck3 = ITEM_ICON.puck;
