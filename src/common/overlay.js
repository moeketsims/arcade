// Live controller diagram: every button, both sticks, triggers and D-pad, labelled with what it does in this game.
// const ov = new ControllerOverlay({ title: 'Golazo — controls', map: { A: 'Long pass', LS: 'Move', ... }, pad });
// ov.toggle(); call ov.update() every frame (it only works while visible).
import { niceKey, PS_NAME, XB_NAME } from './pad.js';

const SVGNS = 'http://www.w3.org/2000/svg';
// Button positions on a 1200×640 canvas
const POS = {
  L2: [415, 150], L1: [415, 190], R2: [785, 150], R1: [785, 190],
  UP: [430, 262], DOWN: [430, 318], LEFT: [402, 290], RIGHT: [458, 290],
  Y: [770, 250], A: [770, 330], X: [730, 290], B: [810, 290],
  LS: [520, 372], RS: [680, 372], SELECT: [515, 236], START: [685, 236], TOUCH: [600, 240], HOME: [600, 316],
};
const LEFT_SIDE = ['L2', 'L1', 'SELECT', 'UP', 'LEFT', 'RIGHT', 'DOWN', 'LS', 'L3'];
const RIGHT_SIDE = ['R2', 'R1', 'START', 'Y', 'X', 'B', 'A', 'RS', 'R3'];
const NAMES = {
  L3: 'L3 (press left stick)', R3: 'R3 (press right stick)', LS: 'Left stick', RS: 'Right stick', UP: 'D-pad ↑', DOWN: 'D-pad ↓', LEFT: 'D-pad ←', RIGHT: 'D-pad →',
  SELECT: 'Create / View', START: 'Options / Menu', HOME: 'PS / Xbox button', TOUCH: 'Touchpad',
};

export class ControllerOverlay {
  constructor({ title = 'Controls', map = {}, keys = null, pad, note = '' }) {
    this.pad = pad; this.map = map; this.visible = false;
    const el = this.el = document.createElement('div'); el.className = 'ctl-overlay hidden';
    el.innerHTML = `<div class="ctl-card"><div class="ctl-head"><h2>${title}</h2><span class="ctl-pad"></span></div>
      <svg viewBox="0 0 1200 640" class="ctl-svg"></svg><div class="ctl-keys"></div>
      <div class="ctl-foot">${note ? note + ' · ' : ''}Press <b>Touchpad</b> / <kbd>Tab</kbd> to close · <b>PS/Home</b> / <kbd>\`</kbd> returns to the Arcade</div></div>`;
    document.body.appendChild(el);
    this.svg = el.querySelector('svg'); this.padLabel = el.querySelector('.ctl-pad');
    this.build();
    // keyboard list
    const kl = keys || {};
    const km = pad?.keymap || {};
    const rows = Object.entries(map).filter(([b]) => (kl[b] || (km[b] && km[b].length) || b === 'LS' || b === 'RS'))
      .map(([b, desc]) => {
        let k = kl[b] || (km[b] || []).map(niceKey).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
        if (b === 'LS' && !kl.LS) k = 'W A S D'; if (b === 'RS' && !kl.RS) k = 'Mouse / arrow keys';
        return `<div><kbd>${k}</kbd><span>${desc}</span></div>`;
      });
    el.querySelector('.ctl-keys').innerHTML = rows.length ? `<div class="ctl-kt">Keyboard &amp; mouse</div><div class="ctl-kgrid">${rows.join('')}</div>` : '';
  }

  _n(tag, attrs, parent = this.svg) { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); parent.appendChild(n); return n; }

  build() {
    const s = this.svg; this.parts = {};
    // body
    this._n('path', { d: 'M360,205 C360,175 400,165 470,170 L730,170 C800,165 840,175 840,205 L880,420 C895,500 840,540 790,500 L720,430 L480,430 L410,500 C360,540 305,500 320,420 Z', class: 'ctl-body' });
    // shoulders
    const sh = (b, x, y, w, h) => { const r = this._n('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 8, class: 'ctl-btn' }); this.parts[b] = r; return r; };
    sh('L2', ...POS.L2, 120, 26); sh('L1', ...POS.L1, 120, 18); sh('R2', ...POS.R2, 120, 26); sh('R1', ...POS.R1, 120, 18);
    this.trigL = this._n('rect', { x: POS.L2[0] - 60, y: POS.L2[1] - 13, width: 0, height: 26, rx: 8, class: 'ctl-trig' });
    this.trigR = this._n('rect', { x: POS.R2[0] - 60, y: POS.R2[1] - 13, width: 0, height: 26, rx: 8, class: 'ctl-trig' });
    // d-pad
    for (const [b, w, h] of [['UP', 26, 30], ['DOWN', 26, 30], ['LEFT', 30, 26], ['RIGHT', 30, 26]]) sh(b, ...POS[b], w, h);
    // face
    for (const b of ['A', 'B', 'X', 'Y']) {
      const c = this._n('circle', { cx: POS[b][0], cy: POS[b][1], r: 19, class: `ctl-btn ctl-face f-${b.toLowerCase()}` }); this.parts[b] = c;
      const t = this._n('text', { x: POS[b][0], y: POS[b][1] + 6, class: 'ctl-ftext' }); t.textContent = b;
    }
    // middle
    sh('SELECT', ...POS.SELECT, 24, 12); sh('START', ...POS.START, 24, 12); sh('TOUCH', ...POS.TOUCH, 120, 54);
    this.parts.HOME = this._n('circle', { cx: POS.HOME[0], cy: POS.HOME[1], r: 13, class: 'ctl-btn' });
    // sticks
    for (const st of ['LS', 'RS']) {
      this._n('circle', { cx: POS[st][0], cy: POS[st][1], r: 36, class: 'ctl-well' });
      this.parts[st] = this._n('circle', { cx: POS[st][0], cy: POS[st][1], r: 25, class: 'ctl-stick' });
    }
    // labels
    const label = (b, x, y, anchor) => {
      const [bx, by] = b === 'L3' ? POS.LS : b === 'R3' ? POS.RS : POS[b];
      const desc = this.map[b] ?? (b === 'L3' || b === 'R3' ? '' : '');
      const lx = anchor === 'end' ? x + 8 : x - 8;
      if (anchor !== 'middle') this._n('path', { d: `M${lx},${y - 5} L${anchor === 'end' ? lx + 22 : lx - 22},${y - 5} L${bx},${by}`, class: `ctl-lead ${desc ? '' : 'dim'}` });
      const t = this._n('text', { x, y, 'text-anchor': anchor, class: `ctl-label ${desc ? '' : 'dim'}` });
      const btn = this._n('tspan', { class: 'ctl-bname' }, t); btn.textContent = (NAMES[b] || `${b} (${PS_NAME[b]})`) + '  ';
      const d = this._n('tspan', {}, t); d.textContent = desc || '—';
      this.labels = this.labels || {}; this.labels[b] = t;
    };
    LEFT_SIDE.forEach((b, i) => label(b, 300, 92 + i * 52, 'end'));
    RIGHT_SIDE.forEach((b, i) => label(b, 900, 92 + i * 52, 'start'));
    label('TOUCH', 600, 560, 'middle'); label('HOME', 600, 600, 'middle');
  }

  show() { this.visible = true; this.el.classList.remove('hidden'); }
  hide() { this.visible = false; this.el.classList.add('hidden'); }
  toggle() { this.visible ? this.hide() : this.show(); return this.visible; }

  update() {
    if (!this.visible || !this.pad) return;
    const p = this.pad;
    for (const [b, el] of Object.entries(this.parts)) {
      if (b === 'LS' || b === 'RS') continue;
      el.classList.toggle('on', p.down(b));
      this.labels[b]?.classList.toggle('on', p.down(b));
    }
    this.parts.LS.setAttribute('cx', POS.LS[0] + p.lx * 16); this.parts.LS.setAttribute('cy', POS.LS[1] - p.ly * 16);
    this.parts.RS.setAttribute('cx', POS.RS[0] + p.rx * 16); this.parts.RS.setAttribute('cy', POS.RS[1] + p.ry * 16);
    this.parts.LS.classList.toggle('on', p.down('L3') || Math.hypot(p.lx, p.ly) > 0.2);
    this.parts.RS.classList.toggle('on', p.down('R3') || Math.hypot(p.rx, p.ry) > 0.2);
    this.labels.LS?.classList.toggle('on', Math.hypot(p.lx, p.ly) > 0.2); this.labels.RS?.classList.toggle('on', Math.hypot(p.rx, p.ry) > 0.2);
    this.labels.L3?.classList.toggle('on', p.down('L3')); this.labels.R3?.classList.toggle('on', p.down('R3'));
    this.trigL.setAttribute('width', 120 * p.l2v); this.trigR.setAttribute('width', 120 * p.r2v);
    this.padLabel.textContent = p.connected ? `🎮 ${p.kind === 'playstation' ? 'PlayStation' : p.kind === 'xbox' ? 'Xbox' : 'Gamepad'} connected` : '⌨️ No controller — keyboard shown below';
  }
}
