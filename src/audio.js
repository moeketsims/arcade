// All sound is synthesised with Web Audio: no audio files.
export class Audio {
  constructor() {
    this.ctx = null; this.musicOn = true; this.track = null; this.nextNote = 0; this.step = 0;
  }
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
  }
  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }

  tone({ f = 440, f2 = null, t = 0.15, type = 'square', vol = 0.3, at = 0, bus = this.sfxBus, attack = 0.005 }) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, s);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), s + t);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + t);
    o.connect(g); g.connect(bus); o.start(s); o.stop(s + t + 0.02);
  }
  noise({ t = 0.2, vol = 0.3, at = 0, lp = 2000, lp2 = null }) {
    if (!this.ctx) return;
    const c = this.ctx, s = c.currentTime + at;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * t), c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, s);
    if (lp2) f.frequency.exponentialRampToValueAtTime(lp2, s + t);
    const g = c.createGain(); g.gain.setValueAtTime(vol, s); g.gain.exponentialRampToValueAtTime(0.0001, s + t);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(s);
  }

  sfx(name) {
    switch (name) {
      case 'jump': this.tone({ f: 330, f2: 660, t: 0.14, type: 'square', vol: 0.18 }); break;
      case 'hover': this.noise({ t: 0.08, vol: 0.06, lp: 900 }); break;
      case 'land': this.noise({ t: 0.08, vol: 0.12, lp: 500 }); break;
      case 'coin': this.tone({ f: 988, t: 0.08, type: 'square', vol: 0.12 }); this.tone({ f: 1319, t: 0.18, type: 'square', vol: 0.12, at: 0.06 }); break;
      case 'punch': this.noise({ t: 0.1, vol: 0.25, lp: 3000, lp2: 400 }); this.tone({ f: 180, f2: 90, t: 0.1, type: 'triangle', vol: 0.25 }); break;
      case 'spin': this.tone({ f: 500, f2: 1200, t: 0.25, type: 'sawtooth', vol: 0.08 }); break;
      case 'dash': this.noise({ t: 0.22, vol: 0.2, lp: 4000, lp2: 600 }); break;
      case 'pound': this.tone({ f: 120, f2: 40, t: 0.35, type: 'sine', vol: 0.5 }); this.noise({ t: 0.3, vol: 0.3, lp: 800, lp2: 100 }); break;
      case 'hurt': this.tone({ f: 400, f2: 120, t: 0.3, type: 'sawtooth', vol: 0.2 }); break;
      case 'stomp': this.tone({ f: 600, f2: 200, t: 0.12, type: 'square', vol: 0.18 }); break;
      case 'break': this.noise({ t: 0.25, vol: 0.3, lp: 2500, lp2: 300 }); break;
      case 'spring': this.tone({ f: 200, f2: 900, t: 0.3, type: 'triangle', vol: 0.3 }); break;
      case 'rescue': [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, t: 0.2, type: 'square', vol: 0.12, at: i * 0.09 })); break;
      case 'power': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone({ f, t: 0.18, type: 'triangle', vol: 0.2, at: i * 0.06 })); break;
      case 'checkpoint': [659, 880].forEach((f, i) => this.tone({ f, t: 0.25, type: 'sine', vol: 0.25, at: i * 0.1 })); break;
      case 'portal': this.tone({ f: 200, f2: 1600, t: 0.9, type: 'sine', vol: 0.3 }); this.noise({ t: 0.9, vol: 0.08, lp: 300, lp2: 6000 }); break;
      case 'scan': this.tone({ f: 880, f2: 1760, t: 0.4, type: 'sine', vol: 0.15 }); break;
      case 'rocket': this.noise({ t: 0.35, vol: 0.25, lp: 1500, lp2: 3000 }); this.tone({ f: 150, f2: 400, t: 0.35, type: 'sawtooth', vol: 0.08 }); break;
      case 'magnet': this.tone({ f: 300, f2: 900, t: 0.3, type: 'sawtooth', vol: 0.12 }); break;
      case 'slow': this.tone({ f: 900, f2: 200, t: 0.6, type: 'sine', vol: 0.2 }); break;
      case 'swim': this.noise({ t: 0.15, vol: 0.1, lp: 700 }); break;
      case 'shoot': this.tone({ f: 700, f2: 300, t: 0.15, type: 'square', vol: 0.08 }); break;
      case 'bosshit': this.tone({ f: 150, f2: 60, t: 0.5, type: 'sawtooth', vol: 0.35 }); this.noise({ t: 0.4, vol: 0.3, lp: 1200, lp2: 100 }); break;
      case 'slam': this.tone({ f: 70, f2: 30, t: 0.6, type: 'sine', vol: 0.6 }); this.noise({ t: 0.5, vol: 0.35, lp: 500, lp2: 60 }); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ f, t: 0.25, type: 'square', vol: 0.12, at: i * 0.12 })); break;
      case 'select': this.tone({ f: 660, t: 0.06, type: 'square', vol: 0.1 }); break;
    }
  }

  // Music: a tiny sequencer. Each track = tempo, scale, bass pattern, arpeggio pattern.
  playMusic(track) { this.track = track; this.step = 0; this.nextNote = this.ctx ? this.ctx.currentTime + 0.1 : 0; }
  toggleMusic() { this.musicOn = !this.musicOn; if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.32 : 0; return this.musicOn; }
  update() {
    if (!this.ctx || !this.track) return;
    const tr = this.track, spb = 60 / tr.bpm / 2; // eighth notes
    while (this.nextNote < this.ctx.currentTime + 0.15) {
      const at = this.nextNote - this.ctx.currentTime, i = this.step;
      const root = tr.root, sc = tr.scale;
      const note = d => root * Math.pow(2, (sc[((d % sc.length) + sc.length) % sc.length] + 12 * Math.floor(d / sc.length)) / 12);
      const bar = Math.floor(i / 8) % tr.chords.length, chord = tr.chords[bar];
      if (i % 2 === 0) this.tone({ f: note(chord) / 2, t: spb * 1.8, type: 'triangle', vol: 0.22, at, bus: this.musicBus });
      const arp = tr.arp[i % tr.arp.length];
      if (arp !== null) this.tone({ f: note(chord + arp) * 2, t: spb * 0.9, type: tr.lead, vol: 0.07, at, bus: this.musicBus });
      if (tr.drums && i % 4 === 0) this.tone({ f: 110, f2: 40, t: 0.12, type: 'sine', vol: 0.3, at, bus: this.musicBus });
      if (tr.drums && i % 4 === 2) this.tone({ f: 4000, f2: 3000, t: 0.03, type: 'square', vol: 0.025, at, bus: this.musicBus });
      this.nextNote += spb; this.step++;
    }
  }
}

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
export const TRACKS = {
  hub: { bpm: 104, root: 196, scale: MAJ, chords: [0, 3, 4, 3], arp: [0, 2, 4, 2, 7, 4, 2, null], lead: 'triangle', drums: false },
  meadow: { bpm: 128, root: 220, scale: MAJ, chords: [0, 4, 5, 3], arp: [0, 2, 4, 7, 4, 2, 4, null], lead: 'square', drums: true },
  frost: { bpm: 112, root: 233, scale: DOR, chords: [0, 3, 5, 4], arp: [7, 4, 2, 4, 9, 4, 2, 0], lead: 'sine', drums: true },
  forge: { bpm: 140, root: 147, scale: MIN, chords: [0, 0, 5, 4], arp: [0, null, 3, 0, 7, null, 3, 5], lead: 'sawtooth', drums: true },
  reef: { bpm: 96, root: 262, scale: MAJ, chords: [0, 5, 3, 4], arp: [0, 4, 7, 9, 7, 4, null, null], lead: 'sine', drums: false },
  neon: { bpm: 132, root: 175, scale: MIN, chords: [0, 5, 3, 6], arp: [0, 7, 3, 7, 5, 7, 3, 9], lead: 'square', drums: true },
  boss: { bpm: 150, root: 110, scale: MIN, chords: [0, 1, 0, 6], arp: [0, 3, 7, 3, 8, 7, 3, 0], lead: 'sawtooth', drums: true },
};
