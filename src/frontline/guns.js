// Procedural models for every weapon, knife and piece of equipment, built from primitives.
// Convention (first-person / model space): barrel points toward -Z, +Y is up, +X is the shooter's right, origin near the pistol grip.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPONS, sanitizeAtts } from './data.js';

// ---------------------------------------------------------------------------------------------------------------
// primitives + materials
// ---------------------------------------------------------------------------------------------------------------
const matCache = new Map();
export function MAT(hex, rough = 0.6, metal = 0.3, extra = {}) {
  const key = `${hex}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}
const glowCache = new Map();
export function GLOW(hex) { if (!glowCache.has(hex)) glowCache.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return glowCache.get(hex); }

const BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
const unitCyl = seg => { if (!cylCache.has(seg)) cylCache.set(seg, new THREE.CylinderGeometry(1, 1, 1, seg, 1)); return cylCache.get(seg); };
const CONE = new THREE.ConeGeometry(1, 1, 12);
const SPHERE = new THREE.SphereGeometry(1, 14, 10);

const DEFAULT_PAL = { body: 0x2b2f36, furn: 0x1b1d21, acc: 0x555b66 };
const PAL = {
  vanguard4: { body: 0x2b2f36, furn: 0x1b1d21, acc: 0x555b66 },
  kestrel47: { body: 0x2a2c30, furn: 0x7a4a26, acc: 0x4a4e55 },
  ranger556: { body: 0x6f6446, furn: 0x5b5039, acc: 0x2b2f36 },
  tempest: { body: 0x4a5334, furn: 0x363d25, acc: 0x23262b },
  viper9: { body: 0x23262b, furn: 0x1a1c20, acc: 0x555b66 },
  hornet: { body: 0x33383f, furn: 0xc2562b, acc: 0x15171a },
  wasp: { body: 0x626a78, furn: 0x2b2f36, acc: 0xc28a2b },
  bulwark60: { body: 0x2a2e26, furn: 0x1c2018, acc: 0x555b66 },
  atlas: { body: 0x3a3f33, furn: 0x24271f, acc: 0x8d7d5c },
  longbow: { body: 0x2b2f36, furn: 0x3a3a3a, acc: 0x7b6e52 },
  sentinel14: { body: 0x23262b, furn: 0x7a5232, acc: 0x555b66 },
  phantom50: { body: 0x4a5236, furn: 0x2f3524, acc: 0x15171a },
  reconbolt: { body: 0x1f2227, furn: 0x2f3138, acc: 0x555b66 },
  breacher12: { body: 0x1f2227, furn: 0x7a5232, acc: 0x555b66 },
  riotauto: { body: 0x2b2f36, furn: 0x1b1d21, acc: 0xd6a31f },
  doublebarrel: { body: 0x4a4e55, furn: 0x8a5a34, acc: 0xb8934a },
  sidewinder: { body: 0x9aa0aa, furn: 0x5a3a22, acc: 0x23262b },
  tactical9: { body: 0x23262b, furn: 0x1b1d21, acc: 0x555b66 },
  magnum: { body: 0x8d949e, furn: 0x6b4426, acc: 0x23262b },
  machinepistol: { body: 0x2b2f36, furn: 0x1b1d21, acc: 0xc2562b },
  ram: { body: 0x4f5a3c, furn: 0x2b2f26, acc: 0xc22b2b },
  skylock: { body: 0x56606b, furn: 0x2b2f36, acc: 0x33e0ff },
};

class Parts {
  constructor(root, pal) { this.root = root; this.pal = pal; this.cur = root; }
  m(k) {
    if (k && k.isMaterial) return k;
    if (typeof k === 'number') return MAT(k, 0.6, 0.3);
    switch (k) {
      case 'body': return MAT(this.pal.body, 0.5, 0.55);
      case 'furn': return MAT(this.pal.furn, 0.75, 0.1);
      case 'acc': return MAT(this.pal.acc, 0.45, 0.6);
      case 'dark': return MAT(0x15171a, 0.55, 0.4);
      case 'metal': return MAT(0x3a3f47, 0.35, 0.8);
      case 'chrome': return MAT(0x9aa0aa, 0.25, 0.9);
      case 'wood': return MAT(0x7a5232, 0.7, 0.0);
      case 'brass': return MAT(0xc2a04a, 0.35, 0.8);
      case 'rubber': return MAT(0x101113, 0.9, 0.0);
      case 'glass': return MAT(0x7fd8ff, 0.1, 0.1, { transparent: true, opacity: 0.35 });
      case 'red': return GLOW(0xff2a2a);
      case 'cyan': return GLOW(0x33e0ff);
      default: return MAT(0x777777);
    }
  }
  box(w, h, l, x, y, z, mat = 'body', rx = 0, ry = 0, rz = 0, parent = this.cur) {
    const o = new THREE.Mesh(BOX, this.m(mat)); o.scale.set(w, h, l); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o;
  }
  /** Cylinder with radius r and length len along an axis ('z' default). Centre at (x,y,z). */
  cyl(r, len, x, y, z, mat = 'body', axis = 'z', seg = 12, parent = this.cur) {
    const o = new THREE.Mesh(unitCyl(seg), this.m(mat)); o.scale.set(r, len, r); o.position.set(x, y, z);
    if (axis === 'z') o.rotation.x = Math.PI / 2; else if (axis === 'x') o.rotation.z = Math.PI / 2;
    parent.add(o); return o;
  }
  cone(r, len, x, y, z, mat = 'body', axis = 'z', parent = this.cur) {
    const o = new THREE.Mesh(CONE, this.m(mat)); o.scale.set(r, len, r); o.position.set(x, y, z);
    if (axis === '-z') o.rotation.x = -Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
    parent.add(o); return o;
  }
  sphere(r, x, y, z, mat = 'body', parent = this.cur) { const o = new THREE.Mesh(SPHERE, this.m(mat)); o.scale.setScalar(r); o.position.set(x, y, z); parent.add(o); return o; }
  group(x = 0, y = 0, z = 0, parent = this.root, name = '') { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; }
}

// ---------------------------------------------------------------------------------------------------------------
// optics, irons, muzzles (shared by every gun)
// ---------------------------------------------------------------------------------------------------------------
/** Iron sights: rear posts at zRear, front post at zFront; the aim line passes at height top + 0.03. Returns {y, z}. */
function irons(P, top, zRear, zFront, scale = 1) {
  const g = P.group(0, 0, 0, P.root, 'irons');
  const sy = top + 0.03 * scale;
  P.box(0.008, 0.032 * scale + 0.01, 0.014, 0.011, top + 0.015 * scale, zRear, 'dark', 0, 0, 0, g);
  P.box(0.008, 0.032 * scale + 0.01, 0.014, -0.011, top + 0.015 * scale, zRear, 'dark', 0, 0, 0, g);
  P.box(0.03, 0.01, 0.02, 0, top + 0.005, zRear, 'dark', 0, 0, 0, g);
  P.box(0.004, 0.03 * scale + 0.004, 0.005, 0, top + 0.015 * scale, zFront, 'dark', 0, 0, 0, g);
  P.box(0.016, 0.012, 0.022, 0, top + 0.004, zFront, 'dark', 0, 0, 0, g);
  return { y: sy, z: zRear };
}

/** Mount an optic centred at zc on a receiver whose top is `top`. Returns {y (axis height), z (eye end)}. */
function optic(P, kind, top, zc, lite) {
  const g = P.group(0, 0, 0, P.root, 'optic');
  P.box(0.022, 0.01, 0.07, 0, top + 0.005, zc, 'dark', 0, 0, 0, g);
  if (kind === 'dot') {
    const y = top + 0.048;
    P.box(0.032, 0.05, 0.075, 0, top + 0.035, zc, 'dark', 0, 0, 0, g);
    P.box(0.024, 0.032, 0.006, 0, y, zc - 0.036, 'glass', 0, 0, 0, g);
    P.box(0.003, 0.003, 0.004, 0, y, zc - 0.0375, 'red', 0, 0, 0, g);
    return { y, z: zc + 0.04, dist: 0.2 };
  }
  if (kind === 'holo') {
    const y = top + 0.052;
    P.box(0.04, 0.012, 0.09, 0, top + 0.016, zc, 'dark', 0, 0, 0, g);
    P.box(0.006, 0.05, 0.09, 0.019, top + 0.04, zc, 'dark', 0, 0, 0, g);
    P.box(0.006, 0.05, 0.09, -0.019, top + 0.04, zc, 'dark', 0, 0, 0, g);
    P.box(0.04, 0.008, 0.09, 0, top + 0.068, zc, 'dark', 0, 0, 0, g);
    P.box(0.032, 0.044, 0.004, 0, y, zc - 0.043, 'glass', 0, 0, 0, g);
    return { y, z: zc + 0.046, dist: 0.2 };
  }
  const long = kind === 'x8', len = long ? 0.27 : 0.15, r = long ? 0.028 : 0.024, y = top + (long ? 0.058 : 0.052);
  P.cyl(r, len, 0, y, zc, 'dark', 'z', 14, g);
  P.cyl(r * 1.35, 0.05, 0, y, zc - len / 2 + 0.01, 'dark', 'z', 14, g);      // objective bell
  P.cyl(r * 1.15, 0.035, 0, y, zc + len / 2 - 0.01, 'dark', 'z', 14, g);     // eyepiece
  P.cyl(r * 1.3, 0.012, 0, y, zc - len / 2 - 0.015, 'glass', 'z', 14, g);
  P.cyl(0.011, 0.03, 0, y + r + 0.006, zc - len * 0.1, 'acc', 'y', 8, g);  // elevation turret
  P.cyl(0.011, 0.03, r + 0.006, y, zc - len * 0.1, 'acc', 'x', 8, g);
  P.box(0.024, 0.03, 0.02, 0, top + 0.02, zc - len * 0.3, 'dark', 0, 0, 0, g);
  P.box(0.024, 0.03, 0.02, 0, top + 0.02, zc + len * 0.3, 'dark', 0, 0, 0, g);
  return { y, z: zc + len / 2 + 0.02, dist: 0.13, scope: true };
}

function muzzleDevice(P, kind, z, y = 0.02, r = 0.0105) {
  if (kind === 'supp') {
    P.cyl(0.023, 0.2, 0, y, z - 0.09, 'dark', 'z', 14);
    P.cyl(0.026, 0.02, 0, y, z - 0.19, 'dark', 'z', 14);
    P.cyl(0.015, 0.03, 0, y, z - 0.005, 'metal', 'z', 10);
    return z - 0.2;
  }
  if (kind === 'comp') {
    P.cyl(0.0165, 0.06, 0, y, z - 0.025, 'dark', 'z', 12);
    P.box(0.044, 0.006, 0.014, 0, y, z - 0.03, 'dark');
    P.box(0.006, 0.044, 0.014, 0, y, z - 0.045, 'dark');
    return z - 0.055;
  }
  return z;
}

// ---------------------------------------------------------------------------------------------------------------
// archetypes. Each returns { top, rail: [zRear, zFront] (centre for optics = mean), muzzleZ, muzzleY, grip: [x,y,z], fore: [x,y,z], mag, bolt, eject, hip: [x,y,z] }
// ---------------------------------------------------------------------------------------------------------------
function stickMag(P, parent, w, len, d, curve, mat = 'dark') {
  P.box(w, len, d, 0, -len / 2, 0, mat, curve, 0, 0, parent);
  P.box(w + 0.004, 0.012, d + 0.004, 0, -len + 0.004, 0, 'acc', curve, 0, 0, parent);
}

function archAR(P, def, a, o) {
  const v = def.look?.variant || 'std';
  const wood = v === 'heavy' || v === 'wood';
  const hg = v === 'carbine' ? 0.22 : v === 'heavy' ? 0.3 : 0.27, bar = v === 'carbine' ? 0.26 : v === 'heavy' ? 0.3 : 0.34;
  const top = 0.046, ext = a.mag === 'ext' ? 1.45 : 1;
  const furn = wood ? 'wood' : 'furn';
  P.box(0.046, 0.052, 0.27, 0, 0.02, -0.12, 'body');                      // upper
  P.box(0.042, 0.05, 0.21, 0, -0.028, -0.07, 'body');                     // lower
  P.box(0.03, 0.095, 0.042, 0, -0.092, 0.035, furn, -0.32);              // grip
  P.box(0.007, 0.007, 0.075, 0, -0.056, -0.035, 'body');                  // trigger guard
  P.box(0.007, 0.018, 0.007, 0, -0.046, -0.03, 'dark');
  P.box(0.007, 0.03, 0.007, 0, -0.07, -0.0, 'body');
  const hgm = P.box(0.054, 0.056, hg, 0, 0.011, -0.255 - hg / 2, furn);   // handguard
  if (!o.lite) for (let i = 0; i < 4; i++) P.box(0.056, 0.004, 0.012, 0, 0.011 + 0.026, -0.275 - i * (hg / 4.5), 'dark');
  P.cyl(0.0095, hg + bar, 0, 0.02, -0.255 - (hg + bar) / 2, 'metal', 'z', 10);   // barrel
  P.box(0.016, 0.04, 0.025, 0, 0.032, -0.255 - hg - 0.018, 'dark');       // gas block / sight base
  P.cyl(0.0125, 0.045, 0, 0.02, -0.255 - hg - bar + 0.01, 'dark', 'z', 10); // flash hider
  // stock
  if (wood) { P.box(0.04, 0.085, 0.27, 0, -0.012, 0.185, 'wood', 0.06); P.box(0.042, 0.095, 0.014, 0, -0.012, 0.325, 'rubber', 0.06); }
  else if (a.stock === 'light') { P.cyl(0.011, 0.25, 0, 0.0, 0.17, 'metal', 'z', 8); P.box(0.006, 0.07, 0.2, 0.014, -0.025, 0.19, 'dark'); P.box(0.006, 0.07, 0.2, -0.014, -0.025, 0.19, 'dark'); P.box(0.04, 0.085, 0.012, 0, -0.022, 0.3, 'rubber'); }
  else { P.cyl(0.017, 0.15, 0, 0.002, 0.1, 'metal', 'z', 10); P.box(0.04, 0.078, 0.14, 0, -0.01, 0.215, 'furn'); P.box(0.042, 0.088, 0.012, 0, -0.01, 0.29, 'rubber'); }
  // magazine
  const mag = P.group(0, -0.04, wood ? -0.115 : -0.12, P.root, 'mag');
  stickMag(P, mag, 0.032, 0.115 * ext, 0.05, wood ? -0.22 : -0.08);
  // charging handle (bolt group slides back)
  const bolt = P.group(0, 0.03, -0.02, P.root, 'bolt');
  P.box(0.012, 0.018, 0.05, 0.026, 0, -0.04, 'dark', 0, 0, 0, bolt); P.box(0.03, 0.012, 0.012, 0, 0.0, -0.01, 'dark', 0, 0, 0, bolt);
  P.box(0.02, 0.008, 0.28, 0, top + 0.004, -0.125, 'dark'); // rail
  const rear = 0.0, front = -0.255 - hg - 0.018;
  const sight = a.optic === 'iron' ? irons(P, top, rear - 0.02, front) : null;
  return { top, rail: [0.01, -0.25], zc: -0.1, muzzleZ: -0.255 - hg - bar, muzzleY: 0.02, grip: [0, -0.045, 0.0], fore: [0, -0.03, -0.255 - hg * 0.55], mag, bolt, eject: [0.03, 0.025, -0.06], hip: [0.19, -0.19, -0.3], irons: sight, front, rear: rear - 0.02 };
}

function archBullpup(P, def, a, o) {
  const top = 0.052, ext = a.mag === 'ext' ? 1.45 : 1;
  P.box(0.05, 0.085, 0.52, 0, 0.0, -0.01, 'body');                          // main body
  P.box(0.046, 0.07, 0.12, 0, -0.005, 0.28, 'furn');                        // butt
  P.box(0.05, 0.09, 0.014, 0, -0.005, 0.345, 'rubber');
  P.box(0.03, 0.095, 0.042, 0, -0.088, -0.07, 'furn', -0.3);               // grip
  P.box(0.007, 0.007, 0.08, 0, -0.056, -0.15, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.046, -0.12, 'dark');
  P.box(0.052, 0.06, 0.14, 0, 0.005, -0.34, 'furn');                        // handguard
  P.cyl(0.0095, 0.34, 0, 0.012, -0.5, 'metal', 'z', 10);
  P.cyl(0.0125, 0.045, 0, 0.012, -0.66, 'dark', 'z', 10);
  const mag = P.group(0, -0.04, 0.1, P.root, 'mag');                         // magazine behind the grip
  stickMag(P, mag, 0.032, 0.11 * ext, 0.05, 0.1);
  const bolt = P.group(0.028, 0.02, 0.06, P.root, 'bolt'); P.box(0.012, 0.016, 0.05, 0, 0, 0, 'dark', 0, 0, 0, bolt);
  P.box(0.022, 0.008, 0.3, 0, top + 0.004, -0.04, 'dark');
  const sight = a.optic === 'iron' ? irons(P, top, 0.1, -0.5) : null;
  return { top, rail: [0.14, -0.22], zc: -0.04, muzzleZ: -0.67, muzzleY: 0.012, grip: [0, -0.045, -0.07], fore: [0, -0.02, -0.33], mag, bolt, eject: [0.03, 0.02, 0.0], hip: [0.19, -0.18, -0.28], irons: sight, front: -0.5, rear: 0.1 };
}

function archSMG(P, def, a, o) {
  const v = def.look?.variant || 'std', ext = a.mag === 'ext' ? 1.4 : 1;
  const top = v === 'boxy' ? 0.05 : 0.046, len = v === 'pdw' ? 0.3 : 0.24;
  if (v === 'pdw') {
    P.box(0.045, 0.075, 0.34, 0, 0.0, -0.05, 'body');                    // compact body
    P.box(0.042, 0.06, 0.1, 0, -0.005, 0.18, 'furn'); P.box(0.044, 0.07, 0.012, 0, -0.005, 0.236, 'rubber');
    P.box(0.03, 0.09, 0.04, 0, -0.085, 0.03, 'furn', -0.3);
    P.box(0.05, 0.055, 0.1, 0, 0.0, -0.27, 'furn'); P.cyl(0.0095, 0.14, 0, 0.01, -0.38, 'metal', 'z', 10); P.cyl(0.0125, 0.04, 0, 0.01, -0.44, 'dark', 'z', 10);
    P.box(0.025, 0.07, 0.03, 0, -0.07, -0.2, 'furn');                    // front grip
  } else {
    P.box(0.046, v === 'boxy' ? 0.07 : 0.058, len, 0, 0.01, -0.09, 'body');
    P.box(0.03, 0.09, 0.04, 0, -0.085, 0.03, 'furn', -0.3);
    P.cyl(0.032, 0.17, 0, 0.012, -0.28, 'dark', 'z', 14);                // shroud
    for (let i = 0; i < 4; i++) P.box(0.066, 0.01, 0.01, 0, 0.012, -0.22 - i * 0.04, 'acc');
    P.cyl(0.0095, 0.14, 0, 0.012, -0.42, 'metal', 'z', 10); P.cyl(0.0125, 0.04, 0, 0.012, -0.47, 'dark', 'z', 10);
    P.box(0.025, 0.085, 0.03, 0, -0.07, -0.22, 'furn');                  // vertical foregrip
    if (a.stock === 'light') P.cyl(0.008, 0.18, 0, 0.0, 0.15, 'metal', 'z', 8);
    else { P.box(0.006, 0.05, 0.2, 0.012, 0.0, 0.18, 'metal'); P.box(0.006, 0.05, 0.2, -0.012, 0.0, 0.18, 'metal'); P.box(0.04, 0.07, 0.012, 0, 0.0, 0.285, 'rubber'); }
  }
  P.box(0.007, 0.007, 0.07, 0, -0.052, -0.03, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.042, -0.025, 'dark');
  const mag = P.group(0, -0.04, v === 'pdw' ? -0.1 : -0.1, P.root, 'mag');
  stickMag(P, mag, 0.03, (v === 'boxy' ? 0.15 : 0.13) * ext, v === 'boxy' ? 0.06 : 0.045, v === 'boxy' ? -0.16 : 0);
  const bolt = P.group(0.026, 0.02, -0.02, P.root, 'bolt'); P.box(0.012, 0.016, 0.045, 0, 0, -0.03, 'dark', 0, 0, 0, bolt);
  P.box(0.02, 0.008, 0.22, 0, top + 0.004, -0.1, 'dark');
  const sight = a.optic === 'iron' ? irons(P, top, 0.02, v === 'pdw' ? -0.38 : -0.4) : null;
  return { top, rail: [0.02, -0.2], zc: -0.08, muzzleZ: v === 'pdw' ? -0.46 : -0.49, muzzleY: v === 'pdw' ? 0.01 : 0.012, grip: [0, -0.045, 0.0], fore: [0, -0.025, v === 'pdw' ? -0.2 : -0.22], mag, bolt, eject: [0.03, 0.02, -0.05], hip: [0.18, -0.17, -0.26], irons: sight, front: v === 'pdw' ? -0.38 : -0.4, rear: 0.02 };
}

function archLMG(P, def, a, o) {
  const belt = def.look?.variant === 'belt', top = 0.062;
  P.box(0.062, 0.09, 0.36, 0, 0.01, -0.1, 'body');
  P.box(0.05, 0.05, 0.2, 0, -0.04, -0.05, 'body');
  P.box(0.032, 0.095, 0.045, 0, -0.1, 0.045, 'furn', -0.3);
  P.box(0.007, 0.007, 0.08, 0, -0.07, -0.04, 'body');
  P.box(0.065, 0.065, 0.3, 0, 0.012, -0.43, 'furn');                         // handguard / shroud
  for (let i = 0; i < 4; i++) P.box(0.068, 0.012, 0.018, 0, 0.045, -0.31 - i * 0.07, 'dark');
  P.cyl(0.0125, 0.42, 0, 0.018, -0.7, 'metal', 'z', 10); P.cyl(0.0165, 0.06, 0, 0.018, -0.9, 'dark', 'z', 10);
  P.box(0.012, 0.075, 0.012, 0.03, -0.07, -0.55, 'metal', 0, 0, 0.5); P.box(0.012, 0.075, 0.012, -0.03, -0.07, -0.55, 'metal', 0, 0, -0.5); // folded bipod
  // carry handle
  P.box(0.012, 0.05, 0.012, 0, 0.1, -0.2, 'metal'); P.box(0.012, 0.05, 0.012, 0, 0.1, -0.38, 'metal'); P.box(0.014, 0.012, 0.2, 0, 0.128, -0.29, 'metal');
  const ext = a.mag === 'ext' ? 1.35 : 1;
  const mag = P.group(0, -0.05, -0.1, P.root, 'mag');
  if (belt) {
    P.box(0.11 * ext, 0.14 * ext, 0.2, -0.065, -0.07, 0, 'dark', 0, 0, 0, mag);       // ammo box on the left
    P.box(0.115 * ext, 0.012, 0.205, -0.065, -0.14 * ext, 0, 'acc', 0, 0, 0, mag);
    for (let i = 0; i < 7; i++) P.box(0.008, 0.012, 0.03, -0.02 + i * 0.0, 0.03 - i * 0.006, -0.08 + i * 0.026, 'brass', 0, 0, 0.1, mag);
    P.box(0.07, 0.03, 0.22, 0, 0.065, -0.04, 'dark');                                  // feed cover
  } else {
    P.box(0.07, 0.11 * ext, 0.14, 0, -0.055, 0, 'dark', 0, 0, 0, mag);
    P.box(0.074, 0.012, 0.144, 0, -0.11 * ext, 0, 'acc', 0, 0, 0, mag);
    P.box(0.07, 0.03, 0.2, 0, 0.065, -0.04, 'dark');
  }
  if (a.stock === 'light') { P.cyl(0.011, 0.25, 0, 0.0, 0.22, 'metal', 'z', 8); P.box(0.006, 0.08, 0.2, 0.014, -0.03, 0.24, 'dark'); P.box(0.006, 0.08, 0.2, -0.014, -0.03, 0.24, 'dark'); P.box(0.042, 0.1, 0.012, 0, -0.03, 0.35, 'rubber'); }
  else { P.box(0.045, 0.095, 0.25, 0, -0.02, 0.27, 'furn', 0.04); P.box(0.048, 0.11, 0.014, 0, -0.02, 0.4, 'rubber', 0.04); }
  const bolt = P.group(0.034, 0.03, -0.1, P.root, 'bolt'); P.box(0.014, 0.02, 0.06, 0, 0, 0, 'dark', 0, 0, 0, bolt);
  P.box(0.022, 0.008, 0.3, 0, top + 0.004, -0.12, 'dark');
  const sight = a.optic === 'iron' ? irons(P, top, 0.06, -0.62, 1.1) : null;
  return { top, rail: [0.04, -0.22], zc: -0.06, muzzleZ: -0.93, muzzleY: 0.018, grip: [0, -0.05, 0.02], fore: [0, -0.015, -0.4], mag, bolt, eject: [0.034, 0.03, -0.1], hip: [0.2, -0.2, -0.32], irons: sight, front: -0.62, rear: 0.06 };
}

function archDMR(P, def, a, o) {
  const v = def.look?.variant || 'std', wood = v === 'wood', top = 0.047, ext = a.mag === 'ext' ? 1.4 : 1;
  const hg = 0.34, bar = 0.38;
  P.box(0.046, 0.054, 0.3, 0, 0.02, -0.13, 'body'); P.box(0.042, 0.052, 0.22, 0, -0.028, -0.07, 'body');
  P.box(0.03, 0.095, 0.042, 0, -0.092, 0.035, wood ? 'wood' : 'furn', -0.32);
  P.box(0.007, 0.007, 0.075, 0, -0.056, -0.035, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.046, -0.03, 'dark');
  P.box(0.052, 0.054, hg, 0, 0.011, -0.28 - hg / 2, wood ? 'wood' : 'furn');
  P.cyl(0.0105, hg + bar, 0, 0.02, -0.28 - (hg + bar) / 2, 'metal', 'z', 10);
  P.cyl(0.0135, 0.05, 0, 0.02, -0.28 - hg - bar + 0.01, 'dark', 'z', 10);
  P.box(0.016, 0.04, 0.025, 0, 0.032, -0.28 - hg - 0.018, 'dark');
  if (wood) { P.box(0.042, 0.1, 0.3, 0, -0.012, 0.19, 'wood', 0.08); P.box(0.044, 0.105, 0.014, 0, -0.016, 0.345, 'rubber', 0.08); }
  else if (a.stock === 'light') { P.cyl(0.011, 0.25, 0, 0.0, 0.17, 'metal', 'z', 8); P.box(0.006, 0.07, 0.2, 0.014, -0.02, 0.19, 'dark'); P.box(0.006, 0.07, 0.2, -0.014, -0.02, 0.19, 'dark'); P.box(0.04, 0.085, 0.012, 0, -0.018, 0.3, 'rubber'); }
  else { P.cyl(0.017, 0.15, 0, 0.002, 0.1, 'metal', 'z', 10); P.box(0.04, 0.085, 0.16, 0, -0.01, 0.225, 'furn'); P.box(0.046, 0.05, 0.12, 0, 0.045, 0.22, 'furn'); P.box(0.042, 0.095, 0.012, 0, -0.01, 0.31, 'rubber'); }
  const mag = P.group(0, -0.04, -0.125, P.root, 'mag'); stickMag(P, mag, 0.034, 0.13 * ext, 0.055, wood ? -0.12 : -0.06);
  const bolt = P.group(0.026, 0.025, -0.03, P.root, 'bolt'); P.box(0.012, 0.018, 0.05, 0, 0, -0.04, 'dark', 0, 0, 0, bolt);
  P.box(0.02, 0.008, 0.3, 0, top + 0.004, -0.13, 'dark');
  P.box(0.012, 0.012, 0.1, 0, -0.07, -0.58, 'metal', 0, 0, 0); // bipod stub
  const sight = a.optic === 'iron' ? irons(P, top, 0.0, -0.28 - hg - 0.018) : null;
  return { top, rail: [0.02, -0.26], zc: -0.1, muzzleZ: -0.28 - hg - bar, muzzleY: 0.02, grip: [0, -0.045, 0.0], fore: [0, -0.025, -0.28 - hg * 0.5], mag, bolt, eject: [0.03, 0.025, -0.07], hip: [0.19, -0.19, -0.3], irons: sight, front: -0.28 - hg - 0.018, rear: 0.0 };
}

function archSniper(P, def, a, o) {
  const v = def.look?.variant || 'light', heavy = v === 'heavy', top = 0.05, ext = a.mag === 'ext' ? 1.5 : 1;
  const bar = heavy ? 0.62 : 0.5;
  P.box(0.05, 0.06, 0.36, 0, 0.015, -0.12, 'body');                          // receiver
  P.box(0.048, 0.07, 0.3, 0, -0.01, -0.34 - 0.0, 'furn');                    // fore-end
  P.cyl(heavy ? 0.0145 : 0.012, bar, 0, 0.02, -0.5 - bar / 2 + 0.04, 'metal', 'z', 12);
  if (heavy) { P.cyl(0.021, 0.12, 0, 0.02, -0.5 - bar + 0.04, 'dark', 'z', 12); P.box(0.06, 0.012, 0.014, 0, 0.02, -0.5 - bar + 0.04, 'dark'); P.box(0.012, 0.06, 0.014, 0, 0.02, -0.5 - bar + 0.0, 'dark'); }
  else P.cyl(0.0175, 0.06, 0, 0.02, -0.5 - bar + 0.06, 'dark', 'z', 12);
  P.box(0.034, 0.1, 0.05, 0, -0.095, 0.03, 'furn', -0.3);                    // grip
  P.box(0.007, 0.007, 0.08, 0, -0.056, -0.035, 'body');
  // stock with cheek piece
  if (a.stock === 'light') { P.box(0.03, 0.09, 0.28, 0, -0.01, 0.2, 'furn', 0.1); P.box(0.032, 0.06, 0.2, 0, 0.045, 0.2, 'furn'); }
  else { P.box(0.05, 0.1, 0.3, 0, -0.01, 0.2, 'furn', 0.1); P.box(0.05, 0.05, 0.22, 0, 0.055, 0.2, 'furn'); }
  P.box(0.05, 0.11, 0.018, 0, -0.018, 0.355, 'rubber', 0.1);
  const mag = P.group(0, -0.035, -0.12, P.root, 'mag'); P.box(0.036, 0.07 * ext, 0.07, 0, -0.035 * ext, 0, 'dark', 0, 0, 0, mag);
  // bolt handle (bolt group slides back + rotates)
  const bolt = P.group(0.032, 0.025, -0.07, P.root, 'bolt');
  P.cyl(0.006, 0.05, 0.03, -0.005, 0.0, 'metal', 'x', 8, bolt); P.sphere(0.014, 0.062, -0.01, 0.0, 'dark', bolt); P.box(0.02, 0.026, 0.06, -0.01, 0.0, 0.0, 'metal', 0, 0, 0, bolt);
  // bipod folded forward
  P.box(0.01, 0.01, 0.12, 0.022, -0.055, -0.5, 'metal'); P.box(0.01, 0.01, 0.12, -0.022, -0.055, -0.5, 'metal');
  P.box(0.026, 0.008, 0.28, 0, top + 0.004, -0.12, 'dark');
  const sight = a.optic === 'iron' ? irons(P, top, 0.06, -0.5 - bar + 0.0, 1.0) : null;
  return { top, rail: [0.05, -0.28], zc: -0.1, muzzleZ: -0.5 - bar + (heavy ? -0.07 : -0.03) + 0.04, muzzleY: 0.02, grip: [0, -0.05, 0.03], fore: [0, -0.02, -0.34], mag, bolt, eject: [0.035, 0.025, -0.06], hip: [0.2, -0.2, -0.3], irons: sight, front: -0.5 - bar + 0.04, rear: 0.06 };
}

function archPump(P, def, a, o) {
  const top = 0.045, wood = true, short = def.id === 'breacher12';
  const bl = short ? 0.5 : 0.6;
  P.box(0.05, 0.07, 0.26, 0, 0.0, -0.1, 'body');
  P.box(0.03, 0.09, 0.04, 0, -0.085, 0.04, 'wood', -0.25);
  P.box(0.007, 0.007, 0.07, 0, -0.058, -0.04, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.046, -0.035, 'dark');
  P.cyl(0.0165, bl, 0, 0.018, -0.23 - bl / 2, 'metal', 'z', 12);                      // barrel
  const ext = a.mag === 'ext' ? 1.25 : 1;
  P.cyl(0.0155, bl * 0.85 * ext, 0, -0.022, -0.23 - bl * 0.85 * ext / 2, 'metal', 'z', 12);   // magazine tube
  P.cyl(0.0185, 0.03, 0, -0.022, -0.23 - bl * 0.85 * ext + 0.01, 'dark', 'z', 12);
  P.box(0.012, 0.012, 0.012, 0, 0.03, -0.23 - bl + 0.02, 'dark');
  // stock
  if (a.stock === 'light') { P.cyl(0.011, 0.25, 0, 0.0, 0.17, 'metal', 'z', 8); P.box(0.042, 0.075, 0.012, 0, -0.01, 0.295, 'rubber'); P.box(0.006, 0.07, 0.2, 0.014, -0.02, 0.19, 'dark'); P.box(0.006, 0.07, 0.2, -0.014, -0.02, 0.19, 'dark'); }
  else { P.box(0.042, 0.09, 0.27, 0, -0.015, 0.19, wood ? 'wood' : 'furn', 0.07); P.box(0.044, 0.1, 0.014, 0, -0.02, 0.33, 'rubber', 0.07); }
  const mag = P.group(0, -0.02, -0.15, P.root, 'mag');                                 // shell loading port marker
  P.box(0.04, 0.012, 0.05, 0, -0.04, 0, 'dark', 0, 0, 0, mag);
  const bolt = P.group(0, -0.012, -0.36, P.root, 'bolt');                               // pump forend
  P.box(0.058, 0.055, 0.2, 0, 0, 0, 'wood', 0, 0, 0, bolt);
  for (let i = 0; i < 4; i++) P.box(0.062, 0.006, 0.008, 0, 0, -0.06 + i * 0.04, 'rubber', 0, 0, 0, bolt);
  const sight = a.optic === 'iron' ? irons(P, top, -0.02, -0.23 - bl + 0.02, 0.8) : null;
  P.box(0.02, 0.008, 0.14, 0, top + 0.004, -0.1, 'dark');
  return { top, rail: [0.0, -0.2], zc: -0.1, muzzleZ: -0.23 - bl, muzzleY: 0.018, grip: [0, -0.045, 0.04], fore: [0, -0.012, -0.36], mag, bolt, eject: [0.03, 0.0, -0.08], hip: [0.18, -0.18, -0.28], irons: sight, front: -0.23 - bl + 0.02, rear: -0.02 };
}

function archAutoShot(P, def, a, o) {
  const top = 0.052;
  P.box(0.052, 0.075, 0.3, 0, 0.0, -0.1, 'body');
  P.box(0.03, 0.095, 0.042, 0, -0.092, 0.035, 'furn', -0.32);
  P.box(0.007, 0.007, 0.075, 0, -0.06, -0.035, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.048, -0.03, 'dark');
  P.box(0.058, 0.06, 0.22, 0, 0.0, -0.36, 'furn');
  P.cyl(0.0175, 0.45, 0, 0.014, -0.36 - 0.2, 'metal', 'z', 12);
  P.cyl(0.0165, 0.4, 0, -0.026, -0.52, 'metal', 'z', 12);
  for (let i = 0; i < 5; i++) P.box(0.062, 0.006, 0.014, 0, 0.034, -0.3 - i * 0.04, 'dark');
  const ext = a.mag === 'ext' ? 1.35 : 1;
  const mag = P.group(0, -0.04, -0.13, P.root, 'mag'); stickMag(P, mag, 0.038, 0.12 * ext, 0.07, -0.05);
  if (a.stock === 'light') { P.cyl(0.011, 0.2, 0, 0.0, 0.15, 'metal', 'z', 8); P.box(0.042, 0.075, 0.012, 0, -0.01, 0.255, 'rubber'); }
  else { P.box(0.042, 0.082, 0.18, 0, -0.012, 0.18, 'furn'); P.box(0.044, 0.09, 0.012, 0, -0.012, 0.27, 'rubber'); }
  const bolt = P.group(0.03, 0.02, -0.06, P.root, 'bolt'); P.box(0.012, 0.016, 0.05, 0, 0, 0, 'dark', 0, 0, 0, bolt);
  P.box(0.022, 0.008, 0.26, 0, top + 0.004, -0.1, 'dark');
  const sight = a.optic === 'iron' ? irons(P, top, 0.02, -0.5, 0.9) : null;
  return { top, rail: [0.02, -0.22], zc: -0.08, muzzleZ: -0.585, muzzleY: 0.014, grip: [0, -0.045, 0.0], fore: [0, -0.015, -0.37], mag, bolt, eject: [0.034, 0.02, -0.06], hip: [0.18, -0.18, -0.28], irons: sight, front: -0.5, rear: 0.02 };
}

function archDouble(P, def, a, o) {
  const top = 0.04;
  const bl = 0.56;
  P.box(0.054, 0.07, 0.17, 0, -0.005, -0.05, 'body');
  P.box(0.03, 0.09, 0.04, 0, -0.08, 0.045, 'wood', -0.3);
  P.box(0.007, 0.007, 0.07, 0, -0.055, -0.04, 'body'); P.box(0.007, 0.016, 0.007, 0, -0.046, -0.035, 'dark');
  // barrels (hinge group so they can tip down for the break-action reload)
  const bolt = P.group(0, 0.0, -0.12, P.root, 'bolt');
  P.cyl(0.0145, bl, 0.0145, 0.015, -bl / 2, 'metal', 'z', 12, bolt); P.cyl(0.0145, bl, -0.0145, 0.015, -bl / 2, 'metal', 'z', 12, bolt);
  P.box(0.02, 0.008, bl, 0, 0.034, -bl / 2, 'dark', 0, 0, 0, bolt);
  P.box(0.058, 0.05, 0.18, 0, -0.015, -0.2, 'wood', 0, 0, 0, bolt);   // fore-end
  P.sphere(0.006, 0, 0.04, -bl + 0.01, 'brass', bolt);
  if (a.stock === 'light') { P.cyl(0.011, 0.25, 0, -0.005, 0.17, 'metal', 'z', 8); P.box(0.042, 0.07, 0.012, 0, -0.01, 0.295, 'rubber'); }
  else { P.box(0.044, 0.09, 0.27, 0, -0.025, 0.17, 'wood', 0.12); P.box(0.046, 0.1, 0.014, 0, -0.04, 0.31, 'rubber', 0.12); }
  const mag = P.group(0, 0.0, -0.1, P.root, 'mag');
  const sight = a.optic === 'iron' ? irons(P, top, 0.0, -0.12 - bl + 0.01, 0.6) : null;
  return { top, rail: [0.0, -0.12], zc: -0.06, muzzleZ: -0.12 - bl, muzzleY: 0.015, grip: [0, -0.045, 0.045], fore: [0, -0.015, -0.32], mag, bolt, eject: [0.03, 0.0, -0.06], hip: [0.17, -0.17, -0.28], irons: sight, front: -0.12 - bl + 0.01, rear: 0.0, hinge: true };
}

function archPistol(P, def, a, o) {
  const v = def.look?.variant || 'modern', auto = v === 'auto', classic = v === 'classic', ext = a.mag === 'ext' ? 1.45 : 1;
  const top = 0.035;
  const frameMat = classic ? 'body' : 'furn';
  P.box(0.03, 0.03, 0.17, 0, -0.012, -0.05, frameMat);                          // frame
  P.box(0.03, 0.1, 0.048, 0, -0.07, 0.04, classic ? 'wood' : frameMat, -0.22);   // grip
  P.box(0.007, 0.007, 0.06, 0, -0.034, -0.08, 'body'); P.box(0.007, 0.016, 0.007, 0, -0.03, -0.065, 'dark');
  if (!classic) P.box(0.026, 0.012, 0.06, 0, -0.03, -0.12, 'furn'); // rail
  const bolt = P.group(0, 0.012, -0.065, P.root, 'bolt');                          // slide
  const sl = auto ? 0.2 : classic ? 0.21 : 0.19;
  P.box(0.032, 0.034, sl, 0, 0.006, -0.0, 'body', 0, 0, 0, bolt);
  for (let i = 0; i < 4; i++) P.box(0.034, 0.03, 0.005, 0, 0.006, 0.07 + i * 0.012, 'dark', 0, 0, 0, bolt);
  P.box(0.012, 0.012, 0.02, 0, 0.026, 0.0, 'dark', 0, 0, 0, bolt);
  P.cyl(0.0085, 0.025, 0, 0.0, -sl / 2 - 0.005, 'metal', 'z', 8, bolt);
  const mag = P.group(0, -0.025, 0.035, P.root, 'mag');
  P.box(0.026, 0.12 * ext, 0.04, 0, -0.06 * ext, 0.0, 'dark', -0.22, 0, 0, mag);
  P.box(0.03, 0.01, 0.046, 0, -0.12 * ext, 0.018 + (ext > 1 ? 0.012 : 0), 'acc', -0.22, 0, 0, mag);
  if (auto) { P.cyl(0.012, 0.05, 0, 0.018, -0.065 - sl / 2 - 0.02, 'dark', 'z', 8); P.box(0.006, 0.05, 0.1, 0.012, 0.0, 0.12, 'metal'); P.box(0.006, 0.05, 0.1, -0.012, 0.0, 0.12, 'metal'); }
  const muzzleZ0 = -0.065 - sl / 2 - 0.02;
  const sight = a.optic === 'iron' ? irons(P, top, 0.03, muzzleZ0 + 0.03, 0.55) : null;
  if (classic) P.box(0.01, 0.018, 0.012, 0, 0.034, 0.075, 'dark'); // hammer
  return { top, rail: [0.0, -0.1], zc: -0.07, muzzleZ: muzzleZ0, muzzleY: 0.018, grip: [0, -0.06, 0.04], fore: [0, -0.045, 0.045], mag, bolt, eject: [0.02, 0.025, -0.06], hip: [0.12, -0.12, -0.26], irons: sight, front: muzzleZ0 + 0.03, rear: 0.03, pistol: true, boltTravel: 0.04 };
}

function archRevolver(P, def, a, o) {
  const top = 0.045;
  P.box(0.034, 0.06, 0.14, 0, 0.0, -0.04, 'body');                          // frame
  P.box(0.032, 0.105, 0.05, 0, -0.07, 0.05, 'wood', -0.28);                 // grip
  P.box(0.007, 0.007, 0.06, 0, -0.036, -0.06, 'body'); P.box(0.007, 0.018, 0.007, 0, -0.03, -0.045, 'dark');
  P.cyl(0.0125, 0.26, 0, 0.012, -0.26, 'body', 'z', 12);                       // barrel
  P.box(0.016, 0.014, 0.22, 0, 0.032, -0.25, 'body');                          // rib
  P.cyl(0.011, 0.2, 0, -0.012, -0.22, 'body', 'z', 10);                        // ejector shroud
  P.box(0.012, 0.014, 0.014, 0, 0.03, -0.36, 'dark');
  P.box(0.012, 0.022, 0.02, 0, 0.03, 0.04, 'dark', 0.3);                       // hammer
  const mag = P.group(0, 0.008, -0.02, P.root, 'mag');                          // cylinder
  P.cyl(0.028, 0.06, 0, 0, 0, 'chrome', 'z', 12, mag);
  for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; P.cyl(0.006, 0.062, Math.cos(ang) * 0.019, Math.sin(ang) * 0.019, 0, 'dark', 'z', 6, mag); }
  const bolt = P.group(0, 0, 0, P.root, 'bolt');
  const sight = a.optic === 'iron' ? irons(P, top - 0.003, 0.05, -0.355, 0.7) : null;
  return { top: top + 0.002, rail: [0.04, -0.08], zc: -0.02, muzzleZ: -0.39, muzzleY: 0.012, grip: [0, -0.05, 0.05], fore: [0, -0.05, 0.05], mag, bolt, eject: [0.02, 0.0, -0.02], hip: [0.13, -0.13, -0.28], irons: sight, front: -0.355, rear: 0.05, pistol: true, revolver: true };
}

function archRocket(P, def, a, o) {
  const sky = def.id === 'skylock';
  const r = sky ? 0.046 : 0.058, L = sky ? 0.9 : 0.98, cy = 0.13;
  P.cyl(r, L, 0, cy, -0.3, 'body', 'z', 16);
  P.cyl(r + 0.01, 0.07, 0, cy, 0.19, 'dark', 'z', 16);            // rear flare
  P.cyl(r + 0.008, 0.06, 0, cy, -0.76, 'dark', 'z', 16);          // front ring
  P.cyl(r + 0.004, 0.05, 0, cy, -0.4, 'acc', 'z', 16);            // painted band
  P.box(0.035, 0.1, 0.05, 0, -0.04, 0.03, 'furn', -0.25);          // rear grip
  P.box(0.035, 0.09, 0.04, 0, 0.0, -0.3, 'furn');                   // front grip
  P.box(0.007, 0.007, 0.07, 0, -0.01, -0.03, 'body');
  P.box(0.08, 0.05, 0.16, 0, cy - r - 0.02, 0.08, 'furn');          // shoulder rest
  if (sky) { P.box(0.07, 0.07, 0.16, 0, cy + r + 0.04, -0.28, 'dark'); P.cyl(0.032, 0.08, 0, cy + r + 0.05, -0.38, 'cyan', 'z', 12); P.box(0.04, 0.05, 0.08, 0.06, cy + 0.0, -0.1, 'dark'); }
  else { P.box(0.012, 0.045, 0.012, 0.0, cy + r + 0.022, -0.1, 'dark'); P.box(0.012, 0.045, 0.012, 0.0, cy + r + 0.022, -0.55, 'dark'); P.box(0.04, 0.012, 0.012, 0, cy + r + 0.05, -0.55, 'dark'); }
  const mag = P.group(0, cy, -0.76 - 0.03, P.root, 'mag');           // the loaded rocket tip
  P.cone(sky ? 0.04 : 0.05, 0.14, 0, 0, -0.07, sky ? 'acc' : 'red', 'z', mag);
  P.cyl(sky ? 0.04 : 0.05, 0.06, 0, 0, 0.0, 'metal', 'z', 12, mag);
  const bolt = P.group(0, 0, 0, P.root, 'bolt');
  const top = cy + r + 0.0;
  const sy = top + 0.05;
  return { top, rail: [0, -0.2], zc: -0.1, muzzleZ: -0.82, muzzleY: cy, grip: [0, -0.045, 0.03], fore: [0, -0.02, -0.3], mag, bolt, eject: [0, cy, 0.2], hip: [0.16, -0.2, -0.2], irons: { y: sy, z: -0.1 }, front: -0.55, rear: -0.1, launcher: true, backblast: [0, cy, 0.22] };
}

const ARCH = { ar: archAR, bullpup: archBullpup, smg: archSMG, lmg: archLMG, beltfed: archLMG, dmr: archDMR, sniper: archSniper, pump: archPump, autoshot: archAutoShot, doublebarrel: archDouble, pistol: archPistol, revolver: archRevolver, rocket: archRocket, skylock: archRocket };

// ---------------------------------------------------------------------------------------------------------------
// public: build a gun
// ---------------------------------------------------------------------------------------------------------------
/**
 * @returns THREE.Group with userData = { id, anchors: {muzzle, eject, sight, grip, fore, mag, bolt}, hip, adsDist, scope, hinge, pistol }
 * Anchors are Object3Ds (muzzle/eject) or Vector3-like arrays in model space (grip/fore/sight).
 */
export function buildGun(id, att = null, opts = {}) {
  const def = WEAPONS[id];
  const a = sanitizeAtts(def, att);
  const root = new THREE.Group(); root.name = `gun:${id}`;
  const pal = PAL[id] || DEFAULT_PAL;
  const P = new Parts(root, pal);
  const info = ARCH[def.model](P, def, a, opts);
  // optic
  let eye = null;
  if (a.optic !== 'iron' && !def.launcher && def.kind !== 'launcher') {
    const o = optic(P, a.optic, info.top, info.zc, opts.lite);
    eye = { x: 0, y: o.y, z: o.z, dist: o.dist, scope: !!o.scope };
  } else if (info.irons) eye = { x: 0, y: info.irons.y, z: info.irons.z, dist: info.pistol ? 0.2 : 0.22, scope: false };
  else eye = { x: 0, y: info.top + 0.03, z: 0.0, dist: 0.22, scope: false };
  // muzzle
  const mz0 = info.muzzleZ, mz = (def.kind === 'launcher') ? mz0 : muzzleDevice(P, a.muzzle, mz0, info.muzzleY);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, info.muzzleY, mz - 0.02); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(...info.eject); root.add(eject);
  root.userData = {
    id, anchors: { muzzle, eject, sight: new THREE.Vector3(eye.x, eye.y, eye.z), grip: new THREE.Vector3(...info.grip), fore: new THREE.Vector3(...info.fore), mag: info.mag, bolt: info.bolt },
    hip: info.hip, adsDist: eye.dist, scope: eye.scope, hinge: !!info.hinge, pistol: !!info.pistol, revolver: !!info.revolver, launcher: !!info.launcher,
    boltTravel: info.boltTravel ?? 0.035, magRest: info.mag ? info.mag.position.clone() : null, boltRest: info.bolt ? info.bolt.position.clone() : null,
    muzzleZ: mz, backblast: info.backblast || null, length: Math.abs(mz) + 0.3,
  };
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return root;
}

// ---------------------------------------------------------------------------------------------------------------
// merged static copy for third-person guns (robots, pickups): a single draw call per gun
// ---------------------------------------------------------------------------------------------------------------
const mergedCache = new Map();
const VCOL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 });
export function buildGunMerged(id) {
  if (!mergedCache.has(id)) {
    const g = buildGun(id, null, { lite: true });
    g.updateMatrixWorld(true);
    const geos = [];
    g.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
      const c = (o.material.color || new THREE.Color(0x888888));
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.deleteAttribute('uv');
      geos.push(geo);
    });
    const merged = mergeGeometries(geos, false);
    mergedCache.set(id, { geo: merged, muzzleZ: g.userData.muzzleZ, muzzleY: g.userData.anchors.muzzle.position.y, length: g.userData.length });
  }
  const c = mergedCache.get(id);
  const mesh = new THREE.Mesh(c.geo, VCOL_MAT);
  mesh.userData = { muzzleZ: c.muzzleZ, muzzleY: c.muzzleY, length: c.length };
  mesh.castShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// knives. Blade points toward -Z, edge faces down (-Y), flat sides +/-X. Origin at the middle of the handle.
// ---------------------------------------------------------------------------------------------------------------
function bladeGeo(points, thick) {
  const sh = new THREE.Shape(); sh.moveTo(points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-thick / 2, 0, 0);
  return g;
}
const bladeMat = MAT(0xd9dde3, 0.22, 0.95);
const bladeDark = MAT(0x3a3f47, 0.35, 0.9);
const knifeCache = new Map();
function curveBlade(R, a0, a1, wTip, wBase, steps = 12) {
  // crescent blade: centre line is an arc (centre at (0, -R)), outer edge thick -> tip
  const outer = [], inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, ang = a0 + (a1 - a0) * t, w = wBase + (wTip - wBase) * t;
    const cx = Math.sin(ang) * R, cy = Math.cos(ang) * R - R;
    const nx = Math.sin(ang), ny = Math.cos(ang);
    outer.push([cx * 1, cy + ny * w * 0.0 + w * 0.0]); inner.push([cx - nx * w, cy - ny * w]);
  }
  return [...outer, ...inner.reverse()];
}

export function buildKnife(id, opts = {}) {
  const root = new THREE.Group(); root.name = `knife:${id}`;
  const P = new Parts(root, { body: 0x2b2f36, furn: 0x1f2227, acc: 0x555b66 });
  const mk = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const ud = { id, anchors: {}, tip: null, blade: null };
  switch (id) {
    case 'combat': {
      P.box(0.028, 0.034, 0.115, 0, 0, 0.0, 'furn');                                   // handle
      for (let i = 0; i < 5; i++) P.box(0.03, 0.036, 0.006, 0, 0, -0.04 + i * 0.02, 'rubber');
      P.box(0.014, 0.05, 0.012, 0, 0, -0.07, 'acc');                                   // guard
      P.cyl(0.015, 0.015, 0, 0, 0.065, 'acc', 'z', 10);                                // pommel
      const g = bladeGeo([[0, 0.016], [0.1, 0.018], [0.17, 0.004], [0.185, -0.012], [0.12, -0.016], [0, -0.016]], 0.005);
      ud.blade = mk(g, bladeMat, 0, 0, -0.075);
      mk(bladeGeo([[0.02, 0.0], [0.15, 0.0], [0.15, -0.002], [0.02, -0.002]], 0.0055), bladeDark, 0, 0.008, -0.075);
      ud.length = 0.28; ud.grip = [0, 0, 0.01]; break;
    }
    case 'karambit': {
      P.box(0.026, 0.036, 0.09, 0, 0, 0, 'furn'); for (let i = 0; i < 4; i++) P.box(0.028, 0.038, 0.006, 0, 0, -0.03 + i * 0.02, 'rubber');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 16), MAT(0x555b66, 0.4, 0.8)); ring.position.set(0, 0, 0.075); ring.rotation.y = Math.PI / 2; root.add(ring);
      const pts = []; const R = 0.1, a0 = -0.15, a1 = 1.35;
      const outer = [], inner = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14, ang = a0 + (a1 - a0) * t, w = 0.026 * (1 - t) + 0.002; const cx = Math.sin(ang) * R, cy = Math.cos(ang) * R - R; outer.push([cx, cy]); inner.push([cx - Math.sin(ang) * w * 0.0 + 0.0, cy + 0.0]); }
      // blade polygon: along the arc (forward = +x in shape space, down = -y); thickness taper approximated by width
      const poly = []; for (let i = 0; i <= 14; i++) { const t = i / 14, ang = a0 + (a1 - a0) * t, w = 0.03 * (1 - t) + 0.001; const cx = Math.sin(ang) * R, cy = Math.cos(ang) * R - R; poly.push([cx, cy + w * 0.5]); }
      for (let i = 14; i >= 0; i--) { const t = i / 14, ang = a0 + (a1 - a0) * t, w = 0.03 * (1 - t) + 0.001; const cx = Math.sin(ang) * R, cy = Math.cos(ang) * R - R; poly.push([cx, cy - w * 0.5 - 0.004]); }
      ud.blade = mk(bladeGeo(poly, 0.005), bladeMat, 0, 0.0, -0.05);
      ud.length = 0.22; ud.grip = [0, 0, 0.0]; break;
    }
    case 'butterfly': {
      // blade with a tang, two handle halves that pivot (animated by the viewmodel)
      const g = bladeGeo([[0, 0.014], [0.09, 0.016], [0.13, 0.002], [0.145, -0.012], [0.09, -0.014], [0, -0.014]], 0.004);
      ud.blade = mk(g, bladeMat, 0, 0, -0.04);
      const pivot = P.group(0, 0, -0.035, root, 'pivot');
      const hA = P.group(0, 0, 0, pivot, 'hA'), hB = P.group(0, 0, 0, pivot, 'hB');
      P.box(0.01, 0.026, 0.12, 0.012, 0, 0.06, 'furn', 0, 0, 0, hA); P.box(0.01, 0.026, 0.12, -0.012, 0, 0.06, 'furn', 0, 0, 0, hB);
      for (let i = 0; i < 3; i++) { P.box(0.012, 0.028, 0.006, 0.012, 0, 0.03 + i * 0.03, 'acc', 0, 0, 0, hA); P.box(0.012, 0.028, 0.006, -0.012, 0, 0.03 + i * 0.03, 'acc', 0, 0, 0, hB); }
      P.cyl(0.008, 0.03, 0, 0, 0, 'chrome', 'x', 8, pivot);
      ud.hA = hA; ud.hB = hB; ud.pivot = pivot; ud.length = 0.26; ud.grip = [0, 0, 0.06]; break;
    }
    case 'machete': {
      P.box(0.026, 0.034, 0.12, 0, 0, 0.0, 'wood'); for (let i = 0; i < 2; i++) P.cyl(0.0045, 0.04, 0, 0, -0.02 + i * 0.05, 'chrome', 'x', 6);
      P.box(0.014, 0.036, 0.01, 0, 0, -0.065, 'acc');
      const g = bladeGeo([[0, 0.022], [0.24, 0.026], [0.34, 0.03], [0.4, 0.012], [0.36, -0.02], [0.2, -0.026], [0, -0.022]], 0.004);
      ud.blade = mk(g, MAT(0xaab0b8, 0.28, 0.9), 0, 0, -0.07);
      ud.length = 0.5; ud.grip = [0, 0, 0.0]; break;
    }
    case 'ballistic': {
      P.cyl(0.0195, 0.17, 0, 0, 0.0, 'furn', 'z', 12); P.cyl(0.024, 0.06, 0, 0, -0.07, 'acc', 'z', 12);
      P.box(0.012, 0.03, 0.03, 0, -0.04, 0.02, 'dark'); P.cyl(0.008, 0.03, 0, 0.0, 0.09, 'acc', 'z', 8);
      const bl = P.group(0, 0, -0.1, root, 'blade');
      const g = bladeGeo([[0, 0.01], [0.09, 0.012], [0.14, 0.0], [0.09, -0.012], [0, -0.01]], 0.004);
      const m = new THREE.Mesh(g, bladeMat); bl.add(m); P.cyl(0.011, 0.03, 0, 0, 0.0, 'acc', 'z', 8, bl);
      ud.blade = bl; ud.length = 0.34; ud.grip = [0, 0, 0.02]; break;
    }
    default: break;
  }
  root.userData = ud;
  return root;
}

/** Small knife used for throwing (lethal) and as the in-flight projectile. */
export function buildThrowingKnife() {
  const root = new THREE.Group();
  const P = new Parts(root, { body: 0x2b2f36, furn: 0x1f2227, acc: 0x555b66 });
  P.box(0.016, 0.022, 0.08, 0, 0, 0.0, 'furn');
  const g = bladeGeo([[0, 0.012], [0.07, 0.013], [0.13, 0.0], [0.07, -0.011], [0, -0.011]], 0.004);
  const m = new THREE.Mesh(g, bladeMat); m.position.z = -0.04; root.add(m);
  root.userData.length = 0.2;
  return root;
}

// ---------------------------------------------------------------------------------------------------------------
// equipment models (held + thrown)
// ---------------------------------------------------------------------------------------------------------------
export function buildGrenade(kind) {
  const root = new THREE.Group(); root.name = `nade:${kind}`;
  const P = new Parts(root, DEFAULT_PAL);
  const ud = { anchors: {}, pin: null };
  switch (kind) {
    case 'frag': P.sphere(0.036, 0, 0, 0, 0x4d5a3c); P.cyl(0.012, 0.02, 0, 0.038, 0, 'metal', 'y', 8); P.box(0.006, 0.05, 0.012, 0.016, 0.045, 0, 'metal'); ud.pin = P.cyl(0.002, 0.03, 0.02, 0.05, 0.02, 'chrome', 'x', 6); for (let i = 0; i < 3; i++) P.box(0.074, 0.003, 0.074, 0, -0.02 + i * 0.02, 0, 0x3b4730); break;
    case 'sticky': P.sphere(0.034, 0, 0, 0, 0xd6822b); P.sphere(0.02, 0, -0.01, 0.0, 0xf2b25a); P.cyl(0.012, 0.02, 0, 0.036, 0, 'metal', 'y', 8); ud.pin = P.cyl(0.002, 0.03, 0.02, 0.05, 0.02, 'chrome', 'x', 6); break;
    case 'flash': P.cyl(0.026, 0.11, 0, 0, 0, 0x8a909a, 'y', 14); P.cyl(0.0265, 0.02, 0, 0.02, 0, 0xf2f2f2, 'y', 14); P.cyl(0.012, 0.02, 0, 0.065, 0, 'metal', 'y', 8); ud.pin = P.cyl(0.002, 0.03, 0.02, 0.07, 0.02, 'chrome', 'x', 6); break;
    case 'smoke': P.cyl(0.026, 0.11, 0, 0, 0, 0x6c7480, 'y', 14); P.cyl(0.0265, 0.025, 0, 0.0, 0, 0x4fae6a, 'y', 14); P.cyl(0.012, 0.02, 0, 0.065, 0, 'metal', 'y', 8); ud.pin = P.cyl(0.002, 0.03, 0.02, 0.07, 0.02, 'chrome', 'x', 6); break;
    case 'stun': P.cyl(0.026, 0.11, 0, 0, 0, 0x4a5058, 'y', 14); P.cyl(0.0265, 0.012, 0, 0.025, 0, 0xf2c300, 'y', 14); P.cyl(0.0265, 0.012, 0, -0.025, 0, 0xf2c300, 'y', 14); P.cyl(0.012, 0.02, 0, 0.065, 0, 'metal', 'y', 8); ud.pin = P.cyl(0.002, 0.03, 0.02, 0.07, 0.02, 'chrome', 'x', 6); break;
    case 'mine': P.cyl(0.075, 0.035, 0, 0, 0, 0x4a5236, 'y', 16); P.cyl(0.03, 0.02, 0, 0.025, 0, 0x2b2f26, 'y', 12); ud.led = P.sphere(0.008, 0, 0.038, 0, 'red'); P.box(0.04, 0.012, 0.01, 0, 0.034, 0.05, 'dark'); break;
    case 'sensor': P.box(0.07, 0.025, 0.12, 0, 0, 0, 'dark'); P.box(0.056, 0.004, 0.09, 0, 0.0145, 0, 0x0a2a18); ud.led = P.sphere(0.006, 0, 0.018, 0.0, 'cyan'); P.cyl(0.004, 0.06, 0.03, 0.04, -0.04, 'metal', 'y', 6); ud.screen = P.box(0.05, 0.002, 0.075, 0, 0.0168, 0, GLOW(0x2cff7a)); break;
    default: P.sphere(0.035, 0, 0, 0, 0x555555); break;
  }
  root.userData = ud;
  return root;
}

/** Collectable ammo crate / pickup visuals are plain boxes (built in the level); this makes a floating pickup gun for dropped weapons. */
export function buildPickupGun(id) {
  const m = buildGunMerged(id);
  const g = new THREE.Group(); g.add(m); m.rotation.y = Math.PI / 2; m.position.set(0, 0.0, 0);
  g.userData = { length: m.userData.length };
  return g;
}

/** Bullet-hole / casing helper geometry exports used by fx. */
export const SHARED = { BOX, SPHERE };
