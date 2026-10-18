// Shared controller + keyboard/mouse input for every game in the arcade.
// Buttons use POSITIONAL names from the W3C "standard" gamepad mapping, so the same code works on
// PlayStation (DualSense), Xbox and generic pads:
//   A = bottom face (PS ✕)   B = right face (PS ○)   X = left face (PS □)   Y = top face (PS △)
//   L1/R1 = bumpers  L2/R2 = triggers (analog in l2v/r2v)  L3/R3 = stick clicks
//   UP/DOWN/LEFT/RIGHT = D-pad  SELECT = Create/View  START = Options/Menu  HOME = PS/Xbox  TOUCH = touchpad press
// Sticks: lx, ly (left; ly > 0 = pushed up/forward), rx, ry (right; ry > 0 = pushed DOWN, like a mouse).
export const BUTTONS = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'TOUCH'];
const INDEX = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16, TOUCH: 17 };
export const PS_NAME = { A: '✕', B: '○', X: '□', Y: '△', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', SELECT: 'Create', START: 'Options', L3: 'L3', R3: 'R3', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', HOME: 'PS', TOUCH: 'Touchpad' };
export const XB_NAME = { A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT', SELECT: 'View', START: 'Menu', L3: 'LS', R3: 'RS', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', HOME: 'Xbox', TOUCH: 'Pad' };
const KEY_NICE = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backquote: '`', Mouse0: 'Mouse L', Mouse1: 'Mouse M', Mouse2: 'Mouse R', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace' };
export const niceKey = c => KEY_NICE[c] || c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');

// Keyboard defaults every game shares: Esc = Options, ` / Home = back to the arcade, Tab = touchpad (controls).
const BASE_KEYS = { START: ['Escape'], HOME: ['Backquote', 'Home'], TOUCH: ['Tab'] };

export class Pad {
  /**
   * @param {object} o
   *   keymap:   { BUTTON: [codes...] } keyboard/mouse codes per button ('KeyJ', 'Space', 'Mouse0', 'WheelUp' …)
   *   moveKeys: { up, down, left, right } codes for the left stick (default WASD)
   *   lookKeys: { up, down, left, right } codes for the right stick (default arrow keys)
   *   pointerLock: element — click it to lock the mouse; mouse motion then feeds mdx/mdy (for shooters)
   */
  constructor(o = {}) {
    this.keymap = { ...BASE_KEYS, ...(o.keymap || {}) };
    for (const k of Object.keys(BASE_KEYS)) this.keymap[k] = [...new Set([...(o.keymap?.[k] || []), ...BASE_KEYS[k]])];
    this.moveKeys = o.moveKeys || { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };
    this.lookKeys = o.lookKeys || { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
    this.keys = new Set(); this.tapped = new Set();
    this.held = {}; this.prev = {}; this.heldTime = {}; this.lastPress = {}; this.dbl = {};
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0; this.l2v = 0; this.r2v = 0;
    this.mdx = 0; this.mdy = 0; this._mdx = 0; this._mdy = 0;
    this.connected = false; this.id = ''; this.kind = 'keyboard'; this.gp = null; this.lastT = performance.now();
    this.usingPad = false;
    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);
    addEventListener('keydown', e => { if (block.has(e.code)) e.preventDefault(); this.keys.add(e.code); if (!e.repeat) this.tapped.add(e.code); this.usingPad = false; });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); });
    addEventListener('mousedown', e => { const c = 'Mouse' + e.button; this.keys.add(c); this.tapped.add(c); this.usingPad = false; });
    addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    addEventListener('wheel', e => { this.tapped.add(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { if (document.pointerLockElement) { this._mdx += e.movementX; this._mdy += e.movementY; } });
    if (o.pointerLock) this.enablePointerLock(o.pointerLock);
  }

  enablePointerLock(el) { el.addEventListener('click', () => { if (!document.pointerLockElement) el.requestPointerLock?.(); }); }
  get locked() { return !!document.pointerLockElement; }

  _key(codes) { return (codes || []).some(c => this.keys.has(c) || this.tapped.has(c)); }

  update() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastT) / 1000); this.lastT = now;
    this.prev = { ...this.held };
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const gp = pads.find(p => p && p.connected && p.mapping === 'standard') || pads.find(p => p && p.connected) || null;
    this.gp = gp; this.connected = !!gp; this.id = gp ? gp.id : '';
    this.kind = !gp ? 'keyboard' : /054c|dualsense|dualshock|wireless controller|playstation/i.test(gp.id) ? 'playstation' : /045e|xbox|xinput/i.test(gp.id) ? 'xbox' : 'generic';
    // keyboard → sticks
    const k = (o, d) => (this._key(o[d]) ? 1 : 0);
    let lx = k(this.moveKeys, 'right') - k(this.moveKeys, 'left'), ly = k(this.moveKeys, 'up') - k(this.moveKeys, 'down');
    let rx = k(this.lookKeys, 'right') - k(this.lookKeys, 'left'), ry = k(this.lookKeys, 'down') - k(this.lookKeys, 'up');
    let l2 = 0, r2 = 0;
    for (const b of BUTTONS) this.held[b] = this._key(this.keymap[b]);
    if (this.held.L2) l2 = 1; if (this.held.R2) r2 = 1;
    if (gp) {
      const dz = (x, y) => { const m = Math.hypot(x, y); if (m < 0.16) return [0, 0]; const s = Math.min(1, (m - 0.16) / 0.8) / m; return [x * s, y * s]; };
      // An axis only counts once it has been seen centred: some controllers (non-standard layouts, triggers wired as
      // axes, drifting sticks) report an axis resting at full tilt, which would otherwise scroll menus on its own.
      const key = gp.index + '|' + gp.id; if (this._axisPad !== key) { this._axisPad = key; this._armed = [false, false, false, false]; }
      const axis = i => { const v = gp.axes[i] || 0; if (Math.abs(v) < 0.25) this._armed[i] = true; return this._armed[i] ? v : 0; };
      const [ax, ay] = dz(axis(0), axis(1)), [bx, by] = dz(axis(2), axis(3));
      if (ax || ay || bx || by) this.usingPad = true;
      lx += ax; ly -= ay; rx += bx; ry += by;
      for (const b of BUTTONS) {
        const btn = gp.buttons[INDEX[b]]; if (!btn) continue;
        const on = b === 'L2' || b === 'R2' ? btn.value > 0.3 || btn.pressed : btn.pressed;
        if (on) { this.held[b] = true; this.usingPad = true; }
      }
      l2 = Math.max(l2, gp.buttons[6]?.value || 0); r2 = Math.max(r2, gp.buttons[7]?.value || 0);
    }
    const clamp = v => Math.max(-1, Math.min(1, v));
    const lm = Math.hypot(lx, ly); if (lm > 1) { lx /= lm; ly /= lm; }
    this.lx = lx; this.ly = ly; this.rx = clamp(rx); this.ry = clamp(ry); this.l2v = l2; this.r2v = r2;
    this.mdx = this._mdx; this.mdy = this._mdy; this._mdx = 0; this._mdy = 0;
    for (const b of BUTTONS) {
      this.heldTime[b] = this.held[b] ? (this.heldTime[b] || 0) + dt : 0;
      this.dbl[b] = false;
      if (this.held[b] && !this.prev[b]) { if (now - (this.lastPress[b] || 0) < 300) this.dbl[b] = true; this.lastPress[b] = now; }
    }
    this.tapped.clear();
  }

  down(b) { return !!this.held[b]; }
  pressed(b) { return !!this.held[b] && !this.prev[b]; }
  released(b) { return !this.held[b] && !!this.prev[b]; }
  heldFor(b) { return this.heldTime[b] || 0; }
  doubleTap(b) { return !!this.dbl[b]; }
  wheel() { return (this.keys.has('WheelUp') ? 1 : 0); }
  any() { return BUTTONS.some(b => this.pressed(b)); }
  /** Name of a button for prompts: PS symbols on a PlayStation pad, letters otherwise. */
  name(b) { return this.kind === 'playstation' ? PS_NAME[b] : XB_NAME[b]; }
  /** First keyboard key bound to a button, for prompts while playing on keyboard. */
  keyName(b) { const c = (this.keymap[b] || [])[0]; return c ? niceKey(c) : ''; }
  /** HTML glyph: shows the controller button when a pad is in use, the key otherwise. */
  glyph(b) {
    const pad = this.connected && (this.usingPad || !this.keymap[b]?.length);
    const cls = ['A', 'B', 'X', 'Y'].includes(b) ? `face ${b.toLowerCase()}` : 'shoulder';
    if (pad || !this.keyName(b)) return `<span class="glyph ${cls}">${['A', 'B', 'X', 'Y'].includes(b) ? b : XB_NAME[b] === b ? b : (this.kind === 'playstation' ? PS_NAME[b] : b)}</span>`;
    return `<kbd>${this.keyName(b)}</kbd>`;
  }
  rumble(weak = 0.5, strong = 0.5, ms = 120) {
    try { this.gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }); } catch { /* not supported */ }
  }
}

/** Go back to the arcade home screen. */
export function goHome() { document.body.classList.add('leaving'); setTimeout(() => { location.href = 'index.html'; }, 250); }
// Coming back with the browser's Back button restores the page as it was when we left: undo the fade-out.
if (typeof addEventListener === 'function') addEventListener('pageshow', () => document.body?.classList.remove('leaving'));
