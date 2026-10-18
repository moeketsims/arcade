// Shared base for anything that can be shot: stances, body hulls, hit shapes (head x2.0, torso x1.0, limbs x0.8).
import { makeBody, rayCapsule, raySphere } from './collision.js';

export const STANCE = { STAND: 0, CROUCH: 1, PRONE: 2, SLIDE: 3, DIVE: 4 };
export const HULL = [1.8, 1.25, 0.6, 1.0, 0.7];            // body heights per stance
export const EYE = [1.65, 1.15, 0.5, 0.95, 0.5];            // eye heights per stance
export const ZONE_MUL = { head: 2.0, torso: 1.0, limb: 0.8 };
export const HEAD_R = 0.16;

let NEXT_ID = 1;

export function makeShapes() {
  const mk = zone => ({ zone, type: 'capsule', ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, r: 0.1 });
  return [mk('head'), mk('torso'), mk('limb'), mk('limb'), mk('limb')];
}

/** Fill the 5 hit shapes for an actor standing at (x,y,z) facing heading h. */
export function fillShapes(sh, x, y, z, h, stance) {
  const sx = Math.sin(h), cz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);   // forward (sx, cz), right (rx, rz)
  const set = (s, ax, ay, az, bx, by, bz, r) => { s.ax = ax; s.ay = ay; s.az = az; s.bx = bx; s.by = by; s.bz = bz; s.r = r; };
  const [head, torso, legs, armL, armR] = sh;
  if (stance === STANCE.PRONE || stance === STANCE.DIVE) {
    const hy = stance === STANCE.DIVE ? y + 0.55 : y + 0.22;
    set(head, x + sx * 0.78, hy + 0.04, z + cz * 0.78, x + sx * 0.78, hy + 0.04, z + cz * 0.78, 0.15);
    set(torso, x + sx * 0.2, hy, z + cz * 0.2, x + sx * 0.55, hy, z + cz * 0.55, 0.2);
    set(legs, x - sx * 0.75, hy - 0.04, z - cz * 0.75, x + sx * 0.05, hy - 0.04, z + cz * 0.05, 0.15);
    set(armL, x + sx * 0.5 + rx * 0.24, hy, z + cz * 0.5 + rz * 0.24, x + sx * 0.85 + rx * 0.2, hy, z + cz * 0.85 + rz * 0.2, 0.08);
    set(armR, x + sx * 0.5 - rx * 0.24, hy, z + cz * 0.5 - rz * 0.24, x + sx * 0.85 - rx * 0.2, hy, z + cz * 0.85 - rz * 0.2, 0.08);
    return;
  }
  const k = stance === STANCE.CROUCH ? 0.66 : stance === STANCE.SLIDE ? 0.5 : 1;
  const lean = stance === STANCE.SLIDE ? -0.25 : 0;           // sliders lean back
  const hy = y + 1.7 * k + (stance === STANCE.SLIDE ? 0.05 : 0);
  set(head, x + sx * lean * 0.6, hy, z + cz * lean * 0.6, x + sx * lean * 0.6, hy, z + cz * lean * 0.6, HEAD_R);
  set(torso, x + sx * lean * 0.35, y + 1.02 * k, z + cz * lean * 0.35, x + sx * lean * 0.5, y + 1.4 * k, z + cz * lean * 0.5, 0.22);
  set(legs, x, y + 0.12, z, x, y + 0.95 * k, z, 0.17);
  set(armL, x + rx * 0.27, y + 1.12 * k, z + rz * 0.27, x + rx * 0.25 + sx * 0.12, y + 1.45 * k, z + rz * 0.25 + cz * 0.12, 0.08);
  set(armR, x - rx * 0.27, y + 1.12 * k, z - rz * 0.27, x - rx * 0.25 + sx * 0.12, y + 1.45 * k, z - rz * 0.25 + cz * 0.12, 0.08);
}

/** Nearest hit of a ray on a shape list. Returns { t, zone, shape } or null (result object is reused). */
const HIT = { t: 0, zone: '', shape: null };
export function rayShapes(ox, oy, oz, dx, dy, dz, shapes, maxT) {
  let best = maxT, found = null;
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    const t = s.ax === s.bx && s.ay === s.by && s.az === s.bz ? raySphere(ox, oy, oz, dx, dy, dz, s.ax, s.ay, s.az, s.r) : rayCapsule(ox, oy, oz, dx, dy, dz, s.ax, s.ay, s.az, s.bx, s.by, s.bz, s.r);
    if (t >= 0 && t < best) { best = t; found = s; }
  }
  if (!found) return null;
  HIT.t = best; HIT.zone = found.zone; HIT.shape = found; return HIT;
}

export class Actor {
  constructor(match, o = {}) {
    this.match = match; this.id = NEXT_ID++; this.name = o.name || 'Robot'; this.team = o.team ?? 0;
    this.isPlayer = false; this.isActor = true;
    this.maxHp = 100; this.hp = 100; this.alive = true; this.invulnT = 0;
    this.body = makeBody(0.3, 1.8); this.heading = 0; this.pitch = 0; this.stance = STANCE.STAND;
    this.stats = { kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, headshots: 0, bestStreak: 0 };
    this.shapes = makeShapes();
    this.dmgBy = new Map(); this.lastAttacker = null; this.lastHitT = -99;
    this.firedT = -99; this.suppressedShot = false;
    this.color = o.color ?? 0x44aaff;
  }
  get x() { return this.body.x; } get y() { return this.body.y; } get z() { return this.body.z; }
  eyeY() { return this.body.y + EYE[this.stance]; }
  setStance(s) { this.stance = s; this.body.h = HULL[s]; }
  updateShapes() { fillShapes(this.shapes, this.body.x, this.body.y, this.body.z, this.heading, this.stance); }
  /** Centre-mass / head aim points for AI. */
  aimPoint(out, zone = 'torso') {
    const s = this.shapes[zone === 'head' ? 0 : 1];
    out.x = (s.ax + s.bx) / 2; out.y = (s.ay + s.by) / 2; out.z = (s.az + s.bz) / 2; return out;
  }
  recordDamage(amount, attacker, t) {
    if (!attacker || attacker === this) return;
    const e = this.dmgBy.get(attacker.id) || { dmg: 0, t: 0, who: attacker };
    e.dmg += amount; e.t = t; e.who = attacker; this.dmgBy.set(attacker.id, e);
    this.lastAttacker = attacker; this.lastHitT = t;
  }
  resetLife() { this.hp = this.maxHp; this.alive = true; this.dmgBy.clear(); this.lastAttacker = null; this.invulnT = 0; }
}
