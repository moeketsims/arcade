import * as THREE from 'three';
import { makeHero } from './models.js';

// Jump physics are derived from two design numbers rather than tuned by hand:
//   JUMP_H = apex height of a full (held) jump in metres (Bolt is 1.5 m tall, so ~2.2 body heights)
//   JUMP_T = time to reach that apex in seconds
// Constant-acceleration kinematics give the gravity and launch speed that hit both exactly:
//   h = v²/2g and t = v/g  =>  g = 2h/t², v = 2h/t
// Falling uses a little more gravity (snappier, less floaty), and letting go of A early while rising adds
// CUT_MULT× gravity, so a tap gives a short hop (JUMP_H / CUT_MULT) and a hold gives the full jump.
const JUMP_H = 3.3, JUMP_T = 0.42, FALL_MULT = 1.25, CUT_MULT = 2.5;
const G = 2 * JUMP_H / (JUMP_T * JUMP_T), JUMP_V = 2 * JUMP_H / JUMP_T;   // 37.4 m/s², 15.7 m/s
const LAUNCH = Math.sqrt(G / 34);   // springs / rocket were tuned for g = 34: scale their launch speed so they reach the same heights
const MAX_FALL = 30, MAX_RUN = 8, ACCEL = 70, AIR_ACCEL = 34, FRICTION = 16, ICE_FRICTION = 1.6;
const HOVER_TIME = 1.1, HOVER_SINK = 0.35, DASH_V = 17, DASH_T = 0.2, COYOTE = 0.12, BUFFER = 0.13;

export class Player {
  constructor(game) {
    this.game = game;
    this.model = makeHero();
    this.u = this.model.userData;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.radius = 0.4; this.height = 1.5;
    this.facing = 0; this.hp = 3; this.maxHp = 3;
    this.power = null;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.reset(new THREE.Vector3());
  }

  reset(p, facing = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.facing = facing;
    this.grounded = false; this.ground = null; this.coyote = 0; this.buffer = 0;
    this.hoverLeft = HOVER_TIME; this.hovering = false; this.dashT = 0; this.dashCd = 0; this.airDash = true;
    this.punchT = 0; this.spinT = 0; this.spinUsed = false; this.pound = 0; this.poundWind = 0;
    this.invul = 0; this.zip = null; this.landSquash = 0; this.animT = 0; this.knock = 0; this.swimCd = 0;
    this.dead = false; this.waveT = 0; this.jumping = false;
    this.safe = null;   // last solid, static spot Bolt stood on: falling off the map puts him back here
  }

  get attacking() { return this.punchT > 0 || this.spinT > 0 || this.pound === 2 || this.dashT > 0; }
  center() { return new THREE.Vector3(this.pos.x, this.pos.y + 0.75, this.pos.z); }

  // Can an attack reach a target at position q (world) with extra radius rr?
  hits(q, rr = 0.6) {
    const c = this.center(), dx = q.x - c.x, dy = q.y - c.y, dz = q.z - c.z, d = Math.hypot(dx, dz);
    if (Math.abs(dy) > 1.6 + rr) return false;
    if (this.spinT > 0) return d < 1.5 + rr;
    if (this.dashT > 0) return d < 1.0 + rr;
    if (this.punchT > 0.05) { const fx = Math.sin(this.facing), fz = Math.cos(this.facing); return d < 1.4 + rr && (dx * fx + dz * fz) / (d || 1) > 0.2; }
    return false;
  }

  hurt(from, dmg = 1) {
    if (this.invul > 0 || this.dead) return false;
    this.hp -= dmg; this.invul = 1.6; this.game.audio.sfx('hurt'); this.game.shake(0.3);
    const dx = this.pos.x - (from?.x ?? this.pos.x), dz = this.pos.z - (from?.z ?? this.pos.z), d = Math.hypot(dx, dz) || 1;
    this.vel.set(dx / d * 8, 9, dz / d * 8); this.knock = 0.35; this.grounded = false;
    this.pound = 0; this.zip = null;
    if (this.hp <= 0) { this.dead = true; this.game.onDeath(); }
    return true;
  }

  update(dt, inp, camYaw) {
    const game = this.game, u = this.u;
    this.animT += dt;
    this.invul = Math.max(0, this.invul - dt); this.knock = Math.max(0, this.knock - dt);
    this.dashCd = Math.max(0, this.dashCd - dt); this.punchT = Math.max(0, this.punchT - dt);
    this.spinT = Math.max(0, this.spinT - dt); this.swimCd = Math.max(0, this.swimCd - dt);
    this.buffer = Math.max(0, this.buffer - dt); this.coyote = Math.max(0, this.coyote - dt);
    if (this.dead) return;

    const water = game.inWater(this.pos);
    const fwd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw)), right = new THREE.Vector3(-Math.cos(camYaw), 0, Math.sin(camYaw));
    const wish = fwd.multiplyScalar(inp.move.y).add(right.multiplyScalar(inp.move.x));
    const wishLen = Math.min(1, wish.length());
    if (inp.pressed('A')) this.buffer = BUFFER;

    // --- magnet zip: fly to node, gravity off ---
    if (this.zip) {
      const to = this.zip.clone().sub(this.center()), d = to.length();
      if (d < 0.9 || inp.pressed('A')) { const jump = inp.pressed('A'); this.vel.set(0, jump ? JUMP_V * 0.9 : 6, 0); this.jumping = jump; this.zip = null; this.hoverLeft = HOVER_TIME; this.airDash = true; }
      else { to.normalize().multiplyScalar(24); this.vel.copy(to); this.facing = Math.atan2(to.x, to.z); }
    } else {
      // --- horizontal control ---
      const ice = this.ground?.ice, fr = ice ? ICE_FRICTION : FRICTION;
      const maxV = (water ? 5 : MAX_RUN) * (this.power?.kind === 'slow' && game.slowT > 0 ? 1.1 : 1);
      if (this.dashT > 0) { this.dashT -= dt; }
      else if (this.knock <= 0 && this.pound === 0) {
        const acc = this.grounded ? (ice ? ACCEL * 0.25 : ACCEL) : AIR_ACCEL;
        const hv = new THREE.Vector3(this.vel.x, 0, this.vel.z);
        const target = wish.clone().multiplyScalar(maxV);
        const diff = target.sub(hv); const step = acc * dt;
        if (wishLen < 0.05 && this.grounded) { const sp = hv.length(), ns = Math.max(0, sp - fr * dt * (ice ? 1 : 3)); if (sp > 0) hv.multiplyScalar(ns / sp); this.vel.x = hv.x; this.vel.z = hv.z; }
        else { if (diff.length() > step) diff.setLength(step); this.vel.x += diff.x; this.vel.z += diff.z; }
        if (wishLen > 0.1) { const tf = Math.atan2(wish.x, wish.z); let df = tf - this.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); this.facing += df * Math.min(1, dt * 14); }
      }

      // --- A: jump / hover / swim ---
      if (water) {
        if (this.buffer > 0 && this.swimCd <= 0) { this.vel.y = Math.max(this.vel.y, 7); this.buffer = 0; this.swimCd = 0.22; game.audio.sfx('swim'); game.fx.bubbles(this.center(), 4); }
      } else if (this.buffer > 0 && (this.grounded || this.coyote > 0) && this.pound === 0) {
        this.vel.y = JUMP_V; this.jumping = true; this.grounded = false; this.coyote = 0; this.buffer = 0; this.landSquash = -0.25; game.audio.sfx('jump');
      }
      if (this.vel.y <= 0 || water) this.jumping = false;
      this.hovering = !water && !this.grounded && inp.down('A') && this.vel.y < 1 && this.hoverLeft > 0 && this.pound === 0 && this.knock <= 0;
      if (this.hovering) {
        // Jets hold Bolt almost level: ease the vertical speed toward a gentle sink (frame-rate independent).
        this.hoverLeft -= dt; this.vel.y += (-HOVER_SINK - this.vel.y) * Math.min(1, dt * 12);
        if (Math.random() < dt * 20) game.audio.sfx('hover');
        game.hoverBeam(this.pos);
      }

      // --- B: dash ---
      if ((inp.pressed('B') || inp.pressed('R2')) && this.dashCd <= 0 && (this.grounded || this.airDash) && this.pound === 0) {
        const dir = wishLen > 0.1 ? wish.clone().normalize() : new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
        this.vel.x = dir.x * DASH_V; this.vel.z = dir.z * DASH_V; if (!this.grounded) { this.vel.y = Math.max(this.vel.y, 2); this.airDash = false; }
        this.dashT = DASH_T; this.dashCd = 0.45; this.facing = Math.atan2(dir.x, dir.z); game.audio.sfx('dash'); game.fx.puff(this.pos, 6, 0xffffff);
      }

      // --- X: punch (ground) / spin (air) ---
      if (inp.pressed('X') && this.punchT <= 0 && this.spinT <= 0) {
        if (this.grounded || water) { this.punchT = 0.28; game.audio.sfx('punch'); }
        else { this.spinT = 0.5; game.audio.sfx('spin'); if (!this.spinUsed) { this.vel.y = Math.max(this.vel.y, 5.5); this.spinUsed = true; } }
      }

      // --- Y: gadget / ground pound / scan ---
      if (inp.pressed('Y')) this.useY();
      if (inp.pressed('L3') && this.grounded) { this.waveT = 1.4; game.audio.sfx('select'); }
    }

    // --- gravity ---
    // In the air, gravity is applied half before the move and half after (velocity Verlet), so the position follows
    // the exact parabola y = v·t − ½g·t² at any frame rate instead of undershooting the apex.
    let grav = 0;
    if (!this.zip) {
      if (this.pound === 1) { this.poundWind -= dt; this.vel.set(0, 0, 0); if (this.poundWind <= 0) { this.pound = 2; this.vel.y = -30; } }
      else if (water) { this.vel.y -= 9 * dt; this.vel.y = Math.max(this.vel.y, -3.5); this.vel.multiplyScalar(1 - Math.min(1, dt * 1.2)); }
      else if (this.dashT > 0 && !this.grounded) grav = G * 0.3;
      else if (!this.hovering) grav = G * (this.vel.y < 0 ? FALL_MULT : this.jumping && !inp.down('A') ? CUT_MULT : 1) * (game.gravityScale ?? 1);
      this.vel.y -= grav * dt / 2;
      this.vel.y = Math.max(this.vel.y, this.pound === 2 ? -32 : -MAX_FALL);
    }

    // --- ride moving platforms / conveyors ---
    if (this.grounded && this.ground) {
      if (this.ground.mover) this.pos.add(this.ground.delta);
      if (this.ground.conveyor) { this.pos.x += this.ground.conveyor.x * dt; this.pos.z += this.ground.conveyor.z * dt; }
    }

    // --- integrate with collisions (2 substeps) ---
    const wasGrounded = this.grounded, fallV = this.vel.y;
    let ground = null; this.hitWall = null;
    for (let s = 0; s < 2; s++) { const gnd = game.phys.move(this, dt / 2); if (gnd) ground = gnd; if (gnd) this.grounded = true; }
    this.grounded = !!ground; this.ground = ground;
    if (!this.grounded && grav) this.vel.y = Math.max(this.vel.y - grav * dt / 2, this.pound === 2 ? -32 : -MAX_FALL);

    if (this.grounded) {
      this.coyote = COYOTE; this.hoverLeft = HOVER_TIME; this.airDash = true; this.spinUsed = false;
      if (this.power?.kind === 'rocket') this.power.charges = this.power.max;
      if (!wasGrounded) {
        if (fallV < -8) { this.landSquash = Math.min(0.35, -fallV / 60); game.audio.sfx('land'); game.fx.puff(this.pos, 5, 0xffffff); }
        if (this.pound === 2) { this.pound = 0; game.onPound(this.pos.clone()); }
      }
      if (ground.spring) { this.vel.y = ground.spring * LAUNCH; this.jumping = false; this.grounded = false; this.pound = 0; this.landSquash = -0.3; game.onSpring(ground); }
      else if (!ground.mover && !ground.crumble && !ground.hurt && !ground.conveyor && !game.inWater(this.pos)) this.safe = safeSpot(ground, this.pos, this.safe || new THREE.Vector3());
      if (ground.hurt) this.hurt(this.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)));
      if (ground.crumble) game.onCrumble(ground);
    } else if (wasGrounded && this.vel.y <= 0) this.coyote = COYOTE;

    this.animate(dt, wishLen);
  }

  useY() {
    const game = this.game, kind = this.power?.kind;
    if (kind === 'rocket' && this.power.charges > 0) {
      this.power.charges--; this.vel.y = 17 * LAUNCH; this.jumping = false; this.grounded = false; this.pound = 0; game.audio.sfx('rocket'); game.fx.puff(this.pos, 10, 0xff8a2b); return;
    }
    if (kind === 'magnet') {
      const node = game.nearestMagnet(this.center(), 16);
      if (node) { this.zip = node.clone(); this.pound = 0; game.audio.sfx('magnet'); game.magnetBeam(node); return; }
    }
    if (kind === 'slow' && game.slowCd <= 0) { game.startSlow(); return; }
    if (!this.grounded && !game.inWater(this.pos)) {
      if (this.pound === 0) { this.pound = 1; this.poundWind = 0.16; this.spinT = 0; game.audio.sfx('spin'); }
    } else if (this.grounded && !kind) { game.scan(this.center()); }
  }

  animate(dt, wishLen) {
    const u = this.u, m = this.model, t = this.animT;
    m.position.copy(this.pos);
    m.rotation.y = this.facing + (this.spinT > 0 ? (0.5 - this.spinT) / 0.5 * Math.PI * 6 : 0);
    // squash & stretch
    this.landSquash += (0 - this.landSquash) * Math.min(1, dt * 10);
    const sq = this.landSquash, airStretch = !this.grounded ? Math.min(0.12, Math.abs(this.vel.y) / 120) : 0;
    u.root.scale.set(1 + sq * 0.6 - airStretch * 0.5, 1 - sq + airStretch, 1 + sq * 0.6 - airStretch * 0.5);
    const speed = Math.hypot(this.vel.x, this.vel.z), run = this.grounded ? Math.min(1, speed / MAX_RUN) : 0;
    const ph = t * 14;
    u.legL.rotation.x = Math.sin(ph) * 0.9 * run; u.legR.rotation.x = -Math.sin(ph) * 0.9 * run;
    u.armL.rotation.x = -Math.sin(ph) * 0.7 * run; u.armR.rotation.x = Math.sin(ph) * 0.7 * run;
    u.root.position.y = this.grounded ? Math.abs(Math.sin(ph)) * 0.06 * run : 0;
    if (!this.grounded) { u.legL.rotation.x = 0.4; u.legR.rotation.x = -0.2; u.armL.rotation.z = -0.6; u.armR.rotation.z = 0.6; }
    else { u.armL.rotation.z = 0; u.armR.rotation.z = 0; }
    if (this.waveT > 0) { this.waveT -= dt; u.armR.rotation.x = -2.6; u.armR.rotation.z = 0.5 + Math.sin(t * 16) * 0.45; }
    if (this.punchT > 0) { const k = Math.sin((0.28 - this.punchT) / 0.28 * Math.PI); u.armR.rotation.x = -1.7 * k; u.armR.position.z = 0.3 * k; } else u.armR.position.z = 0;
    if (this.pound > 0) { u.root.rotation.x = this.pound === 1 ? (0.16 - this.poundWind) / 0.16 * Math.PI * 2 : 0; u.legL.rotation.x = u.legR.rotation.x = -0.6; } else u.root.rotation.x = 0;
    const jet = this.hovering || (this.power?.kind === 'rocket' && this.vel.y > 10);
    for (const leg of [u.legL, u.legR]) { leg.userData.jet.visible = jet; if (jet) leg.userData.jet.scale.set(1, 0.7 + Math.random() * 0.6, 1); }
    u.ring.material.opacity = this.spinT > 0 ? 0.6 : 0;
    // blink + invulnerability flicker
    const blink = (t % 3.3) < 0.12 ? 0.15 : 1; u.eyeL.scale.y = u.eyeR.scale.y = blink;
    m.visible = this.invul <= 0 || Math.floor(t * 20) % 2 === 0;
    // blob shadow
    const gy = this.game.phys.groundBelow(this.pos.x, this.pos.y + 0.1, this.pos.z);
    this.shadow.visible = gy > -1e9; if (this.shadow.visible) { this.shadow.position.set(this.pos.x, gy + 0.03, this.pos.z); const k = Math.max(0.3, 1 - (this.pos.y - gy) / 12); this.shadow.scale.setScalar(k); this.shadow.material.opacity = 0.35 * k; }
  }
}

// Where Bolt stands on collider c, pulled at least a body-width in from the edge so a respawn there is not a ledge.
function safeSpot(c, p, out) {
  const m = 0.9;
  if (c.kind === 'box') {
    const cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
    const x = c.max.x - c.min.x > 2 * m ? Math.max(c.min.x + m, Math.min(c.max.x - m, p.x)) : cx;
    const z = c.max.z - c.min.z > 2 * m ? Math.max(c.min.z + m, Math.min(c.max.z - m, p.z)) : cz;
    return out.set(x, c.max.y, z);
  }
  const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), lim = Math.max(0, c.r - m);
  const s = d > lim ? lim / d : 1;
  return out.set(c.x + dx * s, c.y1, c.z + dz * s);
}
