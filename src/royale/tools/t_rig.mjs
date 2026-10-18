import * as THREE from 'three';
import { render, writePNG } from './raster.mjs';
import { CharacterRig, buildGlider } from '../rig.js';
const OUT = process.argv[2] || '.';
const view = process.argv[3] || 'front';
const list = (process.argv[4] || 'striker,pistol,pump,bolt,rocket,minigun,bow,dualpistols,knife,pickaxe,frag,crossbow').split(',');
const scene = new THREE.Scene();
const colors = [0xe0503a, 0x3a8cff, 0x3ad17a, 0xc77dff, 0xffc02e, 0x2dd4d4];
list.forEach((id, i) => {
  const rig = new CharacterRig({ robot: true, shirt: colors[i % 6], shirt2: colors[(i + 2) % 6], shorts: 0x2a2f3a, socks: colors[(i + 2) % 6], helmet: i % 2 ? 0x1b2433 : undefined, visor: 0xff5577, skin: 0xaab3c4, shadows: false });
  rig.setWeapon(id, i % 5);
  const s = { mode: 'ground', speed: view === 'run' ? 5 : 0, fwd: 1, aim: view === 'low' ? 0 : 1, pitch: 0, swingT: view === 'swing' ? 0.46 : -1, draw: id === 'bow' ? 1 : 0, spin: 0 };
  for (let k = 0; k < 10; k++) rig.update(s, 0.05);
  rig.root.position.set(-(i - list.length / 2) * 1.6, 0, 0);   // character left is +X; keep camera behind/in front
  scene.add(rig.root);
  if (rig.mode === 'ik') console.log(id.padEnd(12), 'reach R', rig.reachR?.toFixed(2), 'L', rig.reachL?.toFixed(2));
});
const W = 1500, H = 560;
const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
if (view === 'back') { cam.position.set(2.5, 2.1, -9); cam.lookAt(0, 1.0, 0); }
else if (view === 'side') { cam.position.set(-12, 1.4, 0); cam.lookAt(0, 1.0, 0); }
else { cam.position.set(1.5, 1.7, 11); cam.lookAt(0, 1.0, 0); }
const img = render(scene, cam, W, H, { sky: 0xdde6f0 });
writePNG(OUT + `/rig_${view}.png`, img);
console.log('rendered', img.tris);
