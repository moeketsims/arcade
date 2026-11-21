// Sparkplug GP: the race simulation. Fixed 60 Hz steps, seeded randomness, no Three.js and no DOM, so a race can be
// run headless in the tests exactly as it runs in the browser. The view reads kart/projectile state and the
// event list; the app feeds one input object per human kart per step.
import { Track } from './track.js';
import { RACERS, KARTS, CLASSES, TRACKS, ITEM_ODDS, kartStats } from './data.js';

export const DT = 1 / 60;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const GRAV = 24, CHECKPOINTS = 16;
export const DRIFT_TIERS = [0.9, 2.0, 3.3];          // seconds of charge for tier 1 / 2 / 3
const DRIFT_BOOST = [0, 0.7, 1.2, 1.9];               // boost seconds per tier
export const BOOST_MUL = 1.32;
const KART_R = 1.25;

/** Small deterministic RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const NO_INPUT = { steer: 0, accel: 0, brake: 0, drift: false, item: false, itemBack: false, lookBack: false };

class Kart {
  constructor(race, idx, racer, kart, human) {
    this.race = race; this.idx = idx; this.racer = racer; this.kart = kart; this.human = human;
    const st = kartStats(racer, kart), cls = race.cls;
    this.stats = st;
    this.top = (24.5 + st.speed * 1.15) * cls.speed;
    this.accelRate = (7 + st.accel * 1.6) * Math.sqrt(cls.speed);
    this.turn = 1.45 + st.handling * 0.13;
    this.mass = 0.8 + st.weight * 0.12;
    this.offGrip = st.offroad ? 0.72 : 0.56;
    this.x = 0; this.y = 0; this.z = 0; this.vy = 0; this.h = 0; this.move = 0; this.speed = 0;
    this.grounded = true; this.air = 0; this.trick = false; this.trickBoost = false;
    this.steerVis = 0; this.drift = 0; this.driftCharge = 0; this.driftTier = 0; this.hopT = 0; this.driftQueued = false;
    this.boostT = 0; this.spinT = 0; this.spinVis = 0; this.invulnT = 0; this.shieldT = 0; this.zapT = 0; this.stallT = 0;
    this.item = null; this.itemCount = 0; this.roulette = 0; this.trailing = false;
    this.ti = 0; this.tf = 0; this.lat = 0; this.cp = CHECKPOINTS - 1; this.lap = 0; this.lapStart = 0; this.lapTimes = []; this.bestLap = Infinity;
    this.finished = false; this.finishTime = 0; this.place = idx + 1; this.dist = 0;
    this.offroad = false; this.wrongT = 0; this.fallT = 0; this.safeI = 0; this.bumpT = 0;
    this.topLap = 0;   // the highest lap this kart has started (see crossLine)
    this.input = { ...NO_INPUT }; this.prevDrift = false; this.prevItem = false;
    this.startCharge = 0; this.startBoost = false;
    // AI personality
    const r = race.rand;
    this.ai = { lane: (r() * 2 - 1) * 0.45, laneT: 0, skill: race.cls.ai * (0.93 + r() * 0.1), itemT: 1 + r() * 3, driftSkill: 0.6 + r() * 0.4, wobble: r() * 10 };
  }
  get raceDist() { return (this.lap - 1) * this.race.track.length + (this.ti + this.tf) * this.race.track.step; }
}

export class Race {
  /**
   * @param o { track: index, cls: index, mode: 'gp'|'tt'|'vs', players: [{ racer, kart }], cpu: count, laps, seed, grid: [racer ids for cpus] }
   */
  constructor(o) {
    this.o = o; this.def = TRACKS[o.track]; this.track = new Track(this.def);
    this.cls = CLASSES[o.cls ?? 1]; this.mode = o.mode || 'vs'; this.laps = o.laps || this.def.laps;
    this.rand = rng(o.seed ?? 12345); this.t = 0; this.tick = 0; this.state = 'countdown'; this.countT = o.countdown ?? 3.6;
    this.events = []; this.projs = []; this.boxes = this.track.boxes.map(b => ({ ...b, t: 0 }));
    this.karts = [];
    const humans = o.players || [];
    const used = new Set(humans.map(p => p.racer));
    humans.forEach((p, i) => this.karts.push(new Kart(this, i, RACERS[p.racer], KARTS[p.kart], true)));
    if (this.mode !== 'tt') {
      const pool = (o.grid || RACERS.map((_, i) => i)).filter(i => !used.has(i));
      const n = o.cpu ?? 8 - humans.length;
      for (let k = 0; k < n; k++) {
        const ri = pool[k % pool.length];
        // CPUs pick a kart that suits their weight (light: scooter or buggy, heavy: rocket or brickhauler)
        const fits = [[2, 0, 1], [0, 1, 2, 3], [3, 1, 0]][RACERS[ri].weight];
        this.karts.push(new Kart(this, this.karts.length, RACERS[ri], KARTS[fits[Math.floor(this.rand() * fits.length)]], false));
      }
    }
    // grid order: humans start at the back in a GP/VS (o.gridOrder can override), two abreast, 7 m between rows
    const order = o.gridOrder || [...this.karts.filter(k => !k.human), ...this.karts.filter(k => k.human)];
    if (this.mode === 'tt') order.splice(0, order.length, ...this.karts);
    order.forEach((k, slot) => {
      const row = Math.floor(slot / 2), side = slot % 2 ? -1 : 1;
      const i = this.track.wrap(-Math.round((6 + row * 7) / this.track.step));
      const p = this.track.at(i, side * this.track.w[i] * 0.22 * (this.mode === 'tt' ? 0 : 1));
      k.x = p.x; k.z = p.z; k.y = p.y; k.h = k.move = this.track.heading(i); k.ti = i; k.safeI = i;
      k.place = slot + 1;
    });
    this.order = [...this.karts].sort((a, b) => a.place - b.place);
    this.replay = []; this.finishOrder = [];
  }

  get human() { return this.karts.find(k => k.human); }
  emit(type, data = {}) { this.events.push({ type, t: this.t, ...data }); }

  /** Advance one fixed step. inputs: array of input objects for the human karts, in order. */
  step(inputs = []) {
    const humans = this.karts.filter(k => k.human);
    humans.forEach((k, i) => { k.input = inputs[i] || NO_INPUT; });
    for (const k of this.karts) if (!k.human || k.autopilot || k.finished) k.input = this.aiInput(k);
    if (this.state === 'countdown') {
      this.countT -= DT;
      for (const k of this.karts) {
        // start boost: hold the throttle from the moment "2" leaves the screen. Holding it any earlier floods the engine.
        if (k.input.accel > 0.5) { if (this.countT > 2) k.startCharge = -1; else if (k.startCharge >= 0) k.startCharge += DT; }
        else if (k.startCharge < 0 && this.countT > 2) k.startCharge = 0;
      }
      const sec = Math.ceil(this.countT);
      if (sec !== this._lastSec && sec >= 1 && sec <= 3) this.emit('count', { n: sec });
      this._lastSec = sec;
      if (this.countT <= 0) {
        this.state = 'race'; this.emit('go');
        for (const k of this.karts) {
          if (k.startCharge > 0.3) { k.boostT = 1.3; k.startBoost = true; this.emit('startboost', { k: k.idx }); }
          else if (k.startCharge < 0) { k.stallT = 0.9; this.emit('stall', { k: k.idx }); }
          k.lapStart = 0;
        }
      }
      this._record();
      this.tick++;
      return;
    }
    this.t += DT; this.tick++;
    for (const k of this.karts) this.updateKart(k);
    this.collideKarts();
    this.updateProjectiles();
    this.updateBoxes();
    this.updatePlaces();
    this._record();
    if (this.state === 'race' && this.karts.filter(k => k.human).every(k => k.finished)) { this.state = 'finishing'; this.finishingT = 0; }
    if (this.state === 'finishing') {
      this.finishingT += DT;
      if (this.karts.every(k => k.finished) || this.finishingT > 7) this.finalize();
    }
  }

  /** Every kart still racing gets a projected finish time from its remaining distance. */
  finalize() {
    if (this.state === 'done') return;
    const L = this.track.length * this.laps;
    for (const k of [...this.order]) if (!k.finished) {
      const rem = Math.max(0, L - k.raceDist), v = Math.max(12, k.top * 0.85);
      k.finished = true; k.finishTime = this.t + rem / v; k.projected = true; this.finishOrder.push(k);
    }
    this.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
    this.finishOrder.forEach((k, i) => { k.place = i + 1; });
    this.state = 'done'; this.emit('done');
  }

  _record() {
    if (this.tick % 2) return;
    this.replay.push({
      t: this.t,
      k: this.karts.map(k => [k.x, k.y, k.z, k.h, k.steerVis, k.drift, k.driftTier, k.boostT > 0 ? 1 : 0, k.spinVis, k.shieldT > 0 ? 1 : 0, k.speed, k.place]),
      p: this.projs.map(p => [p.type, p.x, p.y, p.z]),
      b: this.boxes.map(b => (b.t > 0 ? 0 : 1)),
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  updateKart(k) {
    const T = this.track, inp = k.input;
    // timers
    k.boostT = Math.max(0, k.boostT - DT); k.invulnT = Math.max(0, k.invulnT - DT); k.shieldT = Math.max(0, k.shieldT - DT);
    k.zapT = Math.max(0, k.zapT - DT); k.stallT = Math.max(0, k.stallT - DT); k.bumpT = Math.max(0, k.bumpT - DT);
    if (k.roulette > 0) { k.roulette -= DT; if (k.roulette <= 0) { k.roulette = 0; this.emit('itemready', { k: k.idx, item: k.item }); } }

    // falling off the edge: wait, then a tow-drone puts you back on the road
    if (k.fallT > 0) {
      k.fallT -= DT; k.y -= 14 * DT * (1.2 - k.fallT); k.speed *= 0.98;
      if (k.fallT <= 0) {
        const i = T.wrap(k.safeI - 4), p = T.at(i, 0);
        k.x = p.x; k.z = p.z; k.y = p.y + 2; k.vy = 0; k.h = k.move = T.heading(i); k.speed = 0; k.ti = i; k.invulnT = 2; k.grounded = false;
        this.emit('respawn', { k: k.idx });
      }
      return;
    }

    // ---- throttle / brake --------------------------------------------------------------------------------------
    const proj = T.project(k.x, k.z, k.ti);
    const hw = T.halfWidth(proj.i), absLat = Math.abs(proj.lat);
    k.offroad = k.grounded && absLat > hw + 0.3 && T.edge[proj.i] === 0;
    const ice = T.surface[proj.i] === 1;
    const zapMul = k.zapT > 0 ? 0.72 : 1, aiMul = k.human ? 1 : this.aiSpeedMul(k);
    let top = k.top * zapMul * aiMul;
    if (k.offroad && k.boostT <= 0 && k.shieldT <= 0) top *= k.offGrip;
    if (k.boostT > 0) top = Math.max(top, k.top * BOOST_MUL * aiMul);
    if (k.shieldT > 0) top = Math.max(top, k.top * 1.12);
    const spinning = k.spinT > 0, stalled = k.stallT > 0;
    let accel = spinning || stalled ? 0 : inp.accel, brake = spinning ? 0 : inp.brake;
    if (k.boostT > 0) accel = 1;
    if (accel > 0 && brake > 0.5) { accel = 0; }   // both: brake wins (lets you power-slide-stop)
    if (k.grounded) {
      if (k.boostT > 0 && k.speed < top) k.speed = Math.min(top, k.speed + 45 * DT);   // boosts kick in hard
      else if (accel > 0 && k.speed < top) k.speed += k.accelRate * accel * (1 - 0.65 * Math.max(0, k.speed) / top) * DT;
      else if (k.speed > top) k.speed = Math.max(top, k.speed - 18 * DT);
      if (brake > 0) { if (k.speed > 0) k.speed = Math.max(-1, k.speed - 30 * brake * DT); else k.speed = Math.max(-9, k.speed - 9 * brake * DT); }
      if (!accel && !brake) k.speed *= Math.pow(0.6, DT);
      k.speed -= T.grade[proj.i] * 6 * DT * Math.sign(k.speed || 1) * (k.speed > 0 ? 1 : 0);
    }
    if (spinning) { k.spinT -= DT; k.spinVis += DT * 14; k.speed *= Math.pow(0.15, DT); if (k.spinT <= 0) { k.spinT = 0; k.spinVis = 0; } }

    // ---- steering and drifting -----------------------------------------------------------------------------------
    const steer = spinning ? 0 : clamp(inp.steer, -1, 1);
    k.steerVis += (steer - k.steerVis) * Math.min(1, DT * 10);
    const speedF = clamp(Math.abs(k.speed) / 9, 0, 1) * (1 - 0.3 * clamp(k.speed / k.top, 0, 1));
    const driftPress = inp.drift && !k.prevDrift;
    if (driftPress && k.grounded && !spinning && k.hopT <= 0) { k.hopT = 0.22; k.vy = 4.2; k.grounded = false; k.driftQueued = true; this.emit('hop', { k: k.idx }); }
    if (driftPress && !k.grounded && k.air > 0.12 && k.lastRamp > 0 && !k.trick) { k.trick = true; this.emit('trick', { k: k.idx }); }
    k.hopT = Math.max(0, k.hopT - DT);
    // a drift starts when you land from the hop with drift held, steering, and fast enough
    if (k.drift === 0 && inp.drift && k.grounded && k.driftQueued && Math.abs(steer) > 0.25 && k.speed > 9) {
      k.drift = Math.sign(steer); k.driftCharge = 0; k.driftTier = 0; k.driftQueued = false; this.emit('driftstart', { k: k.idx });
    }
    // after landing you have a moment to pick a direction while drift is held
    if (k.grounded && k.hopT <= 0 && k.driftQueued) { k.queueT = (k.queueT || 0) + DT; if (!inp.drift || k.queueT > 0.3) { k.driftQueued = false; k.queueT = 0; } }
    if (k.drift !== 0) k.queueT = 0;
    if (k.drift !== 0) {
      const end = !inp.drift || k.speed < 7 || spinning;
      if (end) {
        if (k.driftTier > 0 && !spinning) { k.boostT = Math.max(k.boostT, DRIFT_BOOST[k.driftTier]); this.emit('boost', { k: k.idx, tier: k.driftTier }); }
        k.drift = 0; k.driftCharge = 0; k.driftTier = 0;
      } else {
        const into = steer * k.drift;   // +1 = steering into the drift (tighter), -1 = counter-steer (wider)
        const rate = k.turn * (0.62 + 0.48 * into) * k.drift;
        k.h += rate * DT * speedF * (ice ? 0.9 : 1);
        k.driftCharge += DT * (0.75 + 0.75 * Math.max(0, into)) * (k.stats.handling >= 4 ? 1.12 : 1) * (k.offroad ? 0.4 : 1);   // grass charges slowly
        const tier = k.driftCharge >= DRIFT_TIERS[2] ? 3 : k.driftCharge >= DRIFT_TIERS[1] ? 2 : k.driftCharge >= DRIFT_TIERS[0] ? 1 : 0;
        if (tier !== k.driftTier) { k.driftTier = tier; this.emit('drifttier', { k: k.idx, tier }); }
      }
    } else if (!spinning) {
      const dir = k.speed >= 0 ? 1 : -1;
      k.h += steer * k.turn * speedF * dir * DT * (k.grounded ? 1 : 0.4);
    }
    k.prevDrift = inp.drift;
    // velocity direction follows the nose: quickly with grip, slowly on ice or in a drift (that is the slide)
    let grip = k.drift ? 2.6 : 9; if (ice) grip *= 0.35; if (!k.grounded) grip *= 0.15;
    k.move += angDiff(k.move, k.h) * Math.min(1, grip * DT);
    if (k.speed < 0) k.move = k.h;

    // ---- move -----------------------------------------------------------------------------------------------------
    const vx = Math.cos(k.move) * k.speed, vz = Math.sin(k.move) * k.speed;
    k.x += vx * DT; k.z += vz * DT;
    const p2 = T.project(k.x, k.z, k.ti);
    k.ti = p2.i; k.tf = p2.f; k.lat = p2.lat;
    const ground = T.height(p2.i, p2.f), hw2 = T.halfWidth(p2.i), wall = hw2 + T.shoulder;
    // ramps launch you
    for (const r of T.ramps) {
      const d = T.wrap(p2.i - r.i);
      if (d < 3 && k.grounded && k.speed > 8 && Math.abs(p2.lat) < hw2) { k.vy = 6 + k.speed * 0.22 * r.power; k.grounded = false; k.lastRamp = 1; k.air = 0; this.emit('ramp', { k: k.idx }); }
    }
    if (k.grounded) {
      if (T.edge[p2.i] === 1 && Math.abs(p2.lat) > hw2 + 1.2) { k.grounded = false; k.vy = 0; }   // drove off the edge
      else k.y = ground;
    }
    if (!k.grounded) {
      k.air += DT; k.vy -= GRAV * DT; k.y += k.vy * DT;
      const overRoad = Math.abs(p2.lat) <= (T.edge[p2.i] === 1 ? hw2 + 1.2 : wall);
      if (k.y <= ground && overRoad && k.vy <= 0) {
        k.y = ground; k.grounded = true; k.vy = 0;
        if (k.trick) { k.boostT = Math.max(k.boostT, 0.9); this.emit('boost', { k: k.idx, tier: 1, trick: true }); }
        if (k.air > 0.35) this.emit('land', { k: k.idx, hard: k.air > 0.8 });
        k.trick = false; k.air = 0; k.lastRamp = 0;
      } else if (k.y < ground - 3 && !overRoad) { k.fallT = 1.4; k.drift = 0; k.driftCharge = 0; k.driftTier = 0; this.emit('fall', { k: k.idx }); return; }
    }
    // barriers
    if (T.edge[p2.i] === 0 && Math.abs(p2.lat) > wall - KART_R) {
      const sgn = Math.sign(p2.lat), over = Math.abs(p2.lat) - (wall - KART_R);
      k.x -= T.nx[p2.i] * sgn * over; k.z -= T.nz[p2.i] * sgn * over;
      // reflect the sideways part of the velocity
      const tan = Math.atan2(T.tz[p2.i], T.tx[p2.i]), rel = angDiff(tan, k.move), hit = Math.abs(Math.sin(rel));
      if (hit > 0.08) {
        k.move = Math.abs(rel) < Math.PI / 2 ? tan : tan + Math.PI;   // slide along the barrier
        k.h += angDiff(k.h, k.move) * 0.35; k.speed *= 1 - 0.5 * hit;
        if (k.bumpT <= 0 && hit > 0.2) { this.emit('wall', { k: k.idx, hit }); k.bumpT = 0.3; }
      }
    }
    if (k.grounded && Math.abs(p2.lat) <= hw2 + 1) k.safeI = p2.i;
    // boost pads
    for (const pd of T.pads) {
      const d = T.wrap(p2.i - pd.i);
      if (d * T.step < pd.len && Math.abs(p2.lat - pd.lat) < 3.2 && k.grounded) { if (k.boostT < 0.5) this.emit('pad', { k: k.idx }); k.boostT = Math.max(k.boostT, 1.1); }
    }
    // ---- laps --------------------------------------------------------------------------------------------------------
    const cpNow = Math.floor(p2.i / T.n * CHECKPOINTS);
    if (cpNow === (k.cp + 1) % CHECKPOINTS) {
      k.cp = cpNow;
      if (cpNow === 0) this.crossLine(k);
    } else if (cpNow === (k.cp - 1 + CHECKPOINTS) % CHECKPOINTS) {
      if (k.cp === 0) k.lap--;   // reversed back over the line
      k.cp = cpNow;
    }
    // wrong way
    const fwd = Math.cos(k.move) * T.tx[p2.i] + Math.sin(k.move) * T.tz[p2.i];
    k.wrongT = fwd < -0.4 && k.speed > 3 ? k.wrongT + DT : 0;
    // items
    this.handleItem(k, inp);
    k.prevItem = inp.item;
  }

  crossLine(k) {
    k.lap++;
    // Reversed back over the line and across it again: still the same lap, not a new one. Without this the second
    // crossing logged a lap of a few seconds, which became the best lap and could be saved as a time-trial record.
    if (k.lap <= k.topLap) return;
    k.topLap = k.lap;
    if (k.lap >= 2) {
      const lt = this.t - k.lapStart; k.lapTimes.push(lt); k.bestLap = Math.min(k.bestLap, lt); k.lapStart = this.t;
      this.emit('lap', { k: k.idx, lap: k.lap, time: lt });
    } else k.lapStart = 0;
    if (k.lap > this.laps && !k.finished) {
      k.finished = true; k.finishTime = this.t; this.finishOrder.push(k); k.place = this.finishOrder.length;
      this.emit('finish', { k: k.idx, place: k.place, time: this.t });
    } else if (k.lap === this.laps && k.lap > 1) this.emit('finallap', { k: k.idx });
  }

  collideKarts() {
    const K = this.karts;
    for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
      const a = K[i], b = K[j]; if (a.fallT > 0 || b.fallT > 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z, dy = Math.abs(b.y - a.y), d = Math.hypot(dx, dz);
      if (d > KART_R * 2 || dy > 1.6 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, over = KART_R * 2 - d, ma = a.mass * (a.shieldT > 0 ? 4 : 1), mb = b.mass * (b.shieldT > 0 ? 4 : 1);
      a.x -= nx * over * mb / (ma + mb); a.z -= nz * over * mb / (ma + mb); b.x += nx * over * ma / (ma + mb); b.z += nz * over * ma / (ma + mb);
      if (a.shieldT > 0 && b.shieldT <= 0) this.hit(b, 'shield', a); else if (b.shieldT > 0 && a.shieldT <= 0) this.hit(a, 'shield', b);
      else {
        // side bump: nudge each sideways, lighter karts more
        const push = 2.2;
        a.move += angDiff(a.move, Math.atan2(-nz, -nx)) * 0.08 * mb / ma; b.move += angDiff(b.move, Math.atan2(nz, nx)) * 0.08 * ma / mb;
        a.x -= nx * push * DT * mb; a.z -= nz * push * DT * mb; b.x += nx * push * DT * ma; b.z += nz * push * DT * ma;
        if (a.bumpT <= 0 && b.bumpT <= 0) { this.emit('bump', { k: a.idx, o: b.idx }); a.bumpT = b.bumpT = 0.35; }
      }
    }
  }

  /** Something hit kart k. Returns true if it took the hit. */
  hit(k, why, by = null, opts = {}) {
    if (k.finished && !k.human) return false;
    if (k.invulnT > 0 || k.shieldT > 0) return false;
    if (k.fallT > 0) return false;
    k.spinT = opts.spin ?? 1.15; k.speed *= opts.keep ?? 0.35; k.drift = 0; k.driftCharge = 0; k.driftTier = 0; k.boostT = 0; k.invulnT = 1.9;
    if (opts.zap) k.zapT = opts.zap;
    if (opts.pop) { k.vy = 6; k.grounded = false; }
    this.emit('hit', { k: k.idx, why, by: by?.idx ?? -1 });
    return true;
  }

  // ---- items -------------------------------------------------------------------------------------------------------
  rollItem(k) {
    const grp = this.mode === 'tt' ? 0 : clamp(Math.floor((k.place - 1) / Math.max(1, this.karts.length) * 4), 0, 3);
    const entries = Object.entries(ITEM_ODDS).map(([id, w]) => [id, w[grp]]).filter(e => e[1] > 0);
    let tot = entries.reduce((s, e) => s + e[1], 0), r = this.rand() * tot;
    for (const [id, w] of entries) { if ((r -= w) <= 0) return id; }
    return entries[0][0];
  }

  handleItem(k, inp) {
    if (!k.item || k.roulette > 0 || k.spinT > 0) { if (k.trailing && k.spinT > 0) k.trailing = false; return; }
    const press = inp.item && !k.prevItem, release = !inp.item && k.prevItem;
    const trailable = k.item === 'goo' || k.item === 'puck';
    if (trailable) {
      if (press) { k.trailing = true; this.emit('trail', { k: k.idx }); }
      if (k.trailing && (release || !inp.item)) { k.trailing = false; this.useItem(k, inp); }
      return;
    }
    if (press) this.useItem(k, inp);
  }

  /** inp.itemBack fires / drops behind, inp.itemFwd throws a goo blob or decoy ahead instead of dropping it. */
  useItem(k, inp = NO_INPUT) {
    const back = !!inp.itemBack;
    const it = k.item; if (!it) return;
    const fx = Math.cos(k.h), fz = Math.sin(k.h);
    const spend = () => { k.itemCount--; if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; } };
    switch (it) {
      case 'turbo': case 'turbo3': k.boostT = Math.max(k.boostT, 1.25); this.emit('boost', { k: k.idx, tier: 2, item: true }); spend(); break;
      case 'goo': case 'decoy': {
        const p = { type: it, x: k.x - fx * 2.8, z: k.z - fz * 2.8, y: k.y, vy: 0, life: 45, owner: k.idx, safe: 0.4, ti: k.ti, grounded: true };
        if (!back && inp.itemFwd) { p.vx = fx * (k.speed + 18); p.vz = fz * (k.speed + 18); p.vy = 7; p.grounded = false; p.x = k.x + fx * 2; p.z = k.z + fz * 2; p.y = k.y + 1; }
        this.projs.push(p); this.emit('drop', { k: k.idx, item: it }); spend(); break;
      }
      case 'puck': {
        const dir = back ? k.h + Math.PI : k.h;
        this.projs.push({ type: 'puck', x: k.x + Math.cos(dir) * 2.6, z: k.z + Math.sin(dir) * 2.6, y: k.y, a: dir, v: 46 + Math.max(0, k.speed) * (back ? 0 : 0.5), life: 8, bounces: 5, owner: k.idx, safe: 0.25, ti: k.ti });
        this.emit('fire', { k: k.idx, item: 'puck' }); spend(); break;
      }
      case 'wasp': {
        const target = this.order[Math.max(0, k.place - 2)];
        this.projs.push({ type: 'wasp', x: k.x, z: k.z, y: k.y + 2, a: k.h, v: 52, life: 14, owner: k.idx, target: target && target !== k ? target.idx : -1, safe: 0.5, ti: k.ti });
        this.emit('fire', { k: k.idx, item: 'wasp' }); spend(); break;
      }
      case 'shield': k.shieldT = 7; k.boostT = Math.max(k.boostT, 0.5); this.emit('shield', { k: k.idx }); spend(); break;
      case 'thunder': {
        for (const o of this.karts) if (o !== k && o.place < k.place) this.hit(o, 'thunder', k, { spin: 0.8, keep: 0.6, zap: 3.5 });
        this.emit('thunder', { k: k.idx }); spend(); break;
      }
    }
  }

  updateProjectiles() {
    const T = this.track;
    for (const p of this.projs) {
      p.life -= DT; p.safe = Math.max(0, p.safe - DT);
      if (p.type === 'goo' || p.type === 'decoy') {
        if (!p.grounded) {
          p.x += p.vx * DT; p.z += p.vz * DT; p.vy -= GRAV * DT; p.y += p.vy * DT;
          const pr = T.project(p.x, p.z, p.ti); p.ti = pr.i; const g = T.height(pr.i, pr.f);
          if (p.y <= g) { p.y = g; p.grounded = true; if (T.edge[pr.i] === 1 && Math.abs(pr.lat) > T.halfWidth(pr.i) + 1) p.life = 0; }
        }
      } else if (p.type === 'puck') {
        const ox = p.x, oz = p.z; p.x += Math.cos(p.a) * p.v * DT; p.z += Math.sin(p.a) * p.v * DT;
        const pr = T.project(p.x, p.z, p.ti); p.ti = pr.i; p.y = T.height(pr.i, pr.f);
        const wall = T.halfWidth(pr.i) + T.shoulder - 0.5;
        if (Math.abs(pr.lat) > wall) {
          if (T.edge[pr.i] === 1) p.life = 0;
          else {
            p.x = ox; p.z = oz;
            const tan = Math.atan2(T.tz[pr.i], T.tx[pr.i]); p.a = 2 * tan - p.a;   // mirror about the barrier
            if (--p.bounces < 0) p.life = 0; this.emit('bounce', { x: p.x, z: p.z });
          }
        }
      } else if (p.type === 'wasp') {
        const tg = this.karts[p.target];
        const pr = T.project(p.x, p.z, p.ti); p.ti = pr.i;
        let ax, az;
        if (tg && !tg.finished && Math.hypot(tg.x - p.x, tg.z - p.z) < 26) { ax = tg.x; az = tg.z; }
        else { const q = T.at(pr.i + 8, tg ? clamp(tg.lat, -4, 4) : 0); ax = q.x; az = q.z; }
        const want = Math.atan2(az - p.z, ax - p.x); p.a += angDiff(p.a, want) * Math.min(1, DT * 7);
        p.x += Math.cos(p.a) * p.v * DT; p.z += Math.sin(p.a) * p.v * DT; p.y += (T.height(pr.i, pr.f) + 1.6 - p.y) * Math.min(1, DT * 5);
      }
      // hits
      for (const k of this.karts) {
        if (p.life <= 0) break;
        if (k.idx === p.owner && p.safe > 0) continue;
        if (k.fallT > 0) continue;
        const r = p.type === 'wasp' ? 2 : 1.9;
        if (Math.hypot(k.x - p.x, k.z - p.z) < r && Math.abs(k.y - p.y) < 2.4) {
          // a trailing goo / puck blocks a hit from behind
          const fromBehind = Math.cos(k.h) * (p.x - k.x) + Math.sin(k.h) * (p.z - k.z) < 0;
          if (k.trailing && fromBehind) { k.trailing = false; k.itemCount--; if (k.itemCount <= 0) k.item = null; p.life = 0; this.emit('block', { k: k.idx }); break; }
          const took = this.hit(k, p.type, this.karts[p.owner], p.type === 'wasp' ? { pop: true, spin: 1.4, keep: 0.2 } : {});
          if (took || k.shieldT > 0) { p.life = 0; this.emit('pop', { x: p.x, y: p.y, z: p.z, type: p.type }); }
        }
      }
      // projectiles break each other
      if (p.life > 0 && (p.type === 'puck' || p.type === 'wasp')) for (const q of this.projs) {
        if (q === p || q.life <= 0 || q.type === 'wasp') continue;
        if (Math.hypot(q.x - p.x, q.z - p.z) < 1.8) { q.life = 0; if (p.type === 'puck') p.life = 0; this.emit('pop', { x: q.x, y: q.y, z: q.z, type: q.type }); }
      }
    }
    this.projs = this.projs.filter(p => p.life > 0);
  }

  updateBoxes() {
    for (const b of this.boxes) {
      if (b.t > 0) { b.t -= DT; continue; }
      for (const k of this.karts) {
        if (k.fallT > 0) continue;
        if (Math.hypot(k.x - b.x, k.z - b.z) < 2.3 && Math.abs(k.y + 1 - b.y) < 2.5) {
          b.t = 2.2; this.emit('box', { k: k.idx, x: b.x, y: b.y, z: b.z });
          if (!k.item && k.roulette <= 0) { k.item = this.rollItem(k); k.itemCount = k.item === 'turbo3' ? 3 : 1; k.roulette = k.human ? 1.4 : 0.6; }
          break;
        }
      }
    }
  }

  updatePlaces() {
    const racing = this.karts.filter(k => !k.finished).sort((a, b) => b.raceDist - a.raceDist);
    this.order = [...this.finishOrder, ...racing];
    this.order.forEach((k, i) => { if (!k.finished || k.place === 0) k.place = i + 1; });
  }

  // ---- CPU drivers ---------------------------------------------------------------------------------------------------
  /** Rubber band: CPUs well behind the leading human get a little extra, far ahead a little less. */
  aiSpeedMul(k) {
    const h = this.human; if (!h || this.mode === 'tt') return k.ai.skill;
    const gap = h.raceDist - k.raceDist;   // + = CPU behind the player
    const band = gap > 0 ? Math.min(0.07, gap / 900) : Math.max(-0.06, gap / 1300);
    return k.ai.skill * (1 + band);
  }

  aiInput(k) {
    const T = this.track, ai = k.ai;
    const look = 7 + Math.max(0, k.speed) * 0.55;
    const ahead = T.wrap(k.ti + Math.round(look / T.step));
    // lane: drift slowly between preferred offsets, hug the inside of bends, dodge goo
    ai.laneT -= DT; if (ai.laneT <= 0) { ai.lane = clamp(ai.lane + (this.rand() * 2 - 1) * 0.35, -0.55, 0.55); ai.laneT = 2 + this.rand() * 3; }
    let curvAhead = 0; for (let d = 4; d < 30; d += 3) curvAhead += T.curv[T.wrap(k.ti + d)];
    curvAhead /= 9;
    let lane = ai.lane - clamp(curvAhead * 40, -0.5, 0.5);
    // no rails ahead: keep to the middle and do not start drifts
    let voidAhead = false; for (let d = -4; d < 40; d += 4) if (T.edge[T.wrap(k.ti + d)]) { voidAhead = true; break; }
    if (voidAhead) lane *= 0.25;
    for (const p of this.projs) if ((p.type === 'goo' || p.type === 'decoy') && T.wrap(p.ti - k.ti) < 25) { const pl = T.project(p.x, p.z, p.ti).lat / T.halfWidth(p.ti); if (Math.abs(pl - lane) < 0.35) lane = pl > 0 ? pl - 0.5 : pl + 0.5; }
    const tgt = T.at(ahead, clamp(lane, -0.8, 0.8) * T.halfWidth(ahead));
    const want = Math.atan2(tgt.z - k.z, tgt.x - k.x);
    const err = angDiff(k.h, want);
    let steer = clamp(err * 2.6, -1, 1);
    // drift through long bends
    const sharp = Math.abs(curvAhead) > 0.007 * (2 - ai.driftSkill);
    let drift = false;
    if (k.drift !== 0) {
      const sameWay = Math.sign(curvAhead) === k.drift && Math.abs(curvAhead) > 0.004;
      drift = sameWay && k.driftTier < 3;
      if (drift) steer = clamp(err * 2.2 * k.drift, -1, 1) * k.drift;   // steer within the drift
    } else drift = sharp && !voidAhead && k.speed > 14 && Math.abs(err) > 0.05 && ai.driftSkill > 0.65;
    if (voidAhead && k.drift !== 0 && Math.abs(k.lat) > T.halfWidth(k.ti) * 0.55) drift = false;
    let accel = 1, brake = 0;
    if (Math.abs(err) > 1.2 && k.speed > 12) { accel = 0.3; }
    if (Math.abs(err) > 2.2) { brake = 1; accel = 0; steer = -steer; }
    // items
    let item = false, itemBack = false;
    if (k.item && k.roulette <= 0) {
      ai.itemT -= DT;
      if (ai.itemT <= 0) {
        const tgtK = this.order[k.place - 2], behind = this.order[k.place];
        const near = o => o && Math.hypot(o.x - k.x, o.z - k.z) < 30;
        switch (k.item) {
          case 'turbo': case 'turbo3': item = Math.abs(curvAhead) < 0.008; break;
          case 'puck': if (near(tgtK) && Math.abs(angDiff(k.h, Math.atan2(tgtK.z - k.z, tgtK.x - k.x))) < 0.18) item = true; else if (near(behind)) { item = true; itemBack = true; } break;
          case 'goo': case 'decoy': item = near(behind) || this.rand() < 0.004; itemBack = true; break;
          default: item = true;
        }
        if (k.item === 'wasp' && k.place === 1) item = false;
        if (item) ai.itemT = 1 + this.rand() * 2.5;
      }
      // a trailing item is released on the step after it was pressed
      if (k.trailing) item = false;
    }
    if (k.finished || k.autopilot) { /* keep driving after the line */ }
    return { steer, accel, brake, drift, item, itemBack, lookBack: false };
  }
}

/** Quick helper for tests and the time-trial ghost: run a race to the end with every kart on autopilot. */
export function runHeadless(o, maxSeconds = 400) {
  const r = new Race(o);
  for (const k of r.karts) if (k.human) k.autopilot = true;
  const steps = Math.ceil(maxSeconds / DT);
  for (let s = 0; s < steps && r.state !== 'done'; s++) r.step([]);
  return r;
}
