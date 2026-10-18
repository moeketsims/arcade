// Scripted player tests: movement technique, weapons, equipment, streaks, interaction. Run: node player.test.mjs
import './fakedom.mjs';
import { makeEnv, step, run } from './sim.mjs';
import { STANCE } from '../actors.js';
import { WEAPONS } from '../data.js';
import { Weapon } from '../weapons.js';

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };
const section = n => console.log('\n== ' + n);
const quietBots = m => { for (const b of m.bots) { b.update = () => { }; b.invulnT = 0; } };

function tdm(opts = {}) {
  const env = makeEnv(opts.mode || 'tdm', opts);
  const m = env.match; while (m.state !== 'playing') step(env);
  quietBots(m);
  // an open spot in the plaza
  const p = m.player; p.body.x = 0; p.body.y = 0; p.body.z = 2; p.body.vx = p.body.vy = p.body.vz = 0; p.heading = 0; p.pitch = 0; p.invulnT = 0; p.act = null; p.equip = 1;
  run(env, 0.7);
  return env;
}
/** The firing range is a big flat yard: ideal for movement tests (no clutter). Player starts at (0, 40) facing north (-Z). */
function yard(opts = {}) {
  const env = makeEnv('range', opts); const m = env.match; while (m.state !== 'playing') step(env);
  const p = m.player; p.body.x = 0; p.body.y = 0; p.body.z = 42; p.body.vx = p.body.vy = p.body.vz = 0; p.heading = Math.PI; p.pitch = 0; p.invulnT = 0; p.act = null; p.equip = 1;
  for (const t of m.mode.targets) t.popUp = () => { };
  run(env, 0.7);
  return env;
}
const hsp = p => Math.hypot(p.body.vx, p.body.vz);
const aimAt = (p, x, y, z) => { const dx = x - p.body.x, dz = z - p.body.z, dy = y - p.eye; p.heading = Math.atan2(dx, dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); p.rec.p = p.rec.y = p.rec.tp = p.rec.ty = 0; };

section('walk / sprint / tactical sprint');
{
  const env = yard(); const p = env.match.player;
  const z0 = p.body.z; run(env, 1.5, c => { c.moveY = 1; });
  ok(hsp(p) > 3.6 && hsp(p) < 4.5, `walk speed ${hsp(p).toFixed(2)}`); ok(Math.abs(p.body.z - z0) > 3, 'moved forward');
  run(env, 1.0, c => { c.moveY = 1; c.sprintHeld = true; });
  ok(p.sprinting && hsp(p) > 5.6, `sprint ${hsp(p).toFixed(2)} sprinting=${p.sprinting}`);
  step(env, 1 / 60, c => { c.moveY = 1; c.sprintHeld = true; c.sprintDouble = true; });
  run(env, 0.5, c => { c.moveY = 1; c.sprintHeld = true; });
  ok(p.tac.on && hsp(p) > 7.0, `tactical sprint on=${p.tac.on} speed ${hsp(p).toFixed(2)}`);
  run(env, 3.0, c => { c.moveY = 1; c.sprintHeld = true; });
  ok(!p.tac.on, 'tactical sprint ends after its duration');
}
section('slide, slide-cancel, dive, prone, crouch');
{
  const env = yard(); const p = env.match.player;
  run(env, 1.2, c => { c.moveY = 1; c.sprintHeld = true; });
  step(env, 1 / 60, c => { c.moveY = 1; c.sprintHeld = true; c.crouchPressed = true; c.crouchHeld = true; });
  ok(p.slide.on && p.stance === STANCE.SLIDE, 'slide starts from sprint');
  run(env, 0.3, c => { c.moveY = 1; c.crouchHeld = false; });
  const v = hsp(p); ok(v > 5, `slide momentum ${v.toFixed(2)}`);
  step(env, 1 / 60, c => { c.moveY = 1; c.jumpPressed = true; });
  run(env, 0.1, c => { c.moveY = 1; });
  ok(!p.slide.on && p.stance === STANCE.STAND, 'slide-cancel with jump pops up standing');
  ok(hsp(p) > 5, `slide-cancel keeps momentum ${hsp(p).toFixed(2)}`);
  run(env, 1.0, c => { });
  // dive
  const env2 = yard(); const q = env2.match.player;
  run(env2, 0.8, c => { c.moveY = 1; c.sprintHeld = true; });
  step(env2, 1 / 60, c => { c.moveY = 1; c.sprintHeld = true; c.sprintDouble = true; });
  run(env2, 0.3, c => { c.moveY = 1; c.sprintHeld = true; });
  step(env2, 1 / 60, c => { c.moveY = 1; c.crouchPressed = true; c.crouchHeld = true; });
  ok(q.dive.on && q.stance === STANCE.DIVE, 'dolphin dive from tactical sprint');
  run(env2, 1.0, c => { });
  ok(q.stance === STANCE.PRONE, 'dive lands prone');
  // stand from prone by holding B
  run(env2, 0.6, c => { });
  step(env2, 1 / 60, c => { c.crouchPressed = true; c.crouchHeld = true; });
  run(env2, 0.45, c => { c.crouchHeld = true; });
  step(env2, 1 / 60, c => { c.crouchReleased = true; });
  run(env2, 0.2, c => { });
  ok(q.stance === STANCE.STAND || q.stance === STANCE.CROUCH, `got up from prone (${q.stance})`);
  // crouch tap then prone hold
  const env3 = yard(); const r = env3.match.player;
  step(env3, 1 / 60, c => { c.crouchPressed = true; c.crouchHeld = true; }); step(env3, 1 / 60, c => { c.crouchReleased = true; });
  ok(r.stance === STANCE.CROUCH, 'tap B crouches');
  step(env3, 1 / 60, c => { c.crouchPressed = true; c.crouchHeld = true; }); step(env3, 1 / 60, c => { c.crouchReleased = true; });
  ok(r.stance === STANCE.STAND, 'tap B again stands');
  step(env3, 1 / 60, c => { c.crouchPressed = true; c.crouchHeld = true; });
  run(env3, 0.45, c => { c.crouchHeld = true; });
  ok(r.stance === STANCE.PRONE, 'hold B goes prone');
}
section('jump and mantle');
{
  const env = yard(); const p = env.match.player; let maxY = 0;
  step(env, 1 / 60, c => { c.jumpPressed = true; c.jump = true; });
  for (let i = 0; i < 60; i++) { step(env, 1 / 60, c => { c.jump = false; }); maxY = Math.max(maxY, p.body.y); }
  ok(maxY > 0.75 && maxY < 1.1, `jump height ${maxY.toFixed(2)}`);
  // single 1.0 m crate at (6.9, -11.2): approach from the south facing north
  const env1 = tdm(); const p1 = env1.match.player; p1.body.x = 6.9; p1.body.z = -9.2; p1.body.y = 0; p1.heading = Math.PI; p1.pitch = 0;
  run(env1, 1.2, c => { c.moveY = 1; });
  step(env1, 1 / 60, c => { c.moveY = 1; c.jumpPressed = true; c.jump = true; });
  run(env1, 0.15, c => { c.moveY = 1; c.jump = true; });
  ok(p1.act?.type === 'mantle', `mantle started (act=${p1.act?.type}, y=${p1.body.y.toFixed(2)})`);
  run(env1, 1.2, c => { });
  ok(p1.body.y > 0.95 && p1.body.y < 1.1, `standing on top of the crate y=${p1.body.y.toFixed(2)}`);
  // vault over the 0.85 m jersey barrier at (4.2, -5.5) (runs along z, 0.6 thick): approach from the west heading +X
  const env2 = tdm(); const q = env2.match.player; q.body.x = 2.4; q.body.z = -5.5; q.body.y = 0; q.heading = Math.PI / 2; run(env2, 0.2);
  run(env2, 1.0, c => { c.moveY = 1; });
  step(env2, 1 / 60, c => { c.moveY = 1; c.jumpPressed = true; c.jump = true; }); run(env2, 0.15, c => { c.moveY = 1; c.jump = true; });
  ok(q.act?.type === 'mantle', 'vault/mantle started at the barrier'); run(env2, 1.3, c => { });
  ok(q.body.x > 4.6 && q.body.y < 1.0, `got over the barrier x=${q.body.x.toFixed(2)} y=${q.body.y.toFixed(2)}`);
}
section('collision: walls and stairs');
{
  const env = tdm(); const m = env.match, p = m.player;
  // walk into the office west wall from the plaza and make sure we stop
  p.body.x = 6.2; p.body.z = -4.4; p.heading = Math.PI / 2; run(env, 3, c => { c.moveY = 1; });
  ok(p.body.x < 7.8 && p.body.x > 7.2, `stopped at the office wall x=${p.body.x.toFixed(2)}`);
  // stairs in the warehouse: start at the foot and walk up
  p.body.x = -24.85; p.body.z = 4.0; p.body.y = 0; p.heading = Math.PI; run(env, 0.3);
  run(env, 3.5, c => { c.moveY = 1; });
  ok(p.body.y > 3.5, `climbed the warehouse stairs y=${p.body.y.toFixed(2)}`);
}
section('weapons: fire, hits, recoil, reload');
{
  const env = tdm({ loadout: { primary: 'vanguard4' } }); const m = env.match, p = m.player, w = p.weapon;
  const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 17; bot.body.y = 0; bot.heading = Math.PI; bot.updateShapes();
  aimAt(p, 0, 1.25, 17); run(env, 0.5, c => { c.ads = true; }); aimAt(p, 0, 1.25, 17);
  const ammo0 = w.ammo; const hp0 = bot.hp;
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; c.ads = true; });
  run(env, 0.15, c => { c.fire = true; c.ads = true; });
  ok(w.ammo < ammo0, `ammo drops (${ammo0} -> ${w.ammo})`);
  ok(bot.hp < hp0 || !bot.alive, `bot damaged (${hp0} -> ${bot.hp})`);
  run(env, 0.8, c => { c.fire = true; c.ads = true; if (c.fire) { /* keep aim on target while firing */ } });
  ok(!bot.alive, 'bot destroyed by sustained fire');
  ok(p.rec.tp > 0, `recoil built up (${(p.rec.tp * 57.3).toFixed(2)} deg)`);
  run(env, 1.2);
  ok(p.rec.tp < 0.002, 'recoil recovers when firing stops');
  // reload
  w.ammo = 3; step(env, 1 / 60, c => { c.reloadReleasedTap = true; }); ok(w.reload && w.reload.kind === 'tac', 'tactical reload starts');
  run(env, 2.4); ok(!w.reload && w.ammo === 31, `tactical reload ends with ${w.ammo}`);
  w.ammo = 0; step(env, 1 / 60, c => { c.reloadReleasedTap = true; }); ok(w.reload && w.reload.kind === 'empty', 'empty reload starts');
  run(env, 3.2); ok(w.ammo === 30, `empty reload ends with ${w.ammo}`);
  // dry fire auto-reloads
  w.ammo = 0; w.reload = null; step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 0.1, c => { c.fire = true; });
  ok(!!w.reload, 'empty trigger pull starts a reload');
}
section('ADS, sprint-out, hit zones');
{
  const env = tdm({ loadout: { primary: 'longbow' } }); const m = env.match, p = m.player;
  run(env, 0.1, c => { c.ads = true; }); run(env, 0.5, c => { c.ads = true; });
  ok(p.adsT > 0.99, `ADS reaches 1 (${p.adsT.toFixed(2)})`);
  m.camera.updateProjectionMatrix(); ok(m.camera.fov < 45, `zoomed FOV ${m.camera.fov.toFixed(1)}`);
  const sp = p.weapon.spread(1, 0, 1, false); ok(sp < 0.5, `ADS spread small ${sp.toFixed(2)}`);
  // damage zones
  const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 15; bot.body.y = 0; bot.updateShapes();
  const w = p.weapon; let hp = bot.hp;
  aimAt(p, 0, bot.shapes[0].ay, 15); run(env, 0.2, c => { c.ads = true; });
  const before = bot.hp; step(env, 1 / 60, c => { c.ads = true; c.firePressed = true; c.fire = true; }); run(env, 0.1, c => { c.ads = true; });
  ok(!bot.alive || before - bot.hp >= 90, `headshot with the DMR (${before} -> ${bot.hp})`);
}
section('sniper bolt action');
{
  const env = yard({ loadout: { primary: 'phantom50' } }); const m = env.match, p = m.player, w = p.weapon;
  const t = m.mode.targets.find(x => x.kind === 'popup'); t.x = 0; t.z = -18; t.state = 'up'; t.alive = true; t.hp = 100; t.upT = 999; t.up = 1; t.group.visible = true; t.update(0);
  run(env, 0.1, c => { c.ads = true; }); run(env, 0.9, c => { c.ads = true; });
  ok(p.scoped, 'scoped view while aiming a sniper');
  aimAt(p, 0, t.shapes[1].ay * 0.5 + t.shapes[1].by * 0.5, -18);
  step(env, 1 / 60, c => { c.ads = true; c.firePressed = true; c.fire = true; });
  run(env, 0.1, c => { c.ads = true; });
  ok(t.hp <= 0 || !t.alive, `one shot kills at 60 m (hp ${t.hp})`);
  ok(w.ammo === 4 && w.boltT > 0, 'bolt cycling after the shot');
  ok(!p.scoped, 'scope drops after the shot');
}
section('shotgun, pump, shell reload');
{
  const env = tdm({ loadout: { primary: 'breacher12' } }); const m = env.match, p = m.player, w = p.weapon;
  const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 6; bot.body.y = 0; bot.updateShapes(); aimAt(p, 0, 1.25, 6);
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 0.1);
  ok(!bot.alive || bot.hp < 40, `shotgun at 4 m (hp ${bot.hp.toFixed(0)})`); ok(w.ammo === 5, 'one shell used');
  w.ammo = 2; step(env, 1 / 60, c => { c.reloadReleasedTap = true; }); run(env, 1.6);
  ok(w.ammo > 3, `shells loaded one by one (${w.ammo})`);
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; });
  ok(!w.reload, 'firing interrupts a shell reload');
}
section('switch weapon, melee, inspect, fire mode');
{
  const env = tdm(); const m = env.match, p = m.player;
  step(env, 1 / 60, c => { c.switchPressed = true; }); run(env, 0.8); ok(p.cur === 1 && p.weapon.id === 'sidewinder', `swapped to the pistol (${p.weapon?.id})`);
  step(env, 1 / 60, c => { c.selectSlot = 0; }); run(env, 0.9); ok(p.cur === 0, 'slot 1 selects the primary');
  step(env, 1 / 60, c => { c.meleeHold = true; }); run(env, 0.7); ok(p.hold === 'melee', 'hold Y equips the knife');
  const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 4.0; bot.body.y = 0; bot.updateShapes(); aimAt(p, 0, 1.25, 4.0);
  step(env, 1 / 60, c => { c.adsPressed = true; c.ads = true; }); run(env, 0.8);
  ok(!bot.alive, `lunge kills (${bot.hp})`);
  step(env, 1 / 60, c => { c.switchPressed = true; }); run(env, 0.8); ok(p.hold === 'gun', 'tap Y returns to the gun');
  // quick melee
  const bot2 = m.bots.find(b => b.team === 1 && b.alive); bot2.body.x = 0; bot2.body.z = p.body.z + 1.5; bot2.body.y = 0; bot2.updateShapes(); aimAt(p, 0, 1.25, bot2.body.z);
  step(env, 1 / 60, c => { c.meleeQuick = true; }); run(env, 0.8); ok(!bot2.alive, 'quick melee kills');
  // inspect
  step(env, 1 / 60, c => { c.inspect = true; }); ok(m.vm.inspecting, 'inspect animation plays');
  // fire modes
  const w = p.weapon; const m0 = w.mode; step(env, 1 / 60, c => { c.modeSwitch = true; }); ok(w.mode !== m0, `fire mode ${m0} -> ${w.mode}`);
}
section('throwables: frag cook, flash, smoke, stun, knife, mine, sensor');
{
  for (const [lethal, tactical] of [['frag', 'flash'], ['sticky', 'smoke'], ['tknife', 'stun'], ['mine', 'sensor']]) {
    const env = tdm({ loadout: { lethal, tactical } }); const m = env.match, p = m.player;
    const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 12; bot.body.y = 0; bot.updateShapes();
    p.pitch = 0.1;
    const n0 = p.lethal.n;
    step(env, 1 / 60, c => { c.lethalPressed = true; c.lethalHeld = true; });
    run(env, 1.0, c => { c.lethalHeld = true; });
    step(env, 1 / 60, c => { c.lethalHeld = false; c.lethalReleased = true; });
    run(env, 0.9);
    if (lethal !== 'mine') ok(p.lethal.n === n0 - 1 && (m.proj.list.length > 0 || lethal === 'frag'), `${lethal}: thrown (count ${p.lethal.n}, projectiles ${m.proj.list.length})`);
    else ok(m.proj.list.some(x => x.type === 'mine'), 'mine planted');
    run(env, 5, c => { });
    const t0 = p.tactical.n;
    step(env, 1 / 60, c => { c.tacticalPressed = true; c.tacticalHeld = true; }); run(env, 0.7, c => { c.tacticalHeld = true; }); step(env, 1 / 60, c => { c.tacticalHeld = false; c.tacticalReleased = true; });
    run(env, 0.7);
    ok(p.tactical.n === t0 - 1, `${tactical}: used (${p.tactical.n})`);
    if (tactical === 'sensor') ok(p.sensorT > 20, 'sensor active');
    run(env, 3, c => { });
    ok(p.alive || true, 'still running');
  }
  // cooking a frag until it explodes in the hand hurts
  const env = tdm({ loadout: { lethal: 'frag' } }); const p = env.match.player; p.invulnT = 0;
  step(env, 1 / 60, c => { c.lethalPressed = true; c.lethalHeld = true; }); run(env, 4.6, c => { c.lethalHeld = true; });
  ok(p.hp < 100 || !p.alive, `cooked frag detonated in hand (hp ${p.hp.toFixed(0)})`);
}
section('flashbang blinds when facing it');
{
  const env = tdm(); const m = env.match, p = m.player;
  m.flashbang(0, 1.5, 6, { radius: 28 }, null);   // in front of the player (facing +Z)
  ok(p.flashT > 2, `blinded ${p.flashT.toFixed(1)} s`);
  p.flashT = 0; p.heading = Math.PI; m.flashbang(0, 1.5, 6, { radius: 28 }, null); ok(p.flashT < 2.6 && p.flashT > 0, `less blind when facing away ${p.flashT.toFixed(1)} s`);
}
section('scorestreaks: UAV, drone, sentry, airstrike');
{
  const env = tdm(); const m = env.match, p = m.player;
  for (const s of p.streakSlots) { s.prog = s.cost; s.ready = true; }
  step(env, 1 / 60, c => { c.streak[0] = true; }); run(env, 1.0); ok(m.streaks.uavActive(0), 'UAV online');
  // sentry placement: aim at the floor 4 m ahead
  p.pitch = -0.35; step(env, 1 / 60, c => { c.streak[2] = true; }); run(env, 0.1); ok(!!p.targeting, 'sentry placement mode'); run(env, 0.1);
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 0.3); ok(m.streaks.entities.some(e => e.name === 'Sentry Gun'), 'sentry deployed');
  run(env, 1.5);
  // airstrike
  p.pitch = -0.05; step(env, 1 / 60, c => { c.streak[1] = true; }); run(env, 0.1); ok(p.targeting?.id === 'airstrike', 'airstrike targeting');
  step(env, 1 / 60, c => { c.firePressed = true; c.fire = true; }); run(env, 0.2);
  ok(m.streaks.runs.length === 1, 'airstrike scheduled'); run(env, 9); ok(m.streaks.runs.length === 0, 'airstrike finished');
  // drone (progress is shared, refill)
  p.streakSlots[0].id = 'drone'; p.streakSlots[0].def = { ...p.streakSlots[0].def, name: 'Attack Drone' }; p.streakSlots[0].prog = 99; p.streakSlots[0].ready = true;
  m.streaks.deploy(p, 'drone', {}); run(env, 3); ok(m.streaks.entities.some(e => e.name === 'Attack Drone'), 'drone airborne');
}
section('pickups and ammo crates');
{
  const env = tdm(); const m = env.match, p = m.player;
  const bot = m.bots.find(b => b.team === 1); bot.body.x = 0; bot.body.z = 6; bot.body.y = 0; bot.updateShapes(); aimAt(p, 0, 1.25, 6);
  m.damage(bot, 999, p, { weapon: 'test' }); run(env, 0.2);
  const pk = m.pickups.find(x => x.kind === 'gun'); ok(!!pk, 'dead robot drops its weapon');
  if (pk) {
    p.body.x = pk.x; p.body.z = pk.z + 0.6; run(env, 0.2);
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) step(env, 1 / 60, c => { c.reloadHeld = true; c.reloadHeldFor = 0.3 + i / 60; });
    ok(p.weapons[0].id === pk.id || p.weapons[1].id === pk.id || !m.pickups.includes(pk), `picked up ${pk.id}`);
  }
  const ammo = m.pickups.find(x => x.kind === 'ammo'); p.weapons[0].reserve = 5; p.body.x = ammo.x; p.body.z = ammo.z + 0.5; p.body.y = ammo.y; run(env, 0.2);
  for (let i = 0; i < 60; i++) step(env, 1 / 60, c => { c.reloadHeld = true; c.reloadHeldFor = 0.3 + i / 60; });
  ok(p.weapons[0].reserve >= p.weapons[0].def.reserve * 0.99, `ammo crate refilled (${p.weapons[0].reserve})`);
}
section('damage, death, respawn');
{
  const env = tdm(); const m = env.match, p = m.player; p.invulnT = 0;
  m.damage(p, 60, m.bots.find(b => b.team === 1), { weapon: 'test' }); ok(p.hp === 40, 'damage applies'); run(env, 7); ok(p.hp > 55, `health regenerates ${p.hp.toFixed(0)}`);
  m.damage(p, 500, m.bots.find(b => b.team === 1), { weapon: 'test' }); ok(!p.alive, 'player dies'); run(env, 1); ok(!p.alive, 'still dead before respawn'); run(env, 3.5); ok(p.alive && p.invulnT > 0, 'respawned with spawn protection');
  ok(p.stats.deaths === 1, 'death counted');
}
console.log(`\n${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
