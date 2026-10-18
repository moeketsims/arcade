// A crude "decent human" bot that drives the real Player through Controls, used to tune difficulty. Run: node autoplay.mjs [mode] [seconds] [difficulty] [weapon]
import './fakedom.mjs';
import { makeEnv, step } from './sim.mjs';
import { angDiff, clamp, gauss } from '../util.js';

export function makeAuto(match, skill = {}) {
  const S = { turn: 4.2, noise: 0.004, react: 0.22, ...skill };
  const st = { path: null, pi: 0, repath: 0, goalT: 0, lockT: 0, target: null, strafe: 1, strafeT: 0 };
  return (ctl, m, dt) => {
    const p = m.player; if (!p.alive) return;
    const eye = p.eye; let best = null, bd = 1e9;
    for (const t of m.hostilesOf(p)) {
      if (!t.alive || !t.shapes) continue; const s = t.shapes[1], cx = (s.ax + s.bx) / 2, cy = (s.ay + s.by) / 2, cz = (s.az + s.bz) / 2; const d = Math.hypot(cx - p.body.x, cz - p.body.z);
      if (d > 75 || d >= bd) continue; if (m.level.blocked(p.body.x, eye, p.body.z, cx, cy, cz)) continue; best = t; bd = d;
    }
    const w = p.weapon;
    if (best !== st.target) { st.target = best; st.lockT = 0; }
    if (best) {
      st.lockT += dt;
      const s = best.shapes[1], hs = best.shapes[0], cx = (s.ax + s.bx) / 2, cz = (s.az + s.bz) / 2, cy = (s.ay + s.by) / 2 + 0.12;
      const dx = cx - p.body.x, dz = cz - p.body.z, dy = cy - eye, dh = Math.hypot(dx, dz);
      const yawErr = angDiff(p.heading + p.rec.y, Math.atan2(dx, dz)) + gauss() * S.noise, pitErr = Math.atan2(dy, dh) - (p.pitch + p.rec.p) + gauss() * S.noise;
      const maxT = S.turn * dt;
      ctl.lookX = -clamp(yawErr, -maxT, maxT) * 1.0; ctl.lookY = clamp(pitErr, -maxT, maxT);
      ctl.ads = dh > 9 && !p.sprinting; ctl.fire = st.lockT > S.react && Math.abs(yawErr) < 0.05 && Math.abs(pitErr) < 0.05 && !(w && w.reload);
      ctl.firePressed = ctl.fire && !st.fp; st.fp = ctl.fire;
      st.strafeT -= dt; if (st.strafeT <= 0) { st.strafeT = 0.5 + Math.random() * 1.0; st.strafe = Math.random() < 0.5 ? -1 : 1; }
      ctl.moveX = st.strafe * 0.8; ctl.moveY = dh > 28 ? 0.8 : dh < 8 ? -0.5 : 0;
      if (w && w.ammo < 6 && !w.reload) ctl.reloadReleasedTap = true;
    } else {
      st.lockT = 0; st.fp = false;
      if (w && w.ammo < w.capacity * 0.5 && !w.reload) ctl.reloadReleasedTap = true;
      // walk towards the nearest enemy along the nav graph
      st.repath -= dt;
      if ((!st.path || st.pi >= st.path.length || st.repath <= 0) && m.nav) {
        let tg = null, td = 1e9; for (const t of m.hostilesOf(p)) { if (!t.alive || !t.body) continue; const d = Math.hypot(t.body.x - p.body.x, t.body.z - p.body.z); if (d < td) { td = d; tg = t; } }
        if (tg) { const a = m.nav.nearest(p.body.x, p.body.y, p.body.z), b = m.nav.nearest(tg.body.x, tg.body.y, tg.body.z); if (a && b) { st.path = m.nav.path(a.id, b.id); st.pi = 1; } }
        st.repath = 2.0;
      }
      if (st.path && st.pi < st.path.length) {
        const n = m.nav.nodes[st.path[st.pi]]; const dx = n.x - p.body.x, dz = n.z - p.body.z, d = Math.hypot(dx, dz);
        if (d < 1.0) st.pi++;
        const want = Math.atan2(dx, dz), err = angDiff(p.heading, want);
        ctl.lookX = -clamp(err, -4 * dt, 4 * dt); ctl.moveY = Math.abs(err) < 1.2 ? 1 : 0.2; ctl.sprintHeld = true; ctl.lookY = clamp(-p.pitch, -2 * dt, 2 * dt);
      }
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith('autoplay.mjs')) {
  const mode = process.argv[2] || 'tdm', secs = +(process.argv[3] || 300), diff = process.argv[4] || 'regular', weapon = process.argv[5] || 'vanguard4';
  const env = makeEnv(mode, { difficulty: diff, loadout: { primary: weapon } }); const m = env.match;
  const auto = makeAuto(m);
  const dt = 1 / 60; let t = 0;
  while (m.state !== 'playing') step(env);
  const t0 = performance.now();
  for (let i = 0; i < secs * 60 && !m.over; i++) { step(env, dt, (c, mm) => auto(c, mm, dt)); t += dt; }
  const p = m.player;
  console.log(`${mode} ${diff} ${weapon}: ${t.toFixed(0)}s  you K${p.stats.kills} D${p.stats.deaths} A${p.stats.assists} HS${p.stats.headshots} streak ${p.stats.bestStreak} | score ${m.mode.score || ''} xp ${p.sessionXp} | wall ${(performance.now() - t0).toFixed(0)}ms`);
}
