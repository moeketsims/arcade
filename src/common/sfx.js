// Synthesised sound for every arcade game (Web Audio, no files).
// Usage: const sfx = new Sfx(); sfx.init() on the first user input; sfx.play('rifle', { vol: 0.8 }).
export class Sfx {
  constructor() { this.ctx = null; this.loops = {}; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6;
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.bus = this.ctx.createGain(); this.bus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.28; this.musicBus.connect(this.master);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  get ready() { return !!this.ctx; }

  tone({ f = 440, f2 = null, t = 0.15, type = 'square', vol = 0.3, at = 0, attack = 0.004, bus }) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, s); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), s + t);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), s + attack); g.gain.exponentialRampToValueAtTime(0.0001, s + t);
    o.connect(g); g.connect(bus || this.bus); o.start(s); o.stop(s + t + 0.05);
  }
  noise({ t = 0.2, vol = 0.3, at = 0, lp = 2000, lp2 = null, hp = 0, q = 0.7, bus }) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.currentTime + at, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q; f.frequency.setValueAtTime(lp, s); if (lp2) f.frequency.exponentialRampToValueAtTime(lp2, s + t);
    let node = f; if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; f.connect(h); node = h; }
    const g = c.createGain(); g.gain.setValueAtTime(Math.max(0.0002, vol), s); g.gain.exponentialRampToValueAtTime(0.0001, s + t);
    src.connect(f); node.connect(g); g.connect(bus || this.bus); src.start(s, Math.random()); src.stop(s + t + 0.05);
  }

  /** Named effects. opts.vol scales loudness (use for distance), opts.pitch scales frequency. */
  play(name, opts = {}) {
    if (!this.ctx) return;
    const v = opts.vol ?? 1, p = opts.pitch ?? 1;
    const T = (o) => this.tone({ ...o, f: o.f * p, f2: o.f2 ? o.f2 * p : null, vol: (o.vol ?? 0.3) * v });
    const N = (o) => this.noise({ ...o, vol: (o.vol ?? 0.3) * v });
    switch (name) {
      // ----- football -----
      case 'kick': T({ f: 140, f2: 55, t: 0.12, type: 'sine', vol: 0.7 }); N({ t: 0.06, vol: 0.35, lp: 2500 }); break;
      case 'kickSoft': T({ f: 170, f2: 80, t: 0.08, type: 'sine', vol: 0.45 }); N({ t: 0.04, vol: 0.18, lp: 1800 }); break;
      case 'kickHard': T({ f: 120, f2: 40, t: 0.18, type: 'sine', vol: 0.95 }); N({ t: 0.09, vol: 0.5, lp: 3500, lp2: 600 }); break;
      case 'bounce': T({ f: 110, f2: 70, t: 0.07, type: 'sine', vol: 0.3 }); break;
      case 'post': [1180, 1770, 2360].forEach((f, i) => T({ f, t: 0.6 - i * 0.12, type: 'sine', vol: 0.25 / (i + 1) })); N({ t: 0.05, vol: 0.2, lp: 4000 }); break;
      case 'net': N({ t: 0.5, vol: 0.4, lp: 3500, lp2: 500, hp: 200 }); break;
      case 'whistle': this.whistle(v, 1); break;
      case 'whistle2': this.whistle(v, 2); break;
      case 'whistle3': this.whistle(v, 3); break;
      case 'save': T({ f: 200, f2: 120, t: 0.1, type: 'triangle', vol: 0.4 }); N({ t: 0.12, vol: 0.3, lp: 1500 }); break;
      case 'tackle': N({ t: 0.18, vol: 0.4, lp: 900, lp2: 200 }); T({ f: 90, f2: 50, t: 0.15, type: 'sine', vol: 0.4 }); break;
      // ----- guns (vol < 1 for distant shots) -----
      case 'pistol': N({ t: 0.16, vol: 0.55, lp: 5000, lp2: 700 }); T({ f: 220, f2: 70, t: 0.1, type: 'square', vol: 0.18 }); break;
      case 'smg': N({ t: 0.08, vol: 0.4, lp: 5500, lp2: 900 }); T({ f: 260, f2: 90, t: 0.06, type: 'square', vol: 0.12 }); break;
      case 'rifle': N({ t: 0.2, vol: 0.6, lp: 6000, lp2: 500 }); T({ f: 160, f2: 50, t: 0.14, type: 'sawtooth', vol: 0.2 }); break;
      case 'lmg': N({ t: 0.22, vol: 0.6, lp: 4500, lp2: 400 }); T({ f: 130, f2: 45, t: 0.16, type: 'sawtooth', vol: 0.22 }); break;
      case 'shotgun': N({ t: 0.38, vol: 0.85, lp: 4000, lp2: 250 }); T({ f: 95, f2: 35, t: 0.3, type: 'sine', vol: 0.6 }); break;
      case 'sniper': N({ t: 0.6, vol: 0.9, lp: 7000, lp2: 300 }); T({ f: 80, f2: 30, t: 0.5, type: 'sine', vol: 0.7 }); this.noise({ t: 0.9, vol: 0.12 * v, at: 0.12, lp: 1200, lp2: 200 }); break;
      case 'suppressed': N({ t: 0.07, vol: 0.25, lp: 1800, lp2: 500 }); break;
      case 'minigun': N({ t: 0.05, vol: 0.35, lp: 5000, lp2: 1200 }); break;
      case 'rocket': N({ t: 0.7, vol: 0.5, lp: 1200, lp2: 4000 }); T({ f: 200, f2: 600, t: 0.6, type: 'sawtooth', vol: 0.1 }); break;
      case 'explosion': N({ t: 1.2, vol: 1.0, lp: 2500, lp2: 80 }); T({ f: 70, f2: 25, t: 0.9, type: 'sine', vol: 0.9 }); break;
      case 'bow': T({ f: 300, f2: 120, t: 0.15, type: 'triangle', vol: 0.3 }); N({ t: 0.1, vol: 0.15, lp: 3000 }); break;
      case 'reload': N({ t: 0.05, vol: 0.25, lp: 4000, hp: 800 }); this.noise({ t: 0.05, vol: 0.25 * v, at: 0.18, lp: 5000, hp: 1200 }); this.tone({ f: 900 * p, t: 0.04, type: 'square', vol: 0.06 * v, at: 0.2 }); break;
      case 'empty': T({ f: 1500, t: 0.03, type: 'square', vol: 0.12 }); break;
      case 'knife': N({ t: 0.18, vol: 0.35, lp: 8000, lp2: 1500, hp: 1500 }); break;
      case 'stab': N({ t: 0.12, vol: 0.4, lp: 1500, lp2: 300 }); T({ f: 120, f2: 60, t: 0.1, type: 'sine', vol: 0.35 }); break;
      case 'pickaxe': N({ t: 0.12, vol: 0.4, lp: 2000, lp2: 400 }); T({ f: 300, f2: 150, t: 0.08, type: 'triangle', vol: 0.3 }); break;
      case 'hit': T({ f: 1800, t: 0.04, type: 'square', vol: 0.12 }); break;
      case 'headshot': T({ f: 2400, t: 0.06, type: 'square', vol: 0.16 }); T({ f: 3200, t: 0.08, type: 'sine', vol: 0.12, at: 0.03 }); break;
      case 'kill': T({ f: 880, t: 0.08, type: 'square', vol: 0.12 }); T({ f: 1320, t: 0.12, type: 'square', vol: 0.12, at: 0.07 }); break;
      case 'hurt': N({ t: 0.25, vol: 0.4, lp: 700, lp2: 150 }); T({ f: 160, f2: 90, t: 0.2, type: 'sawtooth', vol: 0.15 }); break;
      case 'shieldHit': T({ f: 900, f2: 600, t: 0.12, type: 'sine', vol: 0.2 }); break;
      case 'shieldBreak': N({ t: 0.35, vol: 0.4, lp: 6000, lp2: 1000, hp: 1500 }); T({ f: 1200, f2: 300, t: 0.3, type: 'square', vol: 0.12 }); break;
      case 'footstep': N({ t: 0.05, vol: 0.12, lp: 600 }); break;
      case 'jump': N({ t: 0.08, vol: 0.12, lp: 900 }); break;
      case 'land': N({ t: 0.1, vol: 0.2, lp: 500 }); break;
      case 'slide': N({ t: 0.5, vol: 0.25, lp: 1200, lp2: 400 }); break;
      case 'pickup': T({ f: 660, t: 0.07, type: 'square', vol: 0.12 }); T({ f: 990, t: 0.1, type: 'square', vol: 0.12, at: 0.06 }); break;
      case 'chest': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ f: f * p, t: 0.22, type: 'triangle', vol: 0.12 * v, at: i * 0.06 })); break;
      case 'build': N({ t: 0.09, vol: 0.3, lp: 1500, lp2: 300 }); T({ f: 200, f2: 120, t: 0.07, type: 'triangle', vol: 0.2 }); break;
      case 'buildBreak': N({ t: 0.3, vol: 0.45, lp: 2500, lp2: 200 }); break;
      case 'heal': [392, 523, 659].forEach((f, i) => this.tone({ f: f * p, t: 0.3, type: 'sine', vol: 0.15 * v, at: i * 0.1 })); break;
      case 'shield': [523, 784, 1047].forEach((f, i) => this.tone({ f: f * p, t: 0.3, type: 'sine', vol: 0.15 * v, at: i * 0.08 })); break;
      case 'grenadePin': T({ f: 2000, t: 0.05, type: 'square', vol: 0.1 }); break;
      case 'flash': N({ t: 1.5, vol: 0.5, lp: 9000, lp2: 3000, hp: 2500 }); T({ f: 4000, t: 2.5, type: 'sine', vol: 0.08 }); break;
      case 'glider': N({ t: 0.6, vol: 0.15, lp: 800 }); break;
      case 'wind': N({ t: 0.5, vol: 0.12, lp: 600, lp2: 900 }); break;
      case 'storm': N({ t: 0.6, vol: 0.18, lp: 300, lp2: 600 }); break;
      case 'bus': T({ f: 55, t: 0.5, type: 'sawtooth', vol: 0.08 }); break;
      case 'airstrike': N({ t: 2.5, vol: 0.4, lp: 400, lp2: 4000 }); break;
      case 'uav': [600, 900].forEach((f, i) => this.tone({ f: f * p, t: 0.25, type: 'sine', vol: 0.15 * v, at: i * 0.15 })); break;
      case 'medal': [784, 988, 1175].forEach((f, i) => this.tone({ f: f * p, t: 0.18, type: 'square', vol: 0.08 * v, at: i * 0.07 })); break;
      // ----- UI -----
      case 'ui': T({ f: 700, t: 0.05, type: 'square', vol: 0.08 }); break;
      case 'select': T({ f: 880, t: 0.06, type: 'triangle', vol: 0.15 }); T({ f: 1320, t: 0.08, type: 'triangle', vol: 0.12, at: 0.05 }); break;
      case 'back': T({ f: 500, f2: 300, t: 0.1, type: 'triangle', vol: 0.12 }); break;
      case 'start': [392, 523, 659, 784].forEach((f, i) => this.tone({ f: f * p, t: 0.25, type: 'triangle', vol: 0.15 * v, at: i * 0.07 })); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ f: f * p, t: 0.25, type: 'square', vol: 0.12 * v, at: i * 0.12 })); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.tone({ f: f * p, t: 0.3, type: 'triangle', vol: 0.15 * v, at: i * 0.18 })); break;
      default: break;
    }
  }

  whistle(v = 1, blasts = 1) {
    for (let b = 0; b < blasts; b++) {
      const at = b * 0.35, len = b === blasts - 1 && blasts > 1 ? 0.6 : 0.28;
      if (!this.ctx) return;
      const c = this.ctx, s = c.currentTime + at, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 2650; lfo.frequency.value = 38; lg.gain.value = 160; lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.22 * v, s + 0.02); g.gain.setValueAtTime(0.22 * v, s + len - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, s + len);
      o.connect(g); g.connect(this.bus); o.start(s); lfo.start(s); o.stop(s + len + 0.05); lfo.stop(s + len + 0.05);
    }
  }

  /** Continuous crowd bed: level 0..1, call every frame or on events. */
  crowd(level = 0.3) {
    if (!this.ctx) return;
    if (!this.loops.crowd) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.bus); src.start();
      this.loops.crowd = { g, bp };
    }
    const L = this.loops.crowd, now = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(0.05 + level * 0.45, now, 0.25); L.bp.frequency.setTargetAtTime(600 + level * 500, now, 0.3);
  }
  /** Generic looping bed (wind, storm, engine): name, gain 0..1, filter cutoff. */
  loop(name, level = 0, cutoff = 600) {
    if (!this.ctx) return;
    if (!this.loops[name]) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.bus); src.start(); this.loops[name] = { g, f };
    }
    const L = this.loops[name], now = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(level, now, 0.15); L.f.frequency.setTargetAtTime(cutoff, now, 0.2);
  }
}
