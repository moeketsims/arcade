// Positional sound on top of the shared Sfx synth: distance attenuation, muffling and stereo panning, plus game-specific cues.
// Works silently (all no-ops) until sfx.init() has created an AudioContext, and in Node tests.
import { clamp } from './util.js';

export class Sound {
  constructor(sfx) {
    this.sfx = sfx; this.L = { x: 0, y: 0, z: 0, h: 0 }; this.frame = 0; this.budget = 0; this.last = new Map(); this.ringing = 0;
    this.enabled = true; this.masterLevel = 0.6;      // master gain the flashbang ringing recovers to (kept in sync by the app's volume setting)
  }
  get ctx() { return this.sfx.ctx; }
  setListener(x, y, z, h) { const L = this.L; L.x = x; L.y = y; L.z = z; L.h = h; }
  beginFrame() { this.budget = 14; this.frame++; }

  /** Play a preset at a world position. opts: vol, pitch, ref (distance where volume falls to ~half). */
  at(name, x, y, z, opts = {}) {
    this.custom(x, y, z, opts.vol ?? 1, opts.ref ?? 16, v => this.sfx.play(name, { vol: v, pitch: opts.pitch }), name);
  }
  /** Run any synthesis callback routed through distance attenuation, muffling and panning; fn receives the volume scale. */
  custom(x, y, z, baseVol, ref, fn, key = 'c') {
    const c = this.ctx; if (!c || !this.enabled) return;
    const L = this.L, dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.hypot(dx, dy, dz);
    const vol = baseVol / (1 + (d / ref) * (d / ref));
    if (vol < 0.025) return;
    const k = key + ((x * 0.5) | 0) + ((z * 0.5) | 0), now = c.currentTime;
    if (this.last.get(k) > now - 0.025) return; this.last.set(k, now);
    if (this.budget-- <= 0) return;
    const hd = Math.hypot(dx, dz);
    const pan = hd > 1 ? clamp((dx * -Math.cos(L.h) + dz * Math.sin(L.h)) / hd, -1, 1) * 0.85 : 0;
    this._routed(pan, 14000 / (1 + d / 30), () => fn(vol));
  }
  /** Non-positional (UI / own weapon). */
  ui(name, opts = {}) { if (this.ctx && this.enabled) this.sfx.play(name, opts); }

  _routed(pan, cutoff, fn) {
    const s = this.sfx, c = s.ctx; if (!c) return;
    const old = s.bus;
    try {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(cutoff, 900, 16000);
      let head = lp;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; lp.connect(p); head = p; p.connect(old); } else lp.connect(old);
      s.bus = lp; fn();
    } finally { s.bus = old; }
  }

  // ---- gun helpers -------------------------------------------------------------------------------------------
  gun(snd, x, y, z, vol = 1, own = false) {
    if (own) this.ui(snd, { vol }); else this.at(snd, x, y, z, { vol, ref: snd === 'suppressed' ? 9 : snd === 'sniper' ? 34 : snd === 'shotgun' ? 26 : 22 });
  }

  // ---- cues --------------------------------------------------------------------------------------------------
  magOut() { const s = this.sfx; s.noise({ t: 0.05, vol: 0.18, lp: 3000, hp: 600 }); s.tone({ f: 420, f2: 260, t: 0.05, type: 'square', vol: 0.05 }); }
  magIn() { const s = this.sfx; s.noise({ t: 0.04, vol: 0.2, lp: 3500, hp: 800 }); s.tone({ f: 900, t: 0.03, type: 'square', vol: 0.06, at: 0.01 }); s.noise({ t: 0.05, vol: 0.18, lp: 2500, hp: 500, at: 0.09 }); }
  bolt() { const s = this.sfx; s.noise({ t: 0.05, vol: 0.2, lp: 4500, hp: 900 }); s.tone({ f: 1500, f2: 900, t: 0.06, type: 'square', vol: 0.05 }); s.noise({ t: 0.05, vol: 0.18, lp: 4000, hp: 900, at: 0.1 }); }
  pump() { this.bolt(); }
  shell() { const s = this.sfx; s.tone({ f: 1300, t: 0.03, type: 'square', vol: 0.06 }); s.noise({ t: 0.04, vol: 0.12, lp: 3000, hp: 800, at: 0.02 }); }
  click() { this.sfx.play('empty'); }
  mode() { const s = this.sfx; s.tone({ f: 1100, t: 0.03, type: 'square', vol: 0.06 }); s.tone({ f: 800, t: 0.03, type: 'square', vol: 0.05, at: 0.04 }); }
  swapGun() { const s = this.sfx; s.noise({ t: 0.08, vol: 0.14, lp: 2500, hp: 400 }); s.tone({ f: 600, f2: 450, t: 0.05, type: 'triangle', vol: 0.06 }); }
  ads() { this.sfx.noise({ t: 0.05, vol: 0.05, lp: 1500, hp: 300 }); }
  thud(x, y, z, vol = 0.6) { this.at('land', x, y, z, { vol }); }
  bounce(x, y, z) { const s = this.sfx; this.at('post', x, y, z, { vol: 0.14, pitch: 1.6 }); }
  pin() { this.sfx.play('grenadePin'); this.sfx.noise({ t: 0.04, vol: 0.08, lp: 5000, hp: 2500, at: 0.05 }); }
  lockTone() { this.sfx.tone({ f: 1500, t: 0.07, type: 'sine', vol: 0.14 }); }
  lockOn() { this.sfx.tone({ f: 2400, t: 0.35, type: 'sine', vol: 0.16 }); this.sfx.tone({ f: 2410, t: 0.35, type: 'square', vol: 0.04 }); }
  mineBeep(x, y, z) { this.at('ui', x, y, z, { vol: 0.5, pitch: 1.7 }); }
  streakReady() { const s = this.sfx; [660, 880, 1320].forEach((f, i) => s.tone({ f, t: 0.14, type: 'triangle', vol: 0.12, at: i * 0.08 })); }
  streakCall() { const s = this.sfx; s.tone({ f: 330, f2: 660, t: 0.25, type: 'sawtooth', vol: 0.08 }); s.tone({ f: 880, t: 0.2, type: 'square', vol: 0.06, at: 0.22 }); }
  warning() { const s = this.sfx; for (let i = 0; i < 3; i++) s.tone({ f: 980, t: 0.14, type: 'square', vol: 0.09, at: i * 0.22 }); }
  robotDie(x, y, z) {
    const s = this.sfx;
    this.custom(x, y, z, 1, 18, v => { s.noise({ t: 0.35, vol: 0.5 * v, lp: 5000, lp2: 600, hp: 300 }); s.tone({ f: 700, f2: 60, t: 0.6, type: 'sawtooth', vol: 0.18 * v }); s.tone({ f: 2400, f2: 400, t: 0.25, type: 'square', vol: 0.06 * v }); }, 'die');
  }
  heartbeat() { const s = this.sfx; s.tone({ f: 60, f2: 40, t: 0.14, type: 'sine', vol: 0.5 }); s.tone({ f: 55, f2: 38, t: 0.14, type: 'sine', vol: 0.4, at: 0.2 }); }
  sensorPing() { this.sfx.tone({ f: 1250, f2: 1180, t: 0.12, type: 'sine', vol: 0.1 }); }
  countdown(final = false) { this.sfx.tone({ f: final ? 1320 : 880, t: final ? 0.5 : 0.15, type: 'square', vol: 0.1 }); }
  hitmarker(kind) { this.sfx.play(kind === 'head' ? 'headshot' : kind === 'kill' ? 'kill' : 'hit'); }
  /** Flashbang: loud crack then a long ringing tone, ducking the master volume. */
  flashRing(strength = 1) {
    const s = this.sfx, c = s.ctx; if (!c) return;
    this.ringing = 4.5 * strength;
    s.tone({ f: 5200, t: 4.2 * strength, type: 'sine', vol: 0.09 * strength });
    s.tone({ f: 3300, t: 3.2 * strength, type: 'sine', vol: 0.05 * strength });
    if (s.master) { const g = s.master.gain, now = c.currentTime, lvl = this.masterLevel; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(Math.min(0.18, lvl), now + 0.05); g.linearRampToValueAtTime(lvl, now + 4.5 * strength); }
  }
  /** Looping ambience (sea + wind) at a low level. */
  ambience(on = true) { this.sfx.loop('sea', on ? 0.05 : 0, 380); this.sfx.loop('wind', on ? 0.025 : 0, 1100); }
  hum(level, cutoff = 500) { this.sfx.loop('drone', level, cutoff); }
}
