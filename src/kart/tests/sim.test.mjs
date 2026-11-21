// Sparkplug GP headless tests: tracks, laps, positions, drifting, boosts, items, start boost, time trial, replay.
// Run: node src/kart/tests/sim.test.mjs
import { TRACKS, CUPS, RACERS, KARTS } from '../data.js';
import { Track } from '../track.js';
import { Race, runHeadless, DT, DRIFT_TIERS, NO_INPUT } from '../sim.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };
const section = n => console.log('\n== ' + n);
const runFor = (r, sec, inp = () => NO_INPUT) => { for (let i = 0; i < sec / DT; i++) r.step([typeof inp === 'function' ? inp(r) : inp]); };
const toGo = (r, inp) => { while (r.state === 'countdown') r.step([inp ? inp(r) : NO_INPUT]); };

section('tracks');
TRACKS.forEach(def => {
  const t = new Track(def), s = t.stats();
  ok(s.length > 800 && s.length < 1600, `${def.name}: length ${s.length.toFixed(0)}`);
  ok(s.minR > 15, `${def.name}: tightest bend radius ${s.minR.toFixed(1)} m`);
  ok(s.minGap > 5, `${def.name}: parts of the road overlap (gap ${s.minGap.toFixed(1)})`);
  ok(t.boxes.length >= 12, `${def.name}: item crystals ${t.boxes.length}`);
  console.log(`  ${def.name}: ${s.length.toFixed(0)} m, tightest radius ${s.minR.toFixed(0)} m, ${t.boxes.length} crystals`);
});
ok(CUPS.every(c => c.tracks.every(i => TRACKS[i])), 'cups reference real tracks');

section('full races on every track (8 karts, autopilot)');
const results = [];
TRACKS.forEach((def, ti) => {
  const t0 = Date.now();
  const r = runHeadless({ track: ti, cls: 1, mode: 'gp', players: [{ racer: 0, kart: 0 }], seed: 7 + ti }, 420);
  const real = r.karts.filter(k => !k.projected).length;
  const items = r.events.filter(e => ['fire', 'drop', 'boost', 'shield', 'thunder'].includes(e.type)).length;
  const drifts = r.events.filter(e => e.type === 'boost' && e.tier && !e.item && !e.trick).length;
  const hits = r.events.filter(e => e.type === 'hit').length, falls = r.events.filter(e => e.type === 'fall').length;
  const lead = r.finishOrder[0];
  ok(r.state === 'done', `${def.name}: race finished`);
  ok(real >= 6, `${def.name}: only ${real} karts crossed the line themselves`);
  ok(r.karts.every(k => k.lapTimes.length >= (k.projected ? 0 : 3)), `${def.name}: lap times`);
  const places = r.finishOrder.map(k => k.place).sort((a, b) => a - b).join(',');
  ok(places === '1,2,3,4,5,6,7,8', `${def.name}: places ${places}`);
  ok(lead.finishTime > 60 && lead.finishTime < 220, `${def.name}: winning time ${lead.finishTime.toFixed(1)} s`);
  ok(drifts > 10, `${def.name}: drift boosts ${drifts}`);
  ok(items > 10, `${def.name}: items used ${items}`);
  results.push(`  ${def.name.padEnd(17)} win ${lead.finishTime.toFixed(1)} s (${lead.racer.name}), best lap ${Math.min(...r.karts.map(k => k.bestLap)).toFixed(1)} s, ${real}/8 finished, drift boosts ${drifts}, items ${items}, hits ${hits}, falls ${falls}, ${Date.now() - t0} ms`);
});
console.log(results.join('\n'));

section('drift charges three tiers and releases a boost');
{
  const r = new Race({ track: 0, cls: 1, mode: 'tt', players: [{ racer: 0, kart: 0 }], seed: 1, countdown: 0.01 });
  const k = r.human; toGo(r);
  runFor(r, 3, { ...NO_INPUT, accel: 1 });
  const v0 = k.speed;
  ok(v0 > 18, `speed after 3 s ${v0.toFixed(1)}`);
  runFor(r, 0.05, { ...NO_INPUT, accel: 1, drift: true, steer: 0.6 });
  runFor(r, 0.6, { ...NO_INPUT, accel: 1, drift: true, steer: 0.6 });
  ok(k.drift === 1, `drift started to the right (${k.drift})`);
  runFor(r, DRIFT_TIERS[2] + 0.3, { ...NO_INPUT, accel: 1, drift: true, steer: 1 });
  ok(k.driftTier === 3 || k.driftTier === 2, `charge tier ${k.driftTier} after a long drift`);
  const tier = k.driftTier;
  runFor(r, 2 * DT, { ...NO_INPUT, accel: 1 });
  ok(k.drift === 0 && k.boostT > 0.8, `released: boost ${k.boostT.toFixed(2)} s from tier ${tier}`);
  runFor(r, 0.4, { ...NO_INPUT, accel: 1 });
  ok(k.speed > k.top * 1.05, `boosting above top speed (${k.speed.toFixed(1)} vs ${k.top.toFixed(1)})`);
}

section('start boost and flooded engine');
{
  const r = new Race({ track: 0, cls: 1, mode: 'tt', players: [{ racer: 1, kart: 2 }], seed: 2 });
  toGo(r, rr => ({ ...NO_INPUT, accel: rr.countT < 1.6 ? 1 : 0 }));
  ok(r.human.boostT > 1, `well-timed throttle gives a start boost (${r.human.boostT.toFixed(2)})`);
  const r2 = new Race({ track: 0, cls: 1, mode: 'tt', players: [{ racer: 1, kart: 2 }], seed: 2 });
  toGo(r2, () => ({ ...NO_INPUT, accel: 1 }));
  ok(r2.human.stallT > 0.5 && r2.human.boostT === 0, 'holding the throttle from the start floods the engine');
}

section('steering, braking and reversing respond together');
{
  const r = new Race({ track: 0, cls: 1, mode: 'tt', players: [{ racer: 2, kart: 1 }], seed: 3, countdown: 0.01 });
  const k = r.human; toGo(r); runFor(r, 2, { ...NO_INPUT, accel: 1 });
  const h0 = k.h; runFor(r, 0.5, { ...NO_INPUT, accel: 1, steer: -1 });
  ok(k.h < h0 - 0.3, `left steer while accelerating turns left (${(k.h - h0).toFixed(2)} rad)`);
  runFor(r, 1.5, { ...NO_INPUT, brake: 1 });
  ok(k.speed <= 0, `brake stops and starts reversing (${k.speed.toFixed(1)})`);
}

section('items');
{
  const r = new Race({ track: 0, cls: 1, mode: 'vs', players: [{ racer: 0, kart: 0 }], cpu: 1, seed: 4, countdown: 0.01 });
  toGo(r); runFor(r, 1, { ...NO_INPUT, accel: 1 });
  const me = r.human, victim = r.karts[1];
  // put a rival 12 m ahead and fire a puck at it
  const p = r.track.at(me.ti + 6, me.lat); victim.x = p.x; victim.z = p.z; victim.h = victim.move = me.h; victim.invulnT = 0; victim.ti = me.ti + 6;
  me.item = 'puck'; me.itemCount = 1; me.roulette = 0; me.prevItem = false;
  r.step([{ ...NO_INPUT, accel: 1, item: true }]); ok(me.trailing, 'holding the item trails the puck behind you');
  r.step([{ ...NO_INPUT, accel: 1, item: false }]);
  ok(r.projs.some(q => q.type === 'puck'), 'releasing fires the puck');
  victim.input = NO_INPUT; victim.ai.itemT = 99;
  let hit = false; for (let i = 0; i < 60 && !hit; i++) { r.step([{ ...NO_INPUT, accel: 1 }]); hit = r.events.some(e => e.type === 'hit' && e.k === victim.idx); }
  ok(hit, 'the puck spins out the kart ahead');
  // shield: invincible
  me.item = 'shield'; me.itemCount = 1; me.prevItem = false; r.step([{ ...NO_INPUT, accel: 1, item: true }]);
  ok(me.shieldT > 6, 'prism shield is on'); ok(!r.hit(me, 'test'), 'shielded karts ignore hits');
  // triple turbo: three uses
  me.item = 'turbo3'; me.itemCount = 3; let uses = 0;
  for (let i = 0; i < 6; i++) { me.prevItem = false; r.step([{ ...NO_INPUT, accel: 1, item: i % 2 === 0 }]); if (i % 2 === 0) uses++; }
  ok(me.item === null && uses === 3, 'triple turbo gives three boosts');
  // thunderhead zaps everyone ahead, nobody behind
  const r2 = new Race({ track: 1, cls: 1, mode: 'vs', players: [{ racer: 0, kart: 0 }], seed: 5, countdown: 0.01 }); toGo(r2); runFor(r2, 2, { ...NO_INPUT, accel: 1 });
  const m2 = r2.human; for (const o of r2.karts) o.invulnT = 0;
  m2.item = 'thunder'; m2.itemCount = 1; m2.prevItem = false; r2.step([{ ...NO_INPUT, accel: 1, item: true }]);
  const ahead = r2.karts.filter(o => o.place < m2.place), behind = r2.karts.filter(o => o.place > m2.place);
  ok(ahead.length > 0 && ahead.every(o => o.zapT > 0), `thunderhead zaps ${ahead.length} karts ahead`);
  ok(behind.every(o => o.zapT === 0), 'karts behind are not zapped');
  // item odds: back markers get stronger items
  const counts = { front: {}, back: {} };
  for (let i = 0; i < 4000; i++) { me.place = 1; const a = r.rollItem(me); counts.front[a] = (counts.front[a] || 0) + 1; me.place = 8; const b = r.rollItem(me); counts.back[b] = (counts.back[b] || 0) + 1; }
  ok(!counts.front.thunder && !counts.front.shield, 'the leader never gets a thunderhead or shield');
  ok((counts.back.turbo3 || 0) + (counts.back.shield || 0) > (counts.front.turbo3 || 0) + 400, 'back of the pack gets more catch-up items');
}

section('falling off the skyway and coming back');
{
  const r = new Race({ track: 5, cls: 1, mode: 'tt', players: [{ racer: 0, kart: 0 }], seed: 6, countdown: 0.01 });
  toGo(r); const k = r.human, T = r.track;
  const vi = T.idx(0.3), p = T.at(vi, 0); k.x = p.x; k.z = p.z; k.y = p.y; k.ti = vi; k.h = k.move = T.heading(vi) + Math.PI / 2 * (T.curv[vi] > 0 ? -1 : 1); k.speed = 20;
  let fell = false, back = false;
  for (let i = 0; i < 300; i++) { r.step([{ ...NO_INPUT, accel: 1 }]); if (k.fallT > 0) fell = true; if (fell && k.fallT <= 0 && k.grounded) { back = true; break; } }
  ok(fell, 'driving off an unrailed edge falls');
  ok(back && Math.abs(k.lat) < T.halfWidth(k.ti), 'the tow-drone puts you back on the road');
}

section('barriers keep you on the track');
{
  const r = new Race({ track: 4, cls: 2, mode: 'tt', players: [{ racer: 6, kart: 3 }], seed: 8, countdown: 0.01 });
  toGo(r); const k = r.human, T = r.track; let maxLat = 0;
  runFor(r, 20, rr => { maxLat = Math.max(maxLat, Math.abs(k.lat) - T.halfWidth(k.ti) - T.shoulder); return { ...NO_INPUT, accel: 1, steer: 1 }; });
  ok(maxLat < 0.5, `full lock for 20 s never passes the barrier (overshoot ${maxLat.toFixed(2)} m)`);
}

section('time trial, replay and determinism');
{
  const a = runHeadless({ track: 2, cls: 1, mode: 'tt', players: [{ racer: 3, kart: 1 }], seed: 9 });
  const b = runHeadless({ track: 2, cls: 1, mode: 'tt', players: [{ racer: 3, kart: 1 }], seed: 9 });
  ok(a.karts.length === 1, 'time trial is a solo run');
  ok(a.state === 'done' && a.human.lapTimes.length === 3, 'time trial completes 3 laps');
  ok(a.human.finishTime === b.human.finishTime, 'same seed, same result (deterministic)');
  ok(a.replay.length > 1000 && a.replay[0].k.length === 1, `replay recorded ${a.replay.length} frames`);
  console.log(`  time trial: ${a.human.finishTime.toFixed(2)} s, laps ${a.human.lapTimes.map(t => t.toFixed(2)).join(' / ')}`);
}

section('going back over the line and crossing it again is not a new lap');
{
  const r = new Race({ track: 2, cls: 1, mode: 'tt', players: [{ racer: 3, kart: 1 }], seed: 9, countdown: 0.01 });
  const k = r.human; k.autopilot = true;
  ok(k.lap === 0 && k.topLap === 0 && k.lapTimes.length === 0 && k.bestLap === Infinity, 'a kart starts on lap 0 with no lap times');
  toGo(r);
  const until = (cond, sec, inp = NO_INPUT) => { for (let i = 0; i < sec / DT && !cond(); i++) r.step([inp]); return cond(); };
  const lap2s = () => r.events.filter(e => e.type === 'lap' && e.lap === 2).length;
  ok(until(() => k.lap === 1, 20) && k.topLap === 1 && k.lapTimes.length === 0, 'the first crossing starts lap 1 and logs no lap time');
  ok(until(() => k.lap === 2, 200) && k.lapTimes.length === 1 && lap2s() === 1, 'a full lap logs one lap time');
  const lap1 = k.lapTimes[0];
  for (let n = 0; n < 2; n++) {
    k.speed = 0; k.boostT = 0; k.drift = 0; k.autopilot = false;   // stopped just past the line
    ok(until(() => k.lap === 1, 8, { ...NO_INPUT, brake: 1 }), 'reversing takes the kart back over the line');
    k.autopilot = true;
    ok(until(() => k.lap === 2, 30), 'driving on crosses the line again');
  }
  ok(k.topLap === 2 && k.lapTimes.length === 1 && k.bestLap === lap1 && lap2s() === 1, `crossing again logs no lap (lap times: ${k.lapTimes.map(t => t.toFixed(2)).join(' / ')})`);
  ok(until(() => r.state === 'done', 400), 'the race still finishes');
  ok(k.lapTimes.length === 3 && Math.min(...k.lapTimes) > 15 && k.bestLap === Math.min(...k.lapTimes), `three real laps (${k.lapTimes.map(t => t.toFixed(2)).join(' / ')})`);
  ok(Math.abs(k.lapTimes.reduce((a, b) => a + b, 0) - k.finishTime) < 1e-6, 'the lap times add up to the finish time');
}

section('every racer and kart combination drives');
{
  let worst = Infinity;
  for (let ri = 0; ri < RACERS.length; ri++) for (let ki = 0; ki < KARTS.length; ki++) {
    const r = new Race({ track: 0, cls: 1, mode: 'tt', players: [{ racer: ri, kart: ki }], seed: 1, countdown: 0.01 });
    r.human.autopilot = true; toGo(r); runFor(r, 25); worst = Math.min(worst, r.human.raceDist);
  }
  ok(worst > 400, `slowest combination covers ${worst.toFixed(0)} m in 25 s`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
