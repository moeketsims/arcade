// Dash Derby sound: an engine that follows the player's revs, drift screech, boost whoosh, every race event, and a
// small step sequencer that plays an original tune per track (faster on the final lap). All Web Audio, no files.

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], penta: [0, 2, 4, 7, 9] };
export const SONGS = {
  menu: { bpm: 112, root: 57, scale: 'major', prog: [0, 5, 3, 4], lead: 'triangle', seed: 3 },
  meadow: { bpm: 128, root: 60, scale: 'major', prog: [0, 3, 4, 0], lead: 'square', seed: 11 },
  seaside: { bpm: 122, root: 62, scale: 'mixo', prog: [0, 6, 3, 4], lead: 'triangle', seed: 23 },
  canyon: { bpm: 136, root: 55, scale: 'dorian', prog: [0, 0, 6, 4], lead: 'sawtooth', seed: 37 },
  frost: { bpm: 118, root: 64, scale: 'minor', prog: [0, 5, 2, 6], lead: 'triangle', seed: 41 },
  neon: { bpm: 140, root: 57, scale: 'minor', prog: [0, 5, 6, 4], lead: 'sawtooth', seed: 53 },
  sky: { bpm: 126, root: 65, scale: 'penta', prog: [0, 3, 1, 4], lead: 'square', seed: 67 },
  results: { bpm: 100, root: 60, scale: 'major', prog: [0, 4, 5, 3], lead: 'triangle', seed: 79 },
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class KartAudio {
  constructor(sfx) { this.sfx = sfx; this.engine = null; this.music = null; this.musicOn = true; this.tempo = 1; this.vol = 1; }
  get ctx() { return this.sfx.ctx; }

  ensureEngine() {
    const c = this.ctx; if (!c || this.engine) return;
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; const o2 = c.createOscillator(); o2.type = 'square';
    const lfo = c.createOscillator(); lfo.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o1.frequency);
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.sfx.bus);
    o1.start(); o2.start(); lfo.start();
    // skid: band-passed noise
    const src = c.createBufferSource(); src.buffer = this.sfx.noiseBuf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3;
    const sg = c.createGain(); sg.gain.value = 0; src.connect(bp); bp.connect(sg); sg.connect(this.sfx.bus); src.start();
    // rival engines (one voice following the nearest CPU)
    const r1 = c.createOscillator(); r1.type = 'sawtooth'; const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 600; const rg = c.createGain(); rg.gain.value = 0;
    r1.connect(rl); rl.connect(rg); rg.connect(this.sfx.bus); r1.start();
    this.engine = { g, lp, o1, o2, sg, bp, r1, rg };
  }

  /** Every frame while racing. k = player kart (or null to silence), near = { dist, sp } of the closest rival. */
  updateEngine(k, near, paused) {
    if (!this.ctx) return; this.ensureEngine();
    const E = this.engine, t = this.ctx.currentTime;
    if (!k || paused) { E.g.gain.setTargetAtTime(0, t, 0.08); E.sg.gain.setTargetAtTime(0, t, 0.05); E.rg.gain.setTargetAtTime(0, t, 0.1); return; }
    const sp = Math.abs(k.sp) / k.vmax, rev = k.revving && k.race.state === 'countdown' ? 0.75 : 0;
    const gear = Math.max(rev, sp);
    const f = 48 + gear * 120 + (k.boostT > 0 ? 30 : 0) + (k.air ? 25 : 0);
    E.o1.frequency.setTargetAtTime(f, t, 0.06); E.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    E.lp.frequency.setTargetAtTime(500 + gear * 1600 + (k.boostT > 0 ? 800 : 0), t, 0.08);
    E.g.gain.setTargetAtTime((0.05 + 0.09 * Math.min(1, gear + k.ctl.throttle * 0.3)) * this.vol, t, 0.08);
    const skid = (k.drift.on ? 0.12 + 0.05 * k.drift.tier : 0) + (k.spinT > 0 ? 0.1 : 0) + (k.offroad && k.sp > 6 ? 0.03 : 0);
    E.sg.gain.setTargetAtTime(skid * this.vol, t, 0.04); E.bp.frequency.setTargetAtTime(k.offroad ? 500 : 1500 + k.drift.tier * 300, t, 0.05);
    if (near) { E.r1.frequency.setTargetAtTime(45 + near.sp * 3.2, t, 0.1); E.rg.gain.setTargetAtTime(Math.max(0, 0.05 * (1 - near.dist / 30)) * this.vol, t, 0.1); }
    else E.rg.gain.setTargetAtTime(0, t, 0.1);
  }

  play(name, o = {}) {
    const s = this.sfx; if (!s.ctx) return;
    const T = (x) => s.tone({ vol: 0.2, ...x, vol: (x.vol ?? 0.2) * (o.vol ?? 1) }), N = (x) => s.noise({ ...x, vol: (x.vol ?? 0.2) * (o.vol ?? 1) });
    switch (name) {
      case 'count': T({ f: 523, t: 0.35, type: 'square', vol: 0.18 }); break;
      case 'go': T({ f: 1047, t: 0.7, type: 'square', vol: 0.22 }); T({ f: 1568, t: 0.6, type: 'triangle', vol: 0.12 }); break;
      case 'box': [784, 988, 1319].forEach((f, i) => s.tone({ f, t: 0.12, type: 'triangle', vol: 0.14, at: i * 0.05 })); N({ t: 0.15, vol: 0.12, lp: 6000, hp: 2000 }); break;
      case 'tick': T({ f: 1400 + Math.random() * 600, t: 0.03, type: 'square', vol: 0.05 }); break;
      case 'itemReady': T({ f: 1175, t: 0.12, type: 'triangle', vol: 0.15 }); T({ f: 1568, t: 0.18, type: 'triangle', vol: 0.12, at: 0.06 }); break;
      case 'boost': N({ t: 0.6, vol: 0.28, lp: 1500, lp2: 5000, hp: 300 }); T({ f: 220, f2: 660, t: 0.35, type: 'sawtooth', vol: 0.08 }); break;
      case 'miniturbo': N({ t: 0.4, vol: 0.22, lp: 2500, lp2: 6000, hp: 600 }); T({ f: 440 * (o.tier || 1), f2: 880 * (o.tier || 1), t: 0.18, type: 'square', vol: 0.06 }); break;
      case 'tier': T({ f: [0, 1320, 1760, 2349][o.tier || 1], t: 0.12, type: 'triangle', vol: 0.12 }); break;
      case 'hop': N({ t: 0.06, vol: 0.12, lp: 900 }); break;
      case 'land': N({ t: 0.12, vol: 0.22, lp: 600 }); T({ f: 90, f2: 50, t: 0.12, type: 'sine', vol: 0.25 }); break;
      case 'wall': N({ t: 0.18, vol: 0.35, lp: 1200, lp2: 300 }); T({ f: 120, f2: 60, t: 0.14, type: 'sine', vol: 0.3 }); break;
      case 'bump': N({ t: 0.12, vol: 0.25, lp: 1500, lp2: 400 }); T({ f: 180, f2: 90, t: 0.1, type: 'square', vol: 0.08 }); break;
      case 'hit': N({ t: 0.5, vol: 0.4, lp: 3000, lp2: 300 }); T({ f: 600, f2: 120, t: 0.6, type: 'sawtooth', vol: 0.1 }); break;
      case 'spin': [880, 660, 880, 660].forEach((f, i) => s.tone({ f, t: 0.08, type: 'triangle', vol: 0.06, at: i * 0.09 })); break;
      case 'fire': T({ f: 300, f2: 900, t: 0.12, type: 'square', vol: 0.12 }); N({ t: 0.1, vol: 0.15, lp: 3000 }); break;
      case 'drop': T({ f: 300, f2: 120, t: 0.2, type: 'sine', vol: 0.25 }); N({ t: 0.2, vol: 0.12, lp: 800 }); break;
      case 'splat': N({ t: 0.3, vol: 0.3, lp: 900, lp2: 200 }); T({ f: 200, f2: 80, t: 0.25, type: 'sine', vol: 0.2 }); break;
      case 'shield': [523, 784, 1047].forEach((f, i) => s.tone({ f, t: 0.25, type: 'sine', vol: 0.12, at: i * 0.06 })); break;
      case 'shieldPop': T({ f: 1500, f2: 400, t: 0.25, type: 'sine', vol: 0.2 }); N({ t: 0.2, vol: 0.15, lp: 6000, hp: 2500 }); break;
      case 'comet': N({ t: 1.2, vol: 0.2, lp: 600, lp2: 3000 }); T({ f: 200, f2: 1200, t: 1.0, type: 'sawtooth', vol: 0.06 }); break;
      case 'explode': N({ t: 0.9, vol: 0.6, lp: 2500, lp2: 100 }); T({ f: 80, f2: 30, t: 0.7, type: 'sine', vol: 0.6 }); break;
      case 'storm': N({ t: 1.0, vol: 0.4, lp: 8000, lp2: 600, hp: 800 }); T({ f: 2000, f2: 200, t: 0.5, type: 'square', vol: 0.08 }); break;
      case 'nova': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => s.tone({ f, t: 0.15, type: 'square', vol: 0.07, at: i * 0.04 })); break;
      case 'lap': [784, 1047].forEach((f, i) => s.tone({ f, t: 0.2, type: 'triangle', vol: 0.15, at: i * 0.1 })); break;
      case 'finalLap': [659, 784, 988, 1319].forEach((f, i) => s.tone({ f, t: 0.22, type: 'square', vol: 0.1, at: i * 0.12 })); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => s.tone({ f, t: 0.25, type: 'square', vol: 0.1, at: i * 0.11 })); break;
      case 'finishBad': [523, 494, 466, 440].forEach((f, i) => s.tone({ f, t: 0.3, type: 'triangle', vol: 0.12, at: i * 0.16 })); break;
      case 'fall': T({ f: 900, f2: 100, t: 1.0, type: 'triangle', vol: 0.12 }); break;
      case 'respawn': [440, 660, 880].forEach((f, i) => s.tone({ f, t: 0.1, type: 'sine', vol: 0.1, at: i * 0.07 })); break;
      case 'ramp': N({ t: 0.3, vol: 0.2, lp: 2000, lp2: 600 }); break;
      case 'trick': T({ f: 880, f2: 1760, t: 0.15, type: 'square', vol: 0.08 }); break;
      case 'horn': T({ f: 392, t: 0.35, type: 'square', vol: 0.12 }); T({ f: 494, t: 0.35, type: 'square', vol: 0.1 }); break;
      case 'stall': T({ f: 120, f2: 40, t: 0.6, type: 'sawtooth', vol: 0.2 }); N({ t: 0.5, vol: 0.2, lp: 400 }); break;
      case 'wrong': T({ f: 300, t: 0.15, type: 'square', vol: 0.08 }); break;
      case 'pad': N({ t: 0.35, vol: 0.2, lp: 3000, lp2: 6000, hp: 900 }); break;
      default: s.play(name, o);
    }
  }

  // ---- music ----
  playSong(id) {
    if (!this.ctx) return;
    if (this.music?.id === id) return;
    this.stopSong();
    const S = SONGS[id] || SONGS.menu, sc = SCALES[S.scale];
    let seed = S.seed; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // one 16-step lead phrase per chord, fixed for the song (so it repeats like a real tune)
    const phrases = S.prog.map(() => Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || rnd() < 0.45) ? Math.floor(rnd() * 5) - (rnd() < 0.3 ? 2 : 0) : null));
    const note = (deg, oct = 0) => { const n = sc.length, o = Math.floor(deg / n); return S.root + sc[((deg % n) + n) % n] + 12 * (o + oct); };
    this.music = { id, S, phrases, note, step: 0, next: this.ctx.currentTime + 0.1 };
    this.music.timer = setInterval(() => this._schedule(), 50);
  }
  stopSong() { if (this.music) { clearInterval(this.music.timer); this.music = null; } }
  setMusic(on) { this.musicOn = on; if (this.sfx.musicBus) this.sfx.musicBus.gain.value = on ? 0.28 : 0; }
  _schedule() {
    const M = this.music, c = this.ctx; if (!M || !c) return;
    const bus = this.sfx.musicBus; if (bus) bus.gain.value = this.musicOn ? 0.28 : 0;
    const stepDur = 60 / (M.S.bpm * this.tempo) / 4;
    while (M.next < c.currentTime + 0.25) {
      const at = M.next - c.currentTime, i = M.step % 16, bar = Math.floor(M.step / 16) % M.S.prog.length, ch = M.S.prog[bar];
      const T = o => this.sfx.tone({ ...o, at: Math.max(0, at), bus });
      const N = o => this.sfx.noise({ ...o, at: Math.max(0, at), bus });
      if (i % 4 === 0) { T({ f: 110, f2: 45, t: 0.16, type: 'sine', vol: 0.55 }); }
      if (i % 8 === 4) N({ t: 0.12, vol: 0.28, lp: 3000, hp: 600 });
      if (i % 2 === 1) N({ t: 0.03, vol: 0.09, lp: 9000, hp: 6000 });
      if (i % 2 === 0) T({ f: mtof(M.note(ch + (i % 4 === 2 ? 4 : 0), -2)), t: stepDur * 1.6, type: 'triangle', vol: 0.32 });
      const ph = M.phrases[bar][i];
      if (ph != null) T({ f: mtof(M.note(ch + ph + 7, -1)), t: stepDur * 1.8, type: M.S.lead, vol: 0.09 });
      if (i % 4 === 0) [0, 2, 4].forEach(d => T({ f: mtof(M.note(ch + d, -1)), t: stepDur * 3.5, type: 'sine', vol: 0.05 }));
      M.next += stepDur; M.step++;
    }
  }
}
