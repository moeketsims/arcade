// Player controller: maps every pad/keyboard button to fighter actions and drives the over-the-shoulder camera.
import * as THREE from 'three';
import { CAMERA_FOV } from './config.js';
import { rayFighter } from './combat.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();

export const KEYMAP = {
  A: ['Space'], B: ['KeyQ'], X: ['KeyR', 'KeyE'], Y: ['KeyF'], L1: ['WheelUp'], R1: ['WheelDown'], L2: ['Mouse2'], R2: ['Mouse0'],
  L3: ['ShiftLeft', 'ShiftRight'], R3: ['KeyC'], UP: ['KeyH'], DOWN: ['KeyT'], RIGHT: ['KeyG'], SELECT: ['KeyB'],
};

export class PlayerController {
  constructor(G) {
    this.G = G; this.yaw = 0; this.pitch = 0; this.cam = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1400); this.camPos = new THREE.Vector3(); this.adsT = 0; this.fov = CAMERA_FOV;
    this.kd = new Set(); this.kp = new Set(); this.xHold = 0; this.crouchDown = 0; this.sprintDown = 0; this.repeatT = 0; this.shake = 0; this.camFrac = 1; this.dist = 3.2; this.firstPerson = false; this.deadT = 0; this.orbit = 0; this.mouseSens = 0.0022; this.lookSpeed = 3.3;
    addEventListener('keydown', e => { if (!e.repeat) this.kp.add(e.code); this.kd.add(e.code); });
    addEventListener('keyup', e => this.kd.delete(e.code)); addEventListener('blur', () => this.kd.clear());
  }
  resetView(yaw) { this.yaw = yaw; this.pitch = -0.15; this.adsT = 0; this.fov = CAMERA_FOV; this.deadT = 0; this.xHold = 0; }
  key(c) { return this.kp.has(c); }
  endFrame() { this.kp.clear(); }

  /** Read input and command the player fighter. */
  handleInput(dt, enabled = true) {
    const G = this.G, pad = G.pad, f = G.player; if (!f) return;
    // ------- look -------
    const adsSlow = 1 - 0.5 * this.adsT * (G.player.def?.zoom > 3 ? 1 : 0.7);
    let rx = pad.rx, ry = pad.ry; const sgn = Math.sign, curve = v => sgn(v) * Math.pow(Math.abs(v), 1.55);
    const assist = pad.usingPad ? this.assistFactor() : 1;
    if (enabled) {
      this.yaw -= (curve(rx) * this.lookSpeed * dt + pad.mdx * this.mouseSens * (G.opts.sens || 1)) * adsSlow * assist;
      this.pitch -= (curve(ry) * this.lookSpeed * 0.8 * dt + pad.mdy * this.mouseSens * (G.opts.sens || 1)) * adsSlow * assist;
      this.pitch = clamp(this.pitch, -1.3, 1.4);
    }
    // keep fighter facing = camera yaw (+ recoil)
    const rp = f.recoilPitch * Math.PI / 180, ry2 = f.recoilYaw * Math.PI / 180;
    f.yaw = this.yaw + ry2; f.pitch = clamp(this.pitch + rp, -1.4, 1.45);
    if (!enabled || !f.alive) { f.fireHeld = false; f.adsWant = false; f.move.x = f.move.z = 0; f.interactHeld = false; return; }
    // ------- movement -------
    const lx = pad.lx, ly = pad.ly, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    f.move.x = sy * ly - cy * lx; f.move.z = cy * ly + sy * lx; f.moveF = ly; f.moveS = lx;
    const state = f.state;
    if (state === 'bus') { if (pad.pressed('A')) G.ejectFromBus(f); return; }
    if (state === 'free' || state === 'glide') { if (pad.pressed('A')) f.jump(); return; }
    // ------- ground -------
    const build = f.buildMode, pro = pad.usingPad, moving = Math.hypot(lx, ly) > 0.12;
    // sprint toggle (L3 / Shift): press toggles, long hold behaves like hold-to-sprint
    if (pad.pressed('L3')) { f.sprintWant = !f.sprintWant; this.sprintDown = 0; }
    if (pad.down('L3')) this.sprintDown += dt; if (pad.released('L3') && this.sprintDown > 0.35) f.sprintWant = false;
    if (!moving) f.sprintWant = false;
    // crouch toggle / hold (R3 / C) — C is the ramp key in build mode on the keyboard
    const crouchKeyIsBuild = build && !pro && this.key('KeyC');
    if (pad.pressed('R3') && !crouchKeyIsBuild) { f.crouchWant = !f.crouchWant; this.crouchDown = 0; if (f.crouchWant) f.sprintWant = false; }
    if (pad.down('R3')) this.crouchDown += dt; if (pad.released('R3') && this.crouchDown > 0.4) f.crouchWant = false;
    // jump / glider
    if (pad.down('A')) f.jump();
    // emote
    if (pad.pressed('SELECT')) f.startEmote();
    // heal / grenade
    if (pad.pressed('UP') && !f.using) { if (!f.quickHeal()) G.hud.toast(f.hp >= 100 && f.shield >= 100 ? 'Already at full health and shield' : f.bestMed() === null && (f.slotOf('bandage') >= 0 || f.slotOf('medkit') >= 0 || f.slotOf('smallshield') >= 0 || f.slotOf('potion') >= 0) ? 'Health and shield are high enough' : 'No healing items', 1.2); }
    if (pad.pressed('DOWN')) { if (!f.quickThrow()) G.hud.toast('No grenades', 1.0); }
    // build toggle / pickaxe
    if (pad.pressed('B')) { f.toggleBuild(); if (f.buildMode) { f.crouchWant = false; G.sfx.play('select', { vol: 0.5 }); } }
    if (pad.pressed('Y')) f.pickaxeAction();
    // slot selection by number keys
    for (let i = 0; i < 6; i++) if (this.key('Digit' + (i + 1)) || this.key('Numpad' + (i + 1))) f.select(i);
    // interaction: hold X (or E) when something can be used, tap X / R to reload
    const tgt = G.loot.findTarget(f); G.interactTarget = tgt; f.interactHeld = false;
    if (pad.pressed('X')) { this.xHold = 0; if (!tgt) f.startReload(); }
    if (pad.down('X')) { this.xHold += dt; if (tgt) f.interactHeld = true; else if (this.xHold > 0.3 && f.def && f.def.type === 'med' && !f.using) f.startUse(f.item.id, false); }
    if (pad.released('X') && tgt && this.xHold < 0.2 && f.interactT < 0.2) f.startReload();
    // ------- combat vs build -------
    f.adsWant = false;
    if (build) {
      f.fireHeld = false;
      const rep = this.repeatT <= 0; this.repeatT = Math.max(0, this.repeatT - dt);
      let kind = null;
      if (pro) {
        if (pad.pressed('R2') || (pad.down('R2') && rep)) kind = 'wall'; else if (pad.pressed('L2') || (pad.down('L2') && rep)) kind = 'ramp';
        else if (pad.pressed('R1') || (pad.down('R1') && rep)) kind = 'floor'; else if (pad.pressed('L1') || (pad.down('L1') && rep)) kind = 'roof';
        if (pad.pressed('LEFT')) this.cycleMat(f, -1); if (pad.pressed('RIGHT')) this.cycleMat(f, 1);
        // keyboard piece keys still work while a pad is active
      } else {
        if (this.key('KeyZ')) f.buildPiece = 'wall'; if (this.key('KeyX')) f.buildPiece = 'floor'; if (this.key('KeyC')) f.buildPiece = 'ramp'; if (this.key('KeyV')) f.buildPiece = 'roof';
        const order = ['wall', 'floor', 'ramp', 'roof'];
        if (pad.pressed('L1')) f.buildPiece = order[(order.indexOf(f.buildPiece) + 3) % 4]; if (pad.pressed('R1')) f.buildPiece = order[(order.indexOf(f.buildPiece) + 1) % 4];
        if (pad.pressed('R2') || (pad.down('R2') && rep)) kind = f.buildPiece; else if (pad.pressed('L2')) kind = 'ramp';
        if (pad.pressed('LEFT')) this.cycleMat(f, -1); if (pad.pressed('RIGHT')) this.cycleMat(f, 1);
      }
      if (kind) { G.build.place(f, kind); this.repeatT = 0.13; }
      if (pro) { if (pad.pressed('R2')) f.buildPiece = 'wall'; else if (pad.pressed('L2')) f.buildPiece = 'ramp'; else if (pad.pressed('R1')) f.buildPiece = 'floor'; else if (pad.pressed('L1')) f.buildPiece = 'roof'; }
    } else {
      f.fireHeld = pad.down('R2');
      const def = f.def;
      f.adsWant = pad.down('L2') && !!def && def.type === 'gun' && f.state === 'ground' && !f.sprinting;
      f.adsPressed = pad.pressed('L2');
      if (pad.pressed('L1') || pad.pressed('LEFT')) f.cycle(-1);
      if (pad.pressed('R1') || pad.pressed('RIGHT')) f.cycle(1);
      if (pad.pressed('R2') && f.def && f.def.type === 'gun' && f.sprintWant) f.sprintWant = false;
      if (f.fireHeld || f.adsWant) { f.crouchWant = f.crouchWant && !f.sprinting; }
    }
    if (f.fireHeld && f.using && !f.using.holdSlot) f.cancelUse();
  }
  cycleMat(f, d) { f.buildMat = (f.buildMat + d + 3) % 3; this.G.sfx.play('ui', { vol: 0.5 }); }

  /** Slight aim friction when an enemy is under the reticle (controller only). */
  assistFactor() {
    const G = this.G, f = G.player; if (!f.alive || f.state !== 'ground') return 1;
    this.camForward(_f);
    for (const t of G.alive) {
      if (t === f || t.state === 'bus') continue; t.center(_a).sub(this.camPos); const d = _a.length(); if (d > 90 || d < 2) continue; if (_a.dot(_f) / d > 0.9985) { return 0.62; }
    }
    return 1;
  }
  camForward(out) { const cp = Math.cos(this.pitch), p = this.G.player; return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp); }

  // ---------------- camera ----------------
  update(dt) {
    const G = this.G, f = G.player, cam = this.cam, cw = G.world.cw, T = G.world.terrain, st = G.state;
    let fovT = CAMERA_FOV, dist = 3.1, side = 1.05, up = 0.38, target = _c;
    const def = f.def, gun = def && def.type === 'gun' && f.state === 'ground' && f.alive && !f.buildMode;
    const adsTarget = f.adsWant && gun ? 1 : (def && def.mode === 'charge' && f.charge > 0.05 && gun ? Math.min(1, f.charge * 1.6) : 0);
    this.adsT += (adsTarget - this.adsT) * Math.min(1, dt * 11);
    this.firstPerson = false;
    const yaw = this.yaw + f.recoilYaw * Math.PI / 180, pitch = clamp(this.pitch + f.recoilPitch * Math.PI / 180, -1.4, 1.45);
    if (st === 'title' || st === 'loading') {
      const t = G.time * 0.08; cam.position.set(Math.cos(t) * 190, 85, Math.sin(t) * 190); cam.lookAt(0, 6, 0); cam.fov = 60; cam.updateProjectionMatrix(); this.camPos.copy(cam.position); return;
    }
    if (f.state === 'bus' || (st === 'bus' && G.bus.active && f.state === 'bus')) {
      target = _c.copy(G.bus.pos).add(_a.set(0, 6, 0)); dist = 30; side = 0; up = 0; fovT = 62;
    } else if (!f.alive) {
      this.deadT += dt; const k = this.deadT * 0.35; target = _c.copy(f.pos).add(_a.set(0, 1.2, 0)); dist = 6; side = 0; up = 1; this.yaw += dt * 0.25; fovT = 55;
    } else if (f.state === 'free') { target = f.eye(_c); target.y -= 0.2; dist = 7.5; side = 0.9; up = 1.4; fovT = 70 + Math.min(10, f.speed * 0.1); }
    else if (f.state === 'glide') { target = f.eye(_c); dist = 5.8; side = 0.8; up = 1.6; fovT = 64; }
    else {
      target = f.eye(_c);
      const k = this.adsT; dist = lerp(3.1, 1.85, k); side = lerp(1.05, 0.62, k); up = lerp(0.38, 0.22, k);
      if (f.crouching) up -= 0.05;
      if (gun) fovT = CAMERA_FOV / lerp(1, def.zoom, k);
      if (gun && def.scope && this.adsT > 0.9) { this.firstPerson = true; dist = 0; side = 0; up = 0; }
      if (f.buildMode) { dist = 3.9; up = 0.55; side = 0.7; fovT = 62; }
    }
    this.fov += (fovT - this.fov) * Math.min(1, dt * 10);
    // direction + position
    const cp = Math.cos(pitch), fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const bx = target.x, by = target.y + up, bz = target.z;                       // head pivot
    const dx = rx * side - fx * dist, dy = -fy * dist, dz = rz * side - fz * dist;  // pivot -> desired camera
    const len = Math.hypot(dx, dy, dz); let frac = 1;
    if (len > 0.05) {
      const hit = cw.raycast(bx, by, bz, dx / len, dy / len, dz / len, len + 0.35, { bullet: false, terrain: true });
      if (hit) frac = clamp((hit.t - 0.3) / len, 0.06, 1);
    }
    if (frac < this.camFrac) this.camFrac = frac; else this.camFrac += (frac - this.camFrac) * Math.min(1, dt * 5);
    cam.position.set(bx + dx * this.camFrac, by + dy * this.camFrac, bz + dz * this.camFrac);
    const gy = T.groundAt(cam.position.x, cam.position.z) + 0.35; if (cam.position.y < gy) cam.position.y = gy;
    cam.fov = this.fov; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    // camera shake
    const sh = Math.max(G.fx.shake, 0) * 0.5; if (sh > 0) cam.position.add(_a.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.lookAt(cam.position.x + fx, cam.position.y + fy, cam.position.z + fz);
    this.camPos.copy(cam.position);
    // hide the player's body when it would fill the lens or when scoped
    if (f.alive && f.state !== 'bus') f.root.visible = !this.firstPerson && !(dist < 0.6);
  }

  /** Compute the aim point (what the crosshair is over) for the player's shots. */
  computeAim() {
    const G = this.G, f = G.player, cw = G.world.cw; const cam = this.cam;
    const cp = Math.cos(cam.rotation.x); const dir = _f; cam.getWorldDirection(dir);
    const o = this.camPos, hit = cw.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 350, { bullet: true });
    let t = hit ? hit.t : 350;
    // include other fighters so bullets converge on whatever the crosshair is over (fixes the shoulder-camera parallax)
    for (const q of G.alive) { if (q === f || q.state === 'bus' || !q.alive) continue; const r = rayFighter(o, dir, t, q); if (r && r.t < t) t = r.t; }
    f.aimPoint.set(o.x + dir.x * t, o.y + dir.y * t, o.z + dir.z * t); f.aimDir.copy(dir);
    // if the aim point is closer than the character, bullets would flip: handled by the fighter (falls back to aimDir)
  }
}
