// usage: node t_dbg.mjs seed houseId  -- replays the nav test for one house and traces the bot
import { makeGame } from './harness.mjs';
const SEED = +(process.argv[2] || 5), HID = +(process.argv[3] || 22); const { game } = await makeGame('?seed=' + SEED, { seed: SEED, god: true });
game.startMatch(); const p = game.player;
for (const b of game.bots) { b.update = () => {}; }
const bot = game.bots[0]; const f = bot.f; const W = game.world, nav = W.nav;
game.bots.slice(1).forEach(b => { b.f.placeAt(280, 0); b.f.state = 'ground'; });
p.placeAt(-250, 250);
const h = W.out.houses.find(h => h.id === HID);
const spot = h.chestSpots[0]; const chest = game.loot.chests.find(c => Math.abs(c.x - spot.x) < 0.1 && Math.abs(c.z - spot.z) < 0.1);
const d = h.doors[0];
console.log('house', JSON.stringify({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1, poi: h.poi }), 'door', JSON.stringify({ ox: d.ox, oz: d.oz, ix: d.ix, iz: d.iz, nx: d.nx, nz: d.nz }), 'chest', chest.x, chest.z, 'dir', chest.dx, chest.dz);
f.reset(); f.hp = 1e9; const sx = d.ox + d.nx * 12, sz = d.oz + d.nz * 12; f.placeAt(sx, sz); f.state = 'ground'; f.fireHeld = false;
console.log('start', sx.toFixed(1), sz.toFixed(1), 'blocked?', nav.isBlockedAt(sx, sz), 'pos', f.pos.x.toFixed(1), f.pos.z.toFixed(1), f.pos.y.toFixed(2));
Object.assign(bot, { state: 'loot', goal: { kind: 'chest', obj: chest, x: chest.x, z: chest.z }, target: null, ignore: new Set(), interactFor: 0, stuckCount: 0 }); bot.pathTo(chest.x, chest.z);
const fmt = w => w ? '(' + w[0].toFixed(1) + ',' + w[1].toFixed(1) + (w[2] ? ',' + w[2] : '') + ')' : 'null';
console.log('wp', fmt(bot.wp), 'wps', bot.wps.map(fmt).join(' '));
bot.chestApproach(chest);
console.log('after approach: wps', bot.wps.map(fmt).join(' '));
game.alive = [f, p]; bot.far = false; let t = 0;
const maxT = +(process.argv[4] || 14);
while (t < maxT && !chest.opened) { bot.target = null; bot.state = 'loot'; bot.act(1 / 30); f.update(1 / 30); game.loot.update(1 / 30, f.pos); bot.thinkT = 1; t += 1 / 30; if (!bot.goal) break; if (Math.round(t * 30) % 15 === 0) console.log(t.toFixed(1), 'pos', f.pos.x.toFixed(1), f.pos.z.toFixed(1), 'y', f.pos.y.toFixed(2), 'move', f.move.x.toFixed(2), f.move.z.toFixed(2), 'wp', fmt(bot.wp), 'wps', bot.wps.length, 'stuck', bot.stuckCount, 'int', bot.interactFor.toFixed(2)); }
console.log('end t', t.toFixed(1), 'opened', chest.opened, 'goal', JSON.stringify(bot.goal && bot.goal.kind), 'pos', f.pos.x.toFixed(1), f.pos.z.toFixed(1), 'y', f.pos.y.toFixed(2));
// map around chest
const cx = Math.round(chest.x), cz = Math.round(chest.z);
for (let z = cz - 6; z <= cz + 6; z++) { let r = String(z).padStart(5) + ' '; for (let x = cx - 10; x <= cx + 10; x++) r += (x === cx && z === cz) ? 'C' : (Math.round(f.pos.x) === x && Math.round(f.pos.z) === z) ? 'B' : nav.isBlockedAt(x, z) ? '#' : '.'; console.log(r); }
console.log('map x', cx - 10, '..', cx + 10);
process.exit(0);
