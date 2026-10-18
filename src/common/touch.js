// On-screen touch controls for phones and tablets: twin sticks, D-pad, A/B/X/Y, L1/L2/R1/R2 and HOME / SELECT /
// HELP (touchpad) / MENU (Options). One layer per page, shared by every Pad; Pad.update() merges its state in, so the
// games see touch exactly like a controller. Shown only on touch devices while no real gamepad is connected.
//   L3 / R3: the small buttons on the sticks, or tap a stick without moving it. Drag anywhere on the game view (outside the controls) = mouse-look (mdx/mdy).
const CSS = `
.tc { position: fixed; inset: 0; z-index: 9000; pointer-events: none; display: none; font: 800 15px "Segoe UI", system-ui, sans-serif; color: #fff;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  --s: clamp(96px, 29vmin, 150px); --b: clamp(46px, 12.5vmin, 62px); --g: 14px;
  --sl: calc(var(--g) + env(safe-area-inset-left, 0px)); --sr: calc(var(--g) + env(safe-area-inset-right, 0px)); --sb: calc(16px + env(safe-area-inset-bottom, 0px)); }
.tc.on { display: block; }
.tc [data-b], .tc .tc-stick { pointer-events: auto; touch-action: none; position: absolute; box-sizing: border-box; }
.tc [data-b] { display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #ffffff1c; border: 2px solid #ffffff55;
  box-shadow: 0 2px 10px #0006; text-shadow: 0 1px 3px #000a; transition: background .06s, transform .06s; }
.tc [data-b].on { background: #ffffff66; transform: scale(.92); }
.tc-face { position: absolute; right: var(--sr); bottom: var(--sb); width: calc(var(--b) * 2.9); height: calc(var(--b) * 2.9); }
.tc-face [data-b] { width: var(--b); height: var(--b); font-size: calc(var(--b) * .42); }
.tc-face [data-b=Y] { left: calc(var(--b) * .95); top: 0; border-color: #f2b705; color: #ffd84a; }
.tc-face [data-b=A] { left: calc(var(--b) * .95); bottom: 0; border-color: #2fbf4f; color: #6af08a; }
.tc-face [data-b=X] { left: 0; top: calc(var(--b) * .95); border-color: #2f7de1; color: #7fb4ff; }
.tc-face [data-b=B] { right: 0; top: calc(var(--b) * .95); border-color: #e5383b; color: #ff7b7d; }
.tc-face [data-b=Y].on { background: #f2b70588; } .tc-face [data-b=A].on { background: #2fbf4f88; }
.tc-face [data-b=X].on { background: #2f7de188; } .tc-face [data-b=B].on { background: #e5383b88; }
.tc-dpad { position: absolute; width: calc(var(--b) * 2.3); height: calc(var(--b) * 2.3); }
.tc-dpad [data-b] { width: calc(var(--b) * .8); height: calc(var(--b) * .8); border-radius: 10px; font-size: calc(var(--b) * .36); }
.tc-dpad [data-b=UP] { left: calc(var(--b) * .75); top: 0; } .tc-dpad [data-b=DOWN] { left: calc(var(--b) * .75); bottom: 0; }
.tc-dpad [data-b=LEFT] { left: 0; top: calc(var(--b) * .75); } .tc-dpad [data-b=RIGHT] { right: 0; top: calc(var(--b) * .75); }
.tc-stick { width: var(--s); height: var(--s); border-radius: 50%; background: radial-gradient(#ffffff10, #ffffff22); border: 2px solid #ffffff44; box-shadow: 0 2px 14px #0005; }
.tc-stick.on { border-color: #ffffffaa; }
.tc-knob { position: absolute; left: 50%; top: 50%; width: 44%; height: 44%; margin: -22% 0 0 -22%; border-radius: 50%; background: #ffffff55; border: 2px solid #ffffffaa; pointer-events: none; }
.tc-stick [data-b] { width: calc(var(--b) * .72); height: calc(var(--b) * .72); top: calc(var(--b) * -.22); font-size: calc(var(--b) * .26); }
.tc-ls [data-b] { right: calc(var(--b) * -.22); } .tc-rs [data-b] { left: calc(var(--b) * -.22); }
.tc-sh { position: absolute; display: flex; gap: 10px; }
.tc-sh [data-b] { position: relative; width: calc(var(--b) * 1.25); height: calc(var(--b) * .72); border-radius: 12px; font-size: calc(var(--b) * .32); }
.tc-sys { position: absolute; top: calc(6px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); display: flex; gap: 6px; }
.tc-sys [data-b] { position: relative; height: 28px; padding: 0 10px; border-radius: 14px; font-size: 11px; letter-spacing: 1px; opacity: .7; background: #0004; }
/* landscape: [LS][D-pad] ...... [RS][A B X Y], shoulders above each side */
.tc-ls { left: var(--sl); bottom: var(--sb); }
.tc-dpad { left: calc(var(--sl) + var(--s) + var(--g)); bottom: var(--sb); }
.tc-rs { right: calc(var(--sr) + var(--b) * 2.9 + var(--g)); bottom: var(--sb); }
.tc-l { left: var(--sl); bottom: calc(var(--sb) + var(--s) + 26px); }
.tc-r { right: var(--sr); bottom: calc(var(--sb) + var(--b) * 2.9 + 16px); }
/* portrait: the sticks sit above the D-pad and the face buttons */
@media (orientation: portrait) {
  .tc-dpad { left: calc(var(--sl) + (var(--s) - var(--b) * 2.3) / 2); bottom: calc(var(--sb) + var(--s) + 28px); }
  .tc-rs { right: calc(var(--sr) + (var(--b) * 2.9 - var(--s)) / 2); bottom: calc(var(--sb) + var(--b) * 2.9 + 16px); }
  .tc-l { bottom: calc(var(--sb) + var(--s) + var(--b) * 2.3 + 40px); }
  .tc-r { bottom: calc(var(--sb) + var(--b) * 2.9 + var(--s) + 34px); }
}
body.touch-ui, body.touch-ui canvas { touch-action: manipulation; }
body.touch-ui.touch-look canvas { touch-action: none; }
`;

const SYS = [['HOME', 'HOME'], ['SELECT', 'SELECT'], ['TOUCH', 'HELP'], ['START', 'MENU']];
const TAP_MS = 230, TAP_PX = 12;

class TouchLayer {
  constructor() {
    this.held = new Set(); this.sticks = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
    this.latched = new Set();   // pressed since the last frame, so a tap shorter than a frame still counts
    this.dx = 0; this.dy = 0; this.touches = new Map(); this.lastTouch = 0;
    this.want = true; this.look = true; this.padPresent = false; this.el = null;
    let seen = false; try { seen = sessionStorage.getItem('arcade-touch') === '1'; } catch { /* storage blocked */ }
    this.capable = seen || !!globalThis.matchMedia?.('(pointer: coarse)').matches;
    // any real touch also switches it on (touch-screen laptops report a fine pointer)
    addEventListener('touchstart', e => this._windowStart(e), { passive: true, capture: true });
    addEventListener('touchmove', e => this._windowMove(e), { passive: false });
    addEventListener('touchend', e => this._windowEnd(e), { passive: true });
    addEventListener('touchcancel', e => this._windowEnd(e), { passive: true });
    addEventListener('blur', () => this._clear());
  }

  get active() { return this.capable && !this.padPresent; }
  /** True while a mouse event is probably the browser's copy of a touch (taps fire mousedown/click afterwards). */
  get recentTouch() { return performance.now() - this.lastTouch < 900; }

  _mount() {
    if (this.el || !document.body) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = this.el = document.createElement('div'); el.className = 'tc';
    el.innerHTML = `
      <div class="tc-stick tc-ls" data-stick="L"><div class="tc-knob"></div><div data-b="L3">L3</div></div>
      <div class="tc-stick tc-rs" data-stick="R"><div class="tc-knob"></div><div data-b="R3">R3</div></div>
      <div class="tc-dpad">${['UP', 'DOWN', 'LEFT', 'RIGHT'].map(b => `<div data-b="${b}">${{ UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶' }[b]}</div>`).join('')}</div>
      <div class="tc-face">${['Y', 'X', 'B', 'A'].map(b => `<div data-b="${b}">${b}</div>`).join('')}</div>
      <div class="tc-sh tc-l"><div data-b="L2">L2</div><div data-b="L1">L1</div></div>
      <div class="tc-sh tc-r"><div data-b="R1">R1</div><div data-b="R2">R2</div></div>
      <div class="tc-sys">${SYS.map(([b, t]) => `<div data-b="${b}">${t}</div>`).join('')}</div>`;
    document.body.appendChild(el);
    this.knobs = { L: el.querySelector('.tc-ls .tc-knob'), R: el.querySelector('.tc-rs .tc-knob') };
    this.stickEls = { L: el.querySelector('.tc-ls'), R: el.querySelector('.tc-rs') };
    const opt = { passive: false };
    el.addEventListener('touchstart', e => this._start(e), opt);
    el.addEventListener('touchmove', e => this._move(e), opt);
    el.addEventListener('touchend', e => this._end(e), opt);
    el.addEventListener('touchcancel', e => this._end(e), opt);
  }

  /** Called by Pad.update() every frame. */
  sync(padPresent) {
    this.padPresent = padPresent;
    const show = this.active && this.want;
    if (show) this._mount();
    if (!this.el) return;
    if (this.el.classList.contains('on') !== show) {
      this.el.classList.toggle('on', show);
      document.body.classList.toggle('touch-ui', show); document.body.classList.toggle('touch-look', show && this.look);
      if (!show) this._clear();
    }
    for (const s of ['L', 'R']) { const v = this.sticks[s]; this.knobs[s].style.transform = `translate(${v.x * 85}%, ${v.y * 85}%)`; }   // knob travel ≈ 0.4 × base
  }

  down(b) { return this.held.has(b) || this.latched.has(b); }
  /** Pad.update() calls this after reading the buttons. */
  endFrame() { if (this.latched.size) { this.latched.clear(); this._paint(); } }
  takeLook() { const d = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return d; }

  _markTouch() {
    this.lastTouch = performance.now();
    if (!this.capable) { this.capable = true; try { sessionStorage.setItem('arcade-touch', '1'); } catch { /* storage blocked */ } }
  }
  _clear() { this.held.clear(); this.touches.clear(); for (const s of ['L', 'R']) this.sticks[s] = { x: 0, y: 0 }; this.stickEls && Object.values(this.stickEls).forEach(e => e.classList.remove('on')); this.el?.querySelectorAll('.on').forEach(e => e.classList.remove('on')); }
  _refreshHeld() {
    this.held.clear();
    for (const t of this.touches.values()) if (t.kind === 'btn' && t.b) { this.held.add(t.b); this.latched.add(t.b); }
    this._paint();
  }
  _paint() { this.el?.querySelectorAll('[data-b]').forEach(e => e.classList.toggle('on', this.down(e.dataset.b))); }
  _btnAt(x, y) { const e = document.elementFromPoint(x, y)?.closest?.('.tc [data-b]'); return e ? e.dataset.b : null; }

  _stickVec(t, x, y) {
    const r = t.rect.width * 0.4, dx = (x - t.cx) / r, dy = (y - t.cy) / r, m = Math.hypot(dx, dy);
    const k = m > 1 ? 1 / m : 1, v = this.sticks[t.stick]; v.x = dx * k; v.y = dy * k;
    if (Math.hypot(x - t.x0, y - t.y0) > TAP_PX) t.moved = true;
  }

  _start(e) {
    e.preventDefault(); this._markTouch();
    for (const c of e.changedTouches) {
      const btn = c.target.closest?.('[data-b]'), stickEl = !btn && c.target.closest?.('[data-stick]');
      const busy = stickEl && [...this.touches.values()].some(t => t.kind === 'stick' && t.stick === stickEl.dataset.stick);
      if (busy) this.touches.set(c.identifier, { kind: 'click', stick: stickEl.dataset.stick, t0: performance.now() });   // second finger on a held stick: a quick tap = click
      else if (stickEl) {
        const rect = stickEl.getBoundingClientRect();
        const t = { kind: 'stick', stick: stickEl.dataset.stick, rect, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, x0: c.clientX, y0: c.clientY, t0: performance.now(), moved: false };
        this.touches.set(c.identifier, t); stickEl.classList.add('on'); this._stickVec(t, c.clientX, c.clientY);
      } else {
        this.touches.set(c.identifier, { kind: 'btn', b: btn?.dataset.b || null, slide: !!c.target.closest?.('.tc-face, .tc-dpad') });
      }
    }
    this._refreshHeld();
  }
  _move(e) {
    e.preventDefault();
    for (const c of e.changedTouches) {
      const t = this.touches.get(c.identifier); if (!t) continue;
      if (t.kind === 'stick') this._stickVec(t, c.clientX, c.clientY);
      else if (t.slide) t.b = this._btnAt(c.clientX, c.clientY);   // slide a thumb across the diamond / D-pad
    }
    this._refreshHeld();
  }
  _end(e) {
    e.preventDefault();
    for (const c of e.changedTouches) {
      const t = this.touches.get(c.identifier); if (!t) continue;
      this.touches.delete(c.identifier);
      if (t.kind === 'stick') {
        this.sticks[t.stick] = { x: 0, y: 0 }; this.stickEls[t.stick].classList.remove('on');
        if (!t.moved && performance.now() - t.t0 < TAP_MS) this.latched.add(t.stick + '3');   // tap = stick click
      } else if (t.kind === 'click' && performance.now() - t.t0 < TAP_MS) this.latched.add(t.stick + '3');
    }
    this._refreshHeld();
  }

  // Touches that start outside the controls: taps reach the page as usual (menus, tiles); drags become mouse-look.
  _windowStart(e) {
    this._markTouch();
    if (!this.el?.classList.contains('on') || !this.look) return;
    for (const c of e.changedTouches) if (!this.el.contains(c.target)) this.touches.set(c.identifier, { kind: 'look', x: c.clientX, y: c.clientY });
  }
  _windowMove(e) {
    let used = false;
    for (const c of e.changedTouches) {
      const t = this.touches.get(c.identifier); if (!t || t.kind !== 'look') continue;
      this.dx += c.clientX - t.x; this.dy += c.clientY - t.y; t.x = c.clientX; t.y = c.clientY; used = true;
    }
    if (used && e.cancelable) e.preventDefault();
  }
  _windowEnd(e) {
    this.lastTouch = performance.now();
    for (const c of e.changedTouches) if (this.touches.get(c.identifier)?.kind === 'look') this.touches.delete(c.identifier);
  }
}

let layer = null;
/** The page's touch layer (created on first use), or null outside a browser. */
export function touchLayer() {
  if (!layer && typeof document !== 'undefined' && typeof document.body !== 'undefined' && typeof performance !== 'undefined' && typeof addEventListener === 'function') {
    try { layer = new TouchLayer(); } catch { layer = null; }
  }
  return layer;
}
