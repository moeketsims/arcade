// Team and goalkeeper AI. Works in an "attack frame" where ax = dir * x (own goal at ax = −52.5).
import * as THREE from 'three';
import { HL, HW, GOAL_W, GOAL_H } from './stadium.js';
import { Ball, R } from './ball.js';
import { SHAPE } from './teams.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIFF = { amateur: { react: 0.26, tackle: 0.5, aim: 1.5, think: 0.5, press: 0.8 }, pro: { react: 0.17, tackle: 0.72, aim: 1.0, think: 0.33, press: 1 }, legend: { react: 0.1, tackle: 0.9, aim: 0.65, think: 0.22, press: 1.15 } };

export class TeamAI {
  constructor(game, teamIdx) { this.g = game; this.ti = teamIdx; this.dir = teamIdx === 0 ? 1 : -1; this.mentality = 0; this.pressAll = false; this.receiver = null; }
  get team() { return this.g.teams[this.ti]; }
  get mates() { return this.team.players; }
  get rivals() { return this.g.teams[1 - this.ti].players; }
  get diff() { return DIFF[this.g.settings.difficulty] || DIFF.pro; }
  ax(x) { return this.dir * x; }

  /** Formation target for a player given the ball and possession. */
  shapeTarget(p, haveBall) {
    const s = SHAPE[p.info.slot], b = this.g.ball.pos, bax = this.ax(b.x), m = this.mentality * 5 + (this.pressAll ? 7 : 0);
    let ax;
    if (haveBall) ax = clamp(s.x * 42 + 14 + bax * 0.42 + m, -46, 47);
    else ax = clamp(s.x * 38 - 6 + bax * 0.48 + m, -48.5, 32);
    if (s.role === 'DEF') ax = Math.min(ax, haveBall ? 18 : 6) ;
    let z = s.z * 27 + b.z * 0.28;
    z = clamp(z, -31.5, 31.5);
    return new THREE.Vector3(this.dir * ax, 0, z);
  }

  update(dt) {
    const g = this.g, ball = g.ball, d = this.diff;
    if (g.state === 'goal') return;
    if (g.state === 'pk' || g.mode === 'fk') { const k = this.mates[0]; if (!g.isHumanControlled(k)) this.keeper(k, dt); if (g.mode === 'fk' && g.state === 'play') for (const p of this.mates) if (!p.isKeeper && p !== g.user) { p.moveDir.set(0, 0, 0); p.moveSpeed = 0; } return; }
    const owner = ball.owner || ball.held;
    const haveBall = owner ? owner.team === this.ti : (ball.lastTouch?.team === this.ti && ball.kickT < 1.2);
    const loose = !owner;
    // who chases a loose ball: the player who gets there first
    let chaser = null;
    if (loose && g.state === 'play') {
      let best = Infinity;
      for (const p of this.mates) {
        if (p.isKeeper || p.down) continue;
        const t = this.interceptTime(p);
        if (t < best) { best = t; chaser = p; }
      }
      this.chaser = chaser;
    }
    // pressing assignment
    let presser = null, cover = null;
    if (owner && owner.team !== this.ti && g.state === 'play') {
      const cand = this.mates.filter(p => !p.isKeeper && !p.down).sort((a, b2) => a.pos.distanceTo(owner.pos) - b2.pos.distanceTo(owner.pos));
      presser = cand[0]; cover = cand[1];
    }
    for (const p of this.mates) {
      if (p === g.user || p.down || g.isHumanControlled(p)) continue;
      if (p.isKeeper) { this.keeper(p, dt); continue; }
      p.sprint = false; p.jockey = false; p.faceTarget = null;
      if (g.state !== 'play') { this.moveTo(p, p.setTarget || this.shapeTarget(p, haveBall), 0.85); continue; }
      if (owner === p) { this.carry(p, dt); continue; }
      // aerial duels: head / volley at goal in the final third, clear it elsewhere
      if (loose && !p.busy && ball.pos.y > 0.7 && ball.pos.y < 2.6 && Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z) < 1.7 && (p === chaser || p === this.receiver || Math.random() < 0.3)) {
        if (this.ax(p.pos.x) > 34 && Math.random() < 0.5) { g.shoot(p, ball.pos.y > 1.35 ? 'header' : 'volley', { power: 0.75, aimErr: d.aim }); continue; }
        if (this.ax(p.pos.x) < -20 && Math.random() < 0.5) { g.clearBall(p); continue; }
      }
      if (loose && p === chaser) { this.chase(p); continue; }
      if (p === this.receiver && loose) { this.chase(p); continue; }
      if (presser === p || (cover === p && this.pressAll)) { this.press(p, owner, dt, presser === p ? 1.1 : 3.5); continue; }
      if (cover === p) { const own = new THREE.Vector3(-this.dir * HL, 0, 0); const t = owner.pos.clone().lerp(own, 0.25); this.moveTo(p, t, 0.85); p.faceTarget = owner.pos; continue; }
      // off-ball support and runs
      const tgt = this.shapeTarget(p, haveBall);
      if (haveBall && owner && (p.info.role === 'FWD' || (p.info.role === 'MID' && Math.random() < 0.002))) {
        const bax = this.ax(owner.pos.x);
        if (bax > -15) tgt.x = this.dir * clamp(Math.max(this.ax(tgt.x), bax + 9 + (p.info.slot % 3) * 4), -40, 46);
      }
      this.moveTo(p, tgt, haveBall ? 0.9 : 0.8);
      if (!haveBall && owner) p.faceTarget = owner.pos;
    }
  }

  interceptTime(p) {
    const b = this.g.ball; const v = b.vel;
    // look ahead along the ball path for the first point the player could reach
    let best = Infinity;
    for (let t = 0; t <= 2.2; t += 0.15) {
      const bp = b.pos.clone().addScaledVector(v, t * Math.max(0.2, 1 - t * 0.3));
      const d = Math.hypot(bp.x - p.pos.x, bp.z - p.pos.z);
      const tt = d / (p.maxSpeed * 1.1);
      if (tt <= t + 0.1) { best = Math.min(best, t); break; }
    }
    if (best === Infinity) best = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) / p.maxSpeed + 2;
    return best;
  }

  moveTo(p, t, speedK = 1) {
    const d = new THREE.Vector3(t.x - p.pos.x, 0, t.z - p.pos.z), l = d.length();
    if (l < 0.4) { p.moveDir.set(0, 0, 0); p.moveSpeed = 0; return; }
    p.moveDir.copy(d.divideScalar(l)); p.moveSpeed = Math.min(p.maxSpeed * speedK, 1.2 + l * 1.4);
    p.sprint = l > 12 && speedK > 0.85;
  }

  chase(p) {
    const b = this.g.ball;
    const lead = b.pos.clone().addScaledVector(b.vel, Math.min(0.9, b.pos.distanceTo(p.pos) / 9));
    this.moveTo(p, lead, 1.1); p.sprint = true;
  }

  press(p, owner, dt, standOff) {
    if (!owner) return;
    const own = new THREE.Vector3(-this.dir * HL, 0, 0);
    const goalSide = owner.pos.clone().add(own.clone().sub(owner.pos).setY(0).normalize().multiplyScalar(standOff));
    this.moveTo(p, goalSide, 1.05 * this.diff.press); p.faceTarget = owner.pos;
    p.jockey = p.pos.distanceTo(owner.pos) < 3.5;
    const d = p.pos.distanceTo(owner.pos);
    p.tackleCd = (p.tackleCd || 0) - dt;
    if (d < 1.9 && p.tackleCd <= 0 && !p.busy) {
      p.tackleCd = 0.9 + Math.random() * 0.8;
      if (Math.random() < 0.55 * this.diff.tackle) this.g.tackle(p);
      else if (Math.random() < 0.1 && d < 1.6) this.g.slide(p);
    }
  }

  /** AI ball carrier: dribble, pass, cross or shoot. */
  carry(p, dt) {
    const g = this.g, d = this.diff, goal = new THREE.Vector3(this.dir * HL, 0, 0);
    const pax = this.ax(p.pos.x), distGoal = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
    const near = this.rivals.filter(o => !o.down).map(o => ({ o, d: o.pos.distanceTo(p.pos) })).sort((a, b) => a.d - b.d);
    const pressure = near.length ? near[0].d : 99;
    p.think = (p.think || 0) - dt;
    // dribble direction: towards goal, bending away from the nearest defender
    const to = new THREE.Vector3(goal.x - p.pos.x, 0, (pax > 30 ? 0 : p.pos.z * 0.4) - p.pos.z).normalize();
    if (near.length && near[0].d < 4.5) {
      const away = p.pos.clone().sub(near[0].o.pos).setY(0).normalize();
      to.addScaledVector(away, 0.9 * (1 - near[0].d / 4.5)).normalize();
    }
    if (Math.abs(p.pos.z) > HW - 3) to.z -= Math.sign(p.pos.z) * 0.8;
    p.moveDir.copy(to.normalize()); p.moveSpeed = p.maxSpeed * (pressure < 6 ? 0.95 : 0.8); p.sprint = pressure > 3 && pressure < 9 && pax > -10;
    if (p.busy || p.think > 0) return;
    p.think = d.think * (0.6 + Math.random() * 0.8);
    // shoot?
    const angleOk = Math.abs(p.pos.z) < 18 || distGoal < 14;
    const shootChance = distGoal < 12 ? 0.85 : distGoal < 19 ? 0.5 : distGoal < 27 ? 0.12 * (p.info.shoot / 80) : 0;
    if (angleOk && Math.random() < shootChance) { g.aiShoot(p, d.aim); return; }
    // cross from wide in the final third
    if (pax > 33 && Math.abs(p.pos.z) > 16 && Math.random() < 0.6) {
      const tgt = this.mates.filter(m => m !== p && !m.isKeeper && this.ax(m.pos.x) > 36 && Math.abs(m.pos.z) < 12).sort(() => Math.random() - 0.5)[0];
      const spot = tgt ? tgt.pos.clone() : new THREE.Vector3(this.dir * (HL - 9), 0, (Math.random() - 0.5) * 8);
      g.longPass(p, spot.add(new THREE.Vector3(this.dir * 1, 0, 0)), { cross: true, curve: -Math.sign(p.pos.z) * this.dir * 1.2 * (Math.random() < 0.5 ? 1 : 0) });
      return;
    }
    // pass?
    let best = null, bestScore = -Infinity;
    for (const m of this.mates) {
      if (m === p || m.down) continue;
      if (m.isKeeper && pax > -25) continue;
      const v = m.pos.clone().sub(p.pos), dist = v.length();
      if (dist < 4 || dist > 42) continue;
      const lane = this.laneClearance(p.pos, m.pos);
      const prog = this.ax(m.pos.x) - pax;
      const free = Math.min(8, Math.min(...this.rivals.map(o => o.pos.distanceTo(m.pos))));
      const score = prog * 0.06 + lane * 0.35 + free * 0.18 - dist * 0.015 + Math.random() * 0.4 - (m.isKeeper ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = { m, dist, lane }; }
    }
    const mustPass = pressure < 2.6 || (pressure < 4 && Math.random() < 0.5);
    if (best && (mustPass || bestScore > 1.6 || Math.random() < 0.14)) {
      const lead = best.m.vel.clone().multiplyScalar(Math.min(1.2, best.dist / 18));
      if (best.lane > 1.8 && best.dist < 32) g.groundPass(p, best.m, { lead });
      else g.longPass(p, best.m.pos.clone().add(lead), { receiver: best.m });
      return;
    }
    // skill move to beat a close defender
    if (pressure < 2.4 && Math.random() < 0.35) g.stepover(p, Math.random() < 0.5 ? 1 : -1);
  }

  laneClearance(a, b) {
    let min = 99; const ab = b.clone().sub(a).setY(0), L2 = ab.lengthSq();
    for (const o of this.rivals) {
      const t = clamp(o.pos.clone().sub(a).setY(0).dot(ab) / L2, 0, 1);
      const q = a.clone().addScaledVector(ab, t), d = Math.hypot(q.x - o.pos.x, q.z - o.pos.z);
      min = Math.min(min, d);
    }
    return min;
  }

  // ---------------- goalkeeper ----------------
  keeper(k, dt) {
    const g = this.g, b = g.ball, d = this.diff, gx = -this.dir * HL;
    k.sprint = false; k.jockey = false;
    if (k.busy) return;
    if (this.ti === 0 && g.keeperRush > 0) { g.keeperRush -= dt; this.moveTo(k, b.pos, 1.2); k.sprint = true; k.faceTarget = b.pos; if (k.pos.distanceTo(b.pos) < 2.2 && !b.held) { g.keeperRush = 0; g.keeperSmother(k); } return; }
    if (b.held === k) { // distribute
      k.holdT = (k.holdT || 0) + dt; k.moveDir.set(0, 0, 0); k.moveSpeed = 0; k.faceTarget = new THREE.Vector3(0, 0, k.pos.z * 0.5);
      if (k.holdT > 1.3) { k.holdT = 0; g.keeperDistribute(k); }
      return;
    }
    k.holdT = 0;
    const bd = Math.hypot(b.pos.x - gx, b.pos.z);
    k.keeperReady = bd < 34;
    // react to shots
    const threat = !b.owner && !b.held && b.kicker && b.kicker.team !== this.ti && b.kickT < 1.6 && Math.sign(b.vel.x) === -this.dir && b.speed > 7;
    if (threat && !k.diveDone) {
      k.reactT = (k.reactT ?? d.react * (0.7 + Math.random() * 0.6)) - dt;
      if (k.reactT <= 0) { k.diveDone = true; g.keeperReact(k, this.skillErr(k)); }
      return;
    }
    if (!threat) { k.diveDone = false; k.reactT = undefined; }
    // claim a loose ball in the box / rush a one-on-one
    const inBox = this.ax(b.pos.x) < -36 && Math.abs(b.pos.z) < 20;
    const owner = b.owner;
    if (!owner && inBox && b.pos.y < 2.6 && (b.speed < 9 || Math.hypot(b.pos.x - k.pos.x, b.pos.z - k.pos.z) < 4)) {
      const rivalsClose = this.rivals.some(o => o.pos.distanceTo(b.pos) < k.pos.distanceTo(b.pos) - 0.5);
      if (!rivalsClose || this.ax(b.pos.x) < -46) { this.moveTo(k, b.pos, 1.1); k.sprint = true; k.faceTarget = b.pos; return; }
    }
    if (owner && owner.team !== this.ti && bd < 13 && Math.abs(b.pos.z) < 12) {
      const tgt = b.pos.clone().lerp(new THREE.Vector3(gx, 0, 0), 0.45);
      this.moveTo(k, tgt, 1.05); k.faceTarget = b.pos;
      if (k.pos.distanceTo(b.pos) < 2.1 && Math.random() < dt * 2.5) g.keeperSmother(k);
      return;
    }
    // position on the line between ball and goal centre
    const dir = new THREE.Vector3(b.pos.x - gx, 0, b.pos.z).normalize();
    const out = clamp(bd * 0.1, 0.6, 5.0);
    const tgt = new THREE.Vector3(gx + dir.x * out, 0, clamp(dir.z * out, -2.9, 2.9));
    this.moveTo(k, tgt, 0.75); k.faceTarget = b.pos;
  }
  skillErr(k) { return (1 - (k.info.keeping - 60) / 45) * 0.55 * this.diff.aim; }
}
