// Feature tests: drive the real game headless with simulated input and check outcomes.
import { makeGame, press, release, tap, step, THREE } from './harness.mjs';
import { ITEMS, makeItem, GUNS } from '../items.js';

const errors = []; const origErr = console.error; console.error = (...a) => { errors.push(a.map(x => (x && x.stack) || x).join(' ')); origErr(...a); };
process.on('unhandledRejection', e => { console.log('UNHANDLED', e); process.exit(1); });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const only = process.argv[2];
const section = async (name, fn) => { if (only && only !== name) return; console.log('--', name); try { await fn(); } catch (e) { fail++; console.log('  EXCEPTION in', name, e.stack || e); } };

const { game } = await makeGame('?quick=1&seed=1&storm=0', { quick: true, god: false, seed: 1, storm: false });
const T = game.world.terrain, cw = game.world.cw, pad = game.pad, V = new THREE.Vector3();
game.startMatch();
const p = game.player;
const freeze = b => { b.update = () => {}; b.f.hp = 100000; };
for (const b of game.bots) freeze(b);

/** carve a flat, empty test field out of the island interior */
function openField() {
  let x = 40, z = -40; for (let k = 0; k < 500 && !T.isLand(x, z, 4); k++) { x = (Math.random() - 0.5) * 300; z = (Math.random() - 0.5) * 300; }
  const y = Math.max(6, T.heightAt(x, z)); T.flatten(x + 15, z, 50, 75, y);
  for (const s of [...cw.query(x - 20, z - 40, x + 60, z + 40)]) cw.remove(s);
  for (const pc of [...game.world.pieces.all]) if (Math.abs(pc.x - x - 15) < 60 && Math.abs(pc.z - z) < 50) game.world.pieces.remove(pc);
  return { x, z };
}
const field = openField();
function aimAt(target) {
  const t = target.center(V);
  for (let i = 0; i < 3; i++) { const o = game.ctl.camPos, dx = t.x - o.x, dz = t.z - o.z, dy = t.y - o.y; game.ctl.yaw = Math.atan2(dx, dz); game.ctl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); game.ctl.update(0.0001); }
}
function setup(distance = 20) {
  p.reset(); p.placeAt(field.x, field.z); p.inv.mats = [200, 200, 200]; p.inv.ammo = { light: 300, medium: 300, heavy: 40, shells: 40, rockets: 10, arrows: 30 };
  const b = game.bots[0].f; b.reset(); b.hp = 100000; b.shield = 0; b.placeAt(field.x + distance, field.z); b.state = 'ground'; return b;
}

await section('inventory', async () => {
  game.startMatch(); for (const b of game.bots) freeze(b);
  ok(p.inv.slots[1] && p.inv.slots[1].id === 'striker', 'quick loadout slot 1 is Striker AR (' + p.inv.slots.map(s => s && s.id).join(',') + ')');
  ok(p.cur === 1, 'striker selected');
  ok(game.loot.chests.length > 20, 'chests exist: ' + game.loot.chests.length);
  ok(game.loot.drops.length > 40, 'floor loot exists: ' + game.loot.drops.length);
  ok(p.pos.y < T.heightAt(p.pos.x, p.pos.z) + 1.3, 'quick spawn is on the ground, not on a roof (y ' + p.pos.y.toFixed(1) + ' vs ground ' + T.heightAt(p.pos.x, p.pos.z).toFixed(1) + ')');
});

await section('guns', async () => {
  const b = setup(22);
  for (const id of GUNS) {
    const d = ITEMS[id], TD = d.cls === 'Shotgun' ? 8 : 22; p.reset(); p.placeAt(field.x, field.z); p.inv.ammo = { light: 300, medium: 300, heavy: 40, shells: 40, rockets: 10, arrows: 30 };
    const it = makeItem(id, 2); it.mag = d.mag; p.pickup(it); p.select(p.slotOf(id), true); p.switchT = 0;
    b.hp = 100000; b.shield = 0; b.alive = true; b.placeAt(field.x + TD, field.z); b.vel.set(0, 0, 0);
    step(game, 0.4); aimAt(b);
    const mag0 = it.mag, hp0 = b.hp, dmg0 = p.damageDealt; let held = false;
    for (let i = 0; i < 100; i++) {
      aimAt(b);
      if (d.mode === 'auto' || d.mode === 'spin') { if (!held) { press(game, 'Mouse0'); held = true; } }
      else if (d.mode === 'charge') { if (i === 0) press(game, 'Mouse0'); if (i === 62) release(game, 'Mouse0'); }
      else { if (i % 8 === 0) press(game, 'Mouse0'); if (i % 8 === 3) release(game, 'Mouse0'); }
      game.frame(1 / 60); b.pos.x = field.x + TD; b.pos.z = field.z; b.vel.set(0, 0, 0);
    }
    release(game, 'Mouse0'); step(game, 0.8);
    const fired = mag0 - it.mag;
    const damaged = b.hp < hp0 || p.damageDealt > dmg0;
    ok((fired > 0 || d.mode === 'charge') && damaged, `${id.padEnd(13)} fired ${fired}, target lost ${(hp0 - b.hp).toFixed(0)} hp (dealt ${(p.damageDealt - dmg0).toFixed(0)})`);
    game.combat.reset();
  }
});

await section('reload', async () => {
  const b = setup(30); p.pickup(makeItem('striker', 2)); p.select(p.slotOf('striker'), true); const it = p.item; it.mag = 3; step(game, 0.4);
  tap(game, 'KeyR'); step(game, 0.1);
  ok(p.reloading, 'reload starts on R tap'); step(game, 3.2); ok(it.mag === ITEMS.striker.mag && !p.reloading, 'magazine refilled: ' + it.mag);
  p.pickup(makeItem('pump', 1)); const sg = p.inv.slots[p.slotOf('pump')]; p.select(p.slotOf('pump'), true); sg.mag = 1; step(game, 0.4); tap(game, 'KeyR'); step(game, 3.5);
  ok(sg.mag === ITEMS.pump.mag, 'pump shotgun reloads shell by shell: ' + sg.mag);
});

await section('melee-harvest', async () => {
  const tree = game.world.props.harvs.find(h => h.kind === 'tree' && !h.dead && T.isLand(h.x, h.z, 3) && Math.hypot(h.x - field.x, h.z - field.z) > 80);
  p.reset(); p.placeAt(tree.x + 1.9, tree.z); p.inv.mats = [0, 0, 0]; step(game, 0.3); game.ctl.yaw = Math.atan2(tree.x - p.pos.x, tree.z - p.pos.z); game.ctl.pitch = 0.1;
  const hp0 = tree.hp; tap(game, 'KeyF'); step(game, 1.2);
  ok(p.def && p.def.id === 'pickaxe', 'Y equips the pickaxe');
  ok(tree.hp < hp0, `tree took damage ${hp0} -> ${tree.hp}`); ok(p.inv.mats[0] > 0, 'wood harvested: ' + p.inv.mats[0]);
  press(game, 'Mouse0'); for (let i = 0; i < 600 && !tree.dead; i++) { game.ctl.yaw = Math.atan2(tree.x - p.pos.x, tree.z - p.pos.z); game.frame(1 / 60); } release(game, 'Mouse0');
  ok(tree.dead, 'tree destroyed after repeated hits; wood ' + p.inv.mats[0]);
  const rock = game.world.props.harvs.find(h => h.kind === 'rock' && !h.dead && T.isLand(h.x, h.z, 3)); p.placeAt(rock.x + 2.6, rock.z); step(game, 0.3);
  press(game, 'Mouse0'); for (let i = 0; i < 300 && p.inv.mats[1] === 0; i++) { game.ctl.yaw = Math.atan2(rock.x - p.pos.x, rock.z - p.pos.z); game.ctl.pitch = 0; game.frame(1 / 60); } release(game, 'Mouse0');
  ok(p.inv.mats[1] > 0, 'stone harvested from a rock: ' + p.inv.mats[1]);
  const wall = [...game.world.pieces.all].find(w => w.isStatic && w.kind === 'wall' && T.isLand(w.x, w.z, 3));
  const dirx = wall.rot === 0 ? 0 : 1, dirz = wall.rot === 0 ? 1 : 0; const sx = wall.x + dirx * 2.4, sz = wall.z + dirz * 2.4; p.placeAt(sx, sz, wall.y); step(game, 0.3);
  const hp1 = wall.hp; press(game, 'Mouse0'); for (let i = 0; i < 60 && wall.hp === hp1; i++) { game.ctl.yaw = Math.atan2(wall.x - p.pos.x, wall.z - p.pos.z); game.ctl.pitch = 0.1; game.frame(1 / 60); } release(game, 'Mouse0');
  ok(wall.hp < hp1 || wall.dead, 'pickaxe damages a house wall ' + hp1 + ' -> ' + wall.hp);
});

await section('build', async () => {
  const b = setup(60); p.pickup(makeItem('striker', 1)); step(game, 0.3);
  tap(game, 'KeyQ'); step(game, 0.2); ok(p.buildMode, 'B/Q toggles build mode');
  const mats0 = p.inv.mats[0]; game.ctl.yaw = 0; game.ctl.pitch = 0;
  for (const [k, kind] of [['KeyZ', 'wall'], ['KeyX', 'floor'], ['KeyC', 'ramp'], ['KeyV', 'roof']]) { tap(game, k, 0.03); step(game, 0.02); press(game, 'Mouse0'); step(game, 0.05); release(game, 'Mouse0'); step(game, 0.3); p.placeAt(p.pos.x, p.pos.z + 4.5); step(game, 0.2); }
  const mine = [...game.world.pieces.all].filter(x => x.owner === p);
  ok(mine.length >= 4, `placed wall/floor/ramp/roof: ${mine.map(x => x.kind).join(',')}`); ok(p.inv.mats[0] <= mats0 - 40, 'materials spent: ' + (mats0 - p.inv.mats[0]));
  ok(mine.every(x => x.solids.length > 0), 'pieces have colliders');
  tap(game, 'KeyG'); step(game, 0.1); ok(p.buildMat === 1, 'G cycles material to stone');
  // ramp rush: hold forward and spam ramps while climbing
  p.reset(); p.placeAt(field.x, field.z - 30); p.inv.mats = [300, 300, 300]; step(game, 0.4); tap(game, 'KeyQ'); step(game, 0.2); game.ctl.yaw = 0; game.ctl.pitch = -0.1;
  const y0 = p.pos.y; press(game, 'KeyW'); let maxY = y0;
  for (let i = 0; i < 360; i++) { if (i % 12 === 0) { p.buildCd = 0; game.build.place(p, 'ramp'); } game.frame(1 / 60); maxY = Math.max(maxY, p.pos.y); }
  release(game, 'KeyW'); step(game, 0.3);
  ok(maxY > y0 + 6, `ramp rush climbed: y ${y0.toFixed(2)} -> max ${maxY.toFixed(2)} (now ${p.pos.y.toFixed(2)}, ramps ${[...game.world.pieces.all].filter(x => x.owner === p && x.kind === 'ramp').length})`);
  const fl = game.world.pieces.add({ kind: 'floor', mat: 0, x: field.x + 40, y: p.pos.y, z: field.z + 4, isStatic: false, instant: true });
  p.pos.set(fl.x, fl.y, fl.z); p.vel.set(0, 0, 0); p.grounded = true; step(game, 0.5); ok(Math.abs(p.pos.y - fl.y) < 0.05, 'stands on a floor piece high up: y ' + p.pos.y.toFixed(2) + ' vs ' + fl.y.toFixed(2));
  p.reset(); p.placeAt(field.x + 30, field.z + 30); p.pickup(makeItem('striker', 1)); p.select(1, true); p.inv.ammo.medium = 200; step(game, 0.4);
  const gy = cw.supportAt(p.pos.x + 8, p.pos.z, 99, 0.5), wp = game.world.pieces.add({ kind: 'wall', mat: 0, x: Math.round((p.pos.x + 8) / 4) * 4, y: gy, z: Math.floor(p.pos.z / 4) * 4 + 2, rot: 1, owner: null, instant: true }); const hpw = wp.hp;
  press(game, 'Mouse0'); for (let i = 0; i < 90 && !wp.dead; i++) { aimAt({ center: v => v.set(wp.x, wp.y + 1.5, wp.z) }); game.frame(1 / 60); } release(game, 'Mouse0');
  ok(wp.dead || wp.hp < hpw, `bullets damage/destroy a wall (hp ${hpw} -> ${wp.hp.toFixed(0)})`);
});

await section('melee-weapons', async () => {
  const b = setup(2.0); b.hp = 100000; b.shield = 0;
  for (const id of ['knife', 'machete', 'blade']) {
    p.reset(); p.placeAt(field.x, field.z); const it = makeItem(id, 2); p.pickup(it); p.select(p.slotOf(id), true); p.switchT = 0; b.placeAt(field.x + 2.0, field.z); b.vel.set(0, 0, 0); b.hp = 100000; step(game, 0.4);
    const hp0 = b.hp; press(game, 'Mouse0'); for (let i = 0; i < 70; i++) { aimAt(b); game.frame(1 / 60); b.pos.x = field.x + 2.0; b.pos.z = field.z; } release(game, 'Mouse0'); step(game, 0.3);
    ok(b.hp < hp0, `${id} hits an adjacent target: -${(hp0 - b.hp).toFixed(0)} hp`);
  }
  // energy blade dash slash (L2 / right mouse)
  p.reset(); p.placeAt(field.x, field.z); p.pickup(makeItem('blade', 3)); p.select(1, true); p.switchT = 0; b.placeAt(field.x + 6, field.z); b.hp = 100000; step(game, 0.4); aimAt(b);
  const px0 = p.pos.x, hpB = b.hp; press(game, 'Mouse2'); step(game, 0.08); release(game, 'Mouse2'); for (let i = 0; i < 20; i++) { aimAt(b); game.frame(1 / 60); b.pos.x = field.x + 6; b.pos.z = field.z; }
  ok(p.pos.x - px0 > 3 && b.hp < hpB, `blade dash moved ${(p.pos.x - px0).toFixed(1)} m and hurt the target (-${(hpB - b.hp).toFixed(0)})`);
  // throwing knives: thrown, damage, and can be picked back up
  p.reset(); p.placeAt(field.x, field.z); p.pickup(makeItem('tknives', 2, 5)); p.select(1, true); p.switchT = 0; b.placeAt(field.x + 12, field.z); b.hp = 100000; step(game, 0.4);
  const hpK = b.hp, n0 = p.countOf('tknives'); const drops0 = game.loot.drops.length;
  for (let i = 0; i < 90; i++) { aimAt(b); if (i === 2) press(game, 'Mouse0'); if (i === 5) release(game, 'Mouse0'); game.frame(1 / 60); b.pos.x = field.x + 12; b.pos.z = field.z; }
  step(game, 0.8);
  ok(p.countOf('tknives') === n0 - 1 && b.hp < hpK, `throwing knife: stack ${n0} -> ${p.countOf('tknives')}, target -${(hpK - b.hp).toFixed(0)} hp`);
  ok(game.loot.drops.some(d => d.kind === 'item' && d.item.id === 'tknives' && !d.dead), 'the thrown knife can be picked back up (drop exists)');
  // medkit hold-to-use from the selected slot
  p.reset(); p.placeAt(field.x, field.z); p.hp = 30; p.pickup(makeItem('medkit', 1, 2)); p.select(1, true); p.switchT = 0; step(game, 0.4); press(game, 'Mouse0'); step(game, 5.5); release(game, 'Mouse0'); step(game, 0.2);
  ok(p.hp >= 99 && p.countOf('medkit') === 1, 'medkit used by holding fire on its slot: hp ' + p.hp + ', left ' + p.countOf('medkit'));
});

await section('chest-pickup-heal', async () => {
  p.reset(); const c = game.loot.chests.find(c => !c.opened && T.isLand(c.x, c.z, 2) && c.tier === 'house'); const cx = c.x + c.dx * 1.4, cz = c.z + c.dz * 1.4; p.placeAt(cx, cz, c.y); p.inv.slots[1] = null; step(game, 0.4);
  game.ctl.yaw = Math.atan2(c.x - p.pos.x, c.z - p.pos.z); step(game, 0.1);
  const tgt = game.loot.findTarget(p); ok(tgt && tgt.kind === 'chest', 'chest is the interact target (player y ' + p.pos.y.toFixed(1) + ' chest y ' + c.y.toFixed(1) + ')'); const d0 = game.loot.drops.length;
  press(game, 'KeyE'); step(game, 1.4); release(game, 'KeyE'); step(game, 0.6);
  ok(c.opened, 'holding E opens the chest'); ok(game.loot.drops.length > d0, 'chest popped loot: +' + (game.loot.drops.length - d0));
  step(game, 1.2);
  for (let i = 0; i < 8; i++) {
    const t = game.loot.findTarget(p);
    if (!t || t.kind !== 'item') { const dr = game.loot.drops.find(x => x.kind === 'item' && !x.dead && Math.hypot(x.pos.x - c.x, x.pos.z - c.z) < 5); if (!dr) break; p.placeAt(dr.pos.x + 0.8, dr.pos.z, dr.pos.y); game.ctl.yaw = Math.atan2(dr.pos.x - p.pos.x, dr.pos.z - p.pos.z); step(game, 0.25); continue; }
    press(game, 'KeyE'); step(game, 0.5); release(game, 'KeyE'); step(game, 0.1);
  }
  ok(p.inv.slots.slice(1).some(Boolean), 'picked up items into slots: ' + p.inv.slots.map(s => s && s.id).join(','));
  const a0 = p.inv.ammo.light; game.loot.spawnDrop(new THREE.Vector3(p.pos.x + 0.5, p.pos.y + 0.1, p.pos.z), { ammo: 'light', n: 20 }); step(game, 0.6); ok(p.inv.ammo.light > a0, 'walking over ammo collects it: ' + a0 + ' -> ' + p.inv.ammo.light);
  p.hp = 50; p.shield = 0; p.inv.slots = [p.inv.slots[0], null, null, null, null, null]; p.pickup(makeItem('bandage', 0, 3)); p.pickup(makeItem('smallshield', 1, 2)); p.pickup(makeItem('potion', 2, 1)); step(game, 0.3);
  tap(game, 'KeyH'); step(game, 3.0); ok(p.hp >= 64, 'bandage healed: hp ' + p.hp);
  tap(game, 'KeyH'); step(game, 3.0); tap(game, 'KeyH'); step(game, 3.0); ok(p.shield >= 25, 'H eventually used a shield item: hp ' + p.hp + ' shield ' + p.shield);
});

await section('grenade', async () => {
  const b = setup(14); p.pickup(makeItem('frag', 1, 3)); p.pickup(makeItem('smoke', 0, 2)); p.pickup(makeItem('impulse', 2, 2)); step(game, 0.4); b.hp = 300; aimAt(b);
  const hp0 = b.hp; tap(game, 'KeyT', 0.05); for (let i = 0; i < 20; i++) { aimAt(b); game.frame(1 / 60); } step(game, 3.2);
  ok(b.hp < hp0, `frag grenade hurt the target ${hp0} -> ${b.hp.toFixed(0)}`);
  ok(p.countOf('frag') === 2, 'grenade consumed from the stack: ' + p.countOf('frag'));
  p.inv.slots[p.slotOf('frag')] = null; p.cur = 1; p.lastThrown = 'smoke'; tap(game, 'KeyT', 0.05); step(game, 3.0);
  ok(cw.smokes.length > 0, 'smoke grenade created a cloud that blocks sight: ' + cw.smokes.length);
  b.placeAt(field.x + 8, field.z); b.vel.set(0, 0, 0); p.lastThrown = 'impulse'; aimAt(b); const x0 = b.pos.x; tap(game, 'KeyT', 0.05); for (let i = 0; i < 20; i++) { aimAt(b); game.frame(1 / 60); } step(game, 2.0);
  ok(Math.abs(b.pos.x - x0) > 1.5 || b.vel.length() > 1, 'impulse grenade knocked the target back: dx=' + (b.pos.x - x0).toFixed(1));
});

await section('misc-input', async () => {
  p.reset(); p.placeAt(field.x, field.z - 20); p.pickup(makeItem('striker', 1)); p.pickup(makeItem('pump', 1)); p.pickup(makeItem('bolt', 1)); step(game, 0.3);
  tap(game, 'KeyB'); step(game, 0.3); ok(!!p.emoteName, 'SELECT/B starts an emote: ' + p.emoteName);
  press(game, 'KeyW'); step(game, 0.4); release(game, 'KeyW'); ok(!p.emoteName, 'moving cancels the emote');
  const y0 = p.pos.y; press(game, 'Space'); step(game, 0.15); release(game, 'Space'); ok(p.pos.y > y0 + 0.2 || !p.grounded, 'A jumps'); step(game, 1);
  press(game, 'KeyW'); tap(game, 'ShiftLeft', 0.05); step(game, 0.6); ok(p.sprinting, 'L3/Shift toggles sprint'); release(game, 'KeyW'); step(game, 0.5);
  tap(game, 'KeyC'); step(game, 0.3); ok(p.crouching, 'R3/C crouches'); tap(game, 'KeyC'); step(game, 0.3); ok(!p.crouching, 'toggle back to standing');
  tap(game, 'Digit3'); step(game, 0.1); ok(p.cur === 2, 'number key 3 selects the 2nd loot slot (1 = pickaxe): cur=' + p.cur);
  tap(game, 'Digit1'); step(game, 0.1); ok(p.cur === 0, 'number key 1 selects the pickaxe');
  press(game, 'WheelDown'); step(game, 0.1); ok(p.cur === 1, 'mouse wheel cycles to the next slot: ' + p.cur);
  press(game, 'WheelUp'); step(game, 0.1); ok(p.cur === 0, 'mouse wheel up cycles back: ' + p.cur);
  tap(game, 'Digit2'); step(game, 0.4); press(game, 'Mouse2'); step(game, 0.6); ok(game.ctl.adsT > 0.8 && p.adsWant, 'right mouse aims down sights (adsT=' + game.ctl.adsT.toFixed(2) + ')'); release(game, 'Mouse2'); step(game, 0.5);
  tap(game, 'Escape'); step(game, 0.1); ok(game.paused, 'START/Esc pauses'); const t = game.time; step(game, 0.5); ok(game.time === t, 'simulation frozen while paused');
  tap(game, 'Escape'); step(game, 0.1); ok(!game.paused, 'START/Esc resumes');
  tap(game, 'Tab'); step(game, 0.1); ok(game.overlay.visible, 'TOUCH/Tab shows the controls overlay'); tap(game, 'Tab'); step(game, 0.1); ok(!game.overlay.visible, 'Tab hides it again');
});

await section('storm', async () => {
  game.startMatch(); for (const b of game.bots) freeze(b); game.storm.reset(); game.storm.start(); const st = game.storm; game.opts.storm = true;
  p.placeAt(field.x, field.z); st.center.set(field.x + 200, field.z); st.radius = 50; st.state = 'wait'; st.t = 0; const hp0 = p.hp + p.shield; p.shield = 0; step(game, 3.2);
  ok(p.hp < hp0 - 1, 'storm damages players outside the circle: hp ' + p.hp.toFixed(0));
});

await section('victory', async () => {
  game.startMatch(); for (const b of game.bots) freeze(b);
  for (const b of game.bots) b.f.eliminate({ attacker: p, weapon: 'Test' });
  step(game, 3.0);
  ok(game.alive.length === 1 && game.state === 'ended' && game.stats && game.stats.win, 'last one standing triggers the win screen: place ' + (game.stats && game.stats.place) + ' kills ' + (game.stats && game.stats.kills));
  game.endMenu.onPick(0); ok(game.state === 'bus' || game.state === 'play', 'Play again restarts: ' + game.state);
  for (const b of game.bots) freeze(b); p.eliminate({ attacker: game.bots[0].f, weapon: 'Test' }); step(game, 3.0); ok(game.state === 'ended' && game.stats && !game.stats.win && game.stats.place > 1, 'player elimination shows placement #' + (game.stats && game.stats.place));
});

console.log(`\n${pass} passed, ${fail} failed, ${errors.length} console errors`);
process.exit(fail || errors.length ? 1 : 0);
