// Headless checks for Dash Derby: track geometry, full CPU races on every track and class, laps, positions, items,
// drifting, the start boost and the replay recording. Run: node src/kart/tests/sim.test.mjs
import { TRACKS, CLASSES, RACERS, KARTS, CUPS, ITEMS } from '../data.js';
import { getTrack, STEP } from '../track.js';
import { Race } from '../race.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } else if (process.env.VERBOSE) console.log('  ok:', m); };
const only = process.argv[2];

// ---- track geometry ----
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const T = getTrack(def);
  ok(T.length > 550 && T.length < 1400, `${def.id}: lap length ${T.length.toFixed(0)} m`);
  // no two parts of the course closer than both barriers allow (ignoring neighbours along the loop)
  let worst = Infinity, wi = 0, wj = 0;
  for (let i = 0; i < T.n; i += 2) for (let j = i + 2; j < T.n; j += 2) {
    const along = Math.min(j - i, T.n - (j - i)) * T.step; if (along < 80) continue;
    const d = Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]) - (T.wall[i] + T.wall[j]);
    if (d < worst) { worst = d; wi = i; wj = j; }
  }
  ok(worst > 2, `${def.id}: separate sections keep apart (closest gap ${worst.toFixed(1)} m at ${(wi / T.n).toFixed(3)} / ${(wj / T.n).toFixed(3)})`);
  let maxK = 0; for (let i = 0; i < T.n; i++) maxK = Math.max(maxK, Math.abs(T.curv[i]));
  ok(1 / maxK > 9, `${def.id}: tightest corner radius ${(1 / maxK).toFixed(1)} m`);
  ok(T.boxes.length >= 12, `${def.id}: ${T.boxes.length} item boxes`);
  for (const r of T.ramps) { let k = 0; for (let i = -8; i < 30; i++) k = Math.max(k, Math.abs(T.curv[T.wrap(r.i + i)])); ok(k < 0.03, `${def.id}: ramp sits on a straight (curvature ${k.toFixed(3)})`); }
  const L = T.locate(T.x[50] + T.rx[50] * 3, T.z[50] + T.rz[50] * 3, 48, {});
  ok(Math.abs(L.lat - 3) < 0.2 && Math.abs(L.i - 50) <= 1, `${def.id}: locate() finds lateral offset (${L.lat.toFixed(2)})`);
}
ok(CUPS.every(c => c.tracks.every(t => TRACKS.some(x => x.id === t))), 'every cup lists real tracks');
ok(RACERS.length >= 8 && KARTS.length >= 4, `${RACERS.length} racers, ${KARTS.length} karts`);

// ---- full races, CPU only (the player's kart on autopilot) ----
const entrants = (pi = 7) => RACERS.map((r, i) => ({ racer: r.id, kart: KARTS[i % KARTS.length].id, isPlayer: i === pi }));
function run(def, cls, o = {}) {
  const race = new Race({ track: def, cls, entrants: entrants(), mode: 'race', seed: o.seed || 3, laps: o.laps });
  race.player.autopilot = true;
  const dt = 1 / 60; let t = 0, ev = {};
  while (race.state !== 'done' && t < (o.limit || 420)) {
    race.update(dt); t += dt;
    for (const e of race.takeEvents()) ev[e.type] = (ev[e.type] || 0) + 1;
    for (const k of race.karts) if (!isFinite(k.x + k.y + k.z + k.sp + k.h)) throw new Error('NaN kart state ' + k.name);
  }
  return { race, ev, t };
}
const summary = [];
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  for (const cls of (process.env.ALLCLASS ? CLASSES : [CLASSES[1], CLASSES[2]])) {
    const { race, ev, t } = run(def, cls.id);
    const fin = race.karts.filter(k => k.finished).length;
    ok(fin === 8, `${def.id}/${cls.id}: ${fin}/8 finished in ${t.toFixed(0)} s`);
    const places = race.order.map(k => k.place).join(''); ok(places === '12345678', `${def.id}/${cls.id}: unique places`);
    const best = Math.min(...race.karts.map(k => k.finishTime)), worst = Math.max(...race.karts.map(k => k.finishTime));
    const lapOk = race.karts.every(k => k.lapTimes.length === 3 && k.lapTimes.every(l => l > 10));
    ok(lapOk, `${def.id}/${cls.id}: 3 lap times each`);
    ok(ev.miniturbo > 6, `${def.id}/${cls.id}: CPUs drift for mini-turbos (${ev.miniturbo || 0})`);
    ok((ev.box || 0) > 12, `${def.id}/${cls.id}: item boxes collected (${ev.box || 0})`);
    const resp = race.karts.reduce((a, k) => a + k.respawns, 0);
    ok(resp < (def.drops.length || def.gaps.length ? 30 : 6), `${def.id}/${cls.id}: respawns ${resp}`);
    summary.push(`${def.id.padEnd(8)} ${cls.id.padEnd(6)} win ${best.toFixed(1)}s last ${worst.toFixed(1)}s  turbo ${ev.miniturbo || 0} hits ${ev.hit || 0} walls ${ev.wall || 0} falls ${ev.fall || 0} ramps ${ev.ramp || 0} pads ${ev.pad || 0} boxes ${ev.box || 0}`);
  }
}
console.log(summary.join('\n'));

// ---- start boost, stall, recording ----
{
  const def = TRACKS[0];
  const race = new Race({ track: def, cls: 'swift', entrants: entrants(0), mode: 'race', seed: 1 });
  const P = race.player; P.autopilot = false;
  while (race.time < -0.6) { P.ctl.throttle = 0; race.update(1 / 60); }
  while (race.time < 0.5) { P.ctl.throttle = 1; race.update(1 / 60); }
  ok(P.startResult === 'boost' && P.boostT > 0, `gas between "2" and GO gives a start boost (${P.startResult})`);
  const r2 = new Race({ track: def, cls: 'swift', entrants: entrants(0), mode: 'race', seed: 1 }); const Q = r2.player; Q.autopilot = false;
  while (r2.time < 0.2) { Q.ctl.throttle = 1; r2.update(1 / 60); }
  ok(Q.startResult === 'stall' && Q.stallT > 0, `holding the gas from the start stalls (${Q.startResult})`);
  ok(race.rec.frames.length > 20 && race.rec.frames[0].k.length === 8, 'race records replay frames');
}
// ---- player drift: hop, steer, hold, release = mini-turbo (on a wide test ring) ----
{
  const ring = { id: 'test-ring', name: 'Ring', laps: 3, half: 12, shoulder: 10, pts: Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return [Math.cos(a) * 40, Math.sin(a) * 40, 0]; }), items: [0.5], boosts: [], ramps: [], gaps: [], ice: [], drops: [], movers: [] };
  const race = new Race({ track: ring, cls: 'swift', entrants: [{ racer: 'mango', kart: 'roadster', isPlayer: true }], mode: 'tt', countdown: 0.01 });
  const P = race.player; P.autopilot = false; const c = P.ctl; let got = 0, tier = 0, starts = 0;
  const T = race.track, dir = -Math.sign(T.curv[10]);
  const centre = () => { const p = T.point(P.idx + 8, 0); return Math.atan2(p.x - P.x, p.z - P.z); };
  for (let f = 0; f < 60 * 3; f++) { c.throttle = 1; c.steer = Math.max(-1, Math.min(1, -(((centre() - P.h + 9 * Math.PI) % (2 * Math.PI)) - Math.PI) * 2)); race.update(1 / 60); }
  c.driftPressed = true; c.drift = true; c.steer = dir;
  for (let f = 0; f < 60 * 3.2; f++) {
    c.drift = true; c.throttle = 1;
    const err = ((centre() - P.md + 9 * Math.PI) % (2 * Math.PI)) - Math.PI; c.steer = f < 25 ? dir : Math.max(-1, Math.min(1, dir * 0.2 - err * 3));
    race.update(1 / 60); tier = Math.max(tier, P.drift.tier);
    for (const e of race.takeEvents()) { if (e.type === 'miniturbo') got++; if (e.type === 'driftStart') starts++; }
  }
  c.drift = false; race.update(1 / 60); for (const e of race.takeEvents()) if (e.type === 'miniturbo') got++;
  ok(starts === 1 && tier >= 2 && got === 1 && P.boostT > 0.5, `player drift starts (${starts}), reaches tier ${tier} and releases a mini-turbo (${got}, boost ${P.boostT.toFixed(2)})`);
  const r = new Race({ track: TRACKS[0], cls: 'swift', entrants: [{ racer: 'bolt', kart: 'zipper', isPlayer: true }], mode: 'tt' });
  ok(r.player.item === 'pepper3' && r.player.uses === 3, 'time trial starts with a Triple Pepper');
}
// ---- items: every item does something ----
{
  const def = TRACKS[0];
  for (const id of Object.keys(ITEMS)) {
    const race = new Race({ track: def, cls: 'swift', entrants: entrants(4), mode: 'race', countdown: 0.01, seed: 5 });
    for (let f = 0; f < 60 * 6; f++) { race.update(1 / 60); race.takeEvents(); }
    const P = race.player; P.autopilot = false; P.item = id; P.uses = ITEMS[id].uses; P.ctl.itemPressed = true; P.ctl.throttle = 1;
    const before = { boost: P.boostT, shield: P.shieldT, star: P.starT, proj: race.projectiles.length, haz: race.hazards.length };
    race.update(1 / 60); const ev = race.takeEvents().map(e => e.type);
    const did = P.boostT > before.boost || P.shieldT > 0 || P.starT > 0 || race.projectiles.length > before.proj || race.hazards.length > before.haz || ev.includes('storm');
    ok(did, `item ${id} takes effect (${ev.join(',')})`);
    ok(ITEMS[id].uses === 1 ? !P.item : P.uses === ITEMS[id].uses - 1, `item ${id} uses counted`);
  }
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
