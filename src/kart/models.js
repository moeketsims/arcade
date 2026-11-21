// Sparkplug GP: karts, drivers, item crystals and projectiles, all built from primitives in code.
import * as THREE from 'three';

const mats = new Map();
/** Shared standard material per colour/options (keeps draw state small). */
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.1, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat, transparent: !!o.opacity, opacity: o.opacity ?? 1 }));
  return mats.get(key);
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const sph = (r, m, ws = 16, hs = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m);
const cyl = (r1, r2, h, m, s = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, s), m);
const cone = (r, h, m, s = 12) => new THREE.Mesh(new THREE.ConeGeometry(r, h, s), m);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const shadow = o => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; } }); return o; };

// ---- drivers --------------------------------------------------------------------------------------------------------
function driver(r) {
  const g = new THREE.Group(), main = mat(r.color), acc = mat(r.accent), dark = mat('#1a1d26'), white = mat('#ffffff');
  const body = at(sph(0.42, main), 0, 0.42, 0); body.scale.set(1, 1.1, 0.9); g.add(body);
  const head = new THREE.Group(); head.position.set(0, 1.08, 0.05); g.add(head);
  const eye = (x) => { const e = at(sph(0.1, white, 10, 8), x, 0.06, 0.33); const p = at(sph(0.055, dark, 8, 6), 0, 0, 0.06); e.add(p); return e; };
  const addEyes = (y = 0, z = 0) => { const a = eye(-0.14), b = eye(0.14); a.position.y += y; b.position.y += y; a.position.z += z; b.position.z += z; head.add(a, b); };
  switch (r.kind) {
    case 'fox': {
      head.add(sph(0.4, main)); const snout = at(cone(0.17, 0.4, acc), 0, -0.08, 0.42); snout.rotation.x = Math.PI / 2; head.add(snout);
      head.add(at(sph(0.06, dark, 8, 6), 0, -0.08, 0.62));
      for (const s of [-1, 1]) { const e = at(cone(0.16, 0.5, main, 4), s * 0.24, 0.44, 0); e.rotation.z = -s * 0.3; head.add(e); e.add(at(cone(0.08, 0.26, acc, 4), 0, -0.04, 0.06)); }
      const tail = at(cone(0.16, 0.7, main, 8), 0, 0.3, -0.5); tail.rotation.x = -2.2; g.add(tail); tail.add(at(cone(0.09, 0.22, acc, 8), 0, 0.42, 0));
      addEyes(0.08); break;
    }
    case 'frog': {
      const h = sph(0.42, main); h.scale.set(1.15, 0.8, 1); head.add(h);
      for (const s of [-1, 1]) { const e = at(sph(0.16, main, 10, 8), s * 0.24, 0.3, 0.12); head.add(e); const w = at(sph(0.11, white, 10, 8), 0, 0.04, 0.1); w.add(at(sph(0.06, dark, 8, 6), 0, 0, 0.07)); e.add(w); }
      const m = at(box(0.42, 0.03, 0.05, dark), 0, -0.12, 0.38); head.add(m);
      head.add(at(sph(0.13, acc, 10, 8), 0, -0.22, 0.25)); break;
    }
    case 'robot': {
      head.add(box(0.7, 0.55, 0.6, main));
      const visor = at(box(0.56, 0.2, 0.05, mat(r.accent, { emissive: r.accent, ei: 1.4 })), 0, 0.04, 0.31); head.add(visor);
      head.add(at(cyl(0.025, 0.025, 0.36, dark, 6), 0, 0.45, 0)); head.add(at(sph(0.07, mat('#ff8a2b', { emissive: '#ff5a00', ei: 1 }), 8, 6), 0, 0.65, 0));
      for (const s of [-1, 1]) head.add(at(cyl(0.12, 0.12, 0.08, dark, 10), s * 0.38, 0, 0).rotateZ(Math.PI / 2)); break;
    }
    case 'alien': {
      const h = sph(0.42, main); h.scale.set(1, 1.1, 1); head.add(h);
      for (const s of [-1, 1]) { const a = at(cyl(0.02, 0.02, 0.4, main, 6), s * 0.16, 0.48, 0); a.rotation.z = -s * 0.35; head.add(a); head.add(at(sph(0.08, mat(r.accent, { emissive: r.accent, ei: 0.8 }), 8, 6), s * 0.24, 0.68, 0)); }
      for (const s of [-1, 1]) { const e = at(sph(0.13, dark, 12, 8), s * 0.15, 0.06, 0.32); e.scale.set(0.8, 1.2, 0.6); head.add(e); e.add(at(sph(0.04, white, 6, 4), 0.03, 0.05, 0.08)); }
      break;
    }
    case 'penguin': {
      head.add(sph(0.4, main)); const face = at(sph(0.3, white), 0, -0.04, 0.17); face.scale.set(1, 0.95, 0.75); head.add(face);
      const beak = at(cone(0.09, 0.26, acc, 8), 0, -0.08, 0.46); beak.rotation.x = Math.PI / 2; head.add(beak);
      head.add(at(box(0.62, 0.1, 0.46, mat('#ff4b6e')), 0, 0.24, 0)); addEyes(0.06, 0.02); break;   // a woolly hat band
    }
    case 'panda': {
      head.add(sph(0.4, main)); const muz = at(sph(0.2, acc), 0, -0.1, 0.3); muz.scale.set(1.2, 0.8, 0.8); head.add(muz);
      head.add(at(sph(0.06, dark, 8, 6), 0, -0.04, 0.46));
      for (const s of [-1, 1]) { head.add(at(sph(0.14, main, 10, 8), s * 0.3, 0.32, -0.02)); head.add(at(sph(0.08, acc, 8, 6), s * 0.3, 0.34, 0.06)); head.add(at(sph(0.08, acc, 8, 6), s * 0.18, 0.12, 0.3)); }
      addEyes(0.1, 0.02); break;
    }
    case 'bear': {
      const h = sph(0.44, main); head.add(h); const muz = at(sph(0.2, acc), 0, -0.1, 0.33); muz.scale.set(1.1, 0.85, 0.9); head.add(muz);
      head.add(at(sph(0.07, dark, 8, 6), 0, -0.02, 0.5));
      for (const s of [-1, 1]) head.add(at(sph(0.13, main, 10, 8), s * 0.32, 0.34, 0));
      body.scale.set(1.2, 1.15, 1); addEyes(0.1); break;
    }
    case 'dino': {
      const h = sph(0.38, main); h.scale.set(1, 0.9, 1.2); head.add(h);
      const jaw = at(box(0.42, 0.18, 0.34, main), 0, -0.14, 0.32); head.add(jaw);
      for (let i = 0; i < 4; i++) head.add(at(cone(0.07, 0.18, acc, 4), 0, 0.36 - i * 0.02, 0.1 - i * 0.18));
      const tail = at(cone(0.2, 0.9, main, 8), 0, 0.25, -0.6); tail.rotation.x = -1.9; g.add(tail);
      addEyes(0.12, -0.02); break;
    }
  }
  // arms reaching for the wheel
  for (const s of [-1, 1]) { const a = at(cyl(0.08, 0.07, 0.55, main, 8), s * 0.36, 0.6, 0.28); a.rotation.x = 1.1; a.rotation.z = s * 0.2; g.add(a); }
  g.userData.head = head;
  return g;
}

// ---- karts ----------------------------------------------------------------------------------------------------------
/**
 * Build a kart with its driver. Returns a Group (+Z = forward, y = 0 at the ground) with userData:
 * wheels (spin), steer (front pivots), body (tilt/bounce), head, exhaust (local points), driver.
 */
export function makeKart(racer, kdef) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = mat(racer.color, { metal: 0.35, rough: 0.35 }), trim = mat(racer.accent, { rough: 0.4 }), dark = mat('#20232c', { rough: 0.8 }), chrome = mat('#cfd6e4', { metal: 0.9, rough: 0.25 });
  const tyre = mat('#16181d', { rough: 0.9 });
  const ud = g.userData; ud.wheels = []; ud.steer = []; ud.exhaust = [];
  const wheel = (x, z, r, w) => {
    const piv = new THREE.Group(); piv.position.set(x, r, z); g.add(piv);
    const wh = new THREE.Group(); piv.add(wh);
    const t = cyl(r, r, w, tyre, 16); t.rotation.z = Math.PI / 2; wh.add(t);
    const hub = cyl(r * 0.55, r * 0.55, w + 0.02, trim, 10); hub.rotation.z = Math.PI / 2; wh.add(hub);
    const spoke = box(w + 0.04, r * 1.2, 0.08, chrome); wh.add(spoke);
    ud.wheels.push(wh); if (z > 0) ud.steer.push(piv);
  };
  let seatZ = -0.2, wheelZ = [1.05, -0.95], wr = [0.36, 0.42], track = 0.95;
  switch (kdef.id) {
    case 'buggy': {
      body.add(at(box(1.3, 0.25, 2.3, paint), 0, 0.5, 0));
      const nose = at(box(1.1, 0.3, 0.6, paint), 0, 0.62, 1.2); nose.rotation.x = -0.35; body.add(nose);
      // roll cage
      for (const s of [-1, 1]) { const bar = at(cyl(0.05, 0.05, 1.3, chrome, 6), s * 0.55, 1.15, -0.55); bar.rotation.x = 0.2; body.add(bar); }
      const top = at(cyl(0.05, 0.05, 1.1, chrome, 6), 0, 1.78, -0.42); top.rotation.z = Math.PI / 2; body.add(top);
      body.add(at(box(1.0, 0.12, 0.6, trim), 0, 0.68, -1.2));
      wr = [0.42, 0.48]; track = 1.0; break;
    }
    case 'rocket': {
      const hull = at(cyl(0.45, 0.35, 2.8, paint, 12), 0, 0.62, 0.1); hull.rotation.x = Math.PI / 2; body.add(hull);
      const tip = at(cone(0.45, 0.8, paint, 12), 0, 0.62, 1.9); tip.rotation.x = Math.PI / 2; body.add(tip);
      body.add(at(box(1.9, 0.08, 0.45, trim), 0, 0.85, -1.15));                 // wing
      for (const s of [-1, 1]) body.add(at(box(0.08, 0.35, 0.45, trim), s * 0.9, 0.98, -1.15));
      for (const s of [-1, 1]) { const ex = at(cyl(0.12, 0.16, 0.5, chrome, 10), s * 0.3, 0.6, -1.4); ex.rotation.x = Math.PI / 2; body.add(ex); }
      seatZ = -0.35; wheelZ = [1.15, -0.95]; wr = [0.32, 0.4]; track = 0.95; break;
    }
    case 'scoot': {
      body.add(at(box(1.0, 0.22, 2.0, paint), 0, 0.42, 0));
      const front = at(box(0.9, 0.7, 0.4, paint), 0, 0.8, 0.85); front.rotation.x = -0.25; body.add(front);
      body.add(at(sph(0.16, mat('#fff8c8', { emissive: '#fff2a0', ei: 1.2 }), 10, 8), 0, 0.95, 1.08));
      body.add(at(box(0.8, 0.12, 0.6, trim), 0, 0.58, -0.95));
      wr = [0.3, 0.34]; track = 0.8; wheelZ = [0.95, -0.85]; break;
    }
    case 'brick': {
      body.add(at(box(1.55, 0.5, 2.5, paint), 0, 0.68, 0));
      body.add(at(box(1.5, 0.25, 0.4, chrome), 0, 0.55, 1.35));                 // bumper
      body.add(at(box(1.3, 0.5, 0.6, paint), 0, 1.05, 0.85));                   // engine block
      for (const s of [-1, 1]) body.add(at(cyl(0.09, 0.09, 0.9, chrome, 8), s * 0.55, 1.5, -0.95));   // stacks
      wr = [0.42, 0.5]; track = 1.05; wheelZ = [1.1, -1.0]; break;
    }
  }
  // seat, steering column, number plate
  body.add(at(box(0.8, 0.5, 0.18, dark), 0, 0.95, seatZ - 0.42));
  const col = at(cyl(0.04, 0.04, 0.6, dark, 6), 0, 1.0, seatZ + 0.62); col.rotation.x = -0.9; body.add(col);
  const sw = at(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), dark), 0, 1.18, seatZ + 0.48); sw.rotation.x = -0.6; body.add(sw);
  ud.wheel = sw;
  wheel(track, wheelZ[0], wr[0], 0.32); wheel(-track, wheelZ[0], wr[0], 0.32); wheel(track, wheelZ[1], wr[1], 0.4); wheel(-track, wheelZ[1], wr[1], 0.4);
  ud.exhaust = [new THREE.Vector3(0.35, 0.6, wheelZ[1] - 0.6), new THREE.Vector3(-0.35, 0.6, wheelZ[1] - 0.6)];
  ud.rear = [new THREE.Vector3(track, 0.05, wheelZ[1]), new THREE.Vector3(-track, 0.05, wheelZ[1])];
  const d = driver(racer); d.position.set(0, 0.55, seatZ); d.scale.setScalar(0.95); body.add(d);
  ud.body = body; ud.head = d.userData.head; ud.driver = d;
  // a soft blob shadow helps read height on jumps (real shadows only reach nearby karts)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1.4, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.scale.set(0.85, 1.25, 1); blob.renderOrder = 1; ud.blob = blob;
  return shadow(g);
}

// ---- item crystal & projectiles ---------------------------------------------------------------------------------------
const crystalGeo = new THREE.OctahedronGeometry(0.95, 0);
export function makeCrystal() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x3a7bff, emissiveIntensity: 0.6, transparent: true, opacity: 0.72, roughness: 0.1, metalness: 0.2, flatShading: true }));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), new THREE.MeshBasicMaterial({ color: 0xfff4a0 }));
  g.add(outer, inner); g.userData.outer = outer; g.userData.inner = inner;
  return g;
}
export function makeDecoy() {
  const g = makeCrystal();
  g.userData.outer.material = g.userData.outer.material.clone(); g.userData.outer.material.color.set(0xff9fb0); g.userData.outer.material.emissive.set(0xa0203a);
  g.userData.inner.material = new THREE.MeshBasicMaterial({ color: 0xff3355 });
  return g;
}
export function makeProjectile(type) {
  const g = new THREE.Group();
  if (type === 'goo') {
    const b = sph(0.75, mat('#5be37a', { rough: 0.2, emissive: '#1f7a35', ei: 0.4 }), 14, 10); b.scale.set(1.3, 0.55, 1.3); b.position.y = 0.3; g.add(b);
    for (let i = 0; i < 5; i++) g.add(at(sph(0.25, mat('#5be37a', { rough: 0.2 }), 8, 6), Math.cos(i * 1.3) * 0.9, 0.12, Math.sin(i * 1.3) * 0.9));
    g.add(at(sph(0.12, mat('#ffffff'), 8, 6), -0.25, 0.65, 0.4), at(sph(0.12, mat('#ffffff'), 8, 6), 0.25, 0.65, 0.4));
  } else if (type === 'puck') {
    const p = cyl(0.7, 0.7, 0.35, mat('#ff4b6e', { metal: 0.4, rough: 0.3 }), 18); p.position.y = 0.4; g.add(p);
    g.add(at(cyl(0.45, 0.45, 0.37, mat('#ffffff', { emissive: '#ffd0da', ei: 0.4 }), 18), 0, 0.4, 0));
  } else if (type === 'wasp') {
    const b = sph(0.5, mat('#ffd23f', { rough: 0.4 }), 12, 10); b.scale.set(0.8, 0.8, 1.4); g.add(b);
    for (let i = -1; i <= 1; i++) { const s = at(cyl(0.4, 0.4, 0.12, mat('#1a1d26'), 12), 0, 0, i * 0.3); s.rotation.x = Math.PI / 2; s.scale.set(1.02, 1, 1.02); g.add(s); }
    const st = at(cone(0.15, 0.5, mat('#1a1d26'), 8), 0, 0, -0.85); st.rotation.x = -Math.PI / 2; g.add(st);
    for (const s of [-1, 1]) { const w = at(sph(0.45, new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55 }), 10, 6), s * 0.55, 0.45, 0); w.scale.set(1, 0.15, 0.6); g.add(w); g.userData['wing' + s] = w; }
    g.add(at(sph(0.14, mat('#ff3355', { emissive: '#ff0033', ei: 1 }), 8, 6), 0.18, 0.15, 0.6), at(sph(0.14, mat('#ff3355', { emissive: '#ff0033', ei: 1 }), 8, 6), -0.18, 0.15, 0.6));
  } else if (type === 'decoy') return makeDecoy();
  return shadow(g);
}
