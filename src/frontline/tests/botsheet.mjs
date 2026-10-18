import './fakedom.mjs';
import * as THREE from 'three';
import { makeEnv, step, run } from './sim.mjs';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2];
const env = makeEnv('tdm'); const m = env.match; while (m.state !== 'playing') step(env);
const ids = ['vanguard4', 'viper9', 'bulwark60', 'longbow', 'phantom50', 'breacher12', 'tempest', 'riotauto'];
const TW = 320, TH = 380, cols = 4, rows = 2; const sheet = new Canvas(cols * TW, rows * TH, [30, 34, 44]);
// park everything else
for (const b of m.bots) { b.update = () => {}; b.group.visible = false; }
const bot = m.bots[6]; bot.group.visible = true; bot.state = 'engage';
const scene = new THREE.Scene(); scene.add(bot.group);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x555a60 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
ids.forEach((id, i) => {
  bot.equip(id); bot.body.x = 0; bot.body.y = 0; bot.body.z = 0; bot.heading = 0; bot.stance = 0; bot.aimPitch = 0;
  bot.state = 'engage'; bot.target = null;
  bot.animate(0.016); bot.group.updateMatrixWorld(true);
  const side = i % 2 === 0;
  const cam = new THREE.PerspectiveCamera(30, TW / TH, 0.1, 50);
  if (side) cam.position.set(-5.2, 1.1, 0.8); else cam.position.set(2.2, 1.3, 4.6);
  cam.lookAt(0, 1.0, 0.3); cam.updateMatrixWorld(true);
  const { cv } = renderScene(null, scene, cam, TW, TH, { bg: [110, 140, 175], light: new THREE.Vector3(0.5, 0.9, 0.6) });
  blit(sheet, cv, (i % cols) * TW, Math.floor(i / cols) * TH);
});
sheet.save(`${OUT}/bots.png`); console.log('ok');
