// Starbolt input: wraps the arcade-wide Pad so every controller button has a job.
import { Pad } from './common/pad.js';

export const KEYMAP = {
  A: ['Space'], B: ['ShiftLeft', 'ShiftRight', 'KeyL'], X: ['KeyJ', 'Mouse0'], Y: ['KeyK'],
  L1: ['KeyQ'], R1: ['KeyE'], L2: ['KeyZ'], R2: ['KeyC'], L3: ['KeyF'], R3: ['KeyR'],
  UP: ['ArrowUp'], DOWN: ['ArrowDown'], LEFT: ['ArrowLeft'], RIGHT: ['ArrowRight'],
  START: ['Enter', 'Escape', 'KeyP'], SELECT: ['KeyM'],
};
export const CONTROL_MAP = {
  A: 'Jump · hold to hover · swim', B: 'Dash', X: 'Punch · spin attack in the air', Y: 'Ground pound (air) · gadget or Scan (ground)',
  L1: 'Swing camera 45° left', R1: 'Swing camera 45° right', L2: 'Hold: close-up camera', R2: 'Dash',
  LS: 'Move Bolt', RS: 'Orbit camera', L3: 'Wave', R3: 'Camera behind Bolt',
  UP: 'Camera zoom in', DOWN: 'Camera zoom out', LEFT: 'Rotate camera left', RIGHT: 'Rotate camera right',
  SELECT: 'Music on / off', START: 'Pause menu', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
};

export class Input {
  constructor() {
    this.pad = new Pad({ keymap: KEYMAP, lookKeys: { up: [], down: [], left: [], right: [] } });
    this.move = { x: 0, y: 0 }; this.cam = { x: 0, y: 0 };
    this.dragging = false; this.mdx = 0; this.mdy = 0;
    addEventListener('mousedown', e => { if (e.button === 2) this.dragging = true; });
    addEventListener('mouseup', e => { if (e.button === 2) this.dragging = false; });
    addEventListener('mousemove', e => { if (this.dragging) { this.mdx += e.movementX; this.mdy += e.movementY; } });
  }
  get padName() { return this.pad.connected ? this.pad.id : ''; }
  update() {
    const p = this.pad; p.update();
    this.move.x = p.lx; this.move.y = p.ly;
    this.cam.x = p.rx + (this.mdx + p.mdx) * 0.02; this.cam.y = p.ry + (this.mdy + p.mdy) * 0.02;   // p.mdx/mdy: touch drag-to-look
    this.mdx = 0; this.mdy = 0;
  }
  down(b) { return this.pad.down(b === 'MUSIC' ? 'SELECT' : b); }
  pressed(b) { return this.pad.pressed(b === 'MUSIC' ? 'SELECT' : b); }
  released(b) { return this.pad.released(b); }
  anyPressed() { return ['A', 'START'].some(b => this.pad.pressed(b)); }
}

export const LEGEND = [
  ['<span class="btn a">A</span> <kbd>Space</kbd>', 'Jump · hold to hover'],
  ['<span class="btn b">B</span> <kbd>Shift</kbd> · R2 <kbd>C</kbd>', 'Dash'],
  ['<span class="btn x">X</span> <kbd>J</kbd>', 'Punch · spin in the air'],
  ['<span class="btn y">Y</span> <kbd>K</kbd>', 'Ground pound (air) · gadget / scan (ground)'],
  ['Left stick · <kbd>WASD</kbd>', 'Move'],
  ['Right stick · right-drag', 'Orbit camera'],
  ['L1 / R1 · <kbd>Q</kbd> <kbd>E</kbd>', 'Swing camera 45°'],
  ['L2 · <kbd>Z</kbd>', 'Close-up camera'],
  ['D-pad · arrow keys', 'Camera zoom / rotate'],
  ['L3 · <kbd>F</kbd>  ·  R3 · <kbd>R</kbd>', 'Wave  ·  camera behind Bolt'],
  ['Options <kbd>Esc</kbd> · Create <kbd>M</kbd>', 'Pause · music'],
  ['Touchpad <kbd>Tab</kbd> · PS <kbd>`</kbd>', 'All controls · back to Arcade'],
];
export function legendHTML() {
  return LEGEND.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
}
