// Navigation test: can bots walk into houses through doors and open the chest?
import { makeGame, step, THREE } from './harness.mjs';
const SEED = +(process.argv[2] || 5); const { game } = await makeGame('?seed=' + SEED, { seed: SEED, god: true });
game.startMatch(); const p = game.player; const T = game.world.terrain;
for (const b of game.bots) { b.update = () => {}; }
const bot = game.bots[0]; const f = bot.f;
// make the world quiet: everyone else far away and frozen
game.bots.slice(1).forEach(b => { b.f.placeAt(280, 0); b.f.state = 'ground'; });
p.placeAt(-250, 250);
const houses = game.world.out.houses.filter(h => h.chestSpots.length);
let okN = 0, tot = 0, fails = [];
for (const h of houses) {
  const spot = h.chestSpots[0]; const chest = game.loot.chests.find(c => Math.abs(c.x - spot.x) < 0.1 && Math.abs(c.z - spot.z) < 0.1); if (!chest || chest.opened) continue;
  tot++;
  const d = h.doors[0]; f.reset(); f.hp = 1e9; f.placeAt(d.ox + d.nx * 12, d.oz + d.nz * 12); f.state = 'ground'; f.fireHeld = false;
  Object.assign(bot, { state: 'loot', goal: { kind: 'chest', obj: chest, x: chest.x, z: chest.z }, target: null, ignore: new Set(), interactFor: 0, stuckCount: 0 }); bot.pathTo(chest.x, chest.z); bot.chestApproach(chest);
  game.alive = [f, p]; bot.far = false; let t = 0;
  while (t < 25 && !chest.opened) { bot.target = null; bot.state = 'loot'; bot.act(1 / 30); f.update(1 / 30); game.loot.update(1 / 30, f.pos); bot.thinkT = 1; t += 1 / 30; if (!bot.goal) break; }
  if (chest.opened) okN++; else { const tg = game.loot.findTarget(f); fails.push(`[tg=${tg && tg.kind} interactFor=${bot.interactFor.toFixed(1)} tries=${bot.approachTries} held=${f.interactHeld} y=${f.pos.y.toFixed(2)} cy=${chest.y.toFixed(2)} wp=${bot.wp} wps=${bot.wps.length} ign=${bot.ignore.size}] ${h.poi || 'cabin'} house ${h.id} chest(${chest.x.toFixed(0)},${chest.z.toFixed(0)}) bot at ${f.pos.x.toFixed(0)},${f.pos.z.toFixed(0)} t=${t.toFixed(1)} goal=${bot.goal && bot.goal.kind}`); }
}
console.log(`bots reached and opened ${okN}/${tot} house chests`); fails.slice(0, 8).forEach(x => console.log('  fail:', x));
process.exit(0);
