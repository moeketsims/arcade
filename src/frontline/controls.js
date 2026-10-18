// Translates the shared Pad (controller + keyboard/mouse) into Frontline Ops actions: look curves, sprint latch,
// tap / hold / double-tap button semantics, scoreboard tap-or-hold, menu navigation.
import { Pad } from '../common/pad.js';
import { clamp } from './util.js';

export const KEYMAP = {
  A: ['Space'],
  B: ['KeyC', 'ControlLeft'],
  X: ['KeyR', 'KeyE'],
  L1: ['KeyQ'], R1: ['KeyG'],
  L2: ['Mouse2'], R2: ['Mouse0'],
  L3: ['ShiftLeft', 'ShiftRight'], R3: ['KeyV'],
  UP: ['Digit3'], RIGHT: ['Digit4'], LEFT: ['Digit5'], DOWN: ['KeyB'],
  SELECT: ['CapsLock'],
};
// Y has no keyboard keys in the Pad map: F / 1 / 2 / wheel are handled as raw keys below so they can mean different things.

const TAP = 0.28, HOLD = 0.42;

export class Controls {
  constructor(settings, canvas = null) {
    this.settings = settings;
    this.pad = new Pad({ keymap: KEYMAP, pointerLock: canvas || undefined });
    // raw keyboard edge tracking
    this.rawDown = new Set(); this.rawPressed = new Set(); this.rawReleased = new Set(); this.wheelUp = 0; this.wheelDown = 0;
    this._kd = e => { if (!e.repeat) this.rawPressed.add(e.code); this.rawDown.add(e.code); };
    this._ku = e => { this.rawDown.delete(e.code); this.rawReleased.add(e.code); };
    this._wh = e => { if (e.deltaY < 0) this.wheelUp++; else if (e.deltaY > 0) this.wheelDown++; };
    if (typeof addEventListener === 'function') { addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('wheel', this._wh, { passive: true }); addEventListener('blur', () => this.rawDown.clear()); }
    this.reset();
    this.sprintLatch = false; this._xHeldMax = 0; this.stickHold = 0; this.navRepeat = 0; this.navDir = 0; this.yHeld = 0; this.fHeld = 0; this.sbTime = 0; this.sbToggle = false;
  }
  reset() {
    this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0; this.rawLookX = 0; this.rawLookY = 0;
    this.fire = false; this.firePressed = false; this.fireReleased = false; this.ads = false; this.adsPressed = false; this.adsReleased = false;
    this.sprintHeld = false; this.sprintPressed = false; this.sprintDouble = false;
    this.jump = false; this.jumpPressed = false;
    this.crouchPressed = false; this.crouchHeld = false; this.crouchReleased = false; this.crouchHeldFor = 0;
    this.reloadReleasedTap = false; this.reloadHeld = false; this.reloadHeldFor = 0; this.reloadPressed = false;
    this.switchPressed = false; this.selectSlot = -1; this.meleeHold = false; this.inspect = false; this.yDouble = false;
    this.meleeQuick = false; this.lethalPressed = false; this.lethalHeld = false; this.lethalReleased = false;
    this.tacticalPressed = false; this.tacticalHeld = false; this.tacticalReleased = false;
    this.streak = [false, false, false]; this.modeSwitch = false;
    this.pause = false; this.scoreHeld = false; this.scoreToggle = false; this.overlay = false; this.home = false;
    this.usingPad = false; this.navX = 0; this.navY = 0; this.confirm = false; this.back = false; this.anyPress = false;
  }
  get connected() { return this.pad.connected; }
  /** Swallow this frame's button edges (call after a screen change so the same press is not handled twice). */
  consume() {
    this.confirm = false; this.back = false; this.navX = 0; this.navY = 0; this.pause = false; this.overlay = false; this.anyPress = false;
    this.firePressed = false; this.adsPressed = false; this.jumpPressed = false; this.crouchPressed = false; this.reloadPressed = false; this.reloadReleasedTap = false;
    this.switchPressed = false; this.meleeQuick = false; this.lethalPressed = false; this.tacticalPressed = false; this.modeSwitch = false; this.inspect = false; this.meleeHold = false;
    this.streak = [false, false, false]; this.selectSlot = -1;
  }
  /** Call once per frame (after the previous frame's logic). */
  update(dt) {
    const p = this.pad; p.update();
    const S = this.settings;
    this.usingPad = p.connected && p.usingPad;
    const locked = p.locked || this.usingPad;
    // ---- movement + look
    this.moveX = p.lx; this.moveY = p.ly;
    const sx = p.rx, sy = p.ry, mag = Math.hypot(sx, sy);
    if (mag > 0.92) this.stickHold = Math.min(1, this.stickHold + dt / 0.35); else this.stickHold = Math.max(0, this.stickHold - dt * 3);
    const ramp = 1 + 0.32 * this.stickHold;
    const curve = v => Math.sign(v) * Math.pow(Math.abs(v), 1.55);
    const rate = 3.4 * (S.sensStick ?? 1) * ramp;
    let lx = curve(sx) * rate * dt, ly = -curve(sy) * rate * dt;          // stick: ry>0 = pushed down
    if (locked) { lx += (p.mdx || 0) * 0.0021 * (S.sensMouse ?? 1); ly += -(p.mdy || 0) * 0.0021 * (S.sensMouse ?? 1); }
    if (S.invertY) ly = -ly;
    this.rawLookX = lx; this.rawLookY = ly;
    this.lookX = lx; this.lookY = ly;
    // ---- triggers
    this.fire = p.down('R2') && (locked || !p.keys.has('Mouse0') || this.usingPad); this.firePressed = p.pressed('R2') && this.fire; this.fireReleased = p.released('R2');
    this.ads = p.down('L2') && (locked || !p.keys.has('Mouse2') || this.usingPad); this.adsPressed = p.pressed('L2') && this.ads; this.adsReleased = p.released('L2');
    // ---- sprint: latch on pad (click L3 once), hold on keyboard (Shift); double-tap = tactical sprint
    this.sprintPressed = p.pressed('L3'); this.sprintDouble = p.doubleTap('L3');
    if (this.usingPad) { if (this.sprintPressed) this.sprintLatch = !this.sprintLatch; this.sprintHeld = this.sprintLatch; }
    else { this.sprintHeld = p.down('L3'); this.sprintLatch = false; }
    // ---- face buttons
    this.jump = p.down('A'); this.jumpPressed = p.pressed('A');
    this.crouchPressed = p.pressed('B'); this.crouchHeld = p.down('B'); this.crouchReleased = p.released('B'); this.crouchHeldFor = p.heldFor('B');
    this.reloadPressed = p.pressed('X'); this.reloadHeld = p.down('X'); this.reloadHeldFor = p.heldFor('X'); this.reloadReleasedTap = p.released('X') && this._xHeldMax < HOLD;
    if (p.pressed('X')) this._xHeldMax = 0; this._xHeldMax = Math.max(this._xHeldMax || 0, p.heldFor('X'));
    // Y (pad only): tap = switch (immediately), hold = melee, double-tap = inspect
    const yP = p.pressed('Y');
    this.switchPressed = yP && !p.doubleTap('Y'); this.yDouble = p.doubleTap('Y');
    const yHeld = p.heldFor('Y');
    this.meleeHold = p.down('Y') && yHeld >= HOLD && this.yHeld < HOLD; this.yHeld = p.down('Y') ? yHeld : 0;
    // keyboard equivalents
    this.selectSlot = -1;
    if (this.rawPressed.has('Digit1')) this.selectSlot = 0; if (this.rawPressed.has('Digit2')) this.selectSlot = 1;
    if (this.wheelUp || this.wheelDown) { this.switchPressed = true; }
    this.wheelUp = 0; this.wheelDown = 0;
    // F: tap = inspect, hold = melee
    let fTap = false;
    if (this.rawPressed.has('KeyF')) this.fHeld = 0;
    if (this.rawDown.has('KeyF')) { const prev = this.fHeld; this.fHeld += dt; if (prev < HOLD && this.fHeld >= HOLD) this.meleeHold = true; }
    if (this.rawReleased.has('KeyF') && this.fHeld < HOLD) fTap = true;
    this.inspect = this.yDouble || fTap;
    // ---- shoulders / sticks / dpad
    this.meleeQuick = p.pressed('R3');
    this.lethalPressed = p.pressed('R1'); this.lethalHeld = p.down('R1'); this.lethalReleased = p.released('R1');
    this.tacticalPressed = p.pressed('L1'); this.tacticalHeld = p.down('L1'); this.tacticalReleased = p.released('L1');
    this.streak[0] = p.pressed('UP'); this.streak[1] = p.pressed('RIGHT'); this.streak[2] = p.pressed('LEFT'); this.modeSwitch = p.pressed('DOWN');
    // ---- system
    this.pause = p.pressed('START'); this.overlay = p.pressed('TOUCH'); this.home = p.pressed('HOME');
    // scoreboard: hold SELECT to show, quick tap toggles (CapsLock keys behave oddly across platforms)
    this.scoreToggle = false;
    if (p.pressed('SELECT')) this.sbTime = 0;
    if (p.down('SELECT')) this.sbTime += dt;
    if (p.released('SELECT') && this.sbTime < TAP) { this.sbToggle = !this.sbToggle; this.scoreToggle = true; }
    this.scoreHeld = (p.down('SELECT') && this.sbTime >= TAP * 0.6) || this.sbToggle;
    // ---- menu navigation helpers (D-pad, stick, arrows, WASD, Enter...)
    this._nav(dt);
    this.anyPress = p.any() || this.rawPressed.size > 0;
    this.rawPressed.clear(); this.rawReleased.clear();
  }

  _nav(dt) {
    const p = this.pad, k = c => this.rawDown.has(c);
    let nx = 0, ny = 0;
    if (p.down('LEFT') || k('ArrowLeft') || k('KeyA')) nx -= 1; if (p.down('RIGHT') || k('ArrowRight') || k('KeyD')) nx += 1;
    if (p.down('UP') || k('ArrowUp') || k('KeyW')) ny -= 1; if (p.down('DOWN') || k('ArrowDown') || k('KeyS')) ny += 1;
    if (Math.abs(p.lx) > 0.6) nx += Math.sign(p.lx); if (Math.abs(p.ly) > 0.6) ny -= Math.sign(p.ly);
    nx = clamp(nx, -1, 1); ny = clamp(ny, -1, 1);
    const code = ny + nx * 3;
    this.navX = 0; this.navY = 0;
    if (code !== 0) {
      if (code !== this.navDir) { this.navDir = code; this.navRepeat = 0.38; this.navX = nx; this.navY = ny; }
      else { this.navRepeat -= dt; if (this.navRepeat <= 0) { this.navRepeat = 0.11; this.navX = nx; this.navY = ny; } }
    } else this.navDir = 0;
    this.confirm = p.pressed('A') || this.rawPressed.has('Enter') || this.rawPressed.has('Space');
    this.back = p.pressed('B') || this.rawPressed.has('Backspace');
  }
}
