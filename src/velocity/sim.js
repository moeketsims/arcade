// Velocity Divide: the whole game simulation at a fixed 60 Hz. No Three.js and no DOM, so Node can play full missions.
// Input each step: { x, y (stick; y > 0 = forward), yaw (camera), jump, act, dash } with held booleans. Edges are found here.
import { buildStage } from './stages.js';
export const DT = 1 / 60, G = 32;
const STEP = 0.55, EPS = 0.001, hyp = Math.hypot;

export class Sim {
  constructor(mission, char, seed = 1) {
    const lv = this.lv = buildStage(mission.stage, seed);
    this.m = mission; this.c = char; this.s = char.stats; this.role = char.role;
    this.time = 0; this.sparks = 0; this.total = lv.sparks.length; this.retries = 0; this.done = null; this.doneT = 0; this.winT = 0; this.events = [];
    this.enemies = []; for (const e of lv.enemies) this.addEnemy(e);
    this.orbs = []; this.bolts = []; this.rings = [];
    this.shards = lv.shards.map(s => ({ ...s, got: false })); this.shardsGot = 0;
    const b = lv.boss; this.boss = b ? { ...b, state: 'intro', t: 0, y: b.hi, alive: true, hurt: 0, ringT: 1, orbT: 1.6, phase: 0 } : null;
    if (this.boss) this.boss.hp = this.boss.max = Math.round(b.hp * (this.role === 'mech' ? 1.5 : 1));
    this.check = { ...lv.spawn }; this.checkId = -1; this.prev = { jump: false, act: false, dash: false };
    this.spawn();
  }
  addEnemy(e) { const n = this.enemies.length; this.enemies.push({ hp: 1, r: 0.9, ...e, id: n, alive: true, x0: e.x, y0: e.y, z0: e.z, t: n * 0.7, cd: 1.2 + (n % 3) * 0.7, hurt: 0 }); return this.enemies[n]; }
  ev(t, at) { const o = at || this.p; if (this.events.length < 200) this.events.push({ t, x: o.x, y: o.y, z: o.z }); }
  spawn() {
    const c = this.check, s = this.s;
    this.p = { x: c.x, y: c.y, z: c.z, vx: 0, vy: 0, vz: 0, fx: -Math.sin(c.yaw || 0), fz: -Math.cos(c.yaw || 0), r: s.r, h: s.h, ground: false, coy: 0, buf: 0, cut: false,
      airJumps: 0, airDash: false, atk: 0, spin: false, stomp: false, homing: null, homeT: 0, burstCd: 0, hearts: s.hearts, inv: 1, dead: 0,
      glide: false, fuel: s.hover || 0, hovering: false, dig: 0, scan: 0, scanCd: 0, punchCd: 0, locks: [], lockT: 0, dashT: 0 };
  }
  results() { return { time: Math.round(this.time * 10) / 10, sparks: this.sparks, total: this.total, retries: this.retries }; }
  objective() {
    const k = this.m.kind;
    if (k === 'run') return 'Reach the relay ring';
    if (k === 'seek') return `Find the Core shards: ${this.shardsGot} of ${this.shards.length}`;
    if (k === 'mech') { const n = this.enemies.filter(e => e.alive).length; return n ? `Clear each room to open its gate: ${n} left` : 'Reach the lift'; }
    return this.boss.state === 'open' ? `Strike ${this.boss.name} now` : `Dodge until ${this.boss.name} drops its shield`;
  }

  // ---- queries ---------------------------------------------------------------------------------------------------------
  /** Top of the highest floor under (x, z) that is no higher than a step above y and at most depth below it. */
  floorAt(x, z, y, depth) { let top = -1e9; for (const b of this.lv.solids) if (!b.open && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= y + 0.6 && b.y1 >= y - depth && b.y1 > top) top = b.y1; return top; }
  inside(x, y, z) { for (const b of this.lv.solids) if (!b.open && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1) return true; return false; }
  hit(x, y, z) { const p = this.p, r = p.r; for (const b of this.lv.solids) if (!b.open && x + r > b.x0 && x - r < b.x1 && y + p.h > b.y0 && y < b.y1 && z + r > b.z0 && z - r < b.z1) return b; return null; }
  /** Nearest thing ahead that a homing dash or a tapped bolt would go for. */
  lockTarget(range, minDot, springs = true) {
    const p = this.p; let best = null, bd = range;
    const test = t => { const dx = t.x - p.x, dz = t.z - p.z, d = hyp(dx, dz, t.y - p.y); if (d < bd && d > 0.01 && Math.abs(t.y - p.y) < 10 && (dx * p.fx + dz * p.fz) / (hyp(dx, dz) || 1) > minDot) { bd = d; best = t; } };
    for (const e of this.enemies) if (e.alive) test(e);
    if (this.boss && this.boss.state === 'open') test(this.boss);
    if (springs) for (const sp of this.lv.springs) if (sp.y > p.y - 9 && sp.y < p.y + 2) test(sp);
    return best;
  }
  nextLock() {
    const p = this.p, s = this.s; let best = null, bs = 1e9;
    const test = (t, cap) => { const dx = t.x - p.x, dz = t.z - p.z, d = hyp(dx, dz); if (d > s.lockRange || Math.abs(t.y - p.y) > 12 || (dx * p.fx + dz * p.fz) / (d || 1) < 0.15) return; const n = p.locks.reduce((a, l) => a + (l === t ? 1 : 0), 0); if (n < cap && n * 100 + d < bs) { bs = n * 100 + d; best = t; } };
    for (const e of this.enemies) if (e.alive) test(e, Math.ceil(e.hp));
    if (this.boss && this.boss.state === 'open') test(this.boss, 99);
    return best;
  }
  digSpot() { const p = this.p; return this.shards.find(s => !s.got && s.buried && hyp(s.x - p.x, s.z - p.z) < 2.6 && Math.abs(s.y - p.y) < 2) || null; }

  // ---- one step -------------------------------------------------------------------------------------------------------
  step(inp) {
    const pv = this.prev, jp = inp.jump && !pv.jump, ap = inp.act && !pv.act, ar = !inp.act && pv.act, dp = inp.dash && !pv.dash;
    this.prev = { jump: !!inp.jump, act: !!inp.act, dash: !!inp.dash };
    if (this.done) { this.doneT += DT; return; }
    this.time += DT; const p = this.p;
    if (p.dead > 0) { p.dead -= DT; if (p.dead <= 0) { this.retries++; this.spawn(); this.ev('respawn'); } this.world(); return; }
    const sy = Math.sin(inp.yaw || 0), cy = Math.cos(inp.yaw || 0);
    let ix = cy * inp.x - sy * inp.y, iz = -sy * inp.x - cy * inp.y, mag = hyp(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; mag = 1; } if (mag < 0.12) { ix = iz = mag = 0; }
    for (const k of ['inv', 'atk', 'burstCd', 'punchCd', 'scan', 'scanCd', 'dashT']) p[k] = Math.max(0, p[k] - DT);
    p.buf = jp ? 0.13 : Math.max(0, p.buf - DT); p.coy = p.ground ? 0.1 : Math.max(0, p.coy - DT);
    this[this.role](inp, ix, iz, mag, jp, ap, ar, dp);
    this.move(); if (p.dead <= 0) this.touch(); this.world();
    if (this.winT > 0 && (this.winT -= DT) <= 0) this.win();
  }
  win() { if (!this.done) { this.done = 'win'; this.ev('win'); } }

  /** Ground and air movement. keep = a runner carrying more than top speed holds it, steers it and bleeds it off slowly. */
  loco(ix, iz, mag, top, acc, keep) {
    const p = this.p, s = this.s, sp = hyp(p.vx, p.vz), a = (p.ground ? acc : acc * s.air) * DT;
    if (mag > 0) { p.fx = ix / mag; p.fz = iz / mag; }
    if (keep && sp > top + 0.5) {
      const ns = Math.max(top, sp - s.bleed * (p.ground ? 1 : 0.4) * (mag > 0 ? 1 : 3) * DT);
      let dx = p.vx / sp, dz = p.vz / sp;
      if (mag > 0) { const k = Math.min(1, s.turn * DT); dx += (ix / mag - dx) * k; dz += (iz / mag - dz) * k; const n = hyp(dx, dz) || 1; dx /= n; dz /= n; }
      p.vx = dx * ns; p.vz = dz * ns; return;
    }
    const tx = ix * top, tz = iz * top, ex = tx - p.vx, ez = tz - p.vz, e = hyp(ex, ez), rate = mag > 0 ? a : p.ground ? s.brake * DT : a * 0.25;
    if (e <= rate) { p.vx = tx; p.vz = tz; } else { p.vx += ex / e * rate; p.vz += ez / e * rate; }
  }
  tryJump(h) { const p = this.p; if (p.buf > 0 && (p.ground || p.coy > 0)) { p.vy = Math.sqrt(2 * G * h); p.ground = false; p.coy = 0; p.buf = 0; p.cut = false; this.ev('jump'); return true; } return false; }
  /** Gravity every step (it is what keeps the player pressed to the floor); letting go of jump early halves the rise. */
  gravity(inp) { const p = this.p; p.vy -= G * DT; if (!inp.jump && p.vy > 0 && !p.cut) { p.vy *= 0.5; p.cut = true; } if (p.vy < -45) p.vy = -45; }

  runner(inp, ix, iz, mag, jp, ap, ar, dp) {
    const p = this.p, s = this.s;
    if (p.homing) {
      const t = p.homing, dx = t.x - p.x, dy = t.y - (p.y + 0.6), dz = t.z - p.z, d = hyp(dx, dy, dz) || 1, hd = hyp(dx, dz);
      p.homeT -= DT; p.atk = 0.15;
      if (p.homeT <= 0 || t.alive === false) p.homing = null;
      else { p.vx = dx / d * s.homing; p.vy = dy / d * s.homing; p.vz = dz / d * s.homing; if (hd > 0.1) { p.fx = dx / hd; p.fz = dz / hd; } return; }
    }
    p.spin = !!inp.act && p.ground && hyp(p.vx, p.vz) > 3;
    if (p.spin) { p.atk = 0.1; this.loco(ix, iz, mag, 2, s.accel, true); } else this.loco(ix, iz, mag, s.top, s.accel, true);
    if (ap && !p.ground && !p.stomp) { p.stomp = true; p.vy = -34; p.vx *= 0.3; p.vz *= 0.3; this.ev('dash'); }
    if (p.stomp) p.atk = 0.1;
    if (dp && p.burstCd <= 0) { const sp = Math.max(hyp(p.vx, p.vz), s.burst); p.vx = p.fx * sp; p.vz = p.fz * sp; p.burstCd = 1.1; p.atk = Math.max(p.atk, 0.4); this.ev('dash'); }
    if (!this.tryJump(s.jumpH) && jp && !p.ground) {
      const t = this.lockTarget(s.lock, 0.1);
      if (t) { p.homing = t; p.homeT = 0.7; p.buf = 0; p.stomp = false; this.ev('home'); }
      else if (!p.airDash) { p.airDash = true; const sp = Math.max(hyp(p.vx, p.vz), s.airDash); p.vx = p.fx * sp; p.vz = p.fz * sp; p.vy = Math.max(p.vy, 3); p.cut = true; p.buf = 0; p.atk = Math.max(p.atk, 0.3); this.ev('dash'); }
    }
    this.gravity(inp);
  }

  seeker(inp, ix, iz, mag, jp, ap, ar, dp) {
    const p = this.p, s = this.s;
    if (p.dig > 0) { p.dig -= DT; p.vx = p.vz = 0; if (p.dig <= 0) { const d = this.digSpot(); if (d) this.take(d); } this.gravity(inp); return; }
    if (p.glide && !mag) { ix = p.fx; iz = p.fz; mag = 1; }
    this.loco(ix, iz, mag, p.glide ? s.glideSpeed : s.top, s.accel, false);
    if (!this.tryJump(s.jumpH) && jp && !p.ground && p.airJumps < s.airJumps) { p.airJumps++; p.vy = Math.sqrt(2 * G * s.jump2); p.cut = false; p.buf = 0; p.stomp = false; this.ev('jump2'); }
    if (ap && p.punchCd <= 0) {
      if (p.ground) { if (this.digSpot()) { p.dig = s.digTime; this.ev('dig'); } else { p.atk = 0.28; p.punchCd = 0.42; p.vx += p.fx * 6; p.vz += p.fz * 6; this.ev('punch'); } }
      else if (!p.stomp) { p.stomp = true; p.vy = -30; p.vx *= 0.3; p.vz *= 0.3; this.ev('dash'); }
    }
    if (p.stomp) p.atk = 0.1;
    if (dp && p.scanCd <= 0) { p.scan = s.scanTime; p.scanCd = s.scanCd; this.ev('scan'); }
    p.glide = !p.ground && !!inp.jump && p.vy < -1 && !p.stomp;
    this.gravity(inp);
    if (p.glide && p.vy < -s.glideFall) p.vy = -s.glideFall;
  }

  mech(inp, ix, iz, mag, jp, ap, ar, dp) {
    const p = this.p, s = this.s;
    if (p.dashT <= 0) this.loco(ix, iz, mag, s.top, s.accel, false);
    this.tryJump(s.jumpH);
    if (dp && p.burstCd <= 0) { const dx = mag > 0 ? ix / mag : p.fx, dz = mag > 0 ? iz / mag : p.fz; p.burstCd = 0.9; p.dashT = 0.22; p.vx = dx * s.dash; p.vz = dz * s.dash; p.inv = Math.max(p.inv, 0.3); this.ev('dash'); }
    p.hovering = !p.ground && !!inp.jump && p.vy < 2 && p.fuel > 0;
    this.gravity(inp);
    if (p.hovering) { p.fuel -= DT; p.vy = Math.min(2.5, p.vy + (G + 14) * DT); }
    if (p.ground) p.fuel = Math.min(s.hover, p.fuel + DT * 2);
    if (inp.act) {   // charging: square up to the nearest target, then paint one lock after another
      p.lockT += DT;
      const near = this.lockTarget(s.lockRange, -1, false);
      if (near) { const dx = near.x - p.x, dz = near.z - p.z, d = hyp(dx, dz) || 1; p.fx = dx / d; p.fz = dz / d; }
      if (p.lockT >= 0.22 && p.locks.length < s.locks) { const t = this.nextLock(); if (t) { p.locks.push(t); p.lockT = 0.22 - s.lockRate; this.ev('lock', t); } }
    }
    if (ar) {
      const list = p.locks.length ? p.locks : [this.lockTarget(s.lockRange, 0.3, false)];
      list.forEach((t, i) => this.bolts.push({ x: p.x + p.fx * 0.8, y: p.y + p.h * 0.65, z: p.z + p.fz * 0.8, vx: p.fx, vy: 0, vz: p.fz, t: t || null, life: 1.6, delay: i * 0.05 }));
      p.locks = []; p.lockT = 0; this.ev('fire');
    }
  }

  // ---- collision: boxes only, one axis at a time, short sub-steps at speed, low ledges are stepped onto ------------------------
  move() {
    const p = this.p, n = Math.max(1, Math.ceil(hyp(p.vx, p.vy, p.vz) * DT / 0.4)), dt = DT / n; let grounded = false;
    for (let i = 0; i < n; i++) {
      for (const ax of ['x', 'z']) {
        const v = ax === 'x' ? p.vx : p.vz; if (!v) continue;
        p[ax] += v * dt;
        let b = this.hit(p.x, p.y, p.z), guard = 0;
        while (b && guard++ < 4) {
          if (b.y1 - p.y <= STEP && p.vy <= 3 && !this.hit(p.x, b.y1, p.z)) p.y = b.y1;
          else if (ax === 'x') { p.x = v > 0 ? b.x0 - p.r - EPS : b.x1 + p.r + EPS; p.vx = 0; }
          else { p.z = v > 0 ? b.z0 - p.r - EPS : b.z1 + p.r + EPS; p.vz = 0; }
          b = this.hit(p.x, p.y, p.z);
        }
      }
      p.y += p.vy * dt;
      let b = this.hit(p.x, p.y, p.z), guard = 0;
      while (b && guard++ < 4) { if (p.vy <= 0) { p.y = b.y1; grounded = true; } else p.y = b.y0 - p.h - EPS; p.vy = 0; b = this.hit(p.x, p.y, p.z); }
    }
    if (grounded && !p.ground) this.land();
    p.ground = grounded;
    if (p.y < this.lv.killY) this.die(true);
  }
  land() {
    const p = this.p;
    if (p.stomp) {
      const d = this.role === 'seeker' && this.digSpot(); if (d) this.take(d);
      for (const e of this.enemies) if (e.alive && hyp(e.x - p.x, e.z - p.z) < 3.2 && Math.abs(e.y - p.y) < 3) this.hurtEnemy(e, 2);
      this.ev('stomp');
    } else this.ev('land');
    p.stomp = false; p.airJumps = 0; p.airDash = false; p.homing = null;
  }
  take(sh) { sh.got = true; this.shardsGot++; this.ev('shard', sh); if (this.shardsGot >= this.shards.length) this.winT = 0.8; }
  die(fell) { const p = this.p; if (p.dead > 0 || this.done) return; p.dead = 0.9; p.vx = p.vy = p.vz = 0; p.homing = null; p.locks = []; this.ev(fell ? 'fall' : 'down'); }
  hurt(sx, sz) {
    const p = this.p; if (p.inv > 0 || p.dead > 0 || this.done || this.winT > 0) return;
    let dx = p.x - sx, dz = p.z - sz; if (!dx && !dz) { dx = -p.fx; dz = -p.fz; } const d = hyp(dx, dz) || 1;
    p.hearts--; p.inv = 1.6; p.vx = dx / d * 9; p.vz = dz / d * 9; p.vy = 8; p.cut = true; p.homing = null; p.stomp = false; p.locks = []; p.dig = 0; p.dashT = 0;
    this.ev('hurt'); if (p.hearts <= 0) this.die(false);
  }
  /** melee hits respect a short grace time so one touch counts once; bolts always count. */
  hurtEnemy(e, dmg, melee) {
    if (e === this.boss) {
      if (e.state !== 'open' || !e.alive || (melee && e.hurt > 0)) return false;
      e.hp -= dmg; e.hurt = 0.25; this.ev('bosshit', e);
      if (e.hp <= 0) { e.alive = false; e.state = 'dead'; this.winT = 1.6; for (const x of this.enemies) x.alive = false; this.orbs = []; this.rings = []; this.ev('boom', e); }
      return true;
    }
    if (!e.alive || (melee && e.hurt > 0)) return false;
    e.hp -= dmg; e.hurt = 0.2;
    if (e.hp <= 0) {
      e.alive = false; this.ev('boom', e);
      for (const g of this.lv.solids) if (g.gate !== undefined && !g.open && !this.enemies.some(x => x.alive && x.g === g.gate)) { g.open = true; this.ev('gate', { x: (g.x0 + g.x1) / 2, y: 1.5, z: g.z0 }); }
    }
    return true;
  }
  bounce(t, v) {
    const p = this.p; p.homing = null; p.stomp = false; p.airDash = false; p.airJumps = 0;
    if (v < 0) { const dx = p.x - t.x, dz = p.z - t.z, d = hyp(dx, dz) || 1; p.vx = dx / d * -v; p.vz = dz / d * -v; p.vy = this.role === 'seeker' && p.ground ? 4 : 12; p.cut = true; }
    else if (!p.ground) { p.vx = p.fx * v; p.vz = p.fz * v; p.vy = 12; p.cut = true; }
  }

  touch() {
    const p = this.p, lv = this.lv, cy = p.y + p.h / 2, near = (o, r, v = 1.8) => Math.abs(o.x - p.x) < r && Math.abs(o.z - p.z) < r && Math.abs(o.y - cy) < v;
    for (const s of lv.sparks) if (!s.got && near(s, 1.5)) { s.got = true; this.sparks++; this.ev('spark', s); }
    for (const h of lv.hearts) if (!h.got && p.hearts < this.s.hearts && near(h, 1.5)) { h.got = true; p.hearts++; this.ev('heart', h); }
    for (const sh of this.shards) if (!sh.got && !sh.buried && near(sh, 1.8, 2.2)) this.take(sh);
    for (const sp of lv.springs) if (hyp(sp.x - p.x, sp.z - p.z) < 1.5 && p.y - sp.y < 1.2 && p.y - sp.y > -1.5 && (p.vy <= 2 || p.homing === sp)) { p.vy = sp.v; p.cut = true; p.homing = null; p.airDash = false; p.airJumps = 0; p.stomp = false; this.ev('spring', sp); }
    if (p.ground) for (const d of lv.pads) if (Math.abs(d.x - p.x) < 2.4 && Math.abs(d.z - p.z) < 2.4 && Math.abs(d.y - p.y) < 1) { if (hyp(p.vx, p.vz) < d.v - 1) this.ev('pad', d); p.vx = d.dx * d.v; p.vz = d.dz * d.v; p.fx = d.dx; p.fz = d.dz; }
    lv.checks.forEach((c, i) => { if (i !== this.checkId && hyp(c.x - p.x, c.z - p.z) < 3.5 && Math.abs(c.y - p.y) < 3) { this.checkId = i; this.check = { x: c.x, y: c.y + 0.1, z: c.z, yaw: c.yaw }; this.ev('check', c); } });
    for (const h of lv.hazards) if (p.x + p.r > h.x0 && p.x - p.r < h.x1 && p.y + p.h > h.y0 && p.y < h.y1 && p.z + p.r > h.z0 && p.z - p.r < h.z1) this.hurt(p.x + p.vx, p.z + p.vz);
    for (const e of this.enemies) {
      if (!e.alive || hyp(e.x - p.x, e.y - cy, e.z - p.z) > e.r + 0.8) continue;
      if (p.atk > 0) { if (this.hurtEnemy(e, this.role === 'runner' || p.stomp ? 2 : 1, true)) this.bounce(e, 8); } else if (e.hurt <= 0) this.hurt(e.x, e.z);
    }
    const b = this.boss;
    if (b && b.alive && hyp(b.x - p.x, b.y - cy, b.z - p.z) < b.r + 0.8) {
      if (p.atk > 0) { if (!this.hurtEnemy(b, this.role === 'runner' || p.stomp ? 2 : 1, true) && b.state !== 'open') this.ev('clang', b); this.bounce(b, -9); }
      else if (b.state !== 'open') this.hurt(b.x, b.z);   // an open boss is stunned: bumping into it is safe
    }
    for (const o of this.orbs) if (hyp(o.x - p.x, o.y - cy, o.z - p.z) < 1.0) { o.life = 0; this.hurt(o.x - o.vx, o.z - o.vz); }
    for (const r of this.rings) if (Math.abs(hyp(p.x - r.x, p.z - r.z) - r.r) < 0.7 && p.y < r.y + 0.9) this.hurt(r.x, r.z);
    const g = lv.goal; if (g && hyp(g.x - p.x, g.z - p.z) < g.r && Math.abs(g.y - p.y) < 4) this.win();
  }

  // ---- everything that is not the player ---------------------------------------------------------------------------------
  shoot(src, n = 1) {
    const p = this.p, dx = p.x - src.x, dy = p.y + 0.8 - src.y, dz = p.z - src.z, d = hyp(dx, dy, dz) || 1, a0 = Math.atan2(dx, dz), h = hyp(dx, dz) / d;
    for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.3; this.orbs.push({ x: src.x, y: src.y, z: src.z, vx: Math.sin(a) * h * 10, vy: dy / d * 10, vz: Math.cos(a) * h * 10, life: 4.5 }); }
    this.ev('orb', src);
  }
  summon(n) {
    const b = this.boss; let alive = this.enemies.filter(e => e.alive).length;
    for (let i = 0; i < n && alive < 4; i++, alive++) { const a = this.time * 1.7 + i * 2.4; this.addEnemy({ kind: 'drone', x: b.x + Math.sin(a) * 9, y: 1.4, z: b.z + Math.cos(a) * 9, chase: 3.5 }); }
  }
  world() {
    const p = this.p, bo = this.boss;
    for (const e of this.enemies) {
      if (!e.alive) continue; e.t += DT; e.hurt = Math.max(0, e.hurt - DT);
      if (e.kind === 'drone') {
        if (e.chase) { const dx = p.x - e.x, dz = p.z - e.z, d = hyp(dx, dz); if (d < 26 && d > 0.5 && p.dead <= 0) { e.x += dx / d * e.chase * DT; e.z += dz / d * e.chase * DT; } }
        else { const k = Math.sin(e.t * 0.9); e.x = e.x0 + (e.px || 0) * k; e.z = e.z0 + (e.pz || 0) * k; }
        e.y = e.y0 + Math.sin(e.t * 2) * 0.25;
      } else { e.cd -= DT; if (e.cd <= 0 && p.dead <= 0 && hyp(p.x - e.x, p.z - e.z) < 30) { e.cd = 2.6; this.shoot(e); } }
    }
    for (const o of this.orbs) { o.life -= DT; o.x += o.vx * DT; o.y += o.vy * DT; o.z += o.vz * DT; if (this.inside(o.x, o.y, o.z)) o.life = 0; }
    this.orbs = this.orbs.filter(o => o.life > 0);
    for (const b of this.bolts) {
      if (b.delay > 0) { b.delay -= DT; b.x = p.x + p.fx * 0.8; b.y = p.y + p.h * 0.65; b.z = p.z + p.fz * 0.8; continue; }
      b.life -= DT; const t = b.t;
      if (t && t.alive && (t !== bo || t.state === 'open')) { const dx = t.x - b.x, dy = t.y - b.y, dz = t.z - b.z, d = hyp(dx, dy, dz) || 1; b.vx = dx / d; b.vy = dy / d; b.vz = dz / d; }
      b.x += b.vx * 46 * DT; b.y += b.vy * 46 * DT; b.z += b.vz * 46 * DT;
      for (const e of this.enemies) if (e.alive && hyp(e.x - b.x, e.y - b.y, e.z - b.z) < e.r + 0.6) { this.hurtEnemy(e, 1); b.life = 0; break; }
      if (b.life > 0 && bo && bo.alive && hyp(bo.x - b.x, bo.y - b.y, bo.z - b.z) < bo.r + 0.6) { if (!this.hurtEnemy(bo, 1)) this.ev('clang', bo); b.life = 0; }
      if (b.life > 0 && this.inside(b.x, b.y, b.z)) b.life = 0;
    }
    this.bolts = this.bolts.filter(b => b.life > 0);
    for (const r of this.rings) r.r += 13 * DT;
    this.rings = this.rings.filter(r => r.r < r.max);
    if (bo && bo.alive) {
      bo.t += DT; bo.hurt = Math.max(0, bo.hurt - DT);
      const ph = bo.phase = bo.hp > bo.max * 0.66 ? 0 : bo.hp > bo.max * 0.33 ? 1 : 2;
      if (bo.state === 'intro') { if (bo.t > 2) { bo.state = 'attack'; bo.t = 0; } }
      else if (bo.state === 'attack') {
        bo.y += (bo.hi - bo.y) * Math.min(1, 4 * DT); bo.ringT -= DT; bo.orbT -= DT;
        if (bo.ringT <= 0) { bo.ringT = bo.ring[ph]; this.rings.push({ x: bo.x, z: bo.z, y: bo.floor, r: 2, max: bo.reach }); this.ev('ring', bo); }
        if (bo.orbT <= 0 && p.dead <= 0) { bo.orbT = bo.orb[ph]; this.shoot(bo, bo.spread && ph > 0 ? 3 : 1); }
        if (bo.t > bo.atkTime) { bo.state = 'open'; bo.t = 0; this.ev('open', bo); }
      } else if (bo.state === 'open') {
        bo.y += (bo.lo - bo.y) * Math.min(1, 5 * DT);
        if (bo.t > bo.openTime) { bo.state = 'attack'; bo.t = 0; bo.ringT = 0.8; bo.orbT = 1.2; if (bo.minions && ph > 0) this.summon(ph); this.ev('shield', bo); }
      }
    }
  }
}
