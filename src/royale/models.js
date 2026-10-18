// Weapon, throwable and consumable 3D models built from primitives. +Z is forward, the right-hand grip is the origin.
// userData: r = right grip, l = left grip (or null), m = muzzle point, hold = animation family.
import { Parts } from './parts.js';
import { RARITY } from './config.js';
import { ITEMS } from './items.js';

const C = { gun: 0x2f3540, dark: 0x171a20, poly: 0x4b525f, steel: 0xaab2bd, wood: 0x6f4a2c, woodL: 0x9a6b3e, tan: 0xb39a6b, olive: 0x4f5e2c, white: 0xeeeeee, red: 0xd33a3a, blue: 0x3a8cff, glass: 0x7fe3ff, gold: 0xffc02e, rubber: 0x101214, bone: 0xe6d8b8 };

// ---------- shared pieces ----------
function rifleBase(P, o = {}) {
  const body = o.body ?? C.gun, trim = o.trim ?? C.dark, st = o.stock ?? C.poly;
  const rl = o.recvLen ?? 0.34, rh = o.recvH ?? 0.085, rw = o.recvW ?? 0.055, z0 = -0.14, z1 = z0 + rl;
  P.box(body, [rw, rh, rl], [0, 0.045, (z0 + z1) / 2]);                       // receiver
  P.box(trim, [rw * 0.7, 0.014, rl * 0.92], [0, 0.045 + rh / 2 + 0.006, (z0 + z1) / 2]); // top rail
  P.box(trim, [0.04, 0.1, 0.045], [0, -0.045, -0.04], [0.3, 0, 0]);            // pistol grip
  const sl = o.stockLen ?? 0.22;
  if (sl > 0) { P.box(st, [0.045, 0.085, sl], [0, 0.03, z0 - sl / 2 + 0.01]); P.box(trim, [0.05, 0.1, 0.022], [0, 0.03, z0 - sl - 0.002]); }
  const hl = o.hg ?? 0.22; P.box(o.hgColor ?? st, [0.058, 0.066, hl], [0, 0.048, z1 + hl / 2]);   // handguard
  const bl = o.barrel ?? 0.12; P.cyl(trim, 0.0135, bl + 0.02, [0, 0.062, z1 + hl + bl / 2 - 0.01]);
  if (o.brake !== false) P.cyl(C.dark, 0.02, 0.05, [0, 0.062, z1 + hl + bl + 0.015], 'z', { seg: 8 });
  const mh = o.magH ?? 0.14;
  if (o.mag !== 'none') {
    if (o.mag === 'drum') P.cyl(trim, 0.07, 0.075, [0, -0.02, 0.07], 'x', { seg: 14 });
    else if (o.mag === 'box') P.box(trim, [0.05, mh, 0.08], [0, 0.045 - rh / 2 - mh / 2 + 0.01, 0.075]);
    else P.box(trim, [0.04, mh, 0.055], [0, 0.045 - rh / 2 - mh / 2 + 0.01, 0.075], [-0.18, 0, 0]);
    P.box(0, [0.042, 0.016, 0.058], [0, 0.045 - rh / 2 - 0.02, 0.07], [0, 0, 0], 'acc');
  }
  P.box(0, [0.03, 0.007, rl * 0.5], [0, 0.045 + rh / 2 + 0.002, (z0 + z1) / 2 + 0.03], [0, 0, 0], 'acc');   // rarity stripe on top
  P.box(C.dark, [0.014, 0.022, 0.02], [0, 0.045 + rh / 2 + 0.02, z0 + 0.04]);      // rear sight
  P.box(C.dark, [0.01, 0.026, 0.012], [0, 0.088, z1 + hl + bl - 0.01]);            // front sight
  return { zEnd: z1 + hl + bl + 0.04, z1, hl };
}
function scopeOn(P, len = 0.26, r = 0.028, z = 0.06, y = 0.135) {
  P.cyl(C.dark, r, len, [0, y, z], 'z', { seg: 12 });
  P.cyl(C.dark, r * 1.35, 0.05, [0, y, z + len / 2 - 0.02], 'z', { seg: 12 }); P.cyl(C.dark, r * 1.25, 0.04, [0, y, z - len / 2 + 0.01], 'z', { seg: 12 });
  P.cyl(C.glass, r * 1.05, 0.004, [0, y, z + len / 2 + 0.01], 'z', { seg: 10, bucket: 'glow' }); P.cyl(C.glass, r * 0.95, 0.004, [0, y, z - len / 2 - 0.015], 'z', { seg: 10, bucket: 'glow' });
  P.box(C.dark, [0.02, 0.04, 0.03], [0, y - 0.035, z + len * 0.25]); P.box(C.dark, [0.02, 0.04, 0.03], [0, y - 0.035, z - len * 0.25]);
}
function pistolBase(P, o = {}) {
  const sl = o.slide ?? 0.2, w = o.w ?? 0.032;
  P.box(o.slideC ?? C.gun, [w, 0.042, sl], [0, 0.05, sl / 2 - 0.05]);                     // slide
  P.box(C.dark, [w * 0.9, 0.028, sl * 0.9], [0, 0.015, sl / 2 - 0.045]);                   // frame
  P.box(C.dark, [0.034, 0.105, 0.045], [0, -0.045, -0.015], [0.2, 0, 0]);                  // grip
  P.box(C.dark, [0.01, 0.03, 0.04], [0, -0.01, 0.03]);                                      // trigger guard
  P.box(0, [w * 0.7, 0.007, sl * 0.55], [0, 0.075, sl / 2 - 0.035], [0, 0, 0], 'acc');
  P.box(C.dark, [0.012, 0.014, 0.012], [0, 0.077, sl - 0.06]); P.box(C.dark, [0.016, 0.014, 0.012], [0, 0.077, -0.04]);
  if (o.suppressor) P.cyl(C.dark, 0.02, 0.12, [0, 0.05, sl - 0.05 + 0.07], 'z', { seg: 10 });
  return sl - 0.05;
}
function shotBase(P, o = {}) {
  const st = o.stock ?? C.wood, zb = 0.0;
  P.box(C.gun, [0.05, 0.075, 0.26], [0, 0.045, 0.02]);                                      // receiver
  P.box(C.dark, [0.036, 0.1, 0.045], [0, -0.04, -0.045], [0.3, 0, 0]);                      // grip
  P.box(st, [0.05, 0.085, 0.3], [0, 0.03, -0.29], [0.06, 0, 0]);                            // stock
  P.box(C.dark, [0.052, 0.1, 0.02], [0, 0.025, -0.45]);
  const bl = o.barrel ?? 0.46;
  P.cyl(C.dark, 0.0185, bl, [0, 0.06, 0.15 + bl / 2], 'z', { seg: 10 });
  P.cyl(C.gun, 0.016, bl * 0.8, [0, 0.026, 0.15 + bl * 0.4], 'z', { seg: 10 });             // magazine tube
  P.box(0, [0.03, 0.007, 0.16], [0, 0.088, 0.04], [0, 0, 0], 'acc');
  P.box(C.dark, [0.01, 0.02, 0.012], [0, 0.085, 0.15 + bl - 0.01]);
  return 0.15 + bl;
}

// ---------- model table ----------
const M = {
  ar(P, ud) { const e = rifleBase(P, {}); ud.m = [0, 0.062, e.zEnd + 0.02]; ud.l = [0, 0.0, e.z1 + e.hl * 0.55]; ud.hold = 'rifle'; },
  burstar(P, ud) { const e = rifleBase(P, { body: 0x3a4150, hg: 0.18, barrel: 0.16, stockLen: 0.2, mag: 'curve', hgColor: C.gun });
    P.box(C.dark, [0.012, 0.05, 0.02], [0, 0.12, 0.02]); P.box(C.dark, [0.012, 0.012, 0.16], [0, 0.145, 0.07]);  // carry handle
    ud.m = [0, 0.062, e.zEnd + 0.02]; ud.l = [0, 0.0, e.z1 + e.hl * 0.5]; ud.hold = 'rifle'; },
  heavyar(P, ud) { const e = rifleBase(P, { body: 0x3b3f2c, trim: 0x20231a, stock: 0x4a4d38, recvH: 0.1, recvW: 0.065, recvLen: 0.38, hg: 0.24, barrel: 0.16, magH: 0.17, mag: 'box', hgColor: 0x3b3f2c, stockLen: 0.26 });
    P.cyl(C.dark, 0.026, 0.1, [0, 0.062, e.zEnd - 0.02], 'z', { seg: 8 });
    ud.m = [0, 0.062, e.zEnd + 0.03]; ud.l = [0, 0.0, e.z1 + e.hl * 0.55]; ud.hold = 'rifle'; },
  scopear(P, ud) { const e = rifleBase(P, { body: 0x2a3a4a, hg: 0.2, barrel: 0.14, stockLen: 0.24 }); scopeOn(P, 0.22, 0.025, 0.04, 0.14);
    ud.m = [0, 0.062, e.zEnd + 0.02]; ud.l = [0, 0.0, e.z1 + e.hl * 0.5]; ud.hold = 'rifle'; },
  lmg(P, ud) { const e = rifleBase(P, { body: 0x30343a, hg: 0.3, barrel: 0.2, recvLen: 0.4, recvH: 0.11, recvW: 0.07, mag: 'box', magH: 0.15, stockLen: 0.24 });
    P.box(C.dark, [0.09, 0.1, 0.12], [0, -0.06, 0.09]);    // ammo pouch
    P.seg(C.steel, 0.012, [0.02, -0.01, e.z1 + e.hl], [0.07, -0.1, e.z1 + e.hl + 0.1]); P.seg(C.steel, 0.012, [-0.02, -0.01, e.z1 + e.hl], [-0.07, -0.1, e.z1 + e.hl + 0.1]);  // bipod
    P.cyl(C.steel, 0.025, 0.2, [0, 0.062, e.z1 + 0.14], 'z', { seg: 10 });
    P.box(C.dark, [0.02, 0.05, 0.1], [0, 0.145, 0.0]);
    ud.m = [0, 0.062, e.zEnd + 0.02]; ud.l = [0, 0.0, e.z1 + e.hl * 0.5]; ud.hold = 'rifle'; },
  smgrapid(P, ud) {
    P.box(C.gun, [0.05, 0.08, 0.26], [0, 0.045, 0.0]); P.box(C.dark, [0.036, 0.1, 0.04], [0, -0.045, -0.04], [0.3, 0, 0]);
    P.box(C.dark, [0.036, 0.16, 0.05], [0, -0.07, 0.08], [0, 0, 0]);                     // long stick mag
    P.box(C.poly, [0.04, 0.07, 0.1], [0, 0.04, -0.2]); P.cyl(C.dark, 0.015, 0.14, [0, 0.055, 0.2], 'z'); P.cyl(C.dark, 0.022, 0.06, [0, 0.055, 0.28], 'z', { seg: 8 });
    P.box(0, [0.03, 0.007, 0.15], [0, 0.088, 0.0], [0, 0, 0], 'acc'); P.box(C.dark, [0.012, 0.022, 0.02], [0, 0.098, -0.06]); P.box(C.dark, [0.01, 0.024, 0.012], [0, 0.092, 0.17]);
    ud.m = [0, 0.055, 0.32]; ud.l = [0, -0.01, 0.15]; ud.hold = 'rifle'; },
  smgcompact(P, ud) {
    P.box(0x3a3f4a, [0.052, 0.09, 0.22], [0, 0.045, 0.0]); P.box(C.dark, [0.034, 0.1, 0.04], [0, -0.045, -0.04], [0.3, 0, 0]);
    P.box(C.dark, [0.034, 0.11, 0.05], [0, -0.05, 0.07], [-0.2, 0, 0]);
    P.seg(C.steel, 0.012, [0, 0.045, -0.11], [0, 0.04, -0.3]); P.box(C.dark, [0.04, 0.07, 0.02], [0, 0.04, -0.31]);       // wire stock
    P.cyl(C.dark, 0.016, 0.1, [0, 0.055, 0.2], 'z'); P.box(C.dark, [0.04, 0.05, 0.1], [0, 0.03, 0.14]);
    P.box(0, [0.032, 0.007, 0.12], [0, 0.093, 0.0], [0, 0, 0], 'acc'); P.cyl(C.dark, 0.012, 0.02, [0, 0.105, 0.0], 'y');
    ud.m = [0, 0.055, 0.26]; ud.l = [0, -0.01, 0.13]; ud.hold = 'rifle'; },
  smgsupp(P, ud) {
    P.box(0x2a2f3a, [0.05, 0.085, 0.28], [0, 0.045, 0.0]); P.box(C.dark, [0.036, 0.1, 0.04], [0, -0.045, -0.04], [0.3, 0, 0]);
    P.box(C.dark, [0.036, 0.13, 0.05], [0, -0.06, 0.08], [-0.15, 0, 0]);
    P.box(C.poly, [0.045, 0.07, 0.18], [0, 0.04, -0.22]); P.cyl(C.dark, 0.026, 0.3, [0, 0.055, 0.3], 'z', { seg: 12 });       // suppressor
    P.cyl(C.poly, 0.028, 0.02, [0, 0.055, 0.15], 'z', { seg: 12 }); P.cyl(C.poly, 0.028, 0.02, [0, 0.055, 0.46], 'z', { seg: 12 });
    P.box(0, [0.03, 0.007, 0.16], [0, 0.09, 0.0], [0, 0, 0], 'acc'); P.cyl(C.dark, 0.014, 0.05, [0, 0.105, 0.0], 'z');
    ud.m = [0, 0.055, 0.5]; ud.l = [0, -0.01, 0.12]; ud.hold = 'rifle'; },
  pump(P, ud) { const z = shotBase(P, { barrel: 0.5 }); P.box(C.woodL, [0.06, 0.05, 0.14], [0, 0.026, 0.38]);   // pump grip
    ud.m = [0, 0.06, z + 0.02]; ud.l = [0, -0.01, 0.38]; ud.hold = 'rifle'; },
  tactical(P, ud) { const z = shotBase(P, { barrel: 0.4, stock: C.poly }); P.box(C.dark, [0.045, 0.1, 0.07], [0, -0.01, 0.1]);   // box mag
    P.box(C.poly, [0.06, 0.05, 0.14], [0, 0.026, 0.33]); P.box(0x2a2f3a, [0.06, 0.1, 0.28], [0, 0.04, 0.02]);
    ud.m = [0, 0.06, z + 0.02]; ud.l = [0, -0.01, 0.33]; ud.hold = 'rifle'; },
  heavysg(P, ud) { const z = shotBase(P, { barrel: 0.42, stock: 0x3b3f2c }); P.cyl(C.dark, 0.034, 0.42, [0, 0.07, 0.15 + 0.21], 'z', { seg: 10 }); P.cyl(C.dark, 0.042, 0.08, [0, 0.07, z - 0.04], 'z', { seg: 10 });
    P.box(0x3b3f2c, [0.07, 0.06, 0.16], [0, 0.015, 0.33]); P.box(C.dark, [0.08, 0.1, 0.3], [0, 0.04, 0.02]);
    ud.m = [0, 0.07, z + 0.02]; ud.l = [0, -0.01, 0.33]; ud.hold = 'rifle'; },
  dbl(P, ud) {
    P.box(C.steel, [0.06, 0.07, 0.16], [0, 0.04, 0.02]); P.box(C.dark, [0.036, 0.1, 0.045], [0, -0.04, -0.045], [0.3, 0, 0]);
    P.box(C.woodL, [0.05, 0.09, 0.3], [0, 0.03, -0.25], [0.06, 0, 0]); P.box(C.dark, [0.052, 0.1, 0.02], [0, 0.025, -0.41]);
    P.cyl(C.dark, 0.0185, 0.55, [0.021, 0.06, 0.36], 'z', { seg: 10 }); P.cyl(C.dark, 0.0185, 0.55, [-0.021, 0.06, 0.36], 'z', { seg: 10 });
    P.box(C.woodL, [0.07, 0.045, 0.14], [0, 0.03, 0.3]); P.box(0, [0.05, 0.007, 0.12], [0, 0.09, 0.02], [0, 0, 0], 'acc');
    ud.m = [0, 0.06, 0.64]; ud.l = [0, -0.005, 0.3]; ud.hold = 'rifle'; },
  pistol(P, ud) { const z = pistolBase(P); ud.m = [0, 0.05, z + 0.02]; ud.l = [0.015, -0.075, -0.005]; ud.hold = 'pistol'; },
  handcannon(P, ud) { const z = pistolBase(P, { slide: 0.28, w: 0.04, slideC: 0x5a5f6a }); P.cyl(C.dark, 0.016, 0.06, [0, 0.03, z - 0.02], 'z'); ud.m = [0, 0.05, z + 0.02]; ud.l = [0.015, -0.075, -0.005]; ud.hold = 'pistol'; },
  revolver(P, ud) {
    P.box(C.steel, [0.036, 0.05, 0.12], [0, 0.05, 0.0]); P.cyl(C.steel, 0.034, 0.075, [0, 0.045, 0.07], 'z', { seg: 12 });   // frame + cylinder
    P.cyl(C.dark, 0.014, 0.2, [0, 0.062, 0.2], 'z'); P.box(C.woodL, [0.034, 0.105, 0.05], [0, -0.04, -0.03], [0.35, 0, 0]);
    P.box(C.dark, [0.012, 0.03, 0.03], [0, 0.015, 0.03]); P.box(0, [0.03, 0.007, 0.1], [0, 0.082, 0.02], [0, 0, 0], 'acc'); P.box(C.dark, [0.01, 0.02, 0.012], [0, 0.083, 0.3]);
    ud.m = [0, 0.062, 0.31]; ud.l = [0.015, -0.075, -0.005]; ud.hold = 'pistol'; },
  dualpistol(P, ud) { const z = pistolBase(P, { slide: 0.19 });
    const o = 0.34; P.box(C.gun, [0.032, 0.042, 0.19], [o, 0.05, 0.045]); P.box(C.dark, [0.029, 0.028, 0.17], [o, 0.015, 0.05]); P.box(C.dark, [0.034, 0.105, 0.045], [o, -0.045, -0.015], [0.2, 0, 0]);
    P.box(0, [0.022, 0.007, 0.1], [o, 0.075, 0.04], [0, 0, 0], 'acc'); P.box(C.dark, [0.01, 0.03, 0.04], [o, -0.01, 0.03]);
    ud.m = [0, 0.05, z + 0.02]; ud.m2 = [o, 0.05, z + 0.02]; ud.l = [o, 0.0, 0.0]; ud.hold = 'dual'; },
  bolt(P, ud) { const e = rifleBase(P, { body: 0x3a3f46, stock: C.tan, stockLen: 0.3, hg: 0.3, barrel: 0.4, mag: 'none', hgColor: 0x3a3f46, brake: true, recvLen: 0.34 });
    scopeOn(P, 0.3, 0.03, 0.06, 0.145); P.cyl(C.steel, 0.011, 0.07, [0.045, 0.06, -0.06], 'x'); P.sph(C.steel, 0.02, [0.085, 0.06, -0.06]);   // bolt handle
    P.seg(C.steel, 0.01, [0.015, 0.03, e.zEnd - 0.2], [0.05, -0.08, e.zEnd - 0.12]); P.seg(C.steel, 0.01, [-0.015, 0.03, e.zEnd - 0.2], [-0.05, -0.08, e.zEnd - 0.12]);
    ud.m = [0, 0.062, e.zEnd + 0.04]; ud.l = [0, 0.0, e.z1 + e.hl * 0.45]; ud.hold = 'rifle'; },
  semisniper(P, ud) { const e = rifleBase(P, { body: 0x2c3a2a, stock: 0x3a4a36, trim: 0x1d2419, stockLen: 0.28, hg: 0.26, barrel: 0.32, mag: 'box', magH: 0.12, hgColor: 0x2c3a2a });
    scopeOn(P, 0.26, 0.03, 0.05, 0.145); ud.m = [0, 0.062, e.zEnd + 0.04]; ud.l = [0, 0.0, e.z1 + e.hl * 0.5]; ud.hold = 'rifle'; },
  huntrifle(P, ud) { const e = rifleBase(P, { body: 0x4a4f58, stock: C.woodL, hgColor: C.woodL, stockLen: 0.32, hg: 0.26, barrel: 0.3, mag: 'none', brake: false, recvLen: 0.3, recvH: 0.075, recvW: 0.05, trim: 0x20242b });
    P.cyl(C.steel, 0.011, 0.07, [0.04, 0.06, -0.06], 'x'); P.sph(C.steel, 0.018, [0.078, 0.06, -0.06]);
    ud.m = [0, 0.062, e.zEnd + 0.02]; ud.l = [0, 0.0, e.z1 + e.hl * 0.5]; ud.hold = 'rifle'; },
  rocket(P, ud) {
    P.cyl(0x4a5a3a, 0.075, 0.95, [0, 0.12, 0.1], 'z', { seg: 14 }); P.cyl(C.dark, 0.085, 0.07, [0, 0.12, -0.34], 'z', { seg: 14 }); P.cyl(C.dark, 0.082, 0.05, [0, 0.12, 0.57], 'z', { seg: 14 });
    P.cone(C.red, 0.062, 0.2, [0, 0.12, 0.7], 'z', { seg: 12 }); P.cyl(C.steel, 0.062, 0.1, [0, 0.12, 0.62], 'z', { seg: 12 });
    P.box(C.dark, [0.04, 0.1, 0.045], [0, -0.04, -0.04], [0.3, 0, 0]); P.box(C.dark, [0.04, 0.08, 0.04], [0, 0.04, 0.3]); P.box(C.dark, [0.04, 0.07, 0.07], [0, 0.04, 0.0]);
    P.box(0, [0.03, 0.01, 0.4], [0, 0.2, 0.05], [0, 0, 0], 'acc'); P.box(C.dark, [0.02, 0.06, 0.02], [0, 0.21, -0.15]);
    ud.m = [0, 0.12, 0.88]; ud.l = [0, 0.03, 0.3]; ud.hold = 'heavy'; },
  gl(P, ud) {
    P.box(C.gun, [0.06, 0.09, 0.3], [0, 0.05, 0.0]); P.cyl(0x55604a, 0.08, 0.13, [0, 0.035, 0.12], 'z', { seg: 12 });       // drum
    P.box(C.dark, [0.04, 0.1, 0.045], [0, -0.045, -0.04], [0.3, 0, 0]); P.cyl(C.dark, 0.032, 0.3, [0, 0.06, 0.34], 'z', { seg: 10 }); P.cyl(C.dark, 0.042, 0.04, [0, 0.06, 0.5], 'z', { seg: 10 });
    P.seg(C.steel, 0.012, [0, 0.05, -0.12], [0, 0.04, -0.34]); P.box(C.dark, [0.04, 0.09, 0.03], [0, 0.04, -0.35]); P.box(C.dark, [0.036, 0.08, 0.04], [0, 0.0, 0.3]);
    P.box(0, [0.034, 0.008, 0.18], [0, 0.098, 0.0], [0, 0, 0], 'acc'); P.box(C.dark, [0.012, 0.03, 0.02], [0, 0.12, -0.05]);
    ud.m = [0, 0.06, 0.53]; ud.l = [0, -0.01, 0.3]; ud.hold = 'rifle'; },
  minigun(P, ud) {
    P.box(C.gun, [0.14, 0.15, 0.22], [0, 0.04, -0.02]); P.box(C.dark, [0.04, 0.1, 0.045], [0, -0.09, -0.05], [0.3, 0, 0]); P.box(C.dark, [0.03, 0.04, 0.12], [0, 0.14, 0.0]); P.box(C.dark, [0.04, 0.12, 0.03], [0, 0.18, 0.0]);
    P.cyl(C.steel, 0.07, 0.04, [0, 0.04, 0.11], 'z', { seg: 14 }); P.cyl(C.steel, 0.07, 0.03, [0, 0.04, 0.5], 'z', { seg: 14 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.cyl(C.dark, 0.014, 0.6, [Math.cos(a) * 0.045, 0.04 + Math.sin(a) * 0.045, 0.32], 'z', { seg: 8, bucket: 'spin' }); }
    P.cyl(C.poly, 0.06, 0.06, [0, 0.04, 0.3], 'z', { seg: 12, bucket: 'spin' });
    P.box(0, [0.1, 0.01, 0.2], [0, 0.12, -0.05], [0, 0, 0], 'acc'); P.box(C.dark, [0.12, 0.12, 0.12], [0.11, -0.04, -0.02]);
    ud.m = [0, 0.04, 0.66]; ud.l = [0, -0.04, 0.2]; ud.hold = 'heavy'; ud.spin = true; },
  crossbow(P, ud) {
    P.box(C.woodL, [0.05, 0.07, 0.5], [0, 0.03, -0.05]); P.box(C.dark, [0.04, 0.1, 0.045], [0, -0.04, -0.04], [0.3, 0, 0]); P.box(C.dark, [0.02, 0.025, 0.4], [0, 0.075, 0.1]);
    P.seg(C.dark, 0.022, [0.0, 0.07, 0.38], [0.24, 0.07, 0.3]); P.seg(C.dark, 0.022, [0.0, 0.07, 0.38], [-0.24, 0.07, 0.3]); P.seg(C.steel, 0.006, [0.24, 0.07, 0.3], [-0.24, 0.07, 0.3]);
    P.seg(C.bone, 0.008, [0, 0.092, 0.0], [0, 0.092, 0.4], { bucket: 'arrow' }); P.cone(C.steel, 0.012, 0.05, [0, 0.092, 0.43], 'z', { bucket: 'arrow' }); P.box(0, [0.01, 0.01, 0.04], [0, 0.092, 0.02], [0, 0, 0], 'acc');
    P.box(0, [0.03, 0.007, 0.18], [0, 0.065, -0.15], [0, 0, 0], 'acc'); P.cyl(C.dark, 0.016, 0.1, [0, 0.12, 0.06], 'z');
    ud.m = [0, 0.092, 0.46]; ud.l = [0, 0.0, 0.2]; ud.hold = 'rifle'; },
  bow(P, ud) {
    // grip at origin, limbs curve forward (+z), string on the archer's side. vertical plane (x = 0)
    const pts = []; for (let i = -6; i <= 6; i++) { const y = i * 0.075; pts.push([0, y, 0.11 * (1 - (y / 0.45) ** 2) + 0.0]); }
    for (let i = 0; i < pts.length - 1; i++) P.seg(i % 2 ? C.woodL : C.wood, 0.02, pts[i], pts[i + 1]);
    P.box(C.dark, [0.03, 0.12, 0.04], [0, 0, 0.1]); P.seg(0, 0.012, pts[1], pts[2], { bucket: 'acc' }); P.seg(0, 0.012, pts[10], pts[11], { bucket: 'acc' });
    P.seg(0xe8e8e8, 0.006, [0, 0.45, 0], [0, -0.45, 0], { bucket: 'string' });
    P.seg(C.bone, 0.009, [0, 0, -0.02], [0, 0, 0.55], { bucket: 'arrow' }); P.cone(C.steel, 0.016, 0.07, [0, 0, 0.59], 'z', { seg: 4, bucket: 'arrow' }); P.box(C.red, [0.07, 0.005, 0.07], [0, 0, 0.0], [0, 0, 0], 'arrow'); P.box(C.red, [0.005, 0.07, 0.07], [0, 0, 0.0], [0, 0, 0], 'arrow');
    ud.m = [0, 0, 0.55]; ud.l = [0, 0, 0.1]; ud.r = [0, 0, -0.06]; ud.hold = 'bow'; },
  // ----- melee -----
  pickaxe(P, ud) {
    P.cyl(C.wood, 0.02, 0.8, [0, 0, 0.28], 'z', { seg: 8 }); P.cyl(C.dark, 0.024, 0.14, [0, 0, -0.05], 'z', { seg: 8 });
    P.box(C.steel, [0.05, 0.05, 0.06], [0, 0, 0.66]); P.cone(C.steel, 0.026, 0.25, [0.15, 0, 0.66], 'x', { seg: 6 }); P.cone(C.steel, 0.026, 0.25, [-0.15, 0, 0.66], '-x', { seg: 6 });
    P.box(0, [0.07, 0.012, 0.02], [0, 0.03, 0.66], [0, 0, 0], 'acc');
    ud.m = [0, 0, 0.7]; ud.l = null; ud.hold = 'melee'; ud.tip = [0.25, 0, 0.66]; },
  knife(P, ud) {
    P.box(C.poly, [0.03, 0.03, 0.11], [0, 0, 0.0]); P.box(0, [0.034, 0.012, 0.09], [0, 0.0, 0.0], [0, 0, 0], 'acc'); P.box(C.dark, [0.012, 0.05, 0.015], [0, 0, 0.065]);
    P.box(C.steel, [0.008, 0.032, 0.2], [0, 0.0, 0.17]); P.cone(C.steel, 0.02, 0.07, [0, 0, 0.31], 'z', { seg: 4, sx: 0.4, sz: 1.0 });
    ud.m = [0, 0, 0.34]; ud.l = null; ud.hold = 'melee'; },
  tknife(P, ud) {
    P.box(C.dark, [0.022, 0.022, 0.08], [0, 0, 0.0]); P.box(0, [0.026, 0.01, 0.05], [0, 0, 0.0], [0, 0, 0], 'acc');
    P.box(C.steel, [0.007, 0.028, 0.14], [0, 0, 0.1]); P.cone(C.steel, 0.017, 0.06, [0, 0, 0.2], 'z', { seg: 4, sx: 0.4, sz: 1.0 });
    ud.m = [0, 0, 0.23]; ud.l = null; ud.hold = 'melee'; },
  blade(P, ud) {
    P.cyl(C.dark, 0.016, 0.22, [0, 0, 0.0], 'z', { seg: 8 }); P.box(0, [0.03, 0.026, 0.1], [0, 0, 0.0], [0, 0, 0], 'acc'); P.cyl(C.steel, 0.045, 0.012, [0, 0, 0.11], 'z', { seg: 14 });
    P.box(C.glass, [0.008, 0.042, 0.4], [0, 0, 0.33], [0, 0, 0], 'glow'); P.box(C.glass, [0.008, 0.036, 0.3], [0, -0.012, 0.65], [-0.04, 0, 0], 'glow'); P.cone(C.glass, 0.02, 0.07, [0, -0.024, 0.83], 'z', { seg: 4, sx: 0.3, sz: 1.0, bucket: 'glow' });
    ud.m = [0, 0, 0.8]; ud.l = null; ud.hold = 'melee'; },
  machete(P, ud) {
    P.box(C.poly, [0.03, 0.034, 0.13], [0, 0, 0.0]); P.box(0, [0.034, 0.012, 0.1], [0, 0, 0.0], [0, 0, 0], 'acc'); P.box(C.dark, [0.012, 0.05, 0.015], [0, 0, 0.075]);
    P.box(C.steel, [0.008, 0.05, 0.3], [0, 0.0, 0.24]); P.box(C.steel, [0.008, 0.07, 0.14], [0, 0.01, 0.43]); P.cone(C.steel, 0.035, 0.07, [0, 0.01, 0.53], 'z', { seg: 4, sx: 0.25, sz: 1.0 });
    ud.m = [0, 0, 0.55]; ud.l = null; ud.hold = 'melee'; },
  // ----- throwables -----
  frag(P, ud) { P.sph(C.olive, 0.05, [0, 0, 0], [1, 1.1, 1]); P.cyl(C.dark, 0.022, 0.03, [0, 0.062, 0], 'y'); P.box(C.steel, [0.01, 0.01, 0.07], [0, 0.082, 0.02]); P.torus(C.steel, 0.016, 0.003, [0.02, 0.088, 0.0], [0, 1.57, 0]); P.box(0, [0.1, 0.008, 0.008], [0, 0.0, 0.046], [0, 0, 0], 'acc'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'throw'; },
  impulse(P, ud) { P.sph(0x2a3f66, 0.052, [0, 0, 0]); P.torus(C.glass, 0.052, 0.006, [0, 0, 0], [0, 0, 0], { bucket: 'glow' }); P.torus(C.glass, 0.052, 0.006, [0, 0, 0], [Math.PI / 2, 0, 0], { bucket: 'glow' }); P.cyl(C.dark, 0.02, 0.03, [0, 0.062, 0], 'y'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'throw'; },
  smoke(P, ud) { P.cyl(0x7a8089, 0.04, 0.13, [0, 0, 0], 'y'); P.cyl(C.white, 0.036, 0.03, [0, 0.08, 0], 'y'); P.box(0, [0.082, 0.02, 0.082], [0, -0.01, 0], [0, 0, 0], 'acc'); P.box(C.steel, [0.01, 0.01, 0.07], [0, 0.1, 0.02]); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'throw'; },
  // ----- consumables -----
  bandage(P, ud) { P.cyl(C.white, 0.05, 0.07, [0, 0, 0], 'y', { seg: 14 }); P.cyl(C.bone, 0.052, 0.02, [0, 0.0, 0], 'y', { seg: 14 }); P.box(C.red, [0.05, 0.075, 0.012], [0, 0, 0.05]); P.box(C.red, [0.012, 0.075, 0.05], [0, 0, 0.05]); P.box(0, [0.1, 0.01, 0.1], [0, 0.036, 0], [0, 0, 0], 'acc'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'item'; },
  medkit(P, ud) { P.box(C.white, [0.2, 0.15, 0.07], [0, 0, 0]); P.box(C.red, [0.07, 0.02, 0.075], [0, 0, 0]); P.box(C.red, [0.02, 0.07, 0.075], [0, 0, 0]); P.box(C.dark, [0.09, 0.02, 0.03], [0, 0.085, 0]); P.box(0, [0.2, 0.01, 0.075], [0, -0.07, 0], [0, 0, 0], 'acc'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'item'; },
  smallshield(P, ud) { P.cyl(0x2f6fc8, 0.034, 0.1, [0, 0, 0], 'y', { seg: 12 }); P.cyl(C.glass, 0.03, 0.08, [0, 0, 0], 'y', { seg: 12, bucket: 'glow' }); P.cyl(C.dark, 0.014, 0.03, [0, 0.065, 0], 'y'); P.box(0, [0.07, 0.008, 0.07], [0, -0.05, 0], [0, 0, 0], 'acc'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'item'; },
  potion(P, ud) { P.sph(0x2f6fc8, 0.07, [0, -0.02, 0], [1, 1, 1]); P.sph(C.glass, 0.062, [0, -0.02, 0], [1, 1, 1], { bucket: 'glow' }); P.cyl(0x2f6fc8, 0.026, 0.07, [0, 0.07, 0], 'y'); P.cyl(C.wood, 0.03, 0.03, [0, 0.115, 0], 'y'); P.box(0, [0.1, 0.008, 0.1], [0, -0.09, 0], [0, 0, 0], 'acc'); ud.m = [0, 0, 0]; ud.l = null; ud.hold = 'item'; },
};

const SCALE = { ar: 1.0, burstar: 1.0, heavyar: 1.0, scopear: 1.0, lmg: 0.95, smgrapid: 1.1, smgcompact: 1.12, smgsupp: 1.0, pump: 1.0, tactical: 1.02, heavysg: 0.97, dbl: 0.97, bolt: 0.88, semisniper: 0.92, huntrifle: 0.95, rocket: 0.85, gl: 1.0, minigun: 0.95, crossbow: 1.05, pistol: 1.25, handcannon: 1.25, revolver: 1.25, dualpistol: 1.2, knife: 1.2, tknife: 1.2, machete: 1.1, blade: 1.0 };
const protoCache = new Map();
/** A fresh model for an item id + rarity (geometry/material shared). */
export function weaponModel(id, rarity = 0) {
  const key = id + '|' + rarity;
  let proto = protoCache.get(key);
  if (!proto) {
    const P = new Parts(), ud = { r: [0, 0, 0], l: null, m: [0, 0, 0.3], hold: 'rifle' };
    const fn = M[ITEMS[id] ? ITEMS[id].model : id] || M[id]; if (!fn) throw new Error('no model for ' + id);
    fn(P, ud);
    ud.s = SCALE[ITEMS[id] ? ITEMS[id].model : id] ?? 1;
    const g = P.build(RARITY[rarity].color); g.userData = ud;
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    protoCache.set(key, g); proto = g;
  }
  return proto.clone(true);
}
export const MODEL_KEYS = Object.keys(M);
