// Character visual rig: a Humanoid + weapon mount + analytic two-bone arm IK + pose logic for every state.
import * as THREE from 'three';
import { Humanoid, Poses, track, layer } from '../common/humanoid.js';
import { weaponModel } from './models.js';
import { ITEMS } from './items.js';
import { Parts } from './parts.js';

const L1 = 0.29, L2 = 0.29;           // upper arm / forearm (+ hand centre)
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _pole = new THREE.Vector3(), _E = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _M = new THREE.Matrix4();

/** Place the hand of `side` ('l'|'r') at `target` (chest space). Returns the reach fraction used (1 = fully extended). */
export function solveArm(h, side, target) {
  const sh = h.j[side + 'Shoulder'], el = h.j[side + 'Elbow'];
  _S.copy(sh.position); _d.subVectors(target, _S);
  let dist = _d.length(); const maxR = L1 + L2 - 0.004;
  if (dist < 0.12) { dist = 0.12; _d.setLength(0.12); }
  const reach = Math.min(1, dist / maxR); if (dist > maxR) { dist = maxR; _d.setLength(maxR); }
  const dh = _T.copy(_d).divideScalar(dist);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), A = Math.acos(cosA), sinA = Math.sin(A);
  const interior = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
  const out = side === 'l' ? 1 : -1;
  _pole.set(0.55 * out, -1, -0.25); _pole.addScaledVector(dh, -_pole.dot(dh));
  if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0); _pole.normalize();
  _u.copy(dh).multiplyScalar(cosA).addScaledVector(_pole, sinA).normalize();
  _E.copy(_S).addScaledVector(_u, L1);
  _f.copy(_S).add(_d).sub(_E).normalize();
  _Z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_Z.lengthSq() < 1e-8) _Z.set(0, 0, 1).addScaledVector(_u, -_u.z);
  _Z.normalize(); _Y.copy(_u).negate(); _X.crossVectors(_Y, _Z).normalize();
  _M.makeBasis(_X, _Y, _Z); sh.quaternion.setFromRotationMatrix(_M);
  el.rotation.set(-(Math.PI - interior), 0, 0);
  return reach;
}

// weapon mount placement in chest space per hold family: [x,y,z] right-grip position
const HOLD = {
  rifle: { pos: [-0.17, 0.1, 0.17], low: [-0.16, -0.02, 0.15], lowRot: 0.55 },
  heavy: { pos: [-0.16, 0.06, 0.17], low: [-0.15, -0.06, 0.15], lowRot: 0.5 },
  pistol: { pos: [-0.07, 0.17, 0.30], low: [-0.12, 0.0, 0.2], lowRot: 0.7 },
  dual: { pos: [-0.17, 0.15, 0.30], low: [-0.17, 0.0, 0.2], lowRot: 0.7 },
  bow: { pos: [0.03, 0.2, 0.40], low: [0.03, 0.1, 0.3], lowRot: 0.3 },
};
const lerp = THREE.MathUtils.lerp;

export class CharacterRig {
  constructor(opts = {}) {
    this.h = new Humanoid({ shadows: opts.shadows ?? true, ...opts });
    this.root = new THREE.Group(); this.root.add(this.h.root);       // root = world position + yaw at the feet
    this.wNode = new THREE.Group(); this.h.j.chest.add(this.wNode);  // ranged weapon mount (chest space)
    this.model = null; this.def = null; this.rarity = 0; this.hold = null;
    this.zAdj = 0; this.sc = 1; this.phase = 0; this.t = Math.random() * 10; this.kick = 0; this.swingDir = 1; this.mode = 'hand';
    this.glider = null; this.aimBlend = 0; this.lowBlend = 0; this.drawBlend = 0;
    this.pinned = new THREE.Vector3();
  }

  setWeapon(id, rarity = 0) {
    if (this.model) { this.model.parent?.remove(this.model); this.model = null; }
    this.def = id ? ITEMS[id] : null; this.rarity = rarity; this.hold = null; this.spinNode = null;
    if (!id) return;
    const m = weaponModel(id, rarity), ud = m.userData; this.model = m; this.hold = ud.hold; this.ud = ud; this.sc = ud.s ?? 1; m.scale.setScalar(this.sc);
    if (ud.hold === 'rifle' || ud.hold === 'heavy' || ud.hold === 'pistol' || ud.hold === 'dual' || ud.hold === 'bow') {
      this.mode = 'ik'; this.wNode.add(m);
      this.arrow = m.getObjectByName('arrow') || null; if (this.arrow) this.arrow.visible = false;
      this.spinNode = m.getObjectByName('spin') || null;
    } else {
      this.mode = 'hand'; this.h.j.rHand.add(m);
      m.position.set(0, -0.045, 0.0); m.rotation.set(Math.PI / 2, 0, 0);
      if (ud.hold === 'throw' || ud.hold === 'item') { m.rotation.set(0, 0, 0); m.position.set(0, -0.06, 0.02); }
      if (id === 'pickaxe') { m.rotation.set(Math.PI / 2, 0, Math.PI / 2); }
    }
    m.traverse(o => { if (o.isMesh) o.castShadow = false; });
    // pull the weapon back toward the body until the left hand can reach the foregrip
    this.zAdj = 0;
    if (this.mode === 'ik' && this.ud.l) {
      const hk = HOLD[this.hold] || HOLD.rifle, S = this.h.j.lShoulder.position, sc = this.sc, ud = this.ud;
      const vx = hk.pos[0] + ud.l[0] * sc - S.x, vy = hk.pos[1] + ud.l[1] * sc - S.y, vz = hk.pos[2] + ud.l[2] * sc - S.z;
      const dz = Math.sqrt(Math.max(0, 0.54 * 0.54 - vx * vx - vy * vy)) - vz;
      this.zAdj = Math.max(-0.2, Math.min(0, dz));
    }
  }
  setVisible(v) { this.root.visible = v; }

  _arms(aim, low, drawT) {
    const j = this.h.j, ud = this.ud, hk = HOLD[this.hold] || HOLD.rifle, n = this.wNode;
    // aimed position vs low-ready
    const px = lerp(hk.low[0], hk.pos[0], aim), py = lerp(hk.low[1], hk.pos[1], aim), pz = lerp(hk.low[2], hk.pos[2], aim);
    const ads = this.adsBlend || 0;
    n.position.set(px + 0.05 * ads, py + 0.09 * ads, pz + this.zAdj - this.kick * 0.045);
    n.rotation.set(lerp(hk.lowRot, 0, aim) - this.kick * 0.09 - low * 0.1, 0, 0);
    if (this.reloadT > 0 && this.reloadT < 1) { const k = Math.sin(this.reloadT * Math.PI); n.position.y -= 0.1 * k; n.position.x += 0.06 * k; n.rotation.z = 0.5 * k; n.rotation.x += 0.4 * k; } else n.rotation.z = 0;
    n.updateMatrix();
    const sc = this.sc, rt = new THREE.Vector3(ud.r[0] * sc, ud.r[1] * sc, ud.r[2] * sc);
    if (this.hold === 'bow') rt.z -= 0.3 * drawT;
    rt.applyMatrix4(n.matrix);
    this.reachR = solveArm(this.h, 'r', rt);
    if (ud.l) { const l = new THREE.Vector3(ud.l[0] * sc, ud.l[1] * sc, ud.l[2] * sc).applyMatrix4(n.matrix); this.reachL = solveArm(this.h, 'l', l); }
    else { j.lShoulder.rotation.set(0.1, 0, 0.18); j.lElbow.rotation.set(-0.5, 0, 0); }
    if (this.arrow) this.arrow.visible = drawT > 0.02 || this.def?.id === 'crossbow';
    if (this.hold === 'bow' && this.arrow) this.arrow.position.z = -0.3 * drawT;
  }

  /**
   * s: { speed, fwd (-1..1 movement along facing), side, crouch, sprint, air, vy, aim 0..1, pitch, swingT (-1 none), throwT, useT, reloadT,
   *      emote (name|null), emoteT, mode: 'ground'|'free'|'glide'|'build', draw 0..1, spin 0..1, dt, moving }
   */
  update(s, dt) {
    const h = this.h, j = h.j; this.t += dt; this.kick = Math.max(0, this.kick - dt * 7);
    this.reloadT = s.reloadT ?? -1; this.adsBlend = (this.adsBlend || 0) + ((s.ads || 0) - (this.adsBlend || 0)) * Math.min(1, dt * 12);
    const sp = s.speed || 0;
    let pose;
    const run = Math.min(1.15, sp / 7.2);
    if (s.mode === 'free') {
      const w = Math.sin(this.t * 14) * 0.08;
      pose = { body: [1.3 + (s.dive ?? 0) * 0.15, 0, 0], neck: [-0.85, 0, 0], spine: [-0.15, 0, 0], lShoulder: [-0.5 + w, 0, 1.25], rShoulder: [-0.5 - w, 0, -1.25], lElbow: [-0.45, 0, 0], rElbow: [-0.45, 0, 0], lHip: [0.2, 0, 0.35], rHip: [0.2, 0, -0.35], lKnee: [0.45 + w, 0, 0], rKnee: [0.45 - w, 0, 0], bodyPos: [0, -0.1, 0] };
      this.aimBlend = 0;
    } else if (s.mode === 'glide') {
      const sway = Math.sin(this.t * 2.3) * 0.04;
      pose = { spine: [-0.08, 0, sway], lShoulder: [-2.75, 0, 0.35], rShoulder: [-2.75, 0, -0.35], lElbow: [-0.35, 0, 0], rElbow: [-0.35, 0, 0], lHip: [0.12 + sway, 0, 0.06], rHip: [0.04 - sway, 0, -0.06], lKnee: [0.55, 0, 0], rKnee: [0.35, 0, 0], neck: [-0.1, 0, 0], bodyPos: [0, 0, 0] };
    } else {
      // ground locomotion
      if (!s.air) this.phase += (s.fwd < -0.1 ? -1 : 1) * sp * dt * 1.45;
      const amount = s.crouch ? run * 0.55 : run;
      pose = sp < 0.15 && !s.air ? Poses.idle(this.t) : Poses.run(this.phase, amount);
      if (s.air) {
        const up = (s.vy ?? 0) > 0;
        pose = { ...pose, lHip: [up ? -0.9 : -0.35, 0, 0.12], rHip: [up ? 0.15 : -0.1, 0, -0.12], lKnee: [up ? 1.3 : 0.5, 0, 0], rKnee: [up ? 0.5 : 0.4, 0, 0], lAnkle: [0.3, 0, 0], rAnkle: [0.3, 0, 0], spine: [0.08, 0, 0], bodyPos: [0, 0, 0] };
      }
      if (s.crouch) {
        const c = Poses.crouch(); pose = { ...pose, lHip: [c.lHip[0] + (pose.lHip?.[0] || 0) * 0.35, 0, 0.15], rHip: [c.rHip[0] + (pose.rHip?.[0] || 0) * 0.35, 0, -0.15], lKnee: c.lKnee, rKnee: c.rKnee, lAnkle: c.lAnkle, rAnkle: c.rAnkle, spine: [0.3, 0, 0], bodyPos: [0, -0.42, 0] };
      }
      if (s.sprint && !s.crouch) pose = { ...pose, spine: [0.22, 0, 0] };
      // upper body
      const pitch = s.pitch || 0, aim = s.aim || 0;
      this.aimBlend = aim;
      const tilt = -pitch * 0.75;
      if (this.mode === 'ik' && s.mode !== 'build' && !s.emote) {
        pose = { ...pose, chest: [tilt, (s.aimYaw || 0) * 0.9, 0], neck: [-pitch * 0.25 - 0.05, -(s.aimYaw || 0) * 0.4, 0], head: [-pitch * 0.1, 0, 0] };
      } else if (!s.emote) {
        const stance = { rShoulder: [-0.55, 0, -0.3], rElbow: [-1.45, 0, 0], lShoulder: [-0.25, 0, 0.3], lElbow: [-0.9, 0, 0] };
        pose = { ...pose, ...(s.mode === 'build' ? { rShoulder: [-0.95, 0, -0.35], rElbow: [-1.0, 0, 0], lShoulder: [-0.95, 0, 0.35], lElbow: [-1.0, 0, 0], chest: [0.05, 0, 0] } : stance), neck: [-pitch * 0.2, 0, 0] };
      }
      if (s.swingT >= 0 && s.swingT <= 1) pose = this._swing(pose, s);
      if (s.throwT >= 0 && s.throwT <= 1) pose = layer(pose, Poses.throwArm(s.throwT));
      if (s.useT > 0) pose = { ...pose, rShoulder: [-1.5, 0.35, -0.3], rElbow: [-1.9, 0, 0], lShoulder: [-0.7, 0, 0.4], lElbow: [-1.0, 0, 0], neck: [0.1, 0, 0] };
      if (s.emote) pose = this._emote(pose, s);
    }
    h.pose(pose);
    if (s.mode === 'ground' || s.mode === undefined) {
      if (this.mode === 'ik' && s.mode !== 'build' && !s.emote && !(s.swingT >= 0) && !(s.throwT >= 0) && !(s.useT > 0)) this._arms(s.aim || 0, s.sprint ? 1 : 0, s.draw || 0);
    }
    if (this.spinNode) this.spinNode.rotation.z += (s.spin || 0) * dt * 28;
    if (this.glider) { this.glider.visible = s.mode === 'glide'; }
  }

  _swing(pose, s) {
    const p = s.swingT, id = this.def?.id, sd = this.swingDir;
    if (id === 'pickaxe') {
      return layer(pose, track([
        [0, { rShoulder: [-0.55, 0, -0.3], rElbow: [-1.45, 0, 0] }],
        [0.28, { rShoulder: [-2.7, 0, -0.35], rElbow: [-1.5, 0, 0], chest: [-0.2, -0.15, 0], lShoulder: [-1.4, 0, 0.5], lElbow: [-1.0, 0, 0], spine: [-0.15, 0, 0] }],
        [0.46, { rShoulder: [-0.95, 0, -0.2], rElbow: [-0.3, 0, 0], chest: [0.3, 0.2, 0], lShoulder: [-1.0, 0, 0.4], lElbow: [-0.8, 0, 0], spine: [0.25, 0, 0] }],
        [1, { rShoulder: [-0.55, 0, -0.3], rElbow: [-1.45, 0, 0] }],
      ], p));
    }
    return layer(pose, track([
      [0, { rShoulder: [-0.55, 0, -0.3], rElbow: [-1.45, 0, 0] }],
      [0.25, { rShoulder: [-1.35, -0.7 * sd, -1.0 * sd], rElbow: [-1.0, 0, 0], chest: [0, -0.7 * sd, 0], lShoulder: [-0.3, 0, 0.5] }],
      [0.5, { rShoulder: [-1.15, 0.7 * sd, 0.3 * sd], rElbow: [-0.45, 0, 0], chest: [0.05, 0.75 * sd, 0], lShoulder: [-0.3, 0, 0.5] }],
      [1, { rShoulder: [-0.55, 0, -0.3], rElbow: [-1.45, 0, 0] }],
    ], p));
  }

  _emote(pose, s) {
    const t = s.emoteT || 0;
    if (s.emote === 'wave') {
      const w = Math.sin(t * 9);
      return { ...pose, rShoulder: [-2.8, 0, -0.45], rElbow: [-0.9 + w * 0.5, 0, 0], lShoulder: [0.05, 0, 0.15], lElbow: [-0.25, 0, 0], neck: [0, -0.15, 0], spine: [-0.05, 0, 0] };
    }
    if (s.emote === 'dance') {
      const a = Math.sin(t * 8), b = Math.cos(t * 8);
      return { body: [0, a * 0.25, 0], spine: [0.1, 0, a * 0.2], chest: [0, b * 0.3, 0], neck: [0, 0, -a * 0.15], lShoulder: [-1.9 + b * 0.6, 0, 0.8], rShoulder: [-1.9 - b * 0.6, 0, -0.8], lElbow: [-0.9, 0, 0], rElbow: [-0.9, 0, 0], lHip: [-0.3 * Math.max(0, a), 0, 0.12], rHip: [-0.3 * Math.max(0, -a), 0, -0.12], lKnee: [0.5 * Math.max(0, a) + 0.2, 0, 0], rKnee: [0.5 * Math.max(0, -a) + 0.2, 0, 0], bodyPos: [0, -0.08 + Math.abs(a) * 0.08, 0] };
    }
    const c = Poses.celebrate(t * 0.9);       // 'cheer'
    return c;
  }
}

/** Parachute-style glider canopy (original design: striped umbrella wing) to attach above a character. */
export function buildGlider(color = 0xff5ea8, color2 = 0xfff3d6) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1.9, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.1); geo.scale(1.25, 0.55, 1.0);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c1 = new THREE.Color(color), c2 = new THREE.Color(color2);
  for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10) % 2; const c = k ? c1 : c2; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const canopy = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  canopy.position.y = 2.75; g.add(canopy);
  const P = new Parts();
  for (const [x, z] of [[1.7, 0.2], [-1.7, 0.2], [0.8, -1.4], [-0.8, -1.4], [0.8, 1.4], [-0.8, 1.4]]) P.seg(0xe8e0d0, 0.012, [x * 0.9, 2.78, z * 0.9], [x * 0.12, 1.45, 0.0]);
  const lines = P.build(); g.add(lines);
  return g;
}
