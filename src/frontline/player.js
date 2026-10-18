// The player: first-person movement and technique, weapon handling, equipment, scorestreak flow, camera.
import * as THREE from 'three';
import { Actor, STANCE, HULL, EYE } from './actors.js';
import { moveBody } from './collision.js';
import { Weapon, spreadDir } from './weapons.js';
import { MELEE, LETHALS, TACTICALS, STREAKS, sanitizeLoadout } from './data.js';
import { clamp, lerp, smooth, damp, approach, wrapPI, rnd, DEG, angDiff } from './util.js';

const G = 20, WALK = 4.15, SPRINT = 6.5, TAC_SPEED = 8.2, JUMP_V = 6.0;
const TAC_MAX = 2.6, TAC_COOL = 3.4, SLIDE_DUR = 0.95, SLIDE_V0 = 8.2, PRONE_HOLD = 0.34;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = { x: 0, y: 0, z: 0 }, _o = { x: 0, y: 0, z: 0 }, _vel = { x: 0, y: 0, z: 0 };

export class Player extends Actor {
  constructor(match) {
    super(match, { name: 'You', team: 0, color: 0x39a0ff });
    this.isPlayer = true;
    this.rec = { p: 0, y: 0, tp: 0, ty: 0, last: -9 };
    this.bobPhase = 0; this.bobAmp = 0; this.stepAcc = 0; this.eyeH = EYE[0]; this.shake = 0; this.roll = 0; this.landDip = 0; this.flinch = { x: 0, y: 0, r: 0 }; this._roll = 0;
    this.loadout = null; this.weapons = [null, null]; this.cur = 0; this.hold = 'gun'; this.meleeId = 'combat'; this.lastGun = 0;
    this.lethal = { id: 'frag', n: 2 }; this.tactical = { id: 'flash', n: 2 };
    this.streakSlots = []; this.adsT = 0; this.sprintT = 0; this.tacT = 0; this.slideT = 0; this.mantleT = 0; this.equip = 0;
    this.act = null;            // exclusive action: draw | switch | quick | melee | throw | mantle | call
    this.sprinting = false; this.tac = { on: false, t: 0, cool: 0 }; this.slide = { on: false, t: 0, dir: [0, 1], v0: 8, cool: 0 }; this.dive = { on: false, t: 0 }; this.proneLock = 0;
    this.coyote = 0; this.jumpBuf = 0; this.mantleCool = 0; this.sprintOutT = 0; this.air = false;
    this.bT = 0; this.bConsumed = true; this._relDone = false; this._cue = 0; this.boltCueT = 0;
    this.regenDelay = 0; this.moveF = 0; this.spreadDeg = 0; this.scopeKick = 0; this.interactT = 0; this.prompt = ''; this.promptKind = ''; this.interactTarget = null;
    this.flashT = 0; this.flashMax = 1; this.stunT = 0; this.sensorT = 0; this.sensorPing = 0; this.glintT = 0;
    this.targeting = null; this.lock = { t: 0, target: null, state: 'none', tone: 0 }; this.meleeAlt = false; this.bladeReady = true; this.bladeT = 0;
    this.deadT = 0; this.killer = null;
    this.lookYaw = 0; this.lookPitch = 0; this.aimFriction = 1; this.afT = 0;
    this.xp = 0; this.sessionXp = 0; this.lastKillT = -99; this.multi = 0; this.killsThisLife = 0;
    this.arc = null; this.scoped = false; this._vm = { reload: null };
  }

  // ---------------------------------------------------------------------------------------------------------
  // life cycle
  // ---------------------------------------------------------------------------------------------------------
  setLoadout(l) {
    this.loadout = sanitizeLoadout(l);
    const L = this.loadout;
    this.weapons = [new Weapon(L.primary, L.att[L.primary]), new Weapon(L.secondary, L.att[L.secondary])];
    this.meleeId = L.melee; this.lethal = { id: L.lethal, n: LETHALS[L.lethal].count }; this.tactical = { id: L.tactical, n: TACTICALS[L.tactical].count };
    const old = this.streakSlots;     // streak progress survives respawns
    this.streakSlots = L.streaks.map((id, i) => ({ id, cost: STREAKS[id].cost, prog: old[i]?.id === id ? old[i].prog : 0, ready: old[i]?.id === id ? old[i].ready : false, def: STREAKS[id] }));
    this.cur = 0; this.lastGun = 0; this.hold = 'gun'; this.bladeReady = true;
  }
  /** Place the player and start a new life. spawn: {x,y,z,h} */
  spawnAt(s, firstTime = false) {
    const b = this.body, m = this.match;
    b.x = s.x; b.y = s.y; b.z = s.z; b.vx = b.vy = b.vz = 0; b.onGround = true; this.heading = s.h || 0; this.pitch = 0;
    this.resetLife(); this.setStance(STANCE.STAND); this.eyeH = EYE[0];
    this.rec.p = this.rec.y = this.rec.tp = this.rec.ty = 0; this.rec.last = -9;
    this.setLoadout(this.loadout || {});
    this.sprinting = false; this.tac.on = false; this.tac.cool = 0; this.slide.on = false; this.dive.on = false; this.adsT = 0; this.sprintT = 0; this.tacT = 0; this.slideT = 0; this.mantleT = 0;
    this.flashT = 0; this.stunT = 0; this.sensorT = 0; this.targeting = null; this.deadT = 0; this.killer = null; this.regenDelay = 0; this.landDip = 0; this.shake = 0; this.roll = 0; this._roll = 0;
    this.invulnT = firstTime ? 0.5 : 1.8; this.killsThisLife = 0; this.multi = 0; this.proneLock = 0; this.mantleCool = 0; this.sprintOutT = 0; this.bConsumed = true;
    this.equip = 0; this.act = { type: 'draw', t: 0, dur: 0.6 };
    this.lock.state = 'none'; this.lock.t = 0; this.lock.target = null;
    m.vm?.setWeapon(this.weapons[0]); m.vm?.cancelAnim();
    m.streaks?.hideMarker?.(); this.hideArc();
    this.updateShapes();
  }
  get weapon() { return this.hold === 'gun' ? this.weapons[this.cur] : null; }
  get eye() { return this.body.y + this.eyeH; }
  get cooking() { return this.act?.type === 'throw' && (this.act.phase === 'hold' || this.act.phase === 'pin'); }

  // ---------------------------------------------------------------------------------------------------------
  // per-frame update
  // ---------------------------------------------------------------------------------------------------------
  update(dt, ctl) {
    const m = this.match;
    if (!this.alive) { this.updateDead(dt, ctl); return; }
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.flashT = Math.max(0, this.flashT - dt); this.stunT = Math.max(0, this.stunT - dt); this.glintT = Math.max(0, this.glintT - dt);
    this.mantleCool = Math.max(0, this.mantleCool - dt); this.proneLock = Math.max(0, this.proneLock - dt); this.sprintOutT = Math.max(0, this.sprintOutT - dt);
    this.slide.cool = Math.max(0, this.slide.cool - dt); this.tac.cool = Math.max(0, this.tac.cool - dt);
    this.prompt = ''; this.promptKind = '';
    for (const x of this.weapons) x.update(dt);
    if (this.sensorT > 0) { this.sensorT -= dt; this.sensorPing -= dt; if (this.sensorPing <= 0) { this.sensorPing = 1.6; m.sound.ui('sensorPing'); } }
    if (!this.bladeReady) { this.bladeT -= dt; if (this.bladeT <= 0) this.bladeReady = true; }
    if (this.boltCueT > 0 && (this.boltCueT -= dt) <= 0) m.sound.bolt();

    this.doLook(dt, ctl);
    this.doStance(dt, ctl);
    this.doMovement(dt, ctl);
    this.doActions(dt, ctl);
    this.doWeapon(dt, ctl);
    this.doStreaks(dt, ctl);
    this.doInteract(dt, ctl);
    this.regen(dt);
    this.updateShapes();
    this.moveF = clamp(Math.hypot(this.body.vx, this.body.vz) / SPRINT, 0, 1);
    this.noise(dt);
  }

  // ---------------------------------------------------------------------------------------------------------
  // look
  // ---------------------------------------------------------------------------------------------------------
  doLook(dt, ctl) {
    const w = this.weapon, m = this.match;
    let sx = ctl.lookX, sy = ctl.lookY;
    const zoom = w ? lerp(1, w.stats.zoom, this.adsT) : 1;          // zoomed views need finer control
    const k = 1 / (1 + (zoom - 1) * 0.55);
    sx *= k; sy *= k;
    if (this.stunT > 0) { const q = Math.min(1, this.stunT); sx += Math.sin(m.time * 9) * 0.0016 * q; sy += Math.cos(m.time * 7) * 0.0012 * q; }
    if (ctl.usingPad && m.settings.aimAssist && (sx || sy)) { this.afT -= dt; if (this.afT <= 0) { this.afT = 0.08; this.aimFriction = this.computeFriction(); } sx *= this.aimFriction; sy *= this.aimFriction; } else this.aimFriction = 1;
    if (this.act?.type === 'mantle') { sx *= 0.35; sy *= 0.35; }
    this.heading = wrapPI(this.heading - sx); this.pitch = clamp(this.pitch + sy, -1.45, 1.45);
    this.lookYaw = sx; this.lookPitch = sy;
    // recoil: the kick target decays after a short delay, the visible offset follows it
    const r = this.rec, rc = w?.stats.recoil;
    if (m.time - r.last > (rc?.delay ?? 0.1)) { const rate = (rc?.recover ?? 7) * (this.adsT > 0.5 ? 1.15 : 1); r.tp = damp(r.tp, 0, rate, dt); r.ty = damp(r.ty, 0, rate * 1.1, dt); }
    r.p = damp(r.p, r.tp, 38, dt); r.y = damp(r.y, r.ty, 38, dt);
    this.flinch.x = damp(this.flinch.x, 0, 9, dt); this.flinch.y = damp(this.flinch.y, 0, 9, dt); this.flinch.r = damp(this.flinch.r, 0, 7, dt);
  }
  computeFriction() {
    const m = this.match, eye = this.eye; let best = 1;
    const yaw = this.heading + this.rec.y, pit = this.pitch + this.rec.p, fx = Math.sin(yaw) * Math.cos(pit), fy = Math.sin(pit), fz = Math.cos(yaw) * Math.cos(pit);
    for (const t of m.hostilesOf(this)) {
      if (!t.alive || !t.shapes) continue;
      const s = t.shapes[1], cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2, cz = (s.az + s.bz) / 2;
      const px = cx - this.body.x, py = cy - eye, pz = cz - this.body.z, d = Math.hypot(px, py, pz); if (d > 75 || d < 1) continue;
      const ang = Math.acos(clamp((px * fx + py * fy + pz * fz) / d, -1, 1));
      const cone = (0.07 + 0.5 / d) * (this.adsT > 0.3 ? 0.9 : 1);
      if (ang < cone && !m.level.blocked(this.body.x, eye, this.body.z, cx, cy, cz)) best = Math.min(best, lerp(0.5, 0.85, ang / cone));
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------------------------
  // stance: crouch / prone / slide / dive / sprint
  // ---------------------------------------------------------------------------------------------------------
  canFit(h) { const b = this.body; return !this.match.level.overlaps(b.x - b.hw + 0.01, b.y + 0.02, b.z - b.hw + 0.01, b.x + b.hw - 0.01, b.y + h, b.z + b.hw - 0.01); }
  tryStance(s) {
    if (s === STANCE.STAND && !this.canFit(HULL[0])) { if (this.canFit(HULL[1])) s = STANCE.CROUCH; else return false; }
    if (s === STANCE.CROUCH && !this.canFit(HULL[1])) return false;
    if (this.stance !== s) this.setStance(s);
    return true;
  }
  doStance(dt, ctl) {
    const b = this.body, w = this.weapon;
    const fwd = ctl.moveY > 0.3, cooking = this.cooking;
    const canSprint = this.stance === STANCE.STAND && fwd && this.act?.type !== 'mantle' && !this.slide.on && !this.dive.on && !cooking && !this.targeting && this.stunT <= 0.01;
    // ---- sprint (latched on pad, held on keyboard)
    if (ctl.usingPad && ctl.sprintLatch && (ctl.adsPressed || ctl.firePressed || !fwd || this.stance !== STANCE.STAND)) ctl.sprintLatch = false;
    let wantSprint = ctl.sprintHeld && canSprint && b.onGround && this.adsT < 0.2 && !(ctl.fire && w && !w.reload);
    if (ctl.adsPressed || ctl.firePressed) wantSprint = false;
    if (this.sprinting && !wantSprint) this.sprintOutT = w ? w.stats.sprintOut : 0.2;
    this.sprinting = wantSprint;
    // ---- tactical sprint: double-tap L3 / Shift (faster, weapon raised, limited time)
    if (ctl.sprintDouble && canSprint && this.tac.cool <= 0 && b.onGround && !this.tac.on) { this.tac.on = true; this.tac.t = 0; this.sprinting = true; this.match.ui.toast?.('Tactical sprint'); }
    if (this.tac.on) {
      this.tac.t += dt;
      if (!fwd || this.tac.t > TAC_MAX || !canSprint || ctl.adsPressed || ctl.firePressed) { this.tac.on = false; this.tac.cool = TAC_COOL; this.sprintOutT = 0.3; }
      else this.sprinting = true;
    }
    // ---- B: tap = crouch, hold = prone; while sprinting = slide; during tactical sprint = dolphin dive
    if (this.slide.on) this.updateSlide(dt, ctl);
    else if (this.dive.on) this.updateDive(dt, ctl);
    else {
      if (ctl.crouchPressed) {
        this.bT = 0; this.bConsumed = false;
        if (this.tac.on && b.onGround) { this.startDive(); this.bConsumed = true; }
        else if (this.sprinting && b.onGround && this.slide.cool <= 0 && Math.hypot(b.vx, b.vz) > 4.5) { this.startSlide(); this.bConsumed = true; }
      }
      if (ctl.crouchHeld) { this.bT += dt; if (!this.bConsumed && this.bT >= PRONE_HOLD) { this.bConsumed = true; this.toggleProne(); } }
      if (ctl.crouchReleased) { if (!this.bConsumed && this.bT < PRONE_HOLD) this.toggleCrouch(); this.bConsumed = true; }
      if (this.proneLock <= 0 && ctl.jumpPressed && this.stance === STANCE.PRONE) { this.tryStance(STANCE.STAND); ctl.jumpPressed = false; }
      if (this.stance !== STANCE.STAND) this.sprinting = false;
    }
    this.sprintT = damp(this.sprintT, this.sprinting && !this.tac.on ? 1 : 0, 11, dt);
    this.tacT = damp(this.tacT, this.tac.on ? 1 : 0, 12, dt);
    this.slideT = damp(this.slideT, this.slide.on ? 1 : 0, 12, dt);
  }
  toggleCrouch() {
    if (this.stance === STANCE.CROUCH) this.tryStance(STANCE.STAND);
    else if (this.stance === STANCE.PRONE) { if (this.proneLock <= 0) this.tryStance(STANCE.CROUCH); }
    else if (this.stance === STANCE.STAND) { this.setStance(STANCE.CROUCH); this.sprinting = false; }
  }
  toggleProne() {
    if (this.stance === STANCE.PRONE) { if (this.proneLock <= 0) this.tryStance(STANCE.STAND); }
    else { this.setStance(STANCE.PRONE); this.sprinting = false; this.tac.on = false; this.match.sound.ui('land', { vol: 0.25 }); }
  }
  startSlide() {
    const b = this.body, sp = Math.hypot(b.vx, b.vz), s = this.slide;
    s.on = true; s.t = 0; s.v0 = Math.max(sp, SLIDE_V0); s.dir = sp > 0.5 ? [b.vx / sp, b.vz / sp] : [Math.sin(this.heading), Math.cos(this.heading)];
    this.setStance(STANCE.SLIDE); this.sprinting = false; this.tac.on = false; this.match.sound.ui('slide', { vol: 0.8 }); this.match.ui.rumble?.(0.1, 0.25, 160);
  }
  updateSlide(dt, ctl) {
    const b = this.body, s = this.slide; s.t += dt;
    const k = clamp(s.t / SLIDE_DUR, 0, 1), spd = lerp(s.v0, 2.6, k * 0.5 + k * k * (3 - 2 * k) * 0.5);
    if (Math.hypot(ctl.moveX, ctl.moveY) > 0.3) {     // gentle steering
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
      const wx = fx * ctl.moveY + rx * ctl.moveX, wz = fz * ctl.moveY + rz * ctl.moveX, wl = Math.hypot(wx, wz) || 1;
      const cur = Math.atan2(s.dir[0], s.dir[1]), want = Math.atan2(wx / wl, wz / wl), d = clamp(angDiff(cur, want), -1.3 * dt, 1.3 * dt);
      s.dir = [Math.sin(cur + d), Math.cos(cur + d)];
    }
    if (b.onGround) { b.vx = s.dir[0] * spd; b.vz = s.dir[1] * spd; }
    const cancel = s.t > 0.14 && (ctl.jumpPressed || ctl.crouchPressed);
    if (cancel || s.t >= SLIDE_DUR || (b.hitWall && s.t > 0.2)) {
      const wasJump = ctl.jumpPressed && cancel;
      s.on = false; s.cool = cancel ? 0.15 : 0.6;
      if (cancel) {
        if (this.canFit(HULL[0])) this.setStance(STANCE.STAND); else if (this.canFit(HULL[1])) this.setStance(STANCE.CROUCH);
        const keep = Math.hypot(b.vx, b.vz), boost = Math.min(keep * 1.04 + 0.6, SPRINT * 1.12), dl = keep || 1;
        b.vx = b.vx / dl * boost; b.vz = b.vz / dl * boost;
        if (wasJump && b.onGround) { b.vy = JUMP_V * 0.95; b.onGround = false; this.match.sound.ui('jump', { vol: 0.5 }); }
        this.match.ui.toast?.('Slide cancel');
        this.bConsumed = true;
      } else if (this.canFit(HULL[1])) this.setStance(STANCE.CROUCH);
      ctl.jumpPressed = false; ctl.crouchPressed = false;
    }
  }
  startDive() {
    const b = this.body, d = this.dive; d.on = true; d.t = 0; this.tac.on = false; this.tac.cool = TAC_COOL; this.sprinting = false;
    this.setStance(STANCE.DIVE);
    b.vx = Math.sin(this.heading) * 9.2; b.vz = Math.cos(this.heading) * 9.2; b.vy = 3.6; b.onGround = false;
    this.match.sound.ui('jump', { vol: 0.7 }); this.match.sound.ui('slide', { vol: 0.5 });
  }
  updateDive(dt) {
    const b = this.body, d = this.dive; d.t += dt;
    if ((b.onGround && d.t > 0.12) || d.t > 1.2) {
      d.on = false; this.setStance(STANCE.PRONE); this.proneLock = 0.45; b.vx *= 0.6; b.vz *= 0.6; this.landDip = 0.12;
      this.match.sound.ui('land', { vol: 0.7 }); this.match.ui.rumble?.(0.2, 0.4, 120);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // movement
  // ---------------------------------------------------------------------------------------------------------
  doMovement(dt, ctl) {
    const b = this.body, m = this.match, w = this.weapon;
    if (this.act?.type === 'mantle') { this.updateMantle(dt); return; }
    // ---- jump / mantle (A near a ledge climbs it)
    if (ctl.jumpPressed) this.jumpBuf = 0.12; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.coyote = b.onGround ? 0.09 : Math.max(0, this.coyote - dt);
    const canJump = this.coyote > 0 && this.stance !== STANCE.PRONE && !this.dive.on && !this.slide.on;
    if ((this.jumpBuf > 0 || (ctl.jump && !b.onGround && b.vy < 2.8 && ctl.moveY > 0.3)) && this.mantleCool <= 0 && !this.slide.on && !this.dive.on && this.stance !== STANCE.PRONE) {
      const mt = this.findMantle();
      if (mt) { this.beginMantle(mt); return; }
    }
    if (this.jumpBuf > 0 && canJump) {
      b.vy = this.stance === STANCE.CROUCH ? JUMP_V * 0.82 : JUMP_V; b.onGround = false; this.coyote = 0; this.jumpBuf = 0;
      if (this.stance === STANCE.CROUCH && this.canFit(HULL[0])) this.setStance(STANCE.STAND);
      m.sound.ui('jump', { vol: 0.5 });
    }
    // ---- desired velocity
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    let mx = ctl.moveX, my = ctl.moveY; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    let speed = WALK * (this.hold === 'melee' ? 1.06 * MELEE[this.meleeId].speed : (w?.stats.speed ?? 1));
    if (this.stance === STANCE.CROUCH) speed *= 0.56; else if (this.stance === STANCE.PRONE) speed *= 0.27;
    if (this.adsT > 0.01) speed *= lerp(1, 0.62, smooth(this.adsT));
    if (this.sprinting) speed = (this.tac.on ? TAC_SPEED : SPRINT) * (w ? 0.85 + 0.15 * w.stats.speed : 1.04);
    if (my < -0.1) speed *= 0.82; else if (Math.abs(mx) > 0.5 && my < 0.3) speed *= 0.92;
    if (this.stunT > 0) speed *= 0.5;
    if (this.cooking || this.targeting) speed *= 0.92;
    if (!this.slide.on && !this.dive.on) {
      const tx = (fx * my + rx * mx) * speed, tz = (fz * my + rz * mx) * speed;
      const accel = b.onGround ? (this.stance === STANCE.PRONE ? 18 : 42) : 5.5;
      const dvx = tx - b.vx, dvz = tz - b.vz, dl = Math.hypot(dvx, dvz), step = accel * dt;
      if (b.onGround || ml > 0.1) { if (dl <= step) { b.vx = tx; b.vz = tz; } else { b.vx += dvx / dl * step; b.vz += dvz / dl * step; } }
      if (b.onGround && ml < 0.05) { const f = Math.max(0, 1 - 14 * dt); b.vx *= f; b.vz *= f; }
    }
    // ---- integrate with sub-steps (no tunnelling at low frame rates)
    const n = Math.max(1, Math.ceil(dt / 0.011)), h = dt / n;
    let landed = false, fall = 0;
    for (let i = 0; i < n; i++) {
      b.vy -= G * h;
      if (b.onGround && b.vy < 0) b.vy = -0.5;
      moveBody(m.level, b, h);
      if (b.landed) { landed = true; fall = Math.max(fall, b.fallSpeed); }
    }
    this.air = !b.onGround;
    if (landed) this.onLand(fall);
    if (b.y < (m.map.range?.course?.killY ?? -6)) m.onFell?.(this);
    // ---- bob + footsteps
    const sp = Math.hypot(b.vx, b.vz);
    if (b.onGround && sp > 0.4) this.bobPhase += sp * dt * (this.sprinting ? 1.25 : 1.6);
    this.bobAmp = damp(this.bobAmp, b.onGround && !this.slide.on ? clamp(sp / WALK, 0, 1.6) * (this.stance === STANCE.PRONE ? 0.3 : 1) : 0, 10, dt);
    if (b.onGround && sp > 1.0 && !this.slide.on) {
      this.stepAcc += sp * dt; const stride = this.sprinting ? 2.7 : this.stance === STANCE.CROUCH ? 1.6 : 2.1;
      if (this.stepAcc > stride) { this.stepAcc = 0; m.sound.ui('footstep', { vol: this.sprinting ? 0.5 : this.stance === STANCE.CROUCH ? 0.12 : 0.28, pitch: rnd(0.85, 1.15) }); }
    }
    this.eyeH = damp(this.eyeH, EYE[this.stance], 13, dt);
    if (this.landDip > 0) this.landDip = Math.max(0, this.landDip - dt * 0.5);
  }
  onLand(fall) {
    const m = this.match;
    if (fall > 3) { this.landDip = Math.min(0.16, fall * 0.014); m.sound.ui('land', { vol: clamp(fall / 8, 0.25, 0.9) }); if (fall > 7) m.ui.rumble?.(0.2, 0.4, 100); }
  }

  // ---- mantle -------------------------------------------------------------------------------------------------
  findMantle() {
    const b = this.body, L = this.match.level, fx = Math.sin(this.heading), fz = Math.cos(this.heading), hw = b.hw;
    // something solid must be directly ahead at waist height
    if (!L.overlaps(b.x - hw + fx * 0.4, b.y + 0.6, b.z - hw + fz * 0.4, b.x + hw + fx * 0.4, b.y + 1.0, b.z + hw + fz * 0.4)) return null;
    for (const d of [0.5, 0.75]) {
      const px = b.x + fx * d, pz = b.z + fz * d;
      const top = L.topBetween(px, pz, 0.1, b.y + 0.52, b.y + 1.8);
      if (top === -Infinity) continue;
      // how deep is the ledge along our heading? thin and low things are vaulted over instead of climbed
      let depth = 0.1;
      for (let k = 1; k <= 28; k++) { if (L.topBetween(b.x + fx * (d + k * 0.05), b.z + fz * (d + k * 0.05), 0.04, top - 0.12, top + 0.12) === -Infinity) break; depth += 0.05; }
      for (let k = 1; k <= 12; k++) { if (L.topBetween(b.x + fx * (d - k * 0.05), b.z + fz * (d - k * 0.05), 0.04, top - 0.12, top + 0.12) === -Infinity) break; depth += 0.05; }
      const vault = () => {
        for (const e of [0.9, 1.2]) {
          const lx = b.x + fx * (d + e), lz = b.z + fz * (d + e), fl = L.floorY(lx, b.y + 0.5, lz, 0.6);
          if (Math.abs(fl - b.y) > 2.2) continue;
          if (!L.overlaps(lx - 0.3, fl + 0.03, lz - 0.3, lx + 0.3, fl + 1.2, lz + 0.3) && L.topBetween(lx, lz, 0.2, fl - 0.1, fl + 0.1) !== -Infinity) return { x: lx, y: fl, z: lz, vault: true, dur: 0.5, apex: top + 0.15 };
        }
        return null;
      };
      if (depth < 0.95 && top - b.y <= 1.4) { const v = vault(); if (v) return v; }
      for (const e of [0.45, 0.75, 1.05]) {       // landing spots on the same surface
        const lx = b.x + fx * (d + e - 0.25), lz = b.z + fz * (d + e - 0.25);
        const t2 = L.topBetween(lx, lz, 0.22, top - 0.12, top + 0.12);
        if (t2 === -Infinity) continue;
        if (!L.overlaps(lx - 0.3, t2 + 0.03, lz - 0.3, lx + 0.3, t2 + 1.15, lz + 0.3)) return { x: lx, y: t2, z: lz, vault: false, dur: clamp(0.34 + 0.24 * (t2 - b.y), 0.4, 0.78) };
      }
      if (top - b.y <= 1.4) { const v = vault(); if (v) return v; }
    }
    return null;
  }
  beginMantle(mt) {
    const b = this.body;
    this.act = { type: 'mantle', t: 0, dur: mt.dur, sx: b.x, sy: b.y, sz: b.z, tx: mt.x, ty: mt.y, tz: mt.z, vault: mt.vault, apex: mt.apex ?? Math.max(b.y, mt.y) + 0.25 };
    b.vx = b.vy = b.vz = 0; this.sprinting = false; this.tac.on = false; this.adsT = Math.min(this.adsT, 0.3); this.mantleCool = 0.5; this.jumpBuf = 0; this.coyote = 0;
    this.match.sound.ui('jump', { vol: 0.5, pitch: 0.8 });
    this.weapon?.cancelReload();
  }
  updateMantle(dt) {
    const a = this.act, b = this.body; a.t += dt;
    const k = clamp(a.t / a.dur, 0, 1), up = smooth(Math.min(1, k * 1.7)), fw = smooth(Math.max(0, (k - 0.3) / 0.7));
    if (a.vault) b.y = lerp(a.sy, a.ty, k) + Math.sin(Math.PI * Math.min(1, k * 1.05)) * Math.max(0, a.apex - Math.max(a.sy, a.ty));
    else b.y = lerp(a.sy, a.ty, up);
    b.x = lerp(a.sx, a.tx, fw); b.z = lerp(a.sz, a.tz, fw);
    this.mantleT = Math.sin(Math.PI * k);
    this.eyeH = damp(this.eyeH, EYE[STANCE.CROUCH] + 0.1, 12, dt);
    if (k >= 1) {
      this.act = null; this.mantleT = 0; b.vx = Math.sin(this.heading) * 1.5; b.vz = Math.cos(this.heading) * 1.5; b.vy = 0; b.onGround = true;
      if (!this.canFit(HULL[0])) this.setStance(STANCE.CROUCH);
      this.match.sound.ui('land', { vol: 0.35 });
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // exclusive actions (switch, quick melee, melee swings, throw, streak call)
  // ---------------------------------------------------------------------------------------------------------
  doActions(dt, ctl) {
    const a = this.act, m = this.match;
    let eq = 1;
    if (a) {
      if (a.type !== 'mantle') a.t += dt;
      switch (a.type) {
        case 'draw': eq = clamp(a.t / a.dur, 0, 1); if (a.t >= a.dur) this.act = null; break;
        case 'switch':
          if (a.t < a.lower) eq = 1 - a.t / a.lower;
          else {
            if (!a.swapped) { a.swapped = true; this.applySwitch(a); }
            eq = clamp((a.t - a.lower) / a.raise, 0, 1);
            if (a.t >= a.lower + a.raise) this.act = null;
          }
          if (ctl.yDouble && !a.swapped) { this.act = null; eq = 1; this.inspect(); }   // a double tap on Y inspects instead of swapping
          break;
        case 'quick': this.tickQuick(a); break;
        case 'melee': this.tickMelee(a); break;
        case 'throw': this.tickThrow(a, ctl, dt); break;
        case 'call': eq = a.t < 0.15 ? 1 - a.t / 0.15 : a.t < a.dur - 0.2 ? 0.05 : (a.t - (a.dur - 0.2)) / 0.2; if (a.t >= a.dur) this.act = null; break;
        default: break;
      }
    }
    if (!this.act) eq = 1;
    this.equip = damp(this.equip, eq, 30, dt);
    const busy = this.act && ['mantle', 'quick', 'throw', 'call', 'draw'].includes(this.act.type);
    if (!busy && !this.dive.on && !this.slide.on && !this.targeting) {
      if (ctl.selectSlot >= 0 && (ctl.selectSlot !== this.cur || this.hold !== 'gun')) this.beginSwitch(ctl.selectSlot, 'gun');
      else if (ctl.switchPressed) { if (this.hold === 'melee') this.beginSwitch(this.lastGun, 'gun'); else this.beginSwitch(1 - this.cur, 'gun'); }
      else if (ctl.meleeHold && this.hold !== 'melee') this.beginSwitch(this.cur, 'melee');
      if (ctl.inspect && !this.act && !this.sprinting && this.adsT < 0.2 && !this.weapon?.reload) this.inspect();
    }
    if (ctl.modeSwitch && this.weapon && this.weapon.cycleMode()) { m.sound.mode(); m.ui.flashMode?.(this.weapon.mode); }
    if (ctl.meleeQuick && !busy && !this.dive.on && !this.slide.on && this.act?.type !== 'switch') this.beginQuick();
  }
  beginSwitch(target, kind) {
    if (kind === 'gun' && this.hold === 'gun' && target === this.cur) return;
    this.weapon?.cancelReload(); this.adsT = Math.min(this.adsT, 0.5); this.match.vm?.cancelAnim(); this.lock.state = 'none';
    this.act = { type: 'switch', t: 0, lower: 0.16, raise: kind === 'melee' ? 0.3 : this.weapons[target].drawTime * 0.8, to: target, kind, swapped: false };
    this.match.sound.swapGun();
  }
  applySwitch(a) {
    const vm = this.match.vm;
    if (a.kind === 'melee') { this.lastGun = this.cur; this.hold = 'melee'; vm?.setKnife(this.meleeId); }
    else { this.hold = 'gun'; this.cur = a.to; this.lastGun = a.to; vm?.setWeapon(this.weapons[a.to]); }
    this.rec.tp = this.rec.ty = 0;
  }
  inspect() { this.match.vm?.play('inspect', this.hold === 'melee' ? 3.4 : 3.0); }
  restoreVm() { const vm = this.match.vm; if (!vm) return; if (this.hold === 'melee') vm.setKnife(this.meleeId); else vm.setWeapon(this.weapons[this.cur]); }

  // ---- melee --------------------------------------------------------------------------------------------------
  beginQuick() {
    const m = this.match, def = MELEE[this.meleeId];
    this.weapon?.cancelReload(); this.act = { type: 'quick', t: 0, dur: 0.62, hit: false, def };
    m.vm?.swapTo('knife', this.meleeId); m.vm?.play('quick', 0.62); this.sprinting = false; this.adsT = 0;
    m.sound.ui(def.snd, { vol: 0.6 });
  }
  tickQuick(a) {
    if (!a.hit && a.t >= 0.26) { a.hit = true; this.meleeStrike(100, a.def.reach + 0.1); }
    if (a.t >= a.dur) { this.act = null; this.restoreVm(); }
  }
  meleeAttack(kind) {
    const def = MELEE[this.meleeId], m = this.match;
    const dur = kind === 'lunge' ? def.swing + 0.28 : def.swing + 0.08;
    this.act = { type: 'melee', t: 0, dur, kind, hit: false, def, hitAt: kind === 'lunge' ? 0.52 * dur : 0.46 * dur };
    const anim = kind === 'lunge' ? 'lunge' : (this.meleeAlt ? 'slash2' : 'slash1'); this.meleeAlt = !this.meleeAlt;
    m.vm?.play(anim, dur); m.sound.ui(def.snd, { vol: 0.7, pitch: kind === 'lunge' ? 0.8 : 1 });
    this.sprinting = false;
  }
  tickMelee(a) {
    if (!a.hit && a.t >= a.hitAt) {
      a.hit = true; const d = a.def;
      this.meleeStrike(a.kind === 'lunge' ? d.lunge_dmg : d.slash, a.kind === 'lunge' ? d.lunge : d.reach);
      if (a.kind === 'lunge') { const b = this.body; b.vx += Math.sin(this.heading) * 3.5; b.vz += Math.cos(this.heading) * 3.5; }
    }
    if (a.t >= a.dur + (a.def.cool - a.def.swing) * 0.5) this.act = null;
  }
  meleeStrike(dmg, reach) {
    const m = this.match, eye = this.eye, yaw = this.heading + this.rec.y, cp = Math.cos(this.pitch);
    const r = m.meleeStrike(this, this.body.x, eye, this.body.z, Math.sin(yaw) * cp, Math.sin(this.pitch), Math.cos(yaw) * cp, reach, dmg, { weapon: MELEE[this.meleeId].name, melee: true });
    if (r.hit) { m.sound.ui('stab', { vol: 0.8 }); m.ui.rumble?.(0.4, 0.7, 120); this.shake = Math.max(this.shake, 0.25); }
    return r;
  }

  // ---- throwables ---------------------------------------------------------------------------------------------
  beginThrow(kind) {      // kind: 'lethal' | 'tactical'
    const slot = kind === 'lethal' ? this.lethal : this.tactical, def = kind === 'lethal' ? LETHALS[slot.id] : TACTICALS[slot.id];
    if (slot.n <= 0) { this.match.sound.click(); this.match.ui.flashText?.(`No ${def.name}`); return false; }
    const m = this.match;
    this.weapon?.cancelReload(); this.sprinting = false; this.adsT = 0; this.tac.on = false;
    if (def.kind === 'device') { slot.n--; this.sensorT = def.dur; this.sensorPing = 0; m.sound.streakCall(); m.ui.toast?.(`${def.name} active`); return true; }
    if (def.kind === 'mine') { this.act = { type: 'throw', phase: 'plant', t: 0, dur: 0.8, slot, def, kind }; m.vm?.swapTo('throw', 'mine'); m.vm?.play('plant', 0.8); return true; }
    const knife = def.kind === 'knife';
    this.act = { type: 'throw', phase: knife ? 'hold' : 'pin', t: 0, dur: knife ? 99 : 0.38, slot, def, kind, cookT: 0, thrown: false };
    m.vm?.swapTo(knife ? 'knife' : 'throw', knife ? 'combat' : slot.id);
    if (!knife) { m.vm?.play('pin', 0.38); m.sound.pin(); }
    return true;
  }
  tickThrow(a, ctl, dt) {
    const m = this.match, held = a.kind === 'lethal' ? ctl.lethalHeld : ctl.tacticalHeld;
    if (a.phase === 'plant') { if (a.t >= a.dur * 0.7 && !a.planted) { a.planted = true; this.plantMine(a); } if (a.t >= a.dur) this.endThrow(); return; }
    if (a.phase === 'pin' && a.t >= a.dur) { a.phase = 'hold'; a.t = 0; a.dur = 99; }
    if (a.phase === 'hold') {
      if (a.def.cook) a.cookT += dt;
      this.updateArc(a);
      if (a.def.cook && a.cookT >= a.def.fuse - 0.05 && !a.exploded) { a.exploded = true; a.slot.n--; m.proj.detonateInHand(this, a.def); this.endThrow(); return; }
      if (!held) { a.phase = 'throw'; a.t = 0; a.dur = 0.42; m.vm?.play('throw', 0.42); this.hideArc(); }
    } else if (a.phase === 'throw') {
      if (!a.thrown && a.t >= a.dur * 0.46) { a.thrown = true; this.releaseThrow(a); }
      if (a.t >= a.dur) this.endThrow();
    }
  }
  endThrow() { this.act = null; this.hideArc(); this.restoreVm(); this.equip = 0.3; }
  throwOrigin(out) {
    const h = this.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
    out.x = this.body.x + fx * 0.45 + rx * 0.22; out.y = this.eye - 0.12; out.z = this.body.z + fz * 0.45 + rz * 0.22; return out;
  }
  throwVelocity(speed, out) {
    const p = this.pitch + 0.14, h = this.heading;
    out.x = Math.sin(h) * Math.cos(p) * speed + this.body.vx * 0.55; out.y = Math.sin(p) * speed + this.body.vy * 0.3; out.z = Math.cos(h) * Math.cos(p) * speed + this.body.vz * 0.55; return out;
  }
  releaseThrow(a) {
    const m = this.match, o = this.throwOrigin({}), v = this.throwVelocity(a.def.speed || 17, {});
    a.slot.n--;
    if (a.def.kind === 'knife') m.proj.throwKnife(this, o, v, a.def);
    else m.proj.throwGrenade(this, a.slot.id, a.def, o, v, Math.max(0.15, (a.def.fuse || 2) - a.cookT));
    m.sound.ui('knife', { vol: 0.5, pitch: 0.9 });
  }
  plantMine(a) {
    const m = this.match, ox = this.body.x + Math.sin(this.heading) * 0.9, oz = this.body.z + Math.cos(this.heading) * 0.9;
    const fy = m.level.floorY(ox, this.body.y + 0.6, oz, 0.5);
    a.slot.n--; m.proj.plantMine(this, a.def, ox, fy, oz); m.sound.ui('pickup', { vol: 0.5, pitch: 0.7 });
  }
  updateArc(a) {
    const m = this.match; if (!this.arc) return;
    const o = this.throwOrigin(_o), v = this.throwVelocity(a.def.speed || 17, _vel);
    const pos = this.arc.attr.array; let n = 0, x = o.x, y = o.y, z = o.z, vx = v.x, vy = v.y, vz = v.z; const dt = 1 / 20;
    for (let i = 0; i < 40; i++) {
      vy -= 9.8 * dt; const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      const dx = nx - x, dy = ny - y, dz = nz - z, d = Math.hypot(dx, dy, dz) || 1e-6;
      const h = m.level.raycast(x, y, z, dx / d, dy / d, dz / d, d, true);
      if (h) { pos[n * 3] = x + dx / d * h.t; pos[n * 3 + 1] = y + dy / d * h.t; pos[n * 3 + 2] = z + dz / d * h.t; n++; break; }
      x = nx; y = ny; z = nz; pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; n++;
    }
    this.arc.geo.setDrawRange(0, n); this.arc.attr.needsUpdate = true; this.arc.points.visible = true;
  }
  hideArc() { if (this.arc) this.arc.points.visible = false; }
  makeArc(scene) {
    const geo = new THREE.BufferGeometry(), attr = new THREE.BufferAttribute(new Float32Array(40 * 3), 3); geo.setAttribute('position', attr); geo.setDrawRange(0, 0);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false; pts.visible = false; scene.add(pts); this.arc = { points: pts, geo, attr };
  }

  // ---------------------------------------------------------------------------------------------------------
  // weapon: ADS, firing, reload
  // ---------------------------------------------------------------------------------------------------------
  doWeapon(dt, ctl) {
    const m = this.match, w = this.weapon, a = this.act;
    const blocked = !!a && ['switch', 'quick', 'throw', 'mantle', 'call', 'draw'].includes(a.type);
    if (!blocked && !this.targeting && !this.dive.on && !this.slide.on) {
      if (ctl.lethalPressed) this.beginThrow('lethal'); else if (ctl.tacticalPressed) this.beginThrow('tactical');
    }
    if (this.hold === 'melee') {          // knife equipped: R2 slash, L2 lunge, ballistic knife fires its blade
      this.adsT = damp(this.adsT, 0, 18, dt);
      if (!blocked && !this.targeting && !this.act) {
        const def = MELEE[this.meleeId];
        if (ctl.firePressed && def.ranged && this.bladeReady) this.fireBlade(def);
        else if (ctl.firePressed) this.meleeAttack('slash');
        else if (ctl.adsPressed) this.meleeAttack('lunge');
      }
      return;
    }
    if (!w) return;
    // ---- ADS
    const reloading = !!w.reload && !w.canInterruptReload();
    const canAds = !this.sprinting && !blocked && !this.slide.on && !this.dive.on && !reloading && this.act?.type !== 'melee' && this.scopeKick <= 0;
    const wantAds = ctl.ads && canAds && !this.tac.on;
    this.adsT = approach(this.adsT, wantAds ? 1 : 0, (wantAds ? 1 / w.stats.ads : 1 / (w.stats.ads * 0.65)) * dt);
    if (this.scopeKick > 0) this.scopeKick = Math.max(0, this.scopeKick - dt);
    if (ctl.adsPressed && wantAds) m.sound.ads();
    // ---- airstrike / sentry targeting owns the trigger
    if (this.targeting) { this.updateTargeting(dt, ctl); return; }
    // ---- reload: tap X, or hold X when there is nothing to interact with
    if (ctl.reloadPressed) this._relDone = false;
    let wantReload = ctl.reloadReleasedTap;
    if (ctl.reloadHeld && ctl.reloadHeldFor >= 0.3 && !this.interactTarget && !this._relDone) wantReload = true;
    if (wantReload && !blocked && !w.reload) { if (this.startReload()) this._relDone = true; }
    // ---- fire
    const sprintLock = this.sprintOutT > 0 || this.sprinting;
    if (!blocked && !sprintLock && !this.dive.on && !this.slide.on && this.act?.type !== 'melee') {
      if (w.def.lockOn) this.updateLock(dt, ctl, w); else this.lock.state = 'none';
      const shots = w.trigger(ctl.firePressed, ctl.fire);
      if (shots.length) this.onShots(shots, w);
      if (w.empty) {
        w.empty = false;
        if (!w.reload) {
          m.sound.click();
          if (w.reserve > 0 && w.ammo === 0) this.startReload(); else if (w.reserve <= 0 && w.ammo === 0) m.ui.flashText?.('NO AMMO');
        }
      }
    }
    if (w.shellEvent) { w.shellEvent = false; m.sound.shell(); }
    if (w.reload) this.reloadCues(w);
    const vm = m.vm; if (vm?.inspecting && (ctl.fire || ctl.ads || this.sprinting || ctl.reloadPressed || ctl.switchPressed)) vm.cancelAnim();
  }
  startReload() {
    const w = this.weapon; if (!w || !w.startReload()) return false;
    this.adsT = Math.min(this.adsT, 0.4); this.match.vm?.cancelAnim(); this._cue = 0;
    return true;
  }
  reloadCues(w) {
    const r = w.reload, m = this.match; if (!r || r.kind === 'shell') return;
    const p = w.reloadProgress, c = this._cue || 0;
    if (c < 1 && p > 0.17) { this._cue = 1; m.sound.magOut(); }
    if (c < 2 && p > 0.5) { this._cue = 2; m.sound.magIn(); }
    if (c < 3 && r.kind === 'empty' && p > 0.84) { this._cue = 3; m.sound.bolt(); }
  }
  onShots(shots, w) {
    const m = this.match, s = w.stats, vm = m.vm, cam = m.camera;
    for (const ev of shots) {
      const stanceMul = this.stance === STANCE.PRONE ? 0.6 : this.stance === STANCE.CROUCH ? 0.8 : this.stance === STANCE.SLIDE ? 1.25 : 1;
      const spread = w.spread(this.adsT, this.moveF, stanceMul, this.air, ev.ss) * (this.stunT > 0 ? 1.6 : 1);
      this.spreadDeg = spread;
      const yaw = this.heading + this.rec.y, pit = this.pitch + this.rec.p, cp = Math.cos(pit);
      const dx = Math.sin(yaw) * cp, dy = Math.sin(pit), dz = Math.cos(yaw) * cp;
      const ox = this.body.x, oy = this.eye, oz = this.body.z;
      cam.updateMatrixWorld(true);
      if (vm) vm.muzzleWorld(cam, _v, 0.9); else _v.set(ox, oy - 0.2, oz);
      const mx = _v.x, my = _v.y, mz = _v.z;
      if (s.kind === 'launcher') {
        const tgt = this.lock.state === 'locked' ? this.lock.target : null;
        m.proj.fireRocket(this, { x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, w, tgt);
        if (tgt) { this.lock.state = 'none'; this.lock.t = 0; this.lock.target = null; }
      } else {
        for (let p = 0; p < ev.pellets; p++) {
          spreadDir(dx, dy, dz, s.pellets > 1 ? s.pelletSpread * lerp(1, 0.75, this.adsT) + spread * 0.25 : spread, _d);
          m.fireBullet(this, ox, oy, oz, _d.x, _d.y, _d.z, w, { mx, my, mz, tracer: ev.idx % 2 === 0 || s.pellets > 1 || !!s.bolt || s.rpm < 500, pellet: p });
        }
      }
      m.sound.gun(s.kind === 'launcher' ? 'rocket' : s.snd, ox, oy, oz, 1.0, true);
      m.noise(ox, oy, oz, s.suppressed ? 9 : s.snd === 'sniper' ? 70 : 48, this, !s.suppressed);
      if (!s.suppressed) this.firedT = m.time;
      vm?.kick(s.kick * (this.adsT > 0.5 ? 0.7 : 1), s.kick * 0.9);
      vm?.muzzleFlash(s.flash, s.suppressed);
      if (s.kind !== 'launcher') {
        m.fx.muzzleFlash(mx, my, mz, 0.5 * s.flash * (s.suppressed ? 0.2 : 1));
        if (!s.suppressed) m.fx.flashLight(mx, my, mz, 2.2 * Math.min(1.5, s.flash), 0.07, 0xffb060, 12);
        if (!s.shell && !s.bolt && s.model !== 'doublebarrel' && s.model !== 'pump') {
          vm?.ejectWorld(cam, _w);
          const rx = -Math.cos(this.heading), rz = Math.sin(this.heading);
          m.fx.casing(_w.x, _w.y, _w.z, rx * rnd(1.4, 2.6) + this.body.vx * 0.5, rnd(1.2, 2.2), rz * rnd(1.4, 2.6) + this.body.vz * 0.5);
        }
      }
      const adsK = lerp(1, 0.82, this.adsT) * (this.stance === STANCE.PRONE ? 0.8 : this.stance === STANCE.CROUCH ? 0.92 : 1);
      this.rec.tp = Math.min(this.rec.tp + ev.pitch * DEG * adsK, s.recoil.max * DEG);
      this.rec.ty = clamp(this.rec.ty + ev.yaw * DEG * adsK, -6 * DEG, 6 * DEG);
      this.rec.last = m.time; this.rec.p += ev.pitch * DEG * adsK * 0.5;
      if (s.bolt) { this.scopeKick = 0.5; this.adsT = Math.min(this.adsT, 0.35); this.boltCueT = Math.max(0.3, s.bolt * 0.35); }
      if (s.model === 'pump') this.boltCueT = 0.22;
      m.ui.rumble?.(...(s.rumble || [0.2, 0.3, 40]));
      m.ui.shotFired?.(w); m.mode.onShot?.(w);
    }
  }
  updateLock(dt, ctl, w) {
    const m = this.match, L = this.lock, s = w.stats;
    if (!(this.adsT > 0.6)) { L.t = 0; L.state = 'none'; L.target = null; return; }
    let best = null, bd = 1e9; const eye = this.eye;
    const pit = this.pitch, fx = Math.sin(this.heading) * Math.cos(pit), fy = Math.sin(pit), fz = Math.cos(this.heading) * Math.cos(pit);
    for (const t of m.lockables(this)) {
      const px = t.lockX() - this.body.x, py = t.lockY() - eye, pz = t.lockZ() - this.body.z, d = Math.hypot(px, py, pz);
      if (d > s.lockRange || d < 5) continue;
      const ang = Math.acos(clamp((px * fx + py * fy + pz * fz) / d, -1, 1));
      if (ang < 0.14 && ang < bd && !m.level.blocked(this.body.x, eye, this.body.z, t.lockX(), t.lockY(), t.lockZ())) { best = t; bd = ang; }
    }
    if (best && best === L.target) {
      L.t += dt;
      if (L.t >= s.lockTime) { if (L.state !== 'locked') { m.sound.lockOn(); L.state = 'locked'; } }
      else { L.state = 'locking'; L.tone -= dt; if (L.tone <= 0) { L.tone = 0.22; m.sound.lockTone(); } }
    } else if (best) { L.target = best; L.t = 0; L.state = 'locking'; }
    else { L.t = Math.max(0, L.t - dt * 2); if (L.t <= 0) { L.state = 'none'; L.target = null; } else if (L.state === 'locked') L.state = 'locking'; }
  }
  fireBlade(def) {
    const m = this.match, yaw = this.heading + this.rec.y, cp = Math.cos(this.pitch);
    const dx = Math.sin(yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(yaw) * cp;
    this.bladeReady = false; this.bladeT = 12;
    m.proj.fireBlade(this, { x: this.body.x + dx * 0.4, y: this.eye - 0.08, z: this.body.z + dz * 0.4 }, { x: dx, y: dy, z: dz }, def);
    m.vm?.play('fire_blade', 0.3); m.sound.ui('bow', { vol: 0.8 }); this.act = { type: 'melee', t: 0, dur: 0.4, hit: true, def, kind: 'fire', hitAt: 99 };
    m.vm?.kick(0.04, 0.03);
  }

  // ---------------------------------------------------------------------------------------------------------
  // scorestreaks
  // ---------------------------------------------------------------------------------------------------------
  onKillCredit() {
    for (const s of this.streakSlots) { if (s.prog < s.cost) s.prog++; if (s.prog >= s.cost && !s.ready) { s.ready = true; this.match.sound.streakReady(); this.match.ui.streakReady?.(s); } }
  }
  doStreaks(dt, ctl) {
    const blocked = !!this.act && ['mantle', 'switch', 'throw', 'quick', 'draw'].includes(this.act.type);
    for (let i = 0; i < 3; i++) {
      if (!ctl.streak[i]) continue;
      const s = this.streakSlots[i]; if (!s) continue;
      if (this.targeting) { this.cancelTargeting(); continue; }
      if (blocked || this.dive.on || this.slide.on) continue;
      if (s.prog < s.cost) { this.match.sound.click(); this.match.ui.flashText?.(`${s.def.name}: ${s.prog}/${s.cost} kills`); continue; }
      this.useStreak(i);
    }
  }
  useStreak(i) {
    const s = this.streakSlots[i], m = this.match;
    if (s.id === 'airstrike' || s.id === 'sentry') { this.targeting = { slot: i, id: s.id, valid: false, x: 0, y: 0, z: 0, dirx: 0, dirz: 1 }; this.adsT = 0; m.sound.streakCall(); return; }
    this.consumeStreak(i);
    this.act = { type: 'call', t: 0, dur: 0.6 };
    m.streaks.deploy(this, s.id, {});
  }
  consumeStreak(i) { const s = this.streakSlots[i]; s.prog = 0; s.ready = false; }
  updateTargeting(dt, ctl) {
    const m = this.match, T = this.targeting, eye = this.eye;
    const pit = this.pitch, fx = Math.sin(this.heading) * Math.cos(pit), fy = Math.sin(pit), fz = Math.cos(this.heading) * Math.cos(pit);
    const maxD = T.id === 'sentry' ? 7 : 90;
    const h = m.level.raycast(this.body.x, eye, this.body.z, fx, fy, fz, maxD, true);
    T.valid = false;
    if (h) {
      const px = this.body.x + fx * h.t, py = eye + fy * h.t, pz = this.body.z + fz * h.t;
      T.x = px; T.y = py; T.z = pz;
      T.valid = T.id === 'sentry' ? h.ny > 0.7 && !m.level.overlaps(px - 0.5, py + 0.05, pz - 0.5, px + 0.5, py + 1.0, pz + 0.5) : (h.ny > 0.5 || py < 1.5);
    } else if (T.id === 'airstrike') { T.x = this.body.x + fx * maxD; T.z = this.body.z + fz * maxD; T.y = m.level.floorY(T.x, 50, T.z, 60); T.valid = true; }
    T.dirx = Math.sin(this.heading); T.dirz = Math.cos(this.heading);
    m.streaks.showMarker(T);
    this.prompt = T.valid ? `${this.glyph('R2')} Confirm ${STREAKS[T.id].name}   ${this.glyph('B')} Cancel` : `Invalid position   ${this.glyph('B')} Cancel`; this.promptKind = 'streak';
    if (ctl.crouchPressed) { this.cancelTargeting(); this.bConsumed = true; return; }
    if (ctl.firePressed && T.valid) {
      const i = T.slot; this.consumeStreak(i); m.streaks.deploy(this, T.id, { x: T.x, y: T.y, z: T.z, dx: T.dirx, dz: T.dirz });
      this.targeting = null; m.streaks.hideMarker(); this.act = { type: 'call', t: 0, dur: 0.7 };
    }
  }
  cancelTargeting() { this.targeting = null; this.match.streaks.hideMarker(); this.match.sound.ui('back'); }
  glyph(b) { return this.match.ui.glyph ? this.match.ui.glyph(b) : b; }

  // ---------------------------------------------------------------------------------------------------------
  // interact: hold X near a pickup or ammo crate
  // ---------------------------------------------------------------------------------------------------------
  doInteract(dt, ctl) {
    const m = this.match;
    this.interactTarget = this.act?.type === 'mantle' || this.targeting ? null : m.findInteractable(this);
    const t = this.interactTarget;
    if (t && !this.targeting) { this.prompt = t.prompt(this); this.promptKind = 'interact'; }
    if (t && ctl.reloadHeld && ctl.reloadHeldFor >= 0.28) {
      this.interactT = Math.min(1, this.interactT + dt / 0.55);
      if (this.interactT >= 1) { m.useInteractable(this, t); this.interactT = 0; this._relDone = true; }
    } else this.interactT = Math.max(0, this.interactT - dt * 3);
  }

  // ---------------------------------------------------------------------------------------------------------
  // health, damage hooks, noise
  // ---------------------------------------------------------------------------------------------------------
  regen(dt) {
    this.regenDelay -= dt;
    if (this.regenDelay <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 24 * dt);
  }
  onDamaged(amount, attacker) {
    const m = this.match;
    this.regenDelay = 4.5;
    const q = Math.min(2, amount / 20);
    this.flinch.x += rnd(-1, 1) * 0.012 * q; this.flinch.y += rnd(-1, 1) * 0.012 * q; this.flinch.r += rnd(-1, 1) * 0.02;
    this.rec.tp += Math.min(0.03, amount * 0.0006); this.shake = Math.max(this.shake, Math.min(0.5, amount / 90));
    if (attacker && attacker !== this) {
      const ax = attacker.body ? attacker.body.x : attacker.x, az = attacker.body ? attacker.body.z : attacker.z;
      m.ui.damage?.(wrapPI(Math.atan2(ax - this.body.x, az - this.body.z) - this.heading), amount, this.hp / this.maxHp);
    } else m.ui.damage?.(null, amount, this.hp / this.maxHp);
    m.sound.ui('hurt', { vol: clamp(amount / 40, 0.3, 0.9) });
    m.ui.rumble?.(0.5, 0.7, 140);
    this.adsT = Math.min(this.adsT, 0.85);
  }
  onKilled(attacker) {
    const m = this.match;
    this.alive = false; this.deadT = 0; this.killer = attacker; this.sprinting = false; this.tac.on = false; this.slide.on = false; this.dive.on = false;
    this.act = null; this.targeting = null; m.streaks.hideMarker(); this.hideArc();
    this.weapon?.cancelReload();
    this.stats.deaths++; this.stats.streak = 0;
    m.vm?.cancelAnim?.();
    m.sound.ui('hurt', { vol: 1 }); m.ui.rumble?.(1, 1, 300);
  }
  updateDead(dt) {
    const b = this.body, m = this.match;
    this.deadT += dt;
    b.vx *= Math.max(0, 1 - 6 * dt); b.vz *= Math.max(0, 1 - 6 * dt);
    b.vy -= G * dt; moveBody(m.level, b, dt);
    this.eyeH = damp(this.eyeH, 0.28, 5, dt);
    if (this.killer?.body) {
      const want = Math.atan2(this.killer.body.x - b.x, this.killer.body.z - b.z);
      this.heading = wrapPI(this.heading + clamp(angDiff(this.heading, want), -3 * dt, 3 * dt));
      this.pitch = damp(this.pitch, 0.1, 3, dt);
    }
    this.roll = damp(this.roll, 0.7, 3, dt); this.adsT = damp(this.adsT, 0, 8, dt); this.flashT = 0; this.sprintT = this.tacT = this.slideT = 0;
    this.updateShapes();
  }
  noise(dt) {
    const m = this.match, b = this.body, sp = Math.hypot(b.vx, b.vz);
    this._nt = (this._nt || 0) - dt;
    if (this._nt <= 0) {
      this._nt = 0.4;
      const r = this.sprinting ? 16 : this.stance === STANCE.CROUCH ? 3 : this.stance === STANCE.PRONE ? 1.5 : sp > 1 ? 8 : 0;
      if (r > 0 && b.onGround) m.noise(b.x, b.y + 1, b.z, r, this, false);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // camera + viewmodel state
  // ---------------------------------------------------------------------------------------------------------
  applyCamera(cam, dt, aspect) {
    const b = this.body, S = this.match.settings, w = this.weapon, t = this.match.time;
    const hf = (S.fov || 90) * DEG, vfov = 2 * Math.atan(Math.tan(hf / 2) / aspect) / DEG;
    const zoom = w ? lerp(1, w.stats.zoom, smooth(this.adsT)) : 1;
    let fov = vfov * (1 + 0.035 * this.sprintT + 0.075 * this.tacT + 0.05 * this.slideT);
    fov = 2 * Math.atan(Math.tan(fov * DEG / 2) / zoom) / DEG;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const k = 1 - this.adsT * 0.7;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.018 * this.bobAmp * k, bobX = Math.sin(this.bobPhase) * 0.012 * this.bobAmp * k;
    const sh = this.shake; this.shake = Math.max(0, this.shake - dt * 1.8);
    const sx = (Math.random() - 0.5) * sh * 0.06, sy = (Math.random() - 0.5) * sh * 0.06;
    // smooth the camera over stair steps (only while walking on the ground; jumps, mantles and teleports follow the body exactly)
    if (this._cy === undefined || !b.onGround || this.act?.type === 'mantle' || Math.abs(b.y - this._cy) > 0.7 || !this.alive) this._cy = b.y; else this._cy = damp(this._cy, b.y, 16, dt);
    cam.position.set(b.x - Math.cos(this.heading) * bobX + sx, this._cy + this.eyeH - this.landDip + bobY + sy - this.mantleT * 0.12, b.z + Math.sin(this.heading) * bobX);
    const yaw = this.heading + this.rec.y + this.flinch.y * 0.6, pit = clamp(this.pitch + this.rec.p + this.flinch.x * 0.6, -1.5, 1.5);
    const targetRoll = -this.match.ctl.moveX * 0.014 * (1 - this.adsT) - this.slideT * 0.05 + this.flinch.r + this.roll + (this.stunT > 0 ? Math.sin(t * 8) * 0.03 * Math.min(1, this.stunT) : 0) + sh * (Math.random() - 0.5) * 0.04;
    this._roll = damp(this._roll, targetRoll, 12, dt);
    cam.rotation.order = 'YXZ'; cam.rotation.set(pit, yaw + Math.PI, this._roll);
  }
  /** State consumed by the viewmodel and HUD. */
  vmState() {
    const w = this.weapon, rl = w?.reload, s = this._vm;
    this.scoped = !!(w && w.stats.scope && this.adsT > 0.82 && this.hold === 'gun' && this.scopeKick <= 0 && this.alive);
    s.adsT = this.adsT; s.sprintT = this.sprintT; s.tacT = this.tacT; s.slideT = this.slideT; s.bobPhase = this.bobPhase; s.bobAmp = this.bobAmp;
    s.lookYaw = this.lookYaw; s.lookPitch = this.lookPitch; s.moveX = this.match.ctl.moveX; s.equip = this.equip; s.air = this.air; s.mantleT = this.mantleT; s.hidden = this.scoped || !this.alive;
    s.reload = rl ? { active: true, progress: w.reloadProgress, kind: rl.kind, t: rl.t, per: w.stats.shell ? w.stats.shell.per : 0.4, phase: rl.phase } : null;
    return s;
  }
}
