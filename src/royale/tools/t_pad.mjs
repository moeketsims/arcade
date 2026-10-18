// Gamepad test: a fake standard-mapping controller drives every button.
import { makeGame, step, THREE } from './harness.mjs';
import { makeItem } from '../items.js';
const errors = []; const origErr = console.error; console.error = (...a) => { errors.push(a.join(' ')); origErr(...a); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const { game } = await makeGame('?quick=1&seed=1', { quick: true, seed: 1 });
const IDX = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16, TOUCH: 17 };
const gp = { connected: true, mapping: 'standard', id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', axes: [0, 0, 0, 0], buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
navigator.getGamepads = () => [gp];
const hold = (b, on = true, v = 1) => { gp.buttons[IDX[b]] = { pressed: on, value: on ? v : 0 }; };
const tapB = (b, secs = 0.08) => { hold(b, true); step(game, secs); hold(b, false); step(game, 0.05); };
game.startMatch(); for (const b of game.bots) b.update = () => {}; const p = game.player; const T = game.world.terrain; const cw = game.world.cw;
{ // carve an empty flat test field and stand in it
  let x = 40, z = -40; for (let k = 0; k < 500 && !T.isLand(x, z, 4); k++) { x = (Math.random() - 0.5) * 300; z = (Math.random() - 0.5) * 300; }
  T.flatten(x + 15, z, 50, 75, Math.max(6, T.heightAt(x, z))); for (const s of [...cw.query(x - 20, z - 40, x + 60, z + 40)]) cw.remove(s); for (const pc of [...game.world.pieces.all]) if (Math.abs(pc.x - x - 15) < 60 && Math.abs(pc.z - z) < 50) game.world.pieces.remove(pc); p.placeAt(x, z);
}
step(game, 0.5);
ok(game.pad.connected && game.pad.kind === 'playstation', 'DualSense detected as playstation pad');
// move: left stick up
const y0 = p.pos.clone(); game.ctl.yaw = 0; gp.axes[1] = -1; step(game, 0.6); gp.axes[1] = 0; ok(p.pos.z - y0.z > 1.5 && Math.abs(p.pos.x - y0.x) < 1, 'left stick up moves forward: dz=' + (p.pos.z - y0.z).toFixed(1)); step(game, 0.4);
gp.axes[0] = 1; const x1 = p.pos.clone(); step(game, 0.5); gp.axes[0] = 0; ok(p.pos.x - x1.x < -1, 'left stick right strafes right (-X when facing +Z): dx=' + (p.pos.x - x1.x).toFixed(1)); step(game, 0.4);
const yaw0 = game.ctl.yaw; gp.axes[2] = 1; step(game, 0.4); gp.axes[2] = 0; ok(game.ctl.yaw < yaw0 - 0.3, 'right stick right turns right: ' + (game.ctl.yaw - yaw0).toFixed(2));
const pit0 = game.ctl.pitch; gp.axes[3] = -1; step(game, 0.3); gp.axes[3] = 0; ok(game.ctl.pitch > pit0 + 0.1, 'right stick up looks up: ' + (game.ctl.pitch - pit0).toFixed(2));
game.ctl.pitch = 0;
tapB('A', 0.1); ok(!p.grounded || p.pos.y > y0.y + 0.1, 'A jumps'); step(game, 1);
tapB('R3'); step(game, 0.3); ok(p.crouching, 'R3 crouches'); tapB('R3'); step(game, 0.3); ok(!p.crouching, 'R3 again stands');
gp.axes[1] = -1; tapB('L3'); step(game, 0.5); ok(p.sprinting, 'L3 sprints'); gp.axes[1] = 0; step(game, 0.4);
tapB('R1'); ok(p.cur === 2, 'R1 next slot -> ' + p.cur); tapB('L1'); ok(p.cur === 1, 'L1 previous slot -> ' + p.cur);
tapB('RIGHT'); ok(p.cur === 2, 'D-pad right next slot -> ' + p.cur); tapB('LEFT'); ok(p.cur === 1, 'D-pad left previous slot -> ' + p.cur);
step(game, 0.4); const mag0 = p.item.mag; hold('R2', true, 1); step(game, 0.5); hold('R2', false); step(game, 0.3); ok(p.item.mag < mag0, 'R2 fires: ' + mag0 + ' -> ' + p.item.mag);
hold('L2', true, 1); step(game, 0.6); ok(game.ctl.adsT > 0.8, 'L2 aims down sights: ' + game.ctl.adsT.toFixed(2)); hold('L2', false); step(game, 0.5);
p.item.mag = 5; tapB('X', 0.1); step(game, 0.2); ok(p.reloading, 'X taps reload'); step(game, 3);
tapB('Y'); step(game, 0.3); ok(p.def && p.def.id === 'pickaxe', 'Y equips pickaxe'); tapB('R1'); step(game, 0.4);
p.hp = 40; p.inv.slots = [p.inv.slots[0], p.inv.slots[1], null, null, null, null]; p.pickup(makeItem('bandage', 0, 3)); p.pickup(makeItem('frag', 1, 2)); step(game, 0.3);
tapB('UP'); step(game, 3); ok(p.hp > 50, 'D-pad up heals: ' + p.hp);
const n0 = p.countOf('frag'); tapB('DOWN'); step(game, 0.8); ok(p.countOf('frag') === n0 - 1, 'D-pad down throws a grenade: ' + n0 + ' -> ' + p.countOf('frag'));
tapB('SELECT'); step(game, 0.3); ok(!!p.emoteName, 'SELECT emotes: ' + p.emoteName); gp.axes[1] = -1; step(game, 0.4); gp.axes[1] = 0;
// build mode with the controller (builder-pro layout)
tapB('B'); step(game, 0.3); ok(p.buildMode, 'B toggles build mode'); p.inv.mats = [200, 200, 200]; p.buildCd = 0; game.ctl.pitch = -0.2;
const count = () => [...game.world.pieces.all].filter(x => x.owner === p).map(x => x.kind);
tapB('R2', 0.1); step(game, 0.3); ok(count().includes('wall'), 'R2 places a wall: ' + count());
p.placeAt(p.pos.x + 5, p.pos.z + 5); step(game, 0.3); tapB('R1', 0.1); step(game, 0.3); { const pl = game.build.last; ok(count().includes('floor'), 'R1 places a floor ' + JSON.stringify(pl && { kind: pl.kind, free: pl.free, ok: pl.ok, mats: pl.mats, y: +pl.y.toFixed(2) }) + ' playerY=' + p.pos.y.toFixed(2) + ' piece=' + p.buildPiece + ' mats=' + p.inv.mats); }
p.placeAt(p.pos.x + 5, p.pos.z + 5); step(game, 0.3); tapB('L2', 0.1); step(game, 0.3); ok(count().includes('ramp'), 'L2 places a ramp');
p.placeAt(p.pos.x + 5, p.pos.z + 5); step(game, 0.3); tapB('L1', 0.1); step(game, 0.3); ok(count().includes('roof'), 'L1 places a roof');
tapB('RIGHT'); ok(p.buildMat === 1, 'D-pad right changes material'); tapB('LEFT'); ok(p.buildMat === 0, 'D-pad left changes it back');
tapB('B'); step(game, 0.3); ok(!p.buildMode, 'B leaves build mode');
tapB('START'); step(game, 0.2); ok(game.paused, 'START pauses'); tapB('DOWN'); tapB('A'); step(game, 0.2); ok(game.overlay.visible, 'pause menu: Controls opens the overlay'); tapB('TOUCH'); step(game, 0.2); ok(!game.overlay.visible, 'TOUCH closes the overlay'); tapB('START'); step(game, 0.2); ok(!game.paused, 'START resumes');
tapB('TOUCH'); step(game, 0.2); ok(game.overlay.visible, 'TOUCH opens the controls overlay'); tapB('TOUCH'); step(game, 0.2);
let homed = false; const oldHome = document.body.classList.add; document.body.classList.add = (c) => { if (c === 'leaving') homed = true; }; tapB('HOME'); ok(homed, 'HOME goes back to the arcade'); document.body.classList.add = oldHome;
console.log(`${pass} passed, ${fail} failed, ${errors.length} errors`); process.exit(fail || errors.length ? 1 : 0);
