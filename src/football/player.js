// A footballer: a jointed 3D person in club kit with movement, stamina and timed actions whose
// contact frame is when the foot (or head, chest, hands) actually meets the ball.
import * as THREE from 'three';
import { Humanoid, Poses, mix, mirror } from '../common/humanoid.js';

const ACTIONS = {
  // dur (s), contact (0..1), slow (movement multiplier while acting)
  pass: { dur: 0.42, contact: 0.48, slow: 0.45, pose: p => Poses.pass(p) },
  lob: { dur: 0.6, contact: 0.45, slow: 0.35, pose: p => Poses.kick(p, 0.8) },
  shot: { dur: 0.62, contact: 0.45, slow: 0.3, pose: p => Poses.kick(p, 1) },
  finesse: { dur: 0.6, contact: 0.45, slow: 0.3, pose: p => Poses.kick(p, 0.85) },
  power: { dur: 0.75, contact: 0.5, slow: 0.2, pose: p => Poses.kick(Math.min(1, p * 0.95), 1.15) },
  chip: { dur: 0.5, contact: 0.45, slow: 0.35, pose: p => Poses.chip(p) },
  volley: { dur: 0.62, contact: 0.45, slow: 0.25, pose: p => Poses.volley(p) },
  header: { dur: 0.8, contact: 0.55, slow: 0.4, pose: p => Poses.header(p), jump: 0.55 },
  chest: { dur: 0.55, contact: 0.3, slow: 0.3, pose: p => Poses.chest(p) },
  bicycle: { dur: 1.4, contact: 0.38, slow: 0.05, pose: p => Poses.bicycle(p) },
  rainbow: { dur: 0.6, contact: 0.42, slow: 0.7, pose: p => mix(Poses.kick(p, 0.5), { rHip: [0.9, 0, 0], rKnee: [1.9, 0, 0], lKnee: [0.5, 0, 0], spine: [0.25, 0, 0] }, Math.sin(Math.min(1, p) * Math.PI)) },
  flick: { dur: 0.45, contact: 0.4, slow: 0.6, pose: p => mix(Poses.idle(), { rHip: [-0.9, 0, 0], rKnee: [0.6, 0, 0], rAnkle: [-0.4, 0, 0], spine: [-0.1, 0, 0] }, Math.sin(Math.min(1, p) * Math.PI)) },
  tackle: { dur: 0.55, contact: 0.4, slow: 0.25, pose: p => Poses.tackle(p) },
  slide: { dur: 1.05, contact: 0.2, slow: 0, pose: p => Poses.slide(p) },
  throwIn: { dur: 1.0, contact: 0.72, slow: 0, pose: p => Poses.throwIn(p) },
  dive: { dur: 1.25, contact: 0.3, slow: 0, pose: (p, a) => Poses.dive(p, a.side, a.height) },
  saveMid: { dur: 0.8, contact: 0.4, slow: 0, pose: (p, a) => Poses.saveMiddle(p, a.high) },
  fallen: { dur: 1.8, contact: 2, slow: 0, pose: p => Poses.fallen(Math.min(1, p * 4) * (p > 0.8 ? (1 - p) * 5 : 1)) },
  stumble: { dur: 0.5, contact: 2, slow: 0.2, pose: p => mix(Poses.idle(), Poses.fallen(0.3), Math.sin(p * Math.PI)) },
  getUp: { dur: 0.7, contact: 2, slow: 0, pose: p => mix(Poses.fallen(1), Poses.idle(), p) },
  stepover: { dur: 0.45, contact: 2, slow: 0.9, pose: p => mix(Poses.run(p * 6, 0.6), { rHip: [-0.5, 0.7, -0.5], rKnee: [0.8, 0, 0], spine: [0.2, 0, -0.2] }, Math.sin(p * Math.PI)) },
  celebrate: { dur: 3.4, contact: 2, slow: 1, pose: (p, a, t) => Poses.celebrate(t) },
  kneeSlide: { dur: 3.4, contact: 2, slow: 0.4, pose: (p, a, t) => Poses.kneeSlide(t) },
  keeperThrow: { dur: 0.8, contact: 0.55, slow: 0, pose: p => Poses.throwArm(p) },
  punt: { dur: 0.8, contact: 0.5, slow: 0, pose: p => Poses.kick(p, 1.1) },
};

export class Footballer {
  constructor(game, teamIdx, info, club) {
    this.game = game; this.team = teamIdx; this.info = info; this.isKeeper = info.role === 'GK';
    const kit = this.isKeeper ? club.keeperKit : club.kit;
    this.h = new Humanoid({ skin: info.skin, hair: info.hair, hairStyle: info.hairStyle, shirt: kit.shirt, shirt2: kit.sleeve, shorts: kit.shorts, socks: kit.socks,
      boots: [0x111111, 0xffffff, 0xff3b3b, 0x00b4d8, 0xffd60a][info.slot % 5], number: info.number, name: info.short, numberColor: kit.number,
      longSleeves: this.isKeeper, gloves: this.isKeeper ? 0xeeeeee : null, build: info.build, height: info.height, crest: club.crest });
    game.scene.add(this.h.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.facing = teamIdx === 0 ? Math.PI / 2 : -Math.PI / 2;
    this.moveDir = new THREE.Vector3(); this.moveSpeed = 0; this.faceTarget = null;
    this.act = null; this.phase = Math.random() * 6; this.stamina = 1; this.sprint = false; this.jockey = false;
    this.touchCool = 0; this.jumpY = 0; this.t = 0; this.yellow = 0;
    this.home = new THREE.Vector3(); this.marker = null;
    this.maxSpeed = 6.6 + (info.pace - 70) * 0.06;
  }

  get forward() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  get busy() { return !!this.act && this.act.type !== 'celebrate'; }
  get down() { return this.act && ['fallen', 'getUp', 'slide', 'dive', 'bicycle'].includes(this.act.type); }
  /** Ball-carry point in front of the feet. */
  footPoint(out = new THREE.Vector3()) { const f = this.forward; return out.set(this.pos.x + f.x * 0.62, 0.11, this.pos.z + f.z * 0.62); }

  place(x, z, facing) { this.pos.set(x, 0, z); this.vel.set(0, 0, 0); if (facing != null) this.facing = facing; this.act = null; this.jumpY = 0; }

  /** Start a timed action. data.onContact(p) fires once at the contact frame; data.mirror flips to the left foot. */
  action(type, data = {}) {
    const def = ACTIONS[type]; if (!def) return;
    this.act = { type, def, t: 0, done: false, ...data, dur: data.dur ?? def.dur };
  }

  update(dt) {
    this.t += dt; this.touchCool = Math.max(0, this.touchCool - dt);
    const a = this.act;
    // ---- movement ----
    let maxV = this.moveSpeed;
    if (this.sprint && this.stamina > 0.05 && !this.jockey) { maxV = Math.max(maxV, this.maxSpeed * 1.25); this.stamina = Math.max(0, this.stamina - dt * 0.05); }
    else this.stamina = Math.min(1, this.stamina + dt * 0.025);
    if (a) maxV *= a.def.slow;
    const want = this.moveDir.clone().multiplyScalar(maxV);
    if (a && a.slideVel) { want.copy(a.slideVel).multiplyScalar(Math.max(0, 1 - a.t / a.dur * 1.1)); }
    if (a && a.diveVel) { const p = a.t / a.dur; want.copy(a.diveVel).multiplyScalar(p < 0.02 ? 0 : p < 0.46 ? 1 : 0); }
    const acc = (a && (a.slideVel || a.diveVel)) ? 60 : want.lengthSq() > this.vel.lengthSq() ? 16 : 22;
    const dv = want.sub(this.vel); const l = dv.length(), step = acc * dt;
    if (l > step) dv.multiplyScalar(step / l);
    this.vel.add(dv); this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    // stay inside the stadium floor
    this.pos.x = Math.max(-58, Math.min(58, this.pos.x)); this.pos.z = Math.max(-38, Math.min(38, this.pos.z));
    // ---- facing ----
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let tf = null;
    if (this.faceTarget) tf = Math.atan2(this.faceTarget.x - this.pos.x, this.faceTarget.z - this.pos.z);
    else if (sp > 0.6 && !(a && a.diveVel)) tf = Math.atan2(this.vel.x, this.vel.z);
    if (tf != null && !(a && ['dive', 'bicycle', 'slide'].includes(a.type))) {
      let d = tf - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = (this.game.ball.owner === this ? 7 : 11) * (this.sprint ? 0.75 : 1);
      this.facing += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    // ---- action timeline ----
    if (a) {
      a.t += dt; const p = a.t / a.dur;
      // contact window: the foot/head must actually reach the ball (a.reach) between win0 and win1 around the
      // contact frame; if it never does, onContact fires once at the end with whiff = true.
      if (!a.done) {
        const c = a.def.contact, w0 = c - (a.win0 || 0), w1 = c + (a.win1 || 0);
        if (p >= w0) {
          const ok = !a.reach || a.reach(this);
          if (ok || p >= w1) { a.done = true; a.onContact && a.onContact(this, !ok); }
        }
      }
      if (a.def.jump) { const jp = (p - 0.25) / 0.5; this.jumpY = jp > 0 && jp < 1 ? Math.sin(jp * Math.PI) * a.def.jump : 0; }
      if (a.onUpdate) a.onUpdate(this, p, dt);
      if (p >= 1) { const next = a.then; this.act = null; this.jumpY = 0; if (next) this.action(next); }
    }
    this.animate(dt, sp);
  }

  animate(dt, sp) {
    const a = this.act, h = this.h;
    this.phase += dt * (2.2 + sp * 1.55);
    let pose;
    if (a) {
      const p = Math.min(1, a.t / a.dur);
      pose = a.def.pose(p, a, this.t);
      if (a.mirror) pose = mirror(pose);
      if (['pass', 'lob', 'shot', 'finesse', 'chip', 'tackle', 'stepover', 'flick', 'rainbow'].includes(a.type) && sp > 1.5) pose = mix(Poses.run(this.phase, Math.min(1, sp / 8)), pose, 0.75);
    } else if (this.isKeeper && this.keeperReady && sp < 2.5) pose = mix(Poses.keeperReady(this.t), Poses.run(this.phase, sp / 8), Math.min(1, sp / 2.5));
    else if (this.jockey) pose = mix(Poses.jockey(this.t), Poses.run(this.phase, 0.3), Math.min(1, sp / 6));
    else if (sp < 0.25) pose = Poses.idle(this.t);
    else pose = mix(Poses.idle(this.t), Poses.run(this.phase, Math.min(1.15, sp / 8)), Math.min(1, sp / 1.2));
    h.pose(pose);
    h.root.position.set(this.pos.x, this.jumpY, this.pos.z);
    h.root.rotation.y = this.facing;
  }

  /** Approximate body capsule check for blocks: is the ball touching this player's body? */
  bodyHit(ball) {
    const b = ball.pos, dx = b.x - this.pos.x, dz = b.z - this.pos.z, d = Math.hypot(dx, dz);
    const top = 1.85 * (this.info.height || 1) + this.jumpY;
    return d < 0.32 && b.y > 0.15 + this.jumpY && b.y < top;
  }
  /** World positions of both hands (for keeper saves). */
  hands() { return [this.h.worldOf('lHand'), this.h.worldOf('rHand')]; }
  head() { return this.h.worldOf('head'); }
  foot(side = 'r') { return this.h.worldOf(side + 'Ankle'); }
  dispose() { this.game.scene.remove(this.h.root); }
}
export { ACTIONS };
