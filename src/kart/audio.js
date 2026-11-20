// Sparkplug GP: engine, drift and item sounds, and a small original music sequencer per track. Built on the
// arcade's shared Sfx (Web Audio, no files).
import { Sfx } from '../common/sfx.js';

// Each song: tempo, root (MIDI), scale steps, a 16-step bass line and a 32-step melody (scale degrees, -1 = rest).
const SONGS = [
  { bpm: 132, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], bass: [0, -1, 0, 4, -1, 4, 3, -1, 3, -1, 4, -1, 5, 4, 3, 1], mel: [4, -1, 5, 4, 2, -1, 0, -1, 1, 2, 4, -1, 2, -1, -1, -1, 4, -1, 5, 7, 8, -1, 7, 5, 4, 2, 4, -1, 5, -1, -1, -1], wave: 'square' },
  { bpm: 120, root: 62, scale: [0, 2, 4, 7, 9, 12, 14], bass: [0, -1, 2, -1, 3, -1, 2, -1, 0, -1, 2, -1, 4, -1, 3, 2], mel: [2, 3, 4, -1, 4, 3, 2, -1, 1, 2, 3, -1, 2, -1, 0, -1, 2, 3, 4, 5, 6, -1, 5, 4, 3, -1, 2, -1, 1, -1, -1, -1], wave: 'triangle' },
  { bpm: 140, root: 57, scale: [0, 3, 5, 6, 7, 10, 12], bass: [0, 0, -1, 0, 3, -1, 2, -1, 0, 0, -1, 0, 4, -1, 3, 1], mel: [4, -1, 3, 4, 5, -1, 4, -1, 2, -1, 1, 2, 3, -1, -1, -1, 4, -1, 6, 5, 4, -1, 3, -1, 2, 3, 2, 1, 0, -1, -1, -1], wave: 'sawtooth' },
  { bpm: 112, root: 64, scale: [0, 2, 3, 5, 7, 8, 10], bass: [0, -1, -1, 4, -1, -1, 5, -1, 3, -1, -1, 2, -1, -1, 4, -1], mel: [4, 5, 6, -1, 7, -1, 6, 5, 4, -1, 2, -1, 4, -1, -1, -1, 3, 4, 5, -1, 6, -1, 5, 4, 2, -1, 1, -1, 0, -1, -1, -1], wave: 'triangle' },
  { bpm: 150, root: 55, scale: [0, 2, 3, 5, 7, 8, 10], bass: [0, 0, 7, 0, 0, 7, 0, 5, 0, 0, 7, 0, 3, 3, 5, 6], mel: [7, -1, 7, 6, 4, -1, 4, -1, 3, 4, 6, -1, 4, -1, -1, 2, 7, -1, 9, 8, 7, -1, 6, -1, 4, -1, 3, 4, 2, -1, -1, -1], wave: 'square' },
  { bpm: 126, root: 65, scale: [0, 2, 4, 7, 9, 11, 14], bass: [0, -1, 4, -1, 5, -1, 4, -1, 3, -1, 2, -1, 4, -1, 1, -1], mel: [5, -1, 6, -1, 7, 6, 5, -1, 4, -1, 2, 4, 5, -1, -1, -1, 7, 8, 9, -1, 8, -1, 7, 5, 6, -1, 4, -1, 5, -1, -1, -1], wave: 'sine' },
  { bpm: 104, root: 60, scale: [0, 2, 4, 5, 7, 9, 11], bass: [0, -1, -1, -1, 3, -1, -1, -1, 4, -1, -1, -1, 3, -1, 1, -1], mel: [4, -1, 2, -1, 0, -1, 2, 4, 5, -1, 4, -1, 2, -1, -1, -1, 4, -1, 5, -1, 7, -1, 5, 4, 2, -1, 1, -1, 0, -1, -1, -1], wave: 'triangle' },   // menu
];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

export class KartAudio {
  constructor() { this.sfx = new Sfx(); this.song = null; this.step = 0; this.nextT = 0; this.tempoMul = 1; this.musicOn = true; this.engines = []; this.vol = { music: 0.8, sfx: 1 }; }
  init() { this.sfx.init(); }
  get ctx() { return this.sfx.ctx; }

  setVolumes(music, sfx) { this.vol.music = music; this.vol.sfx = sfx; if (this.sfx.ctx) { this.sfx.musicBus.gain.value = 0.28 * music; this.sfx.bus.gain.value = sfx; } }

  // ---- music ---------------------------------------------------------------------------------------------------------
  playSong(i) { this.song = SONGS[i % SONGS.length]; this.step = 0; this.nextT = 0; this.tempoMul = 1; }
  menuSong() { this.playSong(6); }
  stopSong() { this.song = null; }
  /** Schedule notes a little ahead of time; call every frame. */
  tick() {
    const c = this.ctx; if (!c || !this.song || !this.musicOn) return;
    const S = this.song, spb = 60 / (S.bpm * this.tempoMul) / 4;   // 16th notes
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.2) {
      const st = this.step, t = this.nextT - c.currentTime;
      const deg = (d, oct) => S.root + oct * 12 + S.scale[((d % S.scale.length) + S.scale.length) % S.scale.length] + Math.floor(d / S.scale.length) * 12;
      const b = S.bass[st % 16]; if (b >= 0) this.sfx.tone({ f: midi(deg(b, -2)), t: spb * 1.6, type: 'triangle', vol: 0.5, at: t, bus: this.sfx.musicBus });
      const m = S.mel[st % 32]; if (m >= 0 && Math.floor(st / 32) % 4 !== 3) this.sfx.tone({ f: midi(deg(m, 0)), t: spb * 1.8, type: S.wave, vol: S.wave === 'sawtooth' || S.wave === 'square' ? 0.16 : 0.3, at: t, bus: this.sfx.musicBus });
      // drums: kick on the beat, hat on the off-beats, snare on 2 and 4
      if (st % 4 === 0) this.sfx.tone({ f: 120, f2: 45, t: 0.12, type: 'sine', vol: 0.7, at: t, bus: this.sfx.musicBus });
      if (st % 8 === 4) this.sfx.noise({ t: 0.12, vol: 0.35, at: t, lp: 5000, hp: 1200, bus: this.sfx.musicBus });
      if (st % 2 === 1) this.sfx.noise({ t: 0.03, vol: 0.12, at: t, lp: 12000, hp: 7000, bus: this.sfx.musicBus });
      this.step++; this.nextT += spb;
    }
  }

  // ---- engine ---------------------------------------------------------------------------------------------------------
  /** One engine voice for the player (and a quieter one for the nearest rival). */
  engine(i, speed, top, boost, vol = 1) {
    const c = this.ctx; if (!c) return;
    let e = this.engines[i];
    if (!e) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx.bus); o1.start(); o2.start();
      e = this.engines[i] = { o1, o2, f, g };
    }
    const r = Math.min(1.4, Math.abs(speed) / top), now = c.currentTime;
    // fake gear changes: pitch climbs then drops a little at 40% and 75%
    const gear = r < 0.4 ? r / 0.4 : r < 0.75 ? 0.55 + (r - 0.4) / 0.35 * 0.45 : 0.7 + (r - 0.75) * 1.2;
    const f0 = 48 + gear * 70 + (boost ? 25 : 0);
    e.o1.frequency.setTargetAtTime(f0, now, 0.05); e.o2.frequency.setTargetAtTime(f0 * 0.502, now, 0.05);
    e.f.frequency.setTargetAtTime(500 + r * 1600 + (boost ? 900 : 0), now, 0.08);
    e.g.gain.setTargetAtTime((0.05 + r * 0.06) * vol, now, 0.08);
  }
  silenceEngines() { const c = this.ctx; if (!c) return; for (const e of this.engines) if (e) e.g.gain.setTargetAtTime(0, c.currentTime, 0.05); this.sfx.loop('drift', 0, 2000); this.sfx.loop('off', 0, 400); }
  drift(level, tier) { this.sfx.loop('drift', level * 0.16, 1500 + tier * 900); }
  offroad(level) { this.sfx.loop('off', level * 0.22, 380); }

  // ---- one-shots ------------------------------------------------------------------------------------------------------
  play(name, o = {}) {
    const s = this.sfx; if (!s.ctx) return;
    const T = (x) => s.tone({ vol: 0.3, ...x, vol: (x.vol ?? 0.3) * (o.vol ?? 1) }), N = (x) => s.noise({ ...x, vol: (x.vol ?? 0.3) * (o.vol ?? 1) });
    switch (name) {
      case 'count': T({ f: 523, t: 0.25, type: 'square', vol: 0.25 }); break;
      case 'go': T({ f: 1046, t: 0.6, type: 'square', vol: 0.3 }); T({ f: 1568, t: 0.5, type: 'triangle', vol: 0.2 }); break;
      case 'hop': T({ f: 300, f2: 500, t: 0.08, type: 'triangle', vol: 0.18 }); break;
      case 'tier': T({ f: 600 + o.tier * 300, f2: 900 + o.tier * 400, t: 0.12, type: 'square', vol: 0.14 }); break;
      case 'boost': N({ t: 0.6, vol: 0.45, lp: 3000, lp2: 600 }); T({ f: 180, f2: 420, t: 0.4, type: 'sawtooth', vol: 0.25 }); break;
      case 'pad': N({ t: 0.4, vol: 0.35, lp: 4000, lp2: 800 }); T({ f: 400, f2: 900, t: 0.25, type: 'square', vol: 0.15 }); break;
      case 'box': [880, 1175, 1568].forEach((f, i) => T({ f, t: 0.12, type: 'triangle', vol: 0.2, at: i * 0.05 })); break;
      case 'roulette': T({ f: 1200 + Math.random() * 600, t: 0.04, type: 'square', vol: 0.06 }); break;
      case 'itemready': T({ f: 988, t: 0.1, type: 'square', vol: 0.18 }); T({ f: 1319, t: 0.18, type: 'square', vol: 0.18, at: 0.08 }); break;
      case 'fire': N({ t: 0.15, vol: 0.4, lp: 3000, lp2: 500 }); T({ f: 300, f2: 120, t: 0.15, type: 'square', vol: 0.2 }); break;
      case 'drop': T({ f: 200, f2: 90, t: 0.2, type: 'sine', vol: 0.4 }); N({ t: 0.15, vol: 0.2, lp: 900 }); break;
      case 'hit': N({ t: 0.35, vol: 0.6, lp: 2500, lp2: 300 }); T({ f: 400, f2: 80, t: 0.5, type: 'sawtooth', vol: 0.3 }); break;
      case 'wall': N({ t: 0.15, vol: 0.3 * (o.hit || 1), lp: 1200 }); T({ f: 90, f2: 50, t: 0.12, type: 'sine', vol: 0.4 * (o.hit || 1) }); break;
      case 'bump': T({ f: 140, f2: 70, t: 0.1, type: 'sine', vol: 0.35 }); N({ t: 0.06, vol: 0.2, lp: 1500 }); break;
      case 'shield': [523, 659, 784, 1046, 1318].forEach((f, i) => T({ f, t: 0.15, type: 'triangle', vol: 0.18, at: i * 0.05 })); break;
      case 'thunder': N({ t: 1.4, vol: 0.8, lp: 900, lp2: 80 }); T({ f: 60, f2: 30, t: 1, type: 'sine', vol: 0.6 }); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => T({ f, t: 0.18, type: 'square', vol: 0.15, at: i * 0.09 })); break;
      case 'finallap': [659, 784, 988, 1319].forEach((f, i) => T({ f, t: 0.25, type: 'square', vol: 0.18, at: i * 0.13 })); break;
      case 'finish': s.play('win'); break;
      case 'lose': s.play('lose'); break;
      case 'fall': T({ f: 800, f2: 120, t: 0.9, type: 'triangle', vol: 0.25 }); break;
      case 'respawn': T({ f: 400, f2: 800, t: 0.3, type: 'sine', vol: 0.2 }); break;
      case 'land': T({ f: 110, f2: 60, t: 0.12, type: 'sine', vol: 0.4 }); break;
      case 'trick': T({ f: 700, f2: 1400, t: 0.15, type: 'square', vol: 0.15 }); break;
      case 'stall': N({ t: 0.5, vol: 0.4, lp: 600 }); T({ f: 70, f2: 40, t: 0.5, type: 'sawtooth', vol: 0.2 }); break;
      case 'block': T({ f: 1500, f2: 700, t: 0.12, type: 'square', vol: 0.2 }); break;
      case 'bounce': T({ f: 900, f2: 600, t: 0.05, type: 'square', vol: 0.08 * (o.vol ?? 1) }); break;
      case 'pop': N({ t: 0.2, vol: 0.3, lp: 2000 }); break;
      case 'ui': s.play('ui'); break;
      case 'select': s.play('select'); break;
      case 'back': s.play('back'); break;
      default: break;
    }
  }
}
