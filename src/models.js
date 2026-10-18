import * as THREE from 'three';

const matCache = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1,
      flatShading: !!o.flat });
    matCache.set(key, m);
  }
  return matCache.get(key);
}
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; return me;
}

// ---------- the hero: Bolt ----------
export function makeHero() {
  const g = new THREE.Group();
  const white = mat(0xf4f6fb, { rough: 0.35 }), grey = mat(0xc9d1de, { rough: 0.4 }), dark = mat(0x0d1424, { rough: 0.2, metal: 0.3 });
  const cyan = mat(0x46f0ff, { emissive: 0x46f0ff, ei: 1.6 }), orange = mat(0xff8a2b, { emissive: 0xff6a00, ei: 0.4 });
  const root = new THREE.Group(); g.add(root);                    // squash/stretch pivot at feet
  const body = mesh(new THREE.CapsuleGeometry(0.3, 0.22, 6, 14), white, 0, 0.62, 0); root.add(body);
  const belt = mesh(new THREE.TorusGeometry(0.31, 0.04, 8, 24), orange, 0, 0.55, 0); belt.rotation.x = Math.PI / 2; root.add(belt);
  const head = new THREE.Group(); head.position.y = 1.12; root.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.42, 24, 18), white));
  const visor = mesh(new THREE.SphereGeometry(0.36, 24, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.42), dark, 0, 0, 0.07);
  visor.rotation.y = Math.PI / 2 * 0; head.add(visor);
  const eyeGeo = new THREE.CapsuleGeometry(0.05, 0.08, 4, 8);
  const eyeL = mesh(eyeGeo, cyan, -0.13, 0.03, 0.4), eyeR = mesh(eyeGeo, cyan, 0.13, 0.03, 0.4);
  head.add(eyeL, eyeR);
  const ant = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22), grey, 0, 0.5, 0); head.add(ant);
  const antBall = mesh(new THREE.SphereGeometry(0.07, 12, 10), orange, 0, 0.63, 0); head.add(antBall);
  const ear = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16);
  const earL = mesh(ear, grey, -0.42, 0, 0), earR = mesh(ear, grey, 0.42, 0, 0);
  earL.rotation.z = earR.rotation.z = Math.PI / 2; head.add(earL, earR);
  const mkArm = s => { const p = new THREE.Group(); p.position.set(0.36 * s, 0.78, 0);
    p.add(mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 8), grey, 0, -0.14, 0));
    p.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), white, 0, -0.32, 0)); root.add(p); return p; };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = s => { const p = new THREE.Group(); p.position.set(0.15 * s, 0.36, 0);
    p.add(mesh(new THREE.CapsuleGeometry(0.08, 0.12, 4, 8), grey, 0, -0.12, 0));
    const foot = mesh(new THREE.SphereGeometry(0.13, 12, 10), white, 0, -0.27, 0.04); foot.scale.set(1, 0.7, 1.3); p.add(foot);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
    jet.position.set(0, -0.55, 0); jet.rotation.x = Math.PI; jet.visible = false; p.add(jet); p.userData.jet = jet;
    root.add(p); return p; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  // spin trail ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.0 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.7; g.add(ring);
  g.userData = { root, head, armL, armR, legL, legR, eyeL, eyeR, ring, body };
  return g;
}

// ---------- rescue bots ----------
const BOT_COLORS = [0xff6b6b, 0x6bcBff, 0xffd166, 0x7ae582, 0xc77dff, 0xff9f1c, 0x4cc9f0, 0xf72585];
export function makeBot(i = 0) {
  const g = new THREE.Group(), c = BOT_COLORS[i % BOT_COLORS.length];
  const white = mat(0xf4f6fb, { rough: 0.35 }), col = mat(c), dark = mat(0x0d1424, { rough: 0.2 });
  const eye = mat(0x46f0ff, { emissive: 0x46f0ff, ei: 1.4 });
  const root = new THREE.Group(); g.add(root);
  root.add(mesh(new THREE.CapsuleGeometry(0.2, 0.14, 4, 10), white, 0, 0.38, 0));
  const head = new THREE.Group(); head.position.y = 0.72; root.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.28, 18, 14), white));
  head.add(mesh(new THREE.SphereGeometry(0.24, 18, 12, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.4), dark, 0, 0, 0.05));
  head.add(mesh(new THREE.SphereGeometry(0.04, 8, 8), eye, -0.08, 0.02, 0.27), mesh(new THREE.SphereGeometry(0.04, 8, 8), eye, 0.08, 0.02, 0.27));
  const hat = i % 4;
  if (hat === 0) head.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 14), col, 0, 0.36, 0));
  else if (hat === 1) { const b = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16), col, 0, 0.26, 0); head.add(b); head.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16), col, 0, 0.21, 0)); }
  else if (hat === 2) head.add(mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), col, 0, 0.3, 0));
  else head.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), col, 0, 0.32, 0));
  const arm = mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 6), col, 0.25, 0.5, 0); arm.rotation.z = -2.4; root.add(arm);
  const arm2 = mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 6), col, -0.25, 0.42, 0); arm2.rotation.z = 0.4; root.add(arm2);
  g.userData = { root, head, arm };
  return g;
}

// ---------- enemies ----------
export function makeWalker(color = 0x8e5bd6) {
  const g = new THREE.Group(), m = mat(color, { rough: 0.6 });
  const body = mesh(new THREE.SphereGeometry(0.55, 18, 14), m, 0, 0.55, 0); body.scale.set(1, 0.85, 1); g.add(body);
  const w = mat(0xffffff), k = mat(0x111111);
  for (const s of [-1, 1]) { g.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), w, 0.2 * s, 0.7, 0.45)); g.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), k, 0.2 * s, 0.7, 0.58)); }
  const brow = mesh(new THREE.BoxGeometry(0.55, 0.07, 0.07), k, 0, 0.9, 0.46); brow.rotation.z = 0.0; g.add(brow);
  for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat(0xffffff), 0, 0.98, 0);
    sp.position.set(Math.cos(i / 6 * Math.PI * 2) * 0.35, 0.95, Math.sin(i / 6 * Math.PI * 2) * 0.35); g.add(sp); }
  const fl = mesh(new THREE.SphereGeometry(0.16, 8, 6), m, -0.25, 0.08, 0), fr = mesh(new THREE.SphereGeometry(0.16, 8, 6), m, 0.25, 0.08, 0);
  g.add(fl, fr); g.userData = { body, fl, fr };
  return g;
}
export function makeTurret(color = 0x5a6b8c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.6, 16), mat(color), 0, 0.3, 0));
  const head = new THREE.Group(); head.position.y = 0.85; g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.5, 16, 12), mat(0xe9ecf2)));
  head.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(0xff3355, { emissive: 0xff2244, ei: 1.5 }), 0, 0.1, 0.42));
  const barrel = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.6, 10), mat(0x333a48), 0, -0.1, 0.5); barrel.rotation.x = Math.PI / 2; head.add(barrel);
  g.userData = { head };
  return g;
}
export function makeFloater(color = 0xff7ad9) {
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.6, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { opacity: 0.75, emissive: color, ei: 0.35 }), 0, 0.4, 0); g.add(dome);
  for (let i = 0; i < 6; i++) { const t = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 6), mat(color, { opacity: 0.7 }), Math.cos(i) * 0.35, -0.05, Math.sin(i) * 0.35); g.add(t); }
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0x111111), -0.18, 0.62, 0.42), mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0x111111), 0.18, 0.62, 0.42));
  g.userData = { dome };
  return g;
}
export function makeFlyer(color = 0x3dd6d0) {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.45, 16, 12), mat(color), 0, 0, 0); body.scale.set(1, 0.6, 1); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(0xffee55, { emissive: 0xffcc00, ei: 1 }), 0, 0.05, 0.38));
  const prop = new THREE.Group(); prop.position.y = 0.35; g.add(prop);
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.9, 0.03, 0.14), mat(0xdddddd), 0, 0, 0); b.rotation.y = i * Math.PI / 3; prop.add(b); }
  g.userData = { prop };
  return g;
}

// ---------- props ----------
export function makeCoin() {
  const g = new THREE.Group();
  const c = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 24), mat(0xffc928, { metal: 0.6, rough: 0.25, emissive: 0x6b4a00, ei: 0.6 }));
  c.rotation.x = Math.PI / 2; g.add(c);
  const star = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 5), mat(0xfff1a8, { emissive: 0x8a6d00, ei: 0.6 }));
  star.rotation.x = Math.PI / 2; g.add(star);
  return g;
}
let crateTex = null;
function crateTexture() {
  if (crateTex) return crateTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = '#d98b3a'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#8a4f17'; x.lineWidth = 12; x.strokeRect(6, 6, 116, 116);
  x.beginPath(); x.moveTo(10, 10); x.lineTo(118, 118); x.moveTo(118, 10); x.lineTo(10, 118); x.stroke();
  x.fillStyle = '#ffe08a'; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 64, 66);
  crateTex = new THREE.CanvasTexture(cv); crateTex.colorSpace = THREE.SRGBColorSpace; return crateTex;
}
export function makeCrate() {
  return mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 }), 0, 0.5, 0);
}
export function makeMushroom(color = 0xff4f7b) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.6, 12), mat(0xfff2d6), 0, 0.3, 0));
  const cap = mesh(new THREE.SphereGeometry(0.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), 0, 0.55, 0); cap.scale.y = 0.55; g.add(cap);
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xffffff), Math.cos(i * 1.3) * 0.55, 0.8, Math.sin(i * 1.3) * 0.55));
  g.userData = { cap };
  return g;
}
export function makeCheckpoint() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 8), mat(0xdfe6f0), 0, 1.1, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 16), mat(0x9aa6b8), 0, 0.1, 0));
  const lamp = mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff5566, emissive: 0xff3344, emissiveIntensity: 1 }), 0, 2.35, 0);
  g.add(lamp); g.userData = { lamp };
  return g;
}
export function makePortal(color = 0x46f0ff, r = 2) {
  const g = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(r, 0.22, 14, 48), mat(0xf4f6fb, { metal: 0.4, rough: 0.3 }));
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  g.add(disc);
  const lights = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const l = mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(color, { emissive: color, ei: 2 }), Math.cos(a) * r, Math.sin(a) * r, 0.15); g.add(l); lights.push(l); }
  g.userData = { disc, ring, lights };
  return g;
}
export function makePowerup(kind) {
  const colors = { rocket: 0xff5a36, magnet: 0xe63946, slow: 0x9b5de5 };
  const g = new THREE.Group(), c = colors[kind] || 0xffffff;
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 18), new THREE.MeshStandardMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2 }));
  g.add(bubble);
  if (kind === 'rocket') { g.add(mesh(new THREE.CapsuleGeometry(0.18, 0.35, 6, 10), mat(c), -0.17, 0, 0)); g.add(mesh(new THREE.CapsuleGeometry(0.18, 0.35, 6, 10), mat(c), 0.17, 0, 0)); }
  else if (kind === 'magnet') { const t = mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 20, Math.PI), mat(c)); t.rotation.z = Math.PI; g.add(t);
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), mat(0xdddddd), -0.3, 0.05, 0), mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), mat(0xdddddd), 0.3, 0.05, 0)); }
  else { g.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 24), mat(c, { emissive: c, ei: 0.5 }))); g.children[1].rotation.x = Math.PI / 2;
    const hand = mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), mat(0xffffff), 0, 0.1, 0.07); g.add(hand); }
  g.userData = { bubble };
  return g;
}
export function makeMagnetNode() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.OctahedronGeometry(0.5), mat(0xe63946, { emissive: 0x900010, ei: 0.8, flat: true })));
  const ring = mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 30), mat(0xffffff, { emissive: 0xff8888, ei: 0.6 })); g.add(ring);
  g.userData = { ring };
  return g;
}
export function makeTree(trunk = 0x8b5a2b, leaf = 0x5fbf4a, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.4 * s, 8), mat(trunk), 0, 0.7 * s, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), mat(leaf, { flat: true }), 0, 1.8 * s, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.6 * s, 0), mat(leaf, { flat: true }), 0.4 * s, 2.3 * s, 0.1 * s));
  return g;
}
export function makePine(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 0.8 * s, 6), mat(0x6b4a2b), 0, 0.4 * s, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry((0.9 - i * 0.22) * s, 1 * s, 8), mat(i === 2 ? 0xffffff : 0x2f7d6b, { flat: true }), 0, (1 + i * 0.6) * s, 0));
  return g;
}
export function makeCoral(color, s = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) { const b = mesh(new THREE.CapsuleGeometry(0.12 * s, (0.5 + (i % 3) * 0.3) * s, 4, 8), mat(color), Math.cos(i * 2) * 0.25 * s, 0.4 * s, Math.sin(i * 2) * 0.25 * s);
    b.rotation.z = Math.cos(i * 1.7) * 0.5; b.rotation.x = Math.sin(i * 1.3) * 0.4; g.add(b); }
  return g;
}
