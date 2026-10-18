// Renders special views: chest + loot, bus, glider, skydiver, bot close-ups
import { makeGame, press, release, tap, step, THREE } from './harness.mjs';
import { render, writePNG } from './raster.mjs';
import { makeItem } from '../items.js';
const OUT = process.argv[2] || '.';
const { game } = await makeGame('?quick=1&seed=1', { quick: true, seed: 1, range: true });
const T = game.world.terrain, cw = game.world.cw;
game.startMatch(); const p = game.player;
for (const b of game.bots) b.update = () => {};
const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 900);
const shot = (name, w = 1100, h = 620, fogFar = 500) => { game.scene.updateMatrixWorld(true); const img = render(game.scene, cam, w, h, { sky: 0xbfdcf0, fog: 0xbfdcf0, fogFar, filter: o => o !== game.world.sky && !(o.isSprite) }); writePNG(`${OUT}/v2_${name}.png`, img); console.log('wrote', name); };
step(game, 1.0);
// 1. loot range: ring of items around the player
{
  const c = p.pos; cam.position.set(c.x + 7, c.y + 6, c.z + 9); cam.lookAt(c.x, c.y + 0.5, c.z); cam.fov = 70; cam.updateProjectionMatrix(); shot('range');
}
// 2. chest closed + open
{
  const ch = game.loot.chests[game.loot.chests.length - 1]; cam.position.set(ch.x + ch.dx * 3, ch.y + 2, ch.z + ch.dz * 3); cam.lookAt(ch.x, ch.y + 0.4, ch.z); cam.fov = 55; cam.updateProjectionMatrix(); shot('chest_closed', 800, 450);
  game.loot.openChest(p, ch); step(game, 1.4); shot('chest_open', 800, 450);
}
// 3. bus
{
  game.bus.begin(); game.bus.s = 250; game.bus.update(0); const bp = game.bus.pos; cam.position.set(bp.x + 25, bp.y + 6, bp.z + 28); cam.lookAt(bp.x, bp.y + 5, bp.z); cam.fov = 55; cam.updateProjectionMatrix(); shot('bus', 900, 500, 1500);
}
// 4. glider + skydiver
{
  const bot = game.bots[0].f, bot2 = game.bots[1].f; const base = new THREE.Vector3(p.pos.x + 6, p.pos.y + 60, p.pos.z);
  bot.pos.copy(base); bot.state = 'glide'; bot.vel.set(0, -5, 12); bot.yaw = 0; bot.bodyYaw = 0; bot.root.visible = true; bot.visible = true; bot.updateVisual(0.05, base); bot.updateVisual(0.05, base);
  bot2.pos.set(base.x - 5, base.y + 6, base.z + 3); bot2.state = 'free'; bot2.vel.set(0, -50, 15); bot2.yaw = 0; bot2.bodyYaw = 0; bot2.diveAmt = 1; bot2.updateVisual(0.05, base); bot2.updateVisual(0.05, base);
  cam.position.set(base.x - 4, base.y + 3, base.z - 14); cam.lookAt(base.x - 2, base.y + 1, base.z); cam.fov = 55; cam.updateProjectionMatrix(); shot('glide', 900, 500, 1500);
}
process.exit(0);
