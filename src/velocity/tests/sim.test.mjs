// Velocity Divide headless tests (no browser): node src/velocity/tests/sim.test.mjs
// Physics and abilities for all six kits, stage sanity, then the autopilot plays every mission with every character allowed on it.
import { CHARS, MISSIONS, charById, missionById, rankOf } from '../data.js';
import { Sim, DT } from '../sim.js';
import { Bot } from '../bot.js';
import { buildStage } from '../stages.js';

let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); };
const idle = { x: 0, y: 0, yaw: 0, jump: false, act: false, dash: false }, fwd = { ...idle, y: 1 };
const run = (s, n, inp = idle) => { let top = -1e9; for (let i = 0; i < n; i++) { s.step(typeof inp === 'function' ? inp(i) : inp); top = Math.max(top, s.p.y); } return top; };
const fresh = (mid, cid, seed = 1) => { const m = missionById(mid), s = new Sim(m, charById(cid || m.char) || CHARS[0], seed); run(s, 30); return s; };
const speed = s => Math.hypot(s.p.vx, s.p.vz);

console.log('== data and stages');
ok(CHARS.length === 6 && ['dawn', 'umbra'].every(sd => ['runner', 'seeker', 'mech'].every(r => CHARS.filter(c => c.side === sd && c.role === r).length === 1)), 'six characters: one runner, one seeker and one mech on each side');
ok(MISSIONS.length === 9 && MISSIONS.every(m => fresh(m.id).p.ground), 'all nine stages build and the player starts on solid ground');
ok(MISSIONS.filter(m => m.char).every(m => !m.needs) && ['d4', 'u4', 'x1'].every(id => missionById(id).needs.length), 'the six character stages are open from the start; only the finales are gated');
ok(rankOf({ time: 50, sparks: 100, total: 100, retries: 0 }, 60).rank === 'S' && rankOf({ time: 200, sparks: 0, total: 100, retries: 5 }, 60).rank === 'D', 'ranks run from S to D');
for (const st of ['terraces', 'archive']) {
  const sets = new Set(); let good = true;
  for (let seed = 1; seed <= 8; seed++) { const lv = buildStage(st, seed); good = good && lv.shards.length === 3; sets.add(lv.shards.map(s => s.c + ',' + s.r).join(' ')); }
  const g = buildStage(st, 1).grid;
  ok(good && sets.size >= 3 && g.cand >= 5, `${st}: three shards every time, ${sets.size} different layouts over 8 seeds, ${g.cand} reachable hiding places`);
}

console.log('== runner');
for (const id of ['kite', 'vesper']) {
  const c = charById(id), st = c.stats, mid = c.mission; let s = fresh(mid); const z0 = s.p.z;
  run(s, 80, fwd); ok(Math.abs(speed(s) - st.top) < 0.6 && s.p.z < z0 - 15, `${c.name}: reaches top speed ${st.top} m/s (${speed(s).toFixed(1)})`);
  run(s, 1, { ...fwd, dash: true }); ok(speed(s) >= st.burst - 1, `${c.name}: burst jumps to ${st.burst} m/s (${speed(s).toFixed(1)})`);
  s = fresh(mid); const y0 = s.p.y, full = run(s, 70, { ...idle, jump: true }) - y0;
  s = fresh(mid); const hop = run(s, 70, i => ({ ...idle, jump: i < 4 })) - y0;
  ok(Math.abs(full - st.jumpH) < 0.4 && hop < full * 0.75 && s.p.ground, `${c.name}: full jump ${full.toFixed(2)} m, short hop ${hop.toFixed(2)} m, lands again`);
  s = fresh(mid); run(s, 6, { ...fwd, jump: true }); run(s, 2, fwd); run(s, 1, { ...fwd, jump: true });
  ok(speed(s) >= st.airDash - 1, `${c.name}: air dash (${speed(s).toFixed(1)} m/s)`);
  s = fresh(mid); const e = s.addEnemy({ kind: 'drone', x: s.p.x, y: s.p.y + 1.6, z: s.p.z - 8 }); run(s, 8, { ...fwd, jump: true }); run(s, 2, fwd); run(s, 1, { ...fwd, jump: true }); const homed = !!s.p.homing; run(s, 30, fwd);
  ok(homed && !e.alive && s.p.hearts === st.hearts, `${c.name}: homing dash locks on, breaks a drone and takes no damage`);
  s = fresh(mid); const e2 = s.addEnemy({ kind: 'drone', x: s.p.x, y: s.p.y + 1.3, z: s.p.z - 12 }); run(s, 30, fwd); run(s, 40, { ...fwd, act: true });
  ok(!e2.alive && s.p.hearts === st.hearts, `${c.name}: rolling through a drone breaks it`);
  s = fresh(mid); s.addEnemy({ kind: 'drone', x: s.p.x, y: s.p.y + 1.0, z: s.p.z - 3 }); run(s, 40, fwd);
  ok(s.p.hearts === st.hearts - 1, `${c.name}: running into a drone costs one heart`);
  s = fresh(mid); s.p.y = s.lv.killY - 1; run(s, 2); const dead = s.p.dead > 0; run(s, 90);
  ok(dead && s.retries === 1 && s.p.ground && s.p.hearts === st.hearts, `${c.name}: falling respawns at the checkpoint in under a second with full hearts`);
}

console.log('== seeker');
for (const id of ['mossa', 'quill']) {
  const c = charById(id), st = c.stats, mid = c.mission; let s = fresh(mid); const y0 = s.p.y;
  let top = run(s, 22, { ...idle, jump: true }); run(s, 2); top = Math.max(top, run(s, 40, { ...idle, jump: true })) - y0;
  ok(top > st.jumpH + st.jump2 * 0.6, `${c.name}: double jump reaches ${top.toFixed(2)} m`);
  s = fresh(mid); run(s, 45, { ...idle, jump: true });
  ok(s.p.glide && s.p.vy >= -st.glideFall - 0.01, `${c.name}: holding jump glides (falling at ${(-s.p.vy).toFixed(1)} m/s)`);
  run(s, 1, { ...idle, dash: true }); ok(s.p.scan > 0, `${c.name}: scan switches on`);
  let seed = 1, lv; do { lv = buildStage(missionById(mid).stage, seed); } while (!(lv.shards.some(h => h.buried) && lv.shards.some(h => !h.buried)) && ++seed < 30);
  s = fresh(mid, id, seed);
  for (const h of s.shards) { s.p.x = h.x; s.p.z = h.z; s.p.y = h.y + (h.buried ? 0.2 : -1.2); s.p.vx = s.p.vz = s.p.vy = 0; run(s, 20); if (h.buried) { run(s, 1, { ...idle, act: true }); run(s, 50); } }
  run(s, 80); ok(s.shardsGot === 3 && s.done === 'win', `${c.name}: digging and touching the three shards clears the mission (seed ${seed})`);
}

console.log('== mech');
for (const id of ['pallet', 'ogre']) {
  const c = charById(id), st = c.stats, mid = c.mission; let s = fresh(mid); const y0 = s.p.y;
  const top = run(s, 140, { ...idle, jump: true }) - y0; ok(top > st.jumpH + 1.2 && s.p.ground, `${c.name}: hover lifts to ${top.toFixed(2)} m, then lands when the fuel runs out`);
  s = fresh(mid); const e = s.addEnemy({ kind: 'drone', x: s.p.x + 2, y: 1.4, z: s.p.z - 10, hp: 2 }); run(s, 40, { ...idle, act: true }); const locks = s.p.locks.length; run(s, 1); run(s, 50);
  ok(locks >= 2 && !e.alive, `${c.name}: holding the action paints ${locks} locks; letting go fires and breaks the target`);
  s = fresh(mid); run(s, 1, { ...fwd, dash: true }); ok(speed(s) >= st.dash - 1 && s.p.inv > 0, `${c.name}: thruster dash (${speed(s).toFixed(1)} m/s, briefly safe)`);
}

console.log('== autopilot clears every mission with every character allowed on it');
const combos = []; for (const m of MISSIONS) for (const c of CHARS) if (m.char ? c.id === m.char : m.side === 'both' || c.side === m.side) combos.push([m, c]);
for (const [m, c] of combos) {
  const s = new Sim(m, c, 1), bot = new Bot(s), max = Math.round(480 / DT); let n = 0;
  while (!s.done && n++ < max) { s.step(bot.input()); s.events.length = 0; }
  const r = s.results(), k = rankOf(r, m.par);
  ok(s.done === 'win', `${m.id} ${m.name} as ${c.name}: ${s.done === 'win' ? `cleared in ${r.time} s, sparks ${r.sparks}/${r.total}, retries ${r.retries}, rank ${k.rank}` : `NOT cleared after ${r.time} s (retries ${r.retries}, at ${s.p.x.toFixed(0)}, ${s.p.y.toFixed(0)}, ${s.p.z.toFixed(0)})`}`);
}
{ const a = new Sim(missionById('d1'), charById('kite'), 1), b = new Sim(missionById('d1'), charById('kite'), 1), ba = new Bot(a), bb = new Bot(b);
  for (let i = 0; i < 1200; i++) { a.step(ba.input()); b.step(bb.input()); }
  ok(a.p.x === b.p.x && a.p.z === b.p.z && a.sparks === b.sparks, 'the simulation is deterministic: two identical runs match exactly'); }

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
