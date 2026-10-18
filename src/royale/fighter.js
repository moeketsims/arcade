// Fighter: the shared body of the player and every bot (physics, inventory, weapons, healing, damage, visuals).
import * as THREE from 'three';
import { CharacterRig, buildGlider } from './rig.js';
import { ITEMS, makeItem, reloadOf, isStack } from './items.js';
import { AMMO, AMMO_TYPES, BODY, MAX_HP, MAX_SHIELD, SEA, RARITY } from './config.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
let FID = 1;
export const fwd = yaw => [Math.sin(yaw), Math.cos(yaw)];
function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

export class Fighter {
  constructor(G, o = {}) {
    this.G = G; this.id = FID++; this.name = o.name || 'Fighter'; this.isPlayer = !!o.isPlayer; this.team = this.id;
    this.rig = new CharacterRig({ ...(o.look || {}), shadows: true }); this.root = this.rig.root; G.scene.add(this.root);
    this.glider = buildGlider(o.gliderColor ?? 0xff5ea8, o.gliderColor2 ?? 0xfff3d6); this.glider.visible = false; this.root.add(this.glider); this.rig.glider = this.glider;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.bodyYaw = 0;
    this.aimPoint = new THREE.Vector3(0, 0, 100); this.aimDir = new THREE.Vector3(0, 0, 1);
    this.move = { x: 0, z: 0 }; this.moveF = 0; this.moveS = 0;
    this.sprintWant = false; this.crouchWant = false; this.adsWant = false; this.fireHeld = false; this.interactHeld = false; this.autoTrigger = false;
    this.reset();
  }

  reset() {
    this.hp = MAX_HP; this.shield = 0; this.alive = true; this.state = 'ground'; this.grounded = true; this.inWater = false;
    this.inv = { slots: [makeItem('pickaxe'), null, null, null, null, null], ammo: Object.fromEntries(AMMO_TYPES.map(a => [a, 0])), mats: [0, 0, 0] };
    this.cur = 0; this.prevSlot = 1; this.switchT = 0; this.fireCd = 0; this.semiLock = false; this.bloom = 0; this.burstLeft = 0; this.burstT = 0; this.spin = 0; this.charge = 0;
    this.reloading = false; this.reloadT = 0; this.reloadDur = 1; this.swingT = -1; this.swingCd = 0; this.swingHit = false; this.swingDir = 1; this.dashCd = 0; this.dashT = 0; this.dashDir = new THREE.Vector3();
    this.throwT = -1; this.throwId = null; this.using = null; this.useT = 0; this.interactT = 0; this.interactTarget = null; this.emoteName = null; this.emoteT = 0;
    this.buildMode = false; this.buildMat = 0; this.buildPiece = 'wall'; this.buildCd = 0; this.deployLock = 0; this.fell = 0; this.landT = 0; this.sinceFired = 99; this.sinceHit = 99;
    this.kills = 0; this.damageDealt = 0; this.place = 0; this.lastHit = null; this.invuln = 0; this.dissolve = -1; this.hitFlash = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.stepT = 0; this.standOn = null; this.pickPrefer = -1; this.lastThrown = 'frag'; this.dualSide = 0; this.fireShown = 0; this.crouching = false; this.sprinting = false; this.speed = 0; this.visible = true; this.wantDisplay = null;
    this.root.visible = true; this.root.scale.setScalar(1); this.glider.visible = false; this.display = undefined; this.setDisplay();
  }

  // ---------------- inventory ----------------
  get item() { return this.inv.slots[this.cur]; }
  get def() { const it = this.item; return it ? ITEMS[it.id] : null; }
  mats(m = this.buildMat) { return this.inv.mats[m]; }
  addMats(m, n) { this.inv.mats[m] = Math.min(999, this.inv.mats[m] + n); }
  addAmmo(type, n) { const cap = AMMO[type].cap; const before = this.inv.ammo[type]; this.inv.ammo[type] = Math.min(cap, before + n); return this.inv.ammo[type] - before; }
  totalAmmoFor(def) { return def.ammo ? this.inv.ammo[def.ammo] : 0; }
  slotOf(id) { for (let i = 1; i < 6; i++) if (this.inv.slots[i] && this.inv.slots[i].id === id) return i; return -1; }
  emptySlot() { for (let i = 1; i < 6; i++) if (!this.inv.slots[i]) return i; return -1; }
  countOf(id) { const i = this.slotOf(id); return i < 0 ? 0 : this.inv.slots[i].n; }
  /** Put an item in the inventory. Returns { taken, dropped } — dropped is a swapped-out item. */
  pickup(item) {
    const d = ITEMS[item.id];
    if (isStack(item.id)) {
      const i = this.slotOf(item.id);
      if (i >= 0) { const s = this.inv.slots[i], room = d.stack - s.n; if (room <= 0) return { taken: false, dropped: null }; const take = Math.min(room, item.n); s.n += take; item.n -= take; return { taken: take > 0, dropped: null, partial: item.n > 0 }; }
    }
    let i = this.emptySlot(), dropped = null;
    if (i < 0) { i = this.pickPrefer > 0 ? this.pickPrefer : this.cur > 0 ? this.cur : this.worstSlot(); dropped = this.inv.slots[i]; }
    this.inv.slots[i] = item;
    if (this.cur === 0 && !this.buildMode && (d.type === 'gun' || d.type === 'melee') && !this.using) this.select(i, true);
    else if (i === this.cur) this.syncDisplay();
    return { taken: true, dropped };
  }
  worstSlot() { let w = 1, ws = 1e9; for (let i = 1; i < 6; i++) { const s = this.inv.slots[i]; const sc = s ? (ITEMS[s.id].type === 'gun' ? 30 + s.rarity * 10 : 12) : -1; if (sc < ws) { ws = sc; w = i; } } return w; }
  removeFromSlot(i, n = 1) { const s = this.inv.slots[i]; if (!s) return; if (isStack(s.id)) { s.n -= n; if (s.n <= 0) this.inv.slots[i] = null; } else this.inv.slots[i] = null; if (!this.inv.slots[this.cur]) this.select(0, true); }
  select(i, force = false) {
    if (i < 0 || i > 5 || !this.inv.slots[i]) return false;
    if (i === this.cur && !force) return false;
    if (this.buildMode) this.toggleBuild(false);
    this.cancelAll(); this.prevSlot = this.cur || this.prevSlot; this.cur = i; this.switchT = 0.28; this.burstLeft = 0; this.charge = 0; this.spin = 0; this.syncDisplay(); return true;
  }
  cycle(d) {
    if (this.buildMode) return;
    let i = this.cur; for (let k = 0; k < 6; k++) { i = (i + d + 6) % 6; if (this.inv.slots[i]) { this.select(i); return; } }
  }
  cancelAll() { this.reloading = false; this.using = null; this.useT = 0; this.interactT = 0; this.swingT = -1; this.throwT = -1; this.emoteName = null; }

  // ---------------- displayed model ----------------
  syncDisplay() { this.setDisplay(); }
  setDisplay() {
    let id = null, rar = 0;
    if (!this.buildMode && this.alive) {
      if (this.using) { id = this.using.id; rar = ITEMS[id].rarity ?? 0; }
      else if (this.throwT >= 0 && this.throwId) { id = this.throwId; rar = ITEMS[id].rarity ?? 0; }
      else if (this.item) { id = this.item.id; rar = this.item.rarity; }
    }
    const key = id ? id + '|' + rar : '';
    if (key === this.display) return; this.display = key;
    this.rig.setWeapon(id, rar); this.rig.swingDir = this.swingDir;
  }

  // ---------------- state changes ----------------
  /** Stand at (x,z). With a height hint the nearest surface at/below it is used (so interiors don't put you on the roof); otherwise the terrain/lowest walkable ground. */
  placeAt(x, z, hintY = null) {
    const cw = this.G.world.cw; const y = hintY !== null ? cw.supportAt(x, z, hintY + 0.6, 0.55) : Math.max(cw.supportAt(x, z, this.G.world.terrain.groundAt(x, z) + 0.6, 0.55), this.G.world.terrain.groundAt(x, z));
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.state = 'ground'; this.grounded = true;
  }
  enterBus(p) { this.state = 'bus'; this.pos.copy(p); this.vel.set(0, 0, 0); this.root.visible = false; this.glider.visible = false; }
  leaveBus(v) { this.state = 'free'; this.vel.copy(v); this.vel.y = -4; this.grounded = false; this.deployLock = 0.7; this.root.visible = true; this.G.sfx3d?.('jump', this.pos, 1); }
  deployGlider() { if (this.state === 'free' && this.deployLock <= 0) { this.state = 'glide'; this.G.sfx3d?.('glider', this.pos, 1.5); this.vel.y = Math.max(this.vel.y, -22); return true; } return false; }
  toggleBuild(on = !this.buildMode) {
    if (on === this.buildMode || !this.alive) return;
    if (on && (this.state !== 'ground')) return;
    this.buildMode = on; this.cancelAll(); this.fireHeld = false; this.syncDisplay();
    if (!on) this.switchT = 0.2;
  }
  jump() {
    if (this.state === 'free') { this.deployGlider(); return; }
    if (this.state === 'ground' && this.grounded && !this.inWater && this.alive) { this.vel.y = BODY.jump; this.grounded = false; this.G.sfx3d?.('jump', this.pos, 0.8); if (this.using) { this.using = null; this.setDisplay(); } this.emoteName = null; this.crouchWant = false; }
  }

  // ---------------- queries ----------------
  eyeY() { return this.pos.y + (this.crouching ? BODY.crouchEye : BODY.eye); }
  height() { return this.crouching ? BODY.crouchHeight : BODY.height; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.eyeY(), this.pos.z); }
  center(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height() * 0.55, this.pos.z); }
  headPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height() - 0.2, this.pos.z); }
  heightAboveGround() { return this.pos.y - this.G.world.cw.supportAt(this.pos.x, this.pos.z, 9999, 0); }
  isAimWeapon() { const d = this.def; return !!d && (d.type === 'gun'); }
  muzzle(out = new THREE.Vector3()) {
    const rig = this.rig, m = rig.model;
    if (m && rig.mode === 'ik' && this.root.visible && this.visible) {
      m.updateWorldMatrix(true, false);
      const ud = m.userData, sc = rig.sc || 1, mm = (ud.m2 && this.dualSide) ? ud.m2 : ud.m;
      return out.set(mm[0] * sc, mm[1] * sc, mm[2] * sc).applyMatrix4(m.matrixWorld);
    }
    const [fx, fz] = fwd(this.yaw); return out.set(this.pos.x + fx * 0.7, this.pos.y + 1.35, this.pos.z + fz * 0.7);
  }
  spreadDeg() {
    const d = this.def; if (!d || d.type !== 'gun') return 0;
    let s = d.spread * (this.adsWant ? d.ads : 1) + this.bloom + Math.min(2.5, this.speed * 0.2);
    if (!this.grounded) s += 2.2; if (this.crouching) s *= 0.8; return s;
  }

  // ---------------- per-frame ----------------
  update(dt) {
    this.sinceFired += dt; this.sinceHit += dt;
    if (!this.alive) { this.updateDissolve(dt); return; }
    this.invuln = Math.max(0, this.invuln - dt); this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.switchT = Math.max(0, this.switchT - dt); this.fireCd = Math.max(0, this.fireCd - dt); this.swingCd = Math.max(0, this.swingCd - dt); this.dashCd = Math.max(0, this.dashCd - dt);
    this.buildCd = Math.max(0, this.buildCd - dt); this.deployLock = Math.max(0, this.deployLock - dt); this.landT = Math.max(0, this.landT - dt);
    this.recoilPitch *= Math.max(0, 1 - dt * 6); this.recoilYaw *= Math.max(0, 1 - dt * 6);
    if (this.state === 'bus') return;
    if (this.state === 'free') this.updateFree(dt); else if (this.state === 'glide') this.updateGlide(dt); else this.updateGround(dt);
    // world bounds
    const r = Math.hypot(this.pos.x, this.pos.z); if (r > 310) { this.pos.x *= 310 / r; this.pos.z *= 310 / r; }
    if (this.state === 'ground') { this.updateWeapon(dt); this.updateUse(dt); this.updateEmote(dt); }
    this.updateInteract(dt);
  }

  // ---- movement physics ----
  _horizontalMove(dt) {
    const cw = this.G.world.cw, r = BODY.radius, h = this.height(), steps = Math.max(1, Math.ceil(Math.hypot(this.vel.x, this.vel.z) * dt / 0.3));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt; this.pos.z += this.vel.z * sdt;
      if (cw.collide(this.pos, this.pos.y, h, r, BODY.step)) {
        // remove velocity into walls (cheap): compare intended vs actual displacement
      }
    }
  }
  updateGround(dt) {
    const G = this.G, cw = G.world.cw, T = G.world.terrain, d = this.def;
    this.crouching = this.crouchWant && this.grounded; this.inWater = this.grounded && T.heightAt(this.pos.x, this.pos.z) < SEA - 0.9 && !this.standOn;
    let speed = BODY.walk;
    this.sprinting = this.sprintWant && !this.crouching && !this.adsWant && !this.inWater && this.move.x * this.move.x + this.move.z * this.move.z > 0.1 && !this.using && this.sinceFired > 0.6;
    if (this.sprinting) speed = BODY.sprint; if (this.crouching) speed = BODY.crouch; if (this.adsWant) speed *= 0.62;
    if (d && d.move && d.move !== 1 && (this.spin > 0.2 || d.mode !== 'spin')) speed *= d.move; if (this.using) speed *= 0.72; if (this.inWater) speed *= BODY.swimMul; if (this.buildMode) speed *= 1.05;
    if (this.dashT > 0) { this.dashT -= dt; this.vel.x = this.dashDir.x * 40; this.vel.z = this.dashDir.z * 40; if (this.dashT <= 0) { this.vel.x *= 0.12; this.vel.z *= 0.12; } }
    else {
      const m = Math.hypot(this.move.x, this.move.z), k = m > 1 ? 1 / m : 1;
      const tx = this.move.x * k * speed * Math.min(1, m * 1.3 + 0.0), tz = this.move.z * k * speed * Math.min(1, m * 1.3), acc = (this.grounded ? 48 : 9) * dt;
      this.vel.x += clamp(tx - this.vel.x, -acc, acc); this.vel.z += clamp(tz - this.vel.z, -acc, acc);
    }
    // horizontal
    const px = this.pos.x, pz = this.pos.z; this._horizontalMove(dt);
    // vertical
    const h = this.height(), step = BODY.step;
    const support = cw.supportAt(this.pos.x, this.pos.z, this.pos.y, step), was = this.grounded; this.standOn = cw.standOn;
    this.vel.y -= BODY.gravity * dt;
    if (this.vel.y <= 0) {
      const ny = this.pos.y + this.vel.y * dt;
      if (ny <= support + 0.0005 || (was && this.pos.y - support < 0.6 && this.vel.y > -BODY.gravity * dt * 2.5)) {
        if (!was) this.onLand(-this.vel.y);
        this.pos.y = support; this.vel.y = 0; this.grounded = true;
      } else { this.pos.y = ny; this.grounded = false; this.fell = Math.max(this.fell, -this.vel.y); }
    } else {
      const ceil = cw.ceilingAt(this.pos.x, this.pos.z, this.pos.y + h, 3), ny = this.pos.y + this.vel.y * dt;
      if (ny + h >= ceil) { this.pos.y = ceil - h - 0.01; this.vel.y = 0; } else this.pos.y = ny; this.grounded = false;
    }
    if (this.grounded) this.fell = 0;
    this.speed = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-4);
    // footsteps
    if (this.grounded && this.speed > 2.2 && !this.crouching) { this.stepT -= dt * (this.speed / 5.4); if (this.stepT <= 0) { this.stepT = 0.38; G.sfx3d?.('footstep', this.pos, this.isPlayer ? 0.7 : 1.0, this.isPlayer ? 20 : 12); } }
  }
  onLand(vy) {
    this.G.sfx3d?.('land', this.pos, 1, 30); this.landT = 0.2;
    if (vy > 19 && this.fell > 19) this.damage((vy - 17) * 3.2, { bypass: true, kind: 'fall', attacker: null });
    this.fell = 0; if (this.isPlayer && vy > 8) this.G.pad?.rumble(0.3, 0.3, 80);
    if (this.pos.y <= SEA + 0.05) this.G.fx?.splash(this.pos, 6);
  }
  updateFree(dt) {
    const cw = this.G.world.cw, fwdv = this.moveF, side = this.moveS, [fx, fz] = fwd(this.yaw), rx = -fz, rz = fx;
    const dive = fwdv > 0.3, flare = fwdv < -0.3;
    const hs = dive ? 40 : flare ? 6 : 16, vs = dive ? -44 : flare ? -20 : -30;   // ~5 s of skydive from the bus (3.5 s diving)
    const tx = fx * hs + rx * side * 11, tz = fz * hs + rz * side * 11;
    const k = Math.min(1, dt * 2.6); this.vel.x = lerp(this.vel.x, tx, k); this.vel.z = lerp(this.vel.z, tz, k); this.vel.y = lerp(this.vel.y, vs, Math.min(1, dt * 2.2));
    this.pos.addScaledVector(this.vel, dt); cw.collide(this.pos, this.pos.y, 1.8, 0.4, 0.3);
    this.speed = Math.hypot(this.vel.x, this.vel.z); this.diveAmt = dive ? 1 : flare ? -1 : 0;
    const support = cw.supportAt(this.pos.x, this.pos.z, this.pos.y, 0), agl = this.pos.y - support;
    if (this.deployLock <= 0 && agl < 32) this.deployGlider();
    if (this.pos.y <= support + 0.01) this.landFromAir();
  }
  updateGlide(dt) {
    const cw = this.G.world.cw, fwdv = this.moveF, side = this.moveS, [fx, fz] = fwd(this.yaw), rx = -fz, rz = fx;
    const hs = fwdv > 0.3 ? 22 : fwdv < -0.3 ? 9 : 16, vs = fwdv > 0.3 ? -8.5 : fwdv < -0.3 ? -3.5 : -5.5;
    const k = Math.min(1, dt * 2.4); this.vel.x = lerp(this.vel.x, fx * hs + rx * side * 7, k); this.vel.z = lerp(this.vel.z, fz * hs + rz * side * 7, k); this.vel.y = lerp(this.vel.y, vs, Math.min(1, dt * 3));
    this.pos.addScaledVector(this.vel, dt); cw.collide(this.pos, this.pos.y, 1.8, 0.4, 0.3);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const support = cw.supportAt(this.pos.x, this.pos.z, this.pos.y, 0.3);
    if (this.pos.y <= support + 0.02) { this.pos.y = support; this.landFromAir(); }
  }
  landFromAir() {
    const cw = this.G.world.cw; this.state = 'ground'; this.grounded = true; this.vel.set(this.vel.x * 0.3, 0, this.vel.z * 0.3); this.glider.visible = false; this.fell = 0;
    this.pos.y = cw.supportAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.6); this.G.sfx3d?.('land', this.pos, 1.2, 40); this.landT = 0.3; this.G.onLanded?.(this);
    if (this.pos.y <= SEA + 0.05) this.G.fx?.splash(this.pos, 10);
  }

  // ---- weapons ----
  updateWeapon(dt) {
    const it = this.item, d = it ? ITEMS[it.id] : null;
    if (this.buildMode) { this.bloom = Math.max(0, this.bloom - dt * 6); return; }
    this.bloom = Math.max(0, this.bloom - dt * 3.2);
    if (this.swingT >= 0) this.updateSwing(dt, d);
    if (this.throwT >= 0) this.updateThrow(dt);
    if (!d) return;
    const busy = this.throwT >= 0 || !!this.using || this.emoteName;
    if (d.type === 'gun') {
      this.updateReload(dt, it, d);
      if (this.switchT > 0 || busy) { this.spin = Math.max(0, this.spin - dt * 2); return; }
      const trigger = this.fireHeld;
      if (d.mode === 'auto') { if (trigger && this.canShoot(it, d)) this.shoot(it, d, 1); else if (trigger && it.mag <= 0 && this.fireCd <= 0) this.dryFire(it, d); }
      else if (d.mode === 'semi') {
        if (!trigger || (this.autoTrigger && this.fireCd <= 0)) this.semiLock = false;
        if (trigger && !this.semiLock) { if (this.canShoot(it, d)) { this.shoot(it, d, 1); this.semiLock = true; } else if (it.mag <= 0 && this.fireCd <= 0) { this.dryFire(it, d); this.semiLock = true; } }
      } else if (d.mode === 'burst') {
        if (!trigger || (this.autoTrigger && this.fireCd <= 0 && this.burstLeft <= 0)) this.semiLock = false;
        if (trigger && !this.semiLock && this.burstLeft <= 0 && this.canShoot(it, d)) { this.burstLeft = d.burst.n; this.burstT = 0; this.semiLock = true; }
        if (this.burstLeft > 0) { this.burstT -= dt; if (this.burstT <= 0 && it.mag > 0 && !this.reloading) { this.shoot(it, d, 1, true); this.burstLeft--; this.burstT = d.burst.gap; if (this.burstLeft <= 0) this.fireCd = Math.max(0.1, 1 / d.rate - (d.burst.n - 1) * d.burst.gap); } else if (it.mag <= 0) this.burstLeft = 0; }
      } else if (d.mode === 'spin') {
        const want = trigger && it.mag > 0 && !this.reloading; this.spin = clamp(this.spin + (want ? dt / d.spin : -dt * 0.9), 0, 1);
        if (this.spin >= 1 && want && this.fireCd <= 0) this.shoot(it, d, 1); else if (trigger && it.mag <= 0 && this.fireCd <= 0) this.dryFire(it, d);
      } else if (d.mode === 'charge') {
        if (trigger && it.mag > 0 && !this.reloading && this.fireCd <= 0) { this.charge = Math.min(1, this.charge + dt / d.charge); }
        else if (!trigger && this.charge > 0) { if (this.charge >= 0.18 && it.mag > 0) this.shoot(it, d, this.charge); this.charge = 0; }
        else if (trigger && it.mag <= 0 && this.fireCd <= 0) this.dryFire(it, d);
      }
      if (d.mode !== 'charge' && !trigger) this.charge = 0;
    } else if (d.type === 'melee') {
      const trig = this.fireHeld && this.switchT <= 0 && !busy;
      if (trig && this.swingCd <= 0 && this.swingT < 0) this.startSwing(it, d);
      if (d.dash && this.adsPressed && this.dashCd <= 0 && !busy) this.startDash(it, d);
    } else if (d.type === 'throw' || d.type === 'throwknife') {
      if (this.fireHeld && !this.semiLock && this.switchT <= 0 && !busy && this.throwT < 0) { this.semiLock = true; if (d.type === 'throw') this.startThrow(it.id); else this.startKnife(); }
      if (!this.fireHeld) this.semiLock = false;
    } else if (d.type === 'med') {
      if (this.fireHeld && !this.using && this.switchT <= 0 && !busy) this.startUse(it.id, true);
      if (!this.fireHeld && this.using && this.using.holdSlot) { this.using = null; this.setDisplay(); }
    }
    this.adsPressed = false;
  }
  canShoot(it, d) { return it.mag > 0 && this.fireCd <= 0 && (!this.reloading || d.reloadMode === 'shell') && this.switchT <= 0; }
  dryFire(it, d) {
    this.fireCd = 0.25; this.G.sfx3d?.('empty', this.pos, 0.8, 12);
    if (this.inv.ammo[d.ammo] > 0 && !this.reloading) this.startReload();
  }
  startReload() {
    const it = this.item, d = this.def; if (!d || d.type !== 'gun' || this.reloading || it.mag >= d.mag || this.inv.ammo[d.ammo] <= 0) return false;
    if (this.state !== 'ground' || this.buildMode || this.using) return false;
    this.reloading = true; this.reloadT = 0; this.burstLeft = 0; this.charge = 0;
    this.reloadDur = d.reloadMode === 'shell' ? d.shell * (d.mag - it.mag) : reloadOf(d, it.rarity); this.shellT = 0;
    this.G.sfx3d?.('reload', this.pos, 1, 25); return true;
  }
  updateReload(dt, it, d) {
    if (!this.reloading) return;
    if (d.reloadMode === 'shell') {
      if (this.fireHeld && it.mag > 0 && this.fireCd <= 0) { this.reloading = false; return; }
      this.shellT += dt; const per = d.shell * RARITY[it.rarity].reload;
      while (this.shellT >= per && it.mag < d.mag && this.inv.ammo[d.ammo] > 0) { this.shellT -= per; it.mag++; this.inv.ammo[d.ammo]--; this.G.sfx3d?.('reload', this.pos, 0.6, 20); }
      this.reloadT = Math.min(1, (it.mag - (this.reloadStartMag ?? 0)) / Math.max(1, d.mag)); this.reloadProg = 1 - (d.mag - it.mag) / Math.max(1, d.mag);
      if (it.mag >= d.mag || this.inv.ammo[d.ammo] <= 0) this.reloading = false;
    } else {
      this.reloadT += dt; this.reloadProg = this.reloadT / this.reloadDur;
      if (this.reloadT >= this.reloadDur) { const take = Math.min(d.mag - it.mag, this.inv.ammo[d.ammo]); it.mag += take; this.inv.ammo[d.ammo] -= take; this.reloading = false; this.G.sfx3d?.('reload', this.pos, 0.8, 20); }
    }
  }
  shoot(it, d, chargeScale = 1, inBurst = false) {
    const G = this.G; it.mag--; this.fireCd = d.mode === 'burst' ? 0.05 : 1 / d.rate; if (d.mode === 'spin') this.fireCd = 1 / d.rate;
    this.sinceFired = 0; this.emoteName = null;
    const origin = this.muzzle(_v); const o = origin.clone();
    // direction toward the aim point (convergence), fallback to camera/aim direction
    let dir = _v2.copy(this.aimPoint).sub(o); const dl = dir.length();
    if (dl < 1.5 || dir.dot(this.aimDir) < 0.4 * dl) dir.copy(this.aimDir); else dir.divideScalar(dl);
    const spread = this.spreadDeg(); this.bloom = Math.min(d.maxBloom, this.bloom + d.bloom);
    if (d.dual) this.dualSide ^= 1;
    G.combat.shoot(this, d, it, o, dir.clone(), spread, chargeScale);
    this.rig.kick = 1;
    if (this.isPlayer) { this.recoilPitch += d.recoil[0] * (this.adsWant ? 0.7 : 1); this.recoilYaw += (Math.random() - 0.5) * 2 * d.recoil[1]; G.onPlayerShot?.(this, d); }
    if (it.mag <= 0 && this.inv.ammo[d.ammo] > 0 && d.mode !== 'burst' && (d.mode === 'charge' || this.autoTrigger)) this.startReload();
    if (d.mode === 'charge') { this.fireCd = 1 / d.rate; this.charge = 0; }
  }

  // ---- melee ----
  startSwing(it, d) {
    this.swingT = 0; this.swingHit = false; this.swingDur = 1 / d.rate; this.swingCd = this.swingDur; this.swingDir = -this.swingDir; this.rig.swingDir = this.swingDir; this.sinceFired = 0; this.emoteName = null;
    this.G.sfx3d?.(d.id === 'pickaxe' ? 'knife' : d.sound, this.pos, 0.7, 14);
  }
  updateSwing(dt, d) {
    if (!d || d.type !== 'melee') { this.swingT = -1; return; }
    this.swingT += dt / this.swingDur;
    if (!this.swingHit && this.swingT >= 0.45) { this.swingHit = true; this.G.combat.melee(this, d, this.item); }
    if (this.swingT >= 1) this.swingT = -1;
  }
  startDash(it, d) {
    const [fx, fz] = fwd(this.yaw); this.dashDir.set(fx, 0, fz); this.dashT = 0.2; this.dashCd = d.dash.cd; this.swingT = 0; this.swingDur = 0.3; this.swingHit = true; this.swingCd = 0.4;
    this.G.combat.dashSlash(this, d, it); this.G.sfx3d?.('knife', this.pos, 1, 25);
  }
  pickaxeAction() {
    if (this.state !== 'ground' || !this.alive) return;
    if (this.buildMode) this.toggleBuild(false);
    const d = this.def;
    // Y always brings out the pickaxe (even from a blade or machete, which R2 swings); pressing it again swings
    if (!d || d.id !== 'pickaxe') { this.select(0, true); this.pendingSwing = true; return; }
    if (this.swingCd <= 0 && this.swingT < 0 && this.switchT <= 0) this.startSwing(this.item, d);
  }

  // ---- throwing ----
  nadeSlots() { const out = []; for (let i = 1; i < 6; i++) { const s = this.inv.slots[i]; if (s && ITEMS[s.id].type === 'throw') out.push(i); } return out; }
  quickThrow() {
    if (this.state !== 'ground' || !this.alive || this.throwT >= 0 || this.buildMode) return false;
    const slots = this.nadeSlots(); if (!slots.length) return false;
    let pick = slots.find(i => this.inv.slots[i].id === this.lastThrown) ?? slots[0]; this.startThrow(this.inv.slots[pick].id); return true;
  }
  startThrow(id) {
    if (this.slotOf(id) < 0) return; this.throwT = 0; this.throwId = id; this.throwDone = false; this.lastThrown = id; this.sinceFired = 0; this.emoteName = null; this.using = null; this.setDisplay();
    this.G.sfx3d?.('grenadePin', this.pos, 1, 12);
  }
  startKnife() { if (this.countOf('tknives') <= 0) return; this.throwT = 0; this.throwId = 'tknives'; this.throwDone = false; this.sinceFired = 0; this.setDisplay(); }
  updateThrow(dt) {
    this.throwT += dt / 0.55;
    if (!this.throwDone && this.throwT >= 0.5) {
      this.throwDone = true; const id = this.throwId, i = this.slotOf(id);
      if (i >= 0) { const hand = this.rig.h.worldOf('rHand', _v).clone(); this.G.combat.throwItem(this, id, hand, this.aimDir.clone(), this.aimPoint); this.removeFromSlot(i, 1); }
    }
    if (this.throwT >= 1) { this.throwT = -1; this.throwId = null; this.setDisplay(); }
  }

  // ---- healing / using ----
  bestMed() {
    const hasI = id => this.slotOf(id) >= 0;
    const hpN = this.hp < MAX_HP, shN = this.shield < MAX_SHIELD;
    if (hpN && this.hp <= 40 && hasI('medkit')) return 'medkit';
    if (this.hp < 75 && hasI('bandage')) return 'bandage';
    if (hpN && hasI('medkit') && this.hp < 60) return 'medkit';
    if (this.shield < 50 && hasI('smallshield')) return 'smallshield';
    if (shN && hasI('potion')) return 'potion';
    if (shN && this.shield < 50 && hasI('smallshield')) return 'smallshield';
    if (this.hp < 75 && hasI('medkit')) return 'medkit';
    return null;
  }
  quickHeal() { const id = this.bestMed(); if (!id) return false; return this.startUse(id, false); }
  startUse(id, holdSlot) {
    if (this.using || this.state !== 'ground' || this.buildMode || this.throwT >= 0) return false;
    const d = ITEMS[id]; if (this.slotOf(id) < 0) return false;
    if (d.hp && this.hp >= (d.hpCap || 100) && !d.shield) return false; if (d.shield && !d.hp && this.shield >= (d.shieldCap || 100)) return false;
    this.using = { id, t: 0, need: d.time, holdSlot: !!holdSlot }; this.useT = 0; this.reloading = false; this.charge = 0; this.emoteName = null; this.setDisplay();
    this.G.sfx3d?.('select', this.pos, 0.5, 10); return true;
  }
  updateUse(dt) {
    if (!this.using) return;
    const u = this.using; u.t += dt; this.useT = u.t / u.need;
    if (u.t >= u.need) {
      const d = ITEMS[u.id], i = this.slotOf(u.id);
      if (i >= 0) {
        if (d.hp) this.hp = Math.min(Math.max(this.hp, d.hpCap || 100), this.hp + d.hp);
        if (d.shield) this.shield = Math.min(Math.max(this.shield, d.shieldCap || 100), this.shield + d.shield);
        this.removeFromSlot(i, 1); this.G.sfx3d?.(d.shield ? 'shield' : 'heal', this.pos, 1, 20);
        if (this.isPlayer) this.G.hud?.toast(d.shield ? `+${d.shield} shield` : `+${d.hp} health`, 1.2);
      }
      this.using = null; this.useT = 0; this.setDisplay();
    }
  }
  cancelUse() { if (this.using) { this.using = null; this.useT = 0; this.setDisplay(); } }

  // ---- interaction (chests / pickups) ----
  updateInteract(dt) {
    if (this.state !== 'ground' || !this.alive) { this.interactT = 0; this.interactTarget = null; return; }
    const loot = this.G.loot;
    if (!this.interactHeld) { this.interactT = 0; this.interactTarget = null; return; }
    const tgt = loot.findTarget(this); if (!tgt) { this.interactT = 0; this.interactTarget = null; return; }
    if (!this.interactTarget || tgt.obj !== this.interactTarget.obj) { this.interactTarget = tgt; this.interactT = 0; }
    this.interactT += dt; this.interactNeed = tgt.need;
    if (tgt.kind === 'chest' && this.interactT < dt * 1.5) this.G.sfx3d?.('select', this.pos, 0.4, 10);
    if (this.interactT >= tgt.need) { this.interactT = 0; loot.interact(this, tgt); this.interactTarget = null; }
  }

  // ---- emotes ----
  startEmote() {
    if (this.state !== 'ground' || this.buildMode || this.using) return;
    const list = ['wave', 'dance', 'cheer']; const i = this.emoteName ? (list.indexOf(this.emoteName) + 1) % list.length : 0;
    this.emoteName = list[i]; this.emoteT = 0; this.setDisplay(); this.G.sfx3d?.('ui', this.pos, 0.8, 20);
  }
  updateEmote(dt) {
    if (!this.emoteName) return; this.emoteT += dt;
    if (this.speed > 1.2 || this.fireHeld || !this.grounded) { this.emoteName = null; }
  }

  // ---------------- damage ----------------
  /** info: { attacker, head, weapon, point, dir, bypass, kind }. Returns { shield, hp }. */
  damage(amount, info = {}) {
    if (!this.alive || this.invuln > 0 || amount <= 0) return { shield: 0, hp: 0 };
    if (this.isPlayer && this.G.opts?.god) return { shield: 0, hp: 0 };
    // robot-vs-robot fights run at half damage so the lobby lasts into the late storm circles (you vs robots is full damage)
    if (this.bot && info.attacker && info.attacker.bot && !info.bypass) amount *= 0.5;
    let rem = amount, sh = 0, hp = 0;
    if (!info.bypass && this.shield > 0) { sh = Math.min(this.shield, rem); this.shield -= sh; rem -= sh; }
    if (rem > 0) { hp = Math.min(this.hp, rem); this.hp -= rem; }
    this.sinceHit = 0; this.hitFlash = 1;
    if (info.attacker && info.attacker !== this) { this.lastHit = { attacker: info.attacker, t: this.G.time, weapon: info.weapon || null, pos: info.attacker.pos.clone() }; }
    else if (info.kind === 'storm' || info.kind === 'fall') this.lastHit = this.lastHit || null;
    this.G.onDamaged?.(this, info, sh, hp);
    if (this.hp <= 0) this.eliminate(info);
    return { shield: sh, hp };
  }
  heal(hp = 0, shield = 0) { this.hp = Math.min(MAX_HP, this.hp + hp); this.shield = Math.min(MAX_SHIELD, this.shield + shield); }
  eliminate(info = {}) {
    if (!this.alive) return; this.alive = false; this.hp = 0; this.state = 'dead'; this.fireHeld = false; this.cancelAll(); this.buildMode = false; this.dissolve = 0; this.glider.visible = false;
    this.G.onEliminated?.(this, info);
  }
  updateDissolve(dt) {
    if (this.dissolve < 0) return; this.dissolve += dt; const k = this.dissolve / 0.8;
    if (k >= 1) { this.root.visible = false; this.dissolve = -1; return; }
    const s = 1 - k * k; this.root.scale.set(s, 1 + k * 0.5, s); this.root.position.y = this.pos.y + k * 0.8; this.root.rotation.y += dt * 8;
  }

  // ---------------- visuals ----------------
  updateVisual(dt, camPos = null) {
    const rig = this.rig, root = this.root;
    if (!this.alive) return;
    if (this.state === 'bus') { root.visible = false; return; }
    // visibility / LOD
    if (camPos) { const dx = this.pos.x - camPos.x, dz = this.pos.z - camPos.z, d2 = dx * dx + dz * dz; this.visible = this.isPlayer || d2 < 190 * 190; }
    root.visible = this.visible; if (!this.visible) return;
    root.position.copy(this.pos);
    // facing
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const aimMode = (this.def?.type === 'gun' && !this.buildMode) || this.adsWant || this.sinceFired < 1.2 || this.state !== 'ground' || this.swingT >= 0 || this.emoteName === null && this.fireHeld;
    let target = this.bodyYaw;
    if (this.state === 'free' || this.state === 'glide') target = this.yaw;
    else if (aimMode) target = this.yaw; else if (sp > 0.6) target = Math.atan2(this.vel.x, this.vel.z); else if (this.emoteName) target = this.bodyYaw;
    this.bodyYaw += angDiff(this.bodyYaw, target) * Math.min(1, dt * 14);
    root.rotation.y = this.bodyYaw;
    const [bx, bz] = fwd(this.bodyYaw), speedF = sp > 0.1 ? (this.vel.x * bx + this.vel.z * bz) / sp : 0, speedS = sp > 0.1 ? (this.vel.x * -bz + this.vel.z * bx) / sp : 0;
    const gun = this.def?.type === 'gun';
    // make the weapon converge on whatever the crosshair is over (the shoulder camera is offset from the body)
    let pitchVis = this.pitch, yawOff = 0;
    if (this.state === 'ground' && !this.buildMode && gun) {
      const adx = this.aimPoint.x - this.pos.x, adz = this.aimPoint.z - this.pos.z, ad = Math.hypot(adx, adz);
      if (ad > 4) { yawOff = clamp(angDiff(this.bodyYaw, Math.atan2(adx, adz)) - (this.adsWant ? 0.0 : 0.07), -0.35, 0.3); pitchVis = clamp(Math.atan2(this.aimPoint.y - (this.pos.y + 1.35), ad), -1.2, 1.2); }
    }
    const aimTarget = this.sprinting ? 0 : this.adsWant || this.sinceFired < 2.2 || this.fireHeld ? 1 : gun ? 0.75 : 0.0;
    rig.aimBlend += (aimTarget - rig.aimBlend) * Math.min(1, dt * 9);
    const spinN = this.def?.mode === 'spin' ? this.spin : 0;
    const st = {
      mode: this.state === 'free' ? 'free' : this.state === 'glide' ? 'glide' : this.buildMode ? 'build' : 'ground',
      speed: this.state === 'ground' ? this.speed : sp, fwd: speedF, side: speedS, crouch: this.crouching, sprint: this.sprinting, air: this.state === 'ground' && !this.grounded, vy: this.vel.y,
      aim: this.state === 'ground' ? rig.aimBlend : 0, ads: this.adsWant ? 1 : 0, pitch: pitchVis, aimYaw: yawOff, swingT: this.swingT >= 0 ? this.swingT : -1, throwT: this.throwT >= 0 ? this.throwT : -1, useT: this.using ? 1 : 0,
      reloadT: this.reloading ? Math.min(0.99, this.reloadProg ?? this.reloadT / this.reloadDur) : -1, emote: this.emoteName, emoteT: this.emoteT, draw: this.charge, spin: spinN, dive: this.diveAmt || 0,
    };
    if (this.pendingSwing && this.swingT < 0 && this.switchT <= 0.05) { this.pendingSwing = false; if (this.def?.type === 'melee' && this.swingCd <= 0) this.startSwing(this.item, this.def); }
    this.setDisplay();
    rig.update(st, dt);
    if (this.state === 'glide') { this.glider.visible = true; this.glider.rotation.z = -this.moveS * 0.25; this.glider.rotation.x = this.moveF * 0.12; } else this.glider.visible = false;
    if (this.hitFlash > 0 && this.isPlayer === false) { /* hit flash handled by HUD hitmarkers */ }
  }
}
