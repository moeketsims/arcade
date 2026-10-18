// Exercises every weapon, knife, equipment, streak and range feature at least once to catch runtime errors.
import './fakedom.mjs';
import { makeEnv, step, run } from './sim.mjs';
import { WEAPONS, MELEE, allowedAtts } from '../data.js';
import { buildGunMerged } from '../guns.js';
import { Weapon } from '../weapons.js';
import { Viewmodel } from '../viewmodel.js';

let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };
const section = n => console.log('\n== ' + n);
const yard = (opts = {}) => {
  const env = makeEnv('range', opts); const m = env.match; while (m.state !== 'playing') step(env);
  const p = m.player; p.body.x = 0; p.body.z = 42; p.body.y = 0; p.heading = Math.PI; p.invulnT = 0; p.act = null; p.equip = 1;
  for (const t of m.mode.targets) t.popUp = () => { };
  run(env, 0.6); return env;
};
const place = (t, x, z) => { t.x = x; t.z = z; t.state = 'up'; t.alive = true; t.hp = 100; t.upT = 999; t.up = 1; t.group.visible = true; t.update(0); };

section('every gun: fire, reload, inspect');
for (const id of Object.keys(WEAPONS)) {
  try {
    const sec = WEAPONS[id].slot === 'secondary';
    const env = yard({ loadout: { primary: sec ? 'vanguard4' : id, secondary: sec ? id : 'sidewinder' } });
    const m = env.match, p = m.player;
    if (sec) { step(env, 1 / 60, c => { c.switchPressed = true; }); run(env, 0.9); }
    const t = m.mode.targets.find(x => x.kind === 'popup'); place(t, 0, 22);
    run(env, 0.5, c => { c.ads = true; });
    const w = p.weapon; const a0 = w.ammo;
    for (let i = 0; i < 90; i++) {
      const s = t.shapes[1];
      step(env, 1 / 60, c => {
        c.ads = true; c.fire = true; c.firePressed = i % 8 === 0;
        if (t.alive) { const dx = (s.ax + s.bx) / 2 - p.body.x, dz = (s.az + s.bz) / 2 - p.body.z; p.heading = Math.atan2(dx, dz); p.pitch = Math.atan2((s.ay + s.by) / 2 - p.eye, Math.hypot(dx, dz)); }
      });
    }
    ok(w.ammo < a0 || !!w.reload, `${id} fires`);
    w.ammo = 0; step(env, 1 / 60, c => { c.reloadReleasedTap = true; }); run(env, 7); ok(w.ammo > 0 || w.reserve === 0, `${id} reloads`);
    step(env, 1 / 60, c => { c.inspect = true; }); run(env, 3.2);
  } catch (e) { ok(false, `${id} threw ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
}

section('every attachment combination builds; the sight is centred in ADS');
{
  const vm = new Viewmodel(); let n = 0;
  for (const id of Object.keys(WEAPONS)) {
    const def = WEAPONS[id];
    for (const optic of allowedAtts(def, 'optic')) for (const muzzle of allowedAtts(def, 'muzzle')) for (const mag of allowedAtts(def, 'mag')) for (const stock of allowedAtts(def, 'stock')) {
      const w = new Weapon(id, { optic, muzzle, mag, stock });
      const ud = vm.setWeapon(w);
      vm.update(0.016, { adsT: 1, equip: 1, bobAmp: 0 }, w);
      vm.root.updateMatrixWorld(true);
      const ndc = ud.anchors.sight.clone().applyMatrix4(vm.cur.matrixWorld).project(vm.camera);
      n++;
      if (!isFinite(ndc.x) || Math.abs(ndc.x) > 0.03 || Math.abs(ndc.y) > 0.04) ok(false, `${id} ${optic}/${muzzle}/${mag}/${stock}: sight not centred in ADS (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`);
    }
    buildGunMerged(id);
  }
  ok(true, `${n} attachment combinations checked`);
}

section('melee weapons');
for (const id of Object.keys(MELEE)) {
  const env = yard({ loadout: { melee: id } }); const m = env.match, p = m.player;
  const t = m.mode.targets.find(x => x.kind === 'popup');
  step(env, 1 / 60, c => { c.meleeHold = true; }); run(env, 0.6); ok(p.hold === 'melee', `${id} equipped`);
  place(t, 0, 40.2); p.heading = Math.PI; p.pitch = 0; const hp0 = t.hp;
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 1.0);
  step(env, 1 / 60, c => { c.adsPressed = true; c.ads = true; }); run(env, 1.0);
  ok(t.hp < hp0 || !t.alive || id === 'ballistic', `${id} damages (${t.hp})`);
  step(env, 1 / 60, c => { c.inspect = true; }); run(env, 3.5);
  if (id === 'ballistic') { place(t, 0, 25); run(env, 1.5); step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 0.6); ok(!p.bladeReady, 'blade fired'); }
}

section('launchers: rocket and homing missile');
{
  const env = yard({ loadout: { secondary: 'ram' } }); const m = env.match, p = m.player; const t = m.mode.targets.find(x => x.kind === 'popup'); place(t, 0, 20);
  step(env, 1 / 60, c => { c.switchPressed = true; }); run(env, 1.0); ok(p.weapon.id === 'ram', 'ram equipped');
  p.pitch = Math.atan2(1.2 - p.eye, 22); step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 1.5);
  ok(!t.alive || t.hp < 100, `rocket hits the target (hp ${t.hp})`); ok(p.weapon.ammo === 0, 'rocket consumed');
}
{
  const env = yard({ loadout: { secondary: 'skylock' } }); const m = env.match, p = m.player;
  step(env, 1 / 60, c => { c.switchPressed = true; }); run(env, 1.0);
  const cmd = { id: -9, name: 'Enemy', team: 1, stats: { kills: 0, deaths: 0, assists: 0, score: 0, streak: 0, headshots: 0, bestStreak: 0 }, body: { x: 0, y: 0, z: 10 }, alive: true, heading: 0 };
  const d = m.streaks.deploy(cmd, 'drone', {}); d.place(0, 9, 12); d.alt = 9; p.heading = Math.PI;
  const dr = () => { p.invulnT = 99; const dx = d.x - p.body.x, dz = d.z - p.body.z; p.heading = Math.atan2(dx, dz); p.pitch = Math.atan2(d.y - p.eye, Math.hypot(dx, dz)); };
  for (let i = 0; i < 200; i++) step(env, 1 / 60, c => { c.ads = true; dr(); });
  ok(p.lock.state === 'locked', `lock-on achieved (${p.lock.state})`);
  const hp0 = d.hp; step(env, 1 / 60, c => { c.ads = true; c.firePressed = true; c.fire = true; dr(); }); run(env, 3, c => { c.ads = true; });
  ok(!d.alive || d.hp < hp0, `missile hit the drone (hp ${d.hp})`);
}

section('lethals: mine triggers, throwing knife recovered');
{
  const env = yard({ loadout: { lethal: 'mine' } }); const m = env.match, p = m.player; const t = m.mode.targets.find(x => x.kind === 'popup');
  step(env, 1 / 60, c => { c.lethalPressed = true; c.lethalHeld = true; }); run(env, 1.0);
  const mine = m.proj.list.find(x => x.type === 'mine'); ok(!!mine, 'mine planted');
  run(env, 2); place(t, mine.x, mine.z - 0.5); run(env, 1.5); ok(!t.alive || t.hp < 100, 'mine exploded near the target');
}
{
  const env = yard({ loadout: { lethal: 'tknife' } }); const m = env.match, p = m.player;
  p.pitch = -0.5; step(env, 1 / 60, c => { c.lethalPressed = true; c.lethalHeld = true; }); run(env, 0.2, c => { c.lethalHeld = true; }); step(env, 1 / 60, c => { c.lethalReleased = true; });
  run(env, 1.5); const k = m.proj.list.find(x => x.type === 'pickupKnife'); ok(!!k, 'knife landed as a pickup');
  const n0 = p.lethal.n; if (k) { p.body.x = k.x; p.body.z = k.z; p.body.y = 0; run(env, 0.3); ok(p.lethal.n === n0 + 1, 'knife recovered by walking over it'); }
}

section('range: targets, course, wall decals');
{
  const env = yard(); const m = env.match, p = m.player, r = m.mode;
  const t = r.targets.find(x => x.kind === 'popup'); place(t, 0, 10);
  p.pitch = Math.atan2(1.2 - p.eye, 32); run(env, 0.3);
  for (let i = 0; i < 60; i++) step(env, 1 / 60, c => { c.fire = true; c.firePressed = i % 6 === 0; c.ads = true; });
  ok(r.s.shots > 0, `range counts shots (${r.s.shots})`);
  const R = m.map.range, gates = R.gates; p.body.vx = p.body.vz = 0;
  p.body.x = gates[0].x; p.body.z = gates[0].z + 0.5; p.body.y = 0; run(env, 0.1);
  for (let g = 0; g < gates.length; g++) { p.body.x = gates[g].x; p.body.z = gates[g].z + 0.6; p.body.y = 0; run(env, 0.05); p.body.z = gates[g].z - 0.6; run(env, 0.1); }
  ok(r.course.done === 1 && r.course.best > 0, `course lap recorded (${r.course.last.toFixed(2)} s, done ${r.course.done})`);
  run(env, 4);
  p.body.x = -36; p.body.z = -3.5; p.body.y = -1.5; run(env, 0.3); ok(p.body.y > -1, 'pit fall resets the player');
  p.body.x = 36; p.body.z = 44; p.body.y = 0; p.heading = Math.PI; p.pitch = 0.1; const n0 = m.fx.decals.length; run(env, 0.5);
  for (let i = 0; i < 30; i++) step(env, 1 / 60, c => { c.fire = true; c.firePressed = true; }); ok(m.fx.decals.length > n0, 'bullet holes appear on the recoil wall');
}

section('enemy scorestreaks in TDM + FFA respawn');
{
  const env = makeEnv('tdm'); const m = env.match; while (m.state !== 'playing') step(env);
  m.mode.score[1] = 30;
  for (let i = 0; i < 60 * 60; i++) step(env, 1 / 60);
  ok(m.mode.enemyCalls >= 4, `enemy streaks called (${m.mode.enemyCalls})`);
  const e2 = makeEnv('ffa'); const m2 = e2.match; while (m2.state !== 'playing') step(e2);
  run(e2, 1.0); m2.damage(m2.player, 999, m2.bots[0], { weapon: 'test' }); ok(!m2.player.alive, 'killed'); run(e2, 3.3); ok(m2.player.alive, 'FFA respawn');
}
console.log(`\n${checks - fails}/${checks} coverage checks passed`); process.exit(fails ? 1 : 0);
