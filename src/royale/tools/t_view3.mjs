// A firefight moment: render bots in action from the player's camera.
import { makeGame, press, release, step, THREE } from './harness.mjs';
import { render, writePNG } from './raster.mjs';
const OUT = process.argv[2] || '.';
const { game } = await makeGame('?quick=1&seed=1&storm=0', { quick: true, seed: 1, god: true, storm: false });
game.startMatch(); const p = game.player;
const bots = game.bots.map(b => b.f);
// bring three bots close, in view
const fx = Math.sin(game.ctl.yaw), fz = Math.cos(game.ctl.yaw), rx = -fz, rz = fx;
bots.slice(0, 4).forEach((b, i) => { b.placeAt(p.pos.x + fx * (14 + i * 3) + rx * (i - 1.5) * 4, p.pos.z + fz * (14 + i * 3) + rz * (i - 1.5) * 4); });
step(game, 3.0);
const shot = (name, w = 1000, h = 560) => { game.renderScene(0.0001); const img = render(game.scene, game.ctl.cam, w, h, { sky: 0xbfdcf0, fog: 0xbfdcf0, fogFar: 600, filter: o => o !== game.world.sky && !o.isSprite }); writePNG(`${OUT}/v3_${name}.png`, img); console.log('wrote', name, game.bots.map(b => b.f.item ? b.f.item.id : '-').join(',')); };
shot('fight');
const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400); const b = bots[1]; cam.position.set(b.pos.x + 2.2, b.pos.y + 1.7, b.pos.z - 3.0); cam.lookAt(b.pos.x, b.pos.y + 1.1, b.pos.z);
game.scene.updateMatrixWorld(true); writePNG(`${OUT}/v3_bot.png`, render(game.scene, cam, 700, 500, { sky: 0xbfdcf0, fog: 0xbfdcf0, fogFar: 600, filter: o => o !== game.world.sky && !o.isSprite })); console.log('wrote bot');
process.exit(0);
