import { makeGame, press, release, step } from './harness.mjs';
const { game } = await makeGame('?seed=3', { seed: 3, god: true });
game.startMatch(); const p = game.player, T = game.world.terrain;
for (const t of game.world.out.towers) {
  p.reset(); p.placeAt(t.rampX - 1.5, t.rampZ + 0.0, t.y + 0.1); p.hp = 1e9; step(game, 0.4);
  game.ctl.yaw = Math.PI / 2; game.ctl.pitch = 0; press(game, 'KeyW'); step(game, 5); release(game, 'KeyW'); step(game, 0.4);
  console.log(`tower at (${t.x.toFixed(0)},${t.z.toFixed(0)}) ground ${t.y.toFixed(1)} top ${t.top.toFixed(1)} -> player y ${p.pos.y.toFixed(2)} x ${p.pos.x.toFixed(1)} (platform x ${(t.x - 4).toFixed(0)}..${(t.x + 4).toFixed(0)}) climbed ${p.pos.y > t.top - 0.5 ? 'YES' : 'NO'}`);
}
process.exit(0);
