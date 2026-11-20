// Dash Derby race simulation: kart physics, drifting and mini-turbos, the start boost, laps and checkpoints, positions,
// item boxes, items and hazards, moving obstacles and the replay recording. No rendering and no DOM: main.js draws
// it and the headless tests drive it directly.
import { RACERS, KARTS, CLASSES, ITEMS, kartStats } from './data.js';
import { getTrack } from './track.js';
import { aiDrive, makeBrain } from './ai.js';

export const G = 26;                      // gravity m/s²
export const DRIFT_TIERS = [0.8, 1.7, 2.7];   // seconds of charge for blue / orange / purple sparks
export const TIER_BOOST = [0, 0.75, 1.25, 1.85];
const CHECKPOINTS = [0.25, 0.5, 0.75];
const RADIUS = 1.15;

export const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Seeded random (mulberry32) so a race can be replayed or tested deterministically. */
export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function emptyControls() { return { steer: 0, throttle: 0, brake: 0, drift: false, driftPressed: false, item: false, aim: 0, lookBack: false }; }

export class Kart {
  constructor(race, slot, entry) {
    this.race = race; this.slot = slot;
    this.racer = RACERS.find(r => r.id === entry.racer) || RACERS[0]; this.kartDef = KARTS.find(k => k.id === entry.kart) || KARTS[1];
    this.name = this.racer.name; this.color = this.racer.color; this.isPlayer = !!entry.isPlayer; this.isGhost = false;
    const st = this.stats = kartStats(this.racer, this.kartDef), cls = race.cls;
    this.vmax = (21.5 + st.speed * 1.55) * cls.speed;
    this.accel = 8 + st.accel * 2.3;
    this.turn = 1.5 + st.handling * 0.13;
    this.weight = 1 + st.weight * 0.45;
    this.chargeRate = 0.78 + st.drift * 0.09;
    this.ctl = emptyControls();
    this.brain = makeBrain(this, race);
    this.autopilot = !this.isPlayer;
    const g = race.track.gridSlot(slot);
    this.x = g.x; this.y = g.y; this.z = g.z; this.h = g.h; this.md = g.h; this.idx = g.i; this.lat = 0; this.s = g.i / race.track.n;
    this.sp = 0; this.vy = 0; this.air = false; this.airT = 0; this.offroad = false; this.onIce = false;
    this.drift = { on: false, dir: 0, charge: 0, tier: 0, want: false, grace: 0 };
    this.visH = this.h; this.roll = 0; this.spinAng = 0; this.hop = 0;
    this.boostT = 0; this.starT = 0; this.shieldT = 0; this.spinT = 0; this.zapT = 0; this.fallT = 0; this.safeT = 0;
    this.trickT = 0; this.trickDone = false; this.trickPending = false; this.rampT = 0;
    this.item = null; this.uses = 0; this.rouletteT = 0; this.rouletteItem = null;
    this.lap = 0; this.cps = 7; this.prevS = this.s; this.progress = this.s - 1; this.finished = false; this.finishTime = Infinity;
    this.lapStart = 0; this.lapTimes = []; this.place = slot + 1; this.wrongT = 0; this.bumpT = 0;
    this.startPress = null; this.startResult = null; this.stallT = 0; this.respawns = 0; this.hits = 0;
  }

  get speedFrac() { return this.sp / this.vmax; }
  get boosting() { return this.boostT > 0 || this.starT > 0; }

  /** Item or hazard hit. kind 'spin' | 'flip' | 'zap'. Returns true if it landed. */
  hit(kind, by = null) {
    if (this.starT > 0 || this.fallT > 0) return false;
    if (this.safeT > 0 && kind !== 'zap') return false;
    if (this.shieldT > 0) { this.shieldT = 0; this.race.emit('shieldPop', this); return false; }
    this.drift.on = false; this.drift.charge = 0; this.drift.tier = 0; this.boostT = 0; this.hits++;
    if (kind === 'flip') { this.spinT = 1.5; this.vy = 7; this.air = true; this.sp *= 0.2; }
    else if (kind === 'zap') { this.spinT = Math.max(this.spinT, 0.8); this.zapT = 4; this.sp *= 0.6; if (this.rouletteT > 0 || this.item) { this.item = null; this.uses = 0; this.rouletteT = 0; } }
    else { this.spinT = 1.15; this.sp *= 0.35; }
    this.safeT = 0.6;
    this.race.emit('hit', this, { kind, by });
    return true;
  }

  boost(t, kind = 'boost') { this.boostT = Math.max(this.boostT, t); this.race.emit(kind, this); }

  update(dt) {
    const R = this.race, T = R.track, c = this.ctl;
    for (const k of ['boostT', 'starT', 'shieldT', 'spinT', 'zapT', 'safeT', 'bumpT', 'stallT', 'rampT']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    if (this.rouletteT > 0) { this.rouletteT -= dt; if (this.rouletteT <= 0) { this.rouletteT = 0; this.item = this.rouletteItem; this.uses = ITEMS[this.item].uses; R.emit('itemReady', this); } }
    // falling off the course: the rescue drone lifts you back after a moment
    if (this.fallT > 0) {
      this.fallT -= dt; this.vy -= G * dt; this.y += this.vy * dt; this.x += Math.sin(this.md) * this.sp * dt; this.z += Math.cos(this.md) * this.sp * dt; this.sp *= Math.exp(-dt);
      if (this.fallT <= 0) this.respawn();
      return;
    }
    const stunned = this.spinT > 0 || this.stallT > 0;
    let steer = stunned ? 0 : clamp(c.steer, -1, 1), thr = stunned ? 0 : clamp(c.throttle, 0, 1), brk = stunned ? 0 : clamp(c.brake, 0, 1);
    if (this.stallT > 0) thr = 0;
    // ---- hop and drift ----
    const d = this.drift;
    if (c.driftPressed && !this.air && !stunned) {
      this.vy = 3.8; this.air = true; this.hop = 1; d.want = true; d.grace = 0; R.emit('hop', this);
    } else if (c.driftPressed && this.air && this.rampT > 0 && !this.trickDone) { this.trickDone = true; this.trickPending = true; this.trickT = 0.45; R.emit('trick', this); }
    if (d.on) {
      if (!c.drift || stunned) {
        if (!stunned && d.tier > 0) this.boost(TIER_BOOST[d.tier], 'miniturbo');
        d.on = false; d.charge = 0; d.tier = 0;
      } else if (this.sp < 6 || this.offroad && this.boostT <= 0 && this.sp < 9) { d.on = false; d.charge = 0; d.tier = 0; }
      else {
        const tight = steer * d.dir;   // -1 loose .. +1 tight
        d.charge += dt * this.chargeRate * (this.offroad ? 0.3 : (0.85 + 0.5 * Math.max(0, tight)));
        const tier = d.charge >= DRIFT_TIERS[2] ? 3 : d.charge >= DRIFT_TIERS[1] ? 2 : d.charge >= DRIFT_TIERS[0] ? 1 : 0;
        if (tier > d.tier) { d.tier = tier; R.emit('driftTier', this, { tier }); }
      }
    } else if (d.want && !this.air) {
      // landed from the hop: steer to pick a drift direction (a short grace window after landing)
      d.grace += dt;
      if (!c.drift || d.grace > 0.3) d.want = false;
      else if (Math.abs(steer) > 0.3 && this.sp > 9) { d.on = true; d.want = false; d.dir = Math.sign(steer); d.charge = 0; d.tier = 0; R.emit('driftStart', this); }
    }
    // ---- steering ----
    const vmax = this.vmax * (this.rubber || 1) * (this.zapT > 0 ? 0.72 : 1);
    const spF = Math.min(1, Math.abs(this.sp) / 7), hiF = 1 - 0.22 * Math.min(1, Math.abs(this.sp) / vmax);
    const airF = this.air ? 0.45 : 1, iceGrip = this.onIce ? 2.0 : this.offroad ? 7 : 12;
    if (d.on) {
      const tight = steer * d.dir, rate = this.turn * (0.66 + 0.56 * tight) * airF;
      this.md -= d.dir * rate * dt;
      const target = this.md - d.dir * 0.42; this.h += angDiff(target, this.h) * Math.min(1, 10 * dt);
    } else {
      this.h -= steer * this.turn * spF * hiF * airF * Math.sign(this.sp || 1) * dt;
      if (!this.air) this.md += angDiff(this.h, this.md) * Math.min(1, iceGrip * dt);
    }
    if (this.spinT > 0) this.spinAng += dt * 13 * Math.min(1, this.spinT); else this.spinAng = 0;
    // ---- speed ----
    let cap = vmax * (this.offroad && !this.boosting ? 0.52 : 1) * (d.on ? 0.985 : 1);
    if (this.boostT > 0) cap = vmax * 1.4; else if (this.starT > 0) cap = vmax * 1.3;
    if (this.boosting && !stunned) this.sp = Math.min(cap, this.sp + 45 * dt);
    if (thr > 0 && this.sp < cap) {
      const k = this.sp > 0 ? this.sp / cap : 0;
      this.sp = Math.min(cap, this.sp + this.accel * thr * (1 - 0.82 * k * k) * dt);
    } else if (this.sp > cap) this.sp -= (this.sp - cap) * (this.air ? 0.3 : 1.8) * dt;
    if (brk > 0) { if (this.sp > 0.5) this.sp -= 30 * brk * dt; else this.sp = Math.max(-8, this.sp - 12 * brk * dt); }
    else if (thr <= 0 && !this.boosting && !this.air) { const drag = (3 + Math.abs(this.sp) * 0.18) * dt; this.sp = Math.abs(this.sp) <= drag ? 0 : this.sp - Math.sign(this.sp) * drag; }
    if (this.spinT > 0) this.sp *= Math.exp(-2.2 * dt);
    // ---- move ----
    const prevX = this.x, prevZ = this.z;
    this.x += Math.sin(this.md) * this.sp * dt; this.z += Math.cos(this.md) * this.sp * dt;
    const L = T.locate(this.x, this.z, this.idx, this._loc || (this._loc = {}));
    this.idx = L.i; this.lat = L.lat;
    // barriers
    const drop = T.isDrop(L.i), lim = T.wall[L.i] - RADIUS;
    if (!drop && Math.abs(L.lat) > lim) {
      const side = Math.sign(L.lat), over = Math.abs(L.lat) - lim, rx = T.rx[L.i], rz = T.rz[L.i];
      this.x -= rx * side * over; this.z -= rz * side * over;
      let vx = Math.sin(this.md) * this.sp, vz = Math.cos(this.md) * this.sp;
      const vn = (vx * rx + vz * rz) * side;
      if (vn > 0) {
        vx -= rx * side * vn * 1.3; vz -= rz * side * vn * 1.3;
        const impact = vn / Math.max(1, Math.abs(this.sp));
        const ns = Math.hypot(vx, vz) * (1 - 0.35 * impact);
        if (ns > 0.5) { const nmd = Math.atan2(vx, vz); this.sp = Math.sign(this.sp) * ns; if (this.sp > 0) { this.h += angDiff(nmd, this.md) * 0.6; this.md = nmd; } }
        if (impact > 0.25 && this.bumpT <= 0) { this.bumpT = 0.3; R.emit('wall', this, { impact }); if (impact > 0.5 && d.on) { d.on = false; d.charge = 0; d.tier = 0; } }
      }
      this.lat = side * lim;
    }
    // ground and air
    const ground = T.hasGround(L.i, this.lat), gy = L.y;
    this.onIce = T.isIce(L.i);
    if (this.air) {
      this.airT += dt; this.vy -= G * dt; this.y += this.vy * dt;
      if (ground && this.y <= gy && this.vy <= 0) {
        this.y = gy; this.air = false; this.vy = 0; this.hop = 0;
        if (this.airT > 0.45) R.emit('land', this, { airT: this.airT });
        if (this.trickPending) { this.trickPending = false; if (!stunned) this.boost(0.8, 'trickBoost'); }
        this.airT = 0;
      } else if (!ground && this.y < gy - 5) { this.fall(); return; }
      else if (ground && this.y < gy - 0.6) { this.y = gy; this.vy = 0; this.air = false; this.airT = 0; }   // clipped into a hill
    } else if (!ground) {
      this.air = true; this.vy = 0; this.airT = 0;
    } else {
      this.y = gy;
      if ((T.flags[L.i] & 8) && this.sp > 8 && this.rampT <= 0) {
        const r = T.ramps.find(r => Math.abs(T.wrap(L.i - r.i + 4) - 4) <= 4);
        this.vy = (r ? r.v : 8) * Math.min(1.15, 0.55 + this.sp / 40); this.air = true; this.rampT = 1.2; this.trickDone = false; this.airT = 0; R.emit('ramp', this);
      }
      if (T.flags[L.i] & 16) for (const b of T.boosts) {
        const k = T.wrap(L.i - b.i); if (k < b.len + 1 && Math.abs(this.lat - b.lat) < b.w + 0.6) { if (this.boostT < 0.9) this.boost(1.1, 'pad'); }
      }
    }
    this.offroad = !this.air && !T.onRoad(L.i, this.lat);
    // ---- laps and checkpoints ----
    const s = L.s, ps = this.prevS;
    for (let k = 0; k < 3; k++) { const cpt = CHECKPOINTS[k]; if (ps < cpt && s >= cpt && s - ps < 0.2) this.cps |= 1 << k; }
    if (ps > 0.85 && s < 0.15) {   // crossed the line going forward
      if (this.cps === 7 && !this.finished) {
        this.lap++; this.cps = 0;
        if (this.lap > (this.maxLap || 0)) {
          this.maxLap = this.lap;
          if (this.lap > 1) this.lapTimes.push(R.time - this.lapStart);
          this.lapStart = R.time;
          if (this.lap > R.laps) { this.finished = true; this.finishTime = R.time; this.autopilot = true; R.emit('finish', this); }
          else R.emit('lap', this, { lap: this.lap });
        }
      }
    } else if (ps < 0.15 && s > 0.85 && this.lap > 0) { this.lap--; this.cps = 7; }   // backed over the line: undo it
    this.prevS = s;
    this.progress = this.finished ? R.laps + 2 - this.finishTime * 1e-6 : this.lap === 0 ? s - 1 : (this.lap - 1) + s;
    // wrong way
    const tdot = Math.sin(this.md) * T.tx[L.i] + Math.cos(this.md) * T.tz[L.i];
    this.wrongT = tdot * Math.sign(this.sp) < -0.4 && Math.abs(this.sp) > 3 ? this.wrongT + dt : Math.max(0, this.wrongT - dt * 2);
    // ---- visuals ----
    this.visH = this.h + this.spinAng;
    const targetRoll = d.on ? d.dir * 0.12 : -steer * 0.05 * Math.min(1, this.sp / 15);
    this.roll += (targetRoll - this.roll) * Math.min(1, 8 * dt);
    if (this.trickT > 0) this.trickT -= dt;
    this.moved = Math.hypot(this.x - prevX, this.z - prevZ);
  }

  fall() {
    if (this.fallT > 0) return;
    this.fallT = 1.6; this.drift.on = false; this.drift.charge = 0; this.drift.tier = 0; this.boostT = 0; this.respawns++;
    this.race.emit('fall', this);
  }

  respawn() {
    const T = this.race.track;
    // back on solid road: a little before where you left it, or past the gap if you fell into one
    let i = T.wrap(this.idx - 6), gapAhead = false;
    for (let k = -8; k < 14; k++) if (T.flags[T.wrap(this.idx + k)] & 2) gapAhead = true;
    if (gapAhead) { i = this.idx; for (let k = 0; k < 80 && !(T.flags[i] & 2); k++) i = T.wrap(i + 1); for (let k = 0; k < 80 && (T.flags[i] & 2); k++) i = T.wrap(i + 1); i = T.wrap(i + 4); }
    else for (let k = 0; k < 60 && !T.hasGround(i, 0); k++) i = T.wrap(i - 2);
    const p = T.point(i, 0);
    this.x = p.x; this.y = p.y + 0.2; this.z = p.z; this.h = this.md = p.h; this.idx = i; this.lat = 0; this.sp = 0; this.vy = 0; this.air = false;
    this.spinT = 0; this.safeT = 1.5; this.fallT = 0; this.prevS = i / T.n;
    this.race.emit('respawn', this);
  }
}

export class Race {
  /**
   * @param o.track    track definition (data.js TRACKS entry)
   * @param o.cls      engine class id
   * @param o.entrants [{ racer, kart, isPlayer }] in grid order (slot 0 = pole)
   * @param o.mode     'gp' | 'race' | 'tt'
   */
  constructor(o) {
    this.def = o.track; this.track = getTrack(o.track); this.mode = o.mode || 'race';
    this.cls = CLASSES.find(c => c.id === o.cls) || CLASSES[1];
    this.laps = o.laps || o.track.laps || 3;
    this.rand = rng(o.seed ?? 7);
    this.time = -(o.countdown ?? 4); this.state = 'countdown'; this.events = [];
    this.karts = o.entrants.map((e, i) => new Kart(this, i, e));
    this.player = this.karts.find(k => k.isPlayer) || null;
    this.projectiles = []; this.hazards = []; this.items = this.mode !== 'tt';
    this.order = [...this.karts];
    this.rec = { dt: 1 / 20, frames: [], acc: 0 };
    this.stormT = 0;
    if (this.mode === 'tt' && this.player) { this.player.item = 'pepper3'; this.player.uses = 3; }
    for (const b of this.track.boxes) b.t = 0;
  }

  emit(type, kart, data) { this.events.push({ type, kart, ...data }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Item from the box, weighted by race position (leaders get defence, the back of the pack gets speed). */
  rollItem(k) {
    const n = this.karts.length, p = n > 1 ? (k.place - 1) / (n - 1) : 0;
    const w = {}; let total = 0;
    for (const [id, it] of Object.entries(ITEMS)) {
      const [a, b, c] = it.weights, v = p < 0.5 ? a + (b - a) * (p / 0.5) : b + (c - b) * ((p - 0.5) / 0.5);
      w[id] = Math.max(0, v); total += w[id];
    }
    let r = this.rand() * total; for (const [id, v] of Object.entries(w)) { r -= v; if (r <= 0) return id; }
    return 'pepper';
  }

  update(dt) {
    this.time += dt;
    const T = this.track;
    T.updateMovers(Math.max(0, this.time));
    if (this.state === 'countdown') {
      for (const k of this.karts) {
        if (k.autopilot) aiDrive(k, this, dt);
        // start boost: press the gas between "2" fading and GO; too early stalls the engine
        const c = k.ctl;
        if (c.throttle > 0.5 && k.startPress == null) k.startPress = this.time;
        if (c.throttle <= 0.5) k.startPress = null;
        k.revving = c.throttle > 0.5;
      }
      if (this.time >= 0) {
        this.state = 'race'; this.emit('go', null);
        for (const k of this.karts) {
          if (k.startPress != null && k.ctl.throttle > 0.5) {
            if (k.startPress >= -1.05 && k.startPress <= -0.2) { k.boost(1.3, 'startBoost'); k.startResult = 'boost'; }
            else if (k.startPress < -2.2) { k.stallT = 0.9; k.startResult = 'stall'; this.emit('stall', k); }
          }
          k.lapStart = 0;
        }
      }
      this.record(dt);
      return;
    }
    for (const k of this.karts) if (k.autopilot && !k.isGhost) aiDrive(k, this, dt);
    for (const k of this.karts) {
      if (k.isGhost) continue;
      k.update(dt);
      if (this.items) this.itemLogic(k);
      k.ctl.driftPressed = false; k.ctl.itemPressed = false;
    }
    this.collide(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    for (const b of T.boxes) if (b.t > 0) b.t = Math.max(0, b.t - dt);
    this.rank();
    this.record(dt);
    if (this.karts.every(k => k.finished)) this.state = 'done';
  }

  rank() {
    this.order = [...this.karts].filter(k => !k.isGhost).sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : b.progress - a.progress);
    this.order.forEach((k, i) => { k.place = i + 1; });
  }

  itemLogic(k) {
    const T = this.track;
    if (!k.item && k.rouletteT <= 0 && !k.finished) {
      for (const b of T.boxes) {
        if (b.t > 0) continue;
        if ((b.x - k.x) ** 2 + (b.z - k.z) ** 2 < 2.3 * 2.3 && Math.abs(b.y + 1 - k.y) < 3) {
          b.t = 2.5; k.rouletteItem = this.rollItem(k); k.rouletteT = k.isPlayer ? 1.4 : 1.0; this.emit('box', k); break;
        }
      }
    } else {
      for (const b of T.boxes) if (b.t <= 0 && (b.x - k.x) ** 2 + (b.z - k.z) ** 2 < 2.3 * 2.3 && Math.abs(b.y + 1 - k.y) < 3) { b.t = 2.5; this.emit('boxPop', k); }
    }
    if (k.ctl.itemPressed && k.item && k.rouletteT <= 0 && k.spinT <= 0 && k.fallT <= 0) this.useItem(k);
  }

  useItem(k) {
    const id = k.item, aim = k.ctl.aim || 0;   // aim: +1 forward/up, -1 back/down
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    switch (id) {
      case 'pepper': case 'pepper3': k.boost(1.3, 'pepper'); break;
      case 'shield': k.shieldT = 10; this.emit('shield', k); break;
      case 'nova': k.starT = 6; k.boost(0.1, 'nova'); break;
      case 'puddle': {
        if (aim > 0.5) this.projectiles.push({ type: 'lob', x: k.x + fx * 2, z: k.z + fz * 2, y: k.y + 1, vx: fx * (k.sp + 14), vz: fz * (k.sp + 14), vy: 7, owner: k, life: 3, idx: k.idx });
        else this.hazards.push({ type: 'puddle', x: k.x - fx * 2.6, z: k.z - fz * 2.6, y: k.y, life: 45, owner: k, grace: 0.8 });
        this.emit('drop', k); break;
      }
      case 'puck': case 'puck3': {
        const back = aim < -0.5, dir = back ? k.h + Math.PI : k.h, sp = back ? 30 : 38 + Math.max(0, k.sp);
        this.projectiles.push({ type: 'puck', x: k.x + Math.sin(dir) * 2.2, z: k.z + Math.cos(dir) * 2.2, y: k.y, dir, sp, owner: k, life: 7, bounces: 5, idx: k.idx, grace: 0.3 });
        this.emit('fire', k); break;
      }
      case 'comet': {
        const target = this.order[k.place - 2] || this.order.find(o => o !== k && !o.finished) || null;
        this.projectiles.push({ type: 'comet', x: k.x + fx * 2, z: k.z + fz * 2, y: k.y + 1, dir: k.h, sp: Math.max(30, k.sp + 12), owner: k, target, life: 14, idx: k.idx, grace: 0.4 });
        this.emit('comet', k, { target }); break;
      }
      case 'storm': {
        this.stormT = 1; this.emit('storm', k);
        for (const o of this.karts) if (o !== k && o.place < k.place && !o.finished && !o.isGhost) o.hit('zap', k);
        break;
      }
      default: break;
    }
    k.uses--; if (k.uses <= 0) { k.item = null; k.uses = 0; }
  }

  collide() {
    const ks = this.karts;
    for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) {
      const A = ks[a], B = ks[b];
      if (A.isGhost || B.isGhost || A.fallT > 0 || B.fallT > 0) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d2 = dx * dx + dz * dz, R2 = (RADIUS * 2) ** 2;
      if (d2 >= R2 || Math.abs(A.y - B.y) > 2) continue;
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, over = RADIUS * 2 - d;
      if (A.starT > 0 && B.starT <= 0) { B.hit('spin', A); }
      else if (B.starT > 0 && A.starT <= 0) { A.hit('spin', B); }
      const wa = A.weight, wb = B.weight, sa = wb / (wa + wb), sb = wa / (wa + wb);
      A.x -= nx * over * sa; A.z -= nz * over * sa; B.x += nx * over * sb; B.z += nz * over * sb;
      // trade momentum along the contact normal
      const avx = Math.sin(A.md) * A.sp, avz = Math.cos(A.md) * A.sp, bvx = Math.sin(B.md) * B.sp, bvz = Math.cos(B.md) * B.sp;
      const rel = (bvx - avx) * nx + (bvz - avz) * nz;
      if (rel < 0) {
        const j = -(1.5) * rel / (1 / wa + 1 / wb);
        const nAx = avx - j / wa * nx, nAz = avz - j / wa * nz, nBx = bvx + j / wb * nx, nBz = bvz + j / wb * nz;
        const setV = (K, vx, vz) => { const s = Math.hypot(vx, vz); if (s < 0.3) return; const m = Math.atan2(vx, vz); const fwd = Math.cos(angDiff(m, K.h)); K.sp = s * Math.sign(fwd || 1) * Math.max(0.5, Math.abs(fwd)); if (fwd > 0) K.md = m; };
        setV(A, nAx, nAz); setV(B, nBx, nBz);
        if (Math.abs(rel) > 3 && A.bumpT <= 0) { A.bumpT = B.bumpT = 0.35; this.emit('bump', A, { other: B, force: Math.abs(rel) }); }
      }
    }
    // moving obstacles
    for (const m of this.track.movers) for (const k of ks) {
      if (k.isGhost || k.fallT > 0) continue;
      const dx = k.x - m.x, dz = k.z - m.z, rr = m.r + RADIUS;
      if (dx * dx + dz * dz < rr * rr && Math.abs(k.y - m.y) < 2.5) {
        const d = Math.hypot(dx, dz) || 0.01; k.x = m.x + dx / d * rr; k.z = m.z + dz / d * rr;
        if (k.starT > 0) continue;
        if (!k.hit('spin', null)) { k.sp *= 0.6; }
      }
    }
  }

  updateProjectiles(dt) {
    const T = this.track, loc = {};
    for (const p of this.projectiles) {
      p.life -= dt; if (p.grace > 0) p.grace -= dt;
      if (p.type === 'lob') {
        p.vy -= G * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        T.locate(p.x, p.z, p.idx, loc); p.idx = loc.i;
        if (p.y <= loc.y && p.vy < 0) { p.life = 0; if (T.hasGround(loc.i, loc.lat)) this.hazards.push({ type: 'puddle', x: p.x, z: p.z, y: loc.y, life: 45, owner: p.owner, grace: 0 }); }
        continue;
      }
      if (p.type === 'comet') {
        const tg = p.target;
        if (!tg || tg.finished && !tg.isPlayer || tg.fallT > 0) {
          // lost its target: keep flying along the course for a moment
        }
        let aimX, aimZ;
        const dist = tg ? Math.hypot(tg.x - p.x, tg.z - p.z) : Infinity;
        if (tg && dist < 22) { aimX = tg.x; aimZ = tg.z; }
        else { const q = T.point(p.idx + 10, tg ? Math.max(-3, Math.min(3, tg.lat)) : 0); aimX = q.x; aimZ = q.z; }
        const want = Math.atan2(aimX - p.x, aimZ - p.z); p.dir += angDiff(want, p.dir) * Math.min(1, 6 * dt);
        p.sp = Math.min(58, p.sp + 20 * dt);
        p.x += Math.sin(p.dir) * p.sp * dt; p.z += Math.cos(p.dir) * p.sp * dt;
        T.locate(p.x, p.z, p.idx, loc); p.idx = loc.i; p.y += ((loc.y + 1.2) - p.y) * Math.min(1, 8 * dt);
        if (tg && dist < 2.4 && Math.abs(tg.y - p.y) < 3) { tg.hit('flip', p.owner); p.life = 0; this.emit('explode', null, { x: p.x, y: p.y, z: p.z }); }
        continue;
      }
      // puck: rolls along the ground, bounces off barriers
      p.x += Math.sin(p.dir) * p.sp * dt; p.z += Math.cos(p.dir) * p.sp * dt;
      T.locate(p.x, p.z, p.idx, loc); p.idx = loc.i; p.y = loc.y;
      if (!T.hasGround(loc.i, loc.lat)) { p.life = 0; continue; }
      const lim = T.wall[loc.i] - 0.6;
      if (!T.isDrop(loc.i) && Math.abs(loc.lat) > lim) {
        const side = Math.sign(loc.lat), rx = T.rx[loc.i] * side, rz = T.rz[loc.i] * side;
        let vx = Math.sin(p.dir), vz = Math.cos(p.dir); const dn = vx * rx + vz * rz;
        if (dn > 0) { vx -= 2 * dn * rx; vz -= 2 * dn * rz; p.dir = Math.atan2(vx, vz); p.bounces--; this.emit('puckBounce', null, { x: p.x, z: p.z }); }
        p.x -= rx * (Math.abs(loc.lat) - lim); p.z -= rz * (Math.abs(loc.lat) - lim);
        if (p.bounces < 0) p.life = 0;
      }
      for (const k of this.karts) {
        if (k.isGhost || k.fallT > 0 || (k === p.owner && p.grace > 0)) continue;
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 2.0 * 2.0 && Math.abs(k.y - p.y) < 2) { k.hit('spin', p.owner); p.life = 0; this.emit('puckHit', k); break; }
      }
      for (const h of this.hazards) if (h.life > 0 && (h.x - p.x) ** 2 + (h.z - p.z) ** 2 < 2.2 * 2.2) { h.life = 0; p.life = 0; this.emit('splat', null, { x: h.x, z: h.z }); }
    }
    // pucks cancel each other
    const pucks = this.projectiles.filter(p => p.type === 'puck' && p.life > 0);
    for (let a = 0; a < pucks.length; a++) for (let b = a + 1; b < pucks.length; b++) if ((pucks[a].x - pucks[b].x) ** 2 + (pucks[a].z - pucks[b].z) ** 2 < 2.5) { pucks[a].life = pucks[b].life = 0; this.emit('splat', null, { x: pucks[a].x, z: pucks[a].z }); }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  updateHazards(dt) {
    for (const h of this.hazards) {
      h.life -= dt; if (h.grace > 0) h.grace -= dt;
      for (const k of this.karts) {
        if (k.isGhost || k.fallT > 0 || k.air || (k === h.owner && h.grace > 0)) continue;
        if ((k.x - h.x) ** 2 + (k.z - h.z) ** 2 < 2.0 * 2.0 && Math.abs(k.y - h.y) < 2) { if (k.starT <= 0) k.hit('spin', h.owner); h.life = 0; this.emit('splat', k, { x: h.x, z: h.z }); break; }
      }
    }
    this.hazards = this.hazards.filter(h => h.life > 0);
    if (this.stormT > 0) this.stormT = Math.max(0, this.stormT - dt);
  }

  /** Replay recording at 20 Hz: every kart's pose and state flags, projectiles, hazards and item boxes. */
  record(dt) {
    const r = this.rec; r.acc += dt; if (r.acc < r.dt) return; r.acc -= r.dt;
    if (r.frames.length > 20 * 60 * 8) return;   // 8 minutes is plenty
    const ks = this.karts.map(k => {
      const f = (k.boostT > 0 ? 1 : 0) | (k.drift.on ? 2 : 0) | (k.spinT > 0 ? 4 : 0) | (k.shieldT > 0 ? 8 : 0) | (k.starT > 0 ? 16 : 0) | (k.fallT > 0 ? 32 : 0) | (k.offroad ? 64 : 0);
      return [k.x, k.y, k.z, k.visH, k.roll, f, k.drift.tier, k.sp, k.place, k.lap];
    });
    r.frames.push({ t: this.time, k: ks, p: this.projectiles.map(p => [p.type, p.x, p.y, p.z]), h: this.hazards.map(h => [h.x, h.y, h.z]), b: this.track.boxes.map(b => b.t > 0 ? 1 : 0) });
  }

  /** Finishing times for karts still racing when the results are shown: extrapolated from their pace. */
  estimateFinish() {
    for (const k of this.karts) {
      if (k.finished || k.isGhost) continue;
      const left = Math.max(0, (this.laps + 1) - Math.max(0, k.progress)) * this.track.length;
      k.finishTime = this.time + left / Math.max(8, k.vmax * 0.85); k.finished = true; k.estimated = true;
    }
    this.rank();
  }
}
