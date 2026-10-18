import './fakedom.mjs';
import { makeEnv, step, run } from './sim.mjs';
const mode = process.argv[2] || 'tdm', secs = +(process.argv[3] || 120), diff = process.argv[4] || 'regular';
const env = makeEnv(mode, { difficulty: diff }); const m = env.match;
const st = new Map(); for (const b of m.bots) st.set(b, { engage: 0, seek: 0, patrol: 0, dead: 0, dist: 0, px: 0, pz: 0, stuck: 0, goalWait: 0, shots: 0, ammo: 0 });
let t = 0; const dt = 1 / 60;
let playerDamageTaken = 0, lastHp = 100;
while (m.state !== 'playing') step(env);
for (const b of m.bots) { const s = st.get(b); s.px = b.body.x; s.pz = b.body.z; s.ammo = b.weapon.totalShots; }
const killsAt = [];
for (let i = 0; i < secs * 60; i++) {
  step(env, dt, c => { });
  for (const b of m.bots) { const s = st.get(b); if (!b.alive) s.dead += dt; else { s[b.state] = (s[b.state] || 0) + dt; if (b.goalWait > 0) s.goalWait += dt; if (b.stuckT >= 1.2) s.stuck += dt; } if (i % 30 === 0) { s.dist += Math.hypot(b.body.x - s.px, b.body.z - s.pz); s.px = b.body.x; s.pz = b.body.z; } }
  if (m.player.hp < lastHp) playerDamageTaken += lastHp - m.player.hp; lastHp = m.player.hp;
}
console.log(`mode ${mode} diff ${diff} ${secs}s | player damage taken ${playerDamageTaken.toFixed(0)} deaths ${m.player.stats.deaths}`);
for (const b of m.bots) { const s = st.get(b); console.log(`${b.name.padEnd(9)} t${b.team} ${b.weaponId.padEnd(12)} K${b.stats.kills} D${b.stats.deaths} engage ${s.engage.toFixed(0)}s seek ${s.seek.toFixed(0)}s patrol ${s.patrol.toFixed(0)}s (wait ${s.goalWait.toFixed(0)}) dead ${s.dead.toFixed(0)}s walked ${s.dist.toFixed(0)}m stuck ${s.stuck.toFixed(0)}s shots ${b.weapon.totalShots - s.ammo}`); }
if (m.mode.score) console.log('score', m.mode.score);
