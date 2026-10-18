// Render what the player's camera sees at various moments (software rasteriser).
import { makeGame, press, release, step, THREE } from './harness.mjs';
import { render, writePNG } from './raster.mjs';
const OUT = process.argv[2] || '.';
const what = process.argv[3] || 'quick';
const { game } = await makeGame('?quick=1', { quick: true, god: true });
const shot = (name, w = 960, h = 540) => {
  game.renderScene(0.0001);
  const img = render(game.scene, game.ctl.cam, w, h, { sky: 0xbfdcf0, fog: 0xbfdcf0, fogFar: 600, filter: o => o !== game.world.sky });
  writePNG(`${OUT}/view_${name}.png`, img); console.log('wrote', name, img.tris);
};
game.startMatch();
const p = game.player;
// freeze bots for a still shot
for (const b of game.bots) b.update = () => {};
step(game, 1.0);
if (what === 'quick' || what === 'all') shot('hip');
// aim down sights
game.pad.keys.add('Mouse2'); step(game, 0.6); shot('ads'); game.pad.keys.delete('Mouse2'); step(game, 0.4);
// build mode with ghost
press(game, 'KeyQ'); step(game, 0.1); release(game, 'KeyQ'); step(game, 0.5); shot('build');
for (const k of ['KeyZ', 'KeyX', 'KeyC', 'KeyV']) { press(game, k); step(game, 0.05); release(game, k); press(game, 'Mouse0'); step(game, 0.12); release(game, 'Mouse0'); game.pad.keys.delete('Mouse0'); step(game, 0.2); }
console.log('pieces built by player', [...game.world.pieces.all].filter(x => x.owner === p).map(x => x.kind).join(','), 'mats', p.inv.mats);
step(game, 1.0); shot('built');
process.exit(0);
