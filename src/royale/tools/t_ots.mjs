// Over-the-shoulder view of one character holding a weapon (what the player's camera sees).
import * as THREE from 'three';
import { render, writePNG } from './raster.mjs';
import { CharacterRig } from '../rig.js';
const OUT = process.argv[2] || '.';
const ids = (process.argv[3] || 'striker').split(',');
const mode = process.argv[4] || 'aim';
const W = 640, H = 360;
const scene = new THREE.Scene();
const rig = new CharacterRig({ robot: false, shirt: 0xf2b705, shirt2: 0xf2b705, shorts: 0x2a2f3a, socks: 0x3a8cff, helmet: 0x2f7de1, skin: 0xe0ac69, shadows: false });
scene.add(rig.root);
// ground plane with a grid for reference
const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 30, 30), new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 1 })); g.rotation.x = -Math.PI / 2; scene.add(g);
const cam = new THREE.PerspectiveCamera(68, W / H, 0.1, 200);
const tiles = [];
for (const id of ids) {
  rig.setWeapon(id, 3);
  const s = { mode: 'ground', speed: mode === 'run' ? 6 : 0, fwd: 1, aim: mode === 'low' ? 0 : 1, pitch: mode === 'up' ? 0.5 : mode === 'down' ? -0.5 : 0, swingT: mode === 'swing' ? 0.46 : -1, draw: 1, spin: 0, crouch: mode === 'crouch' };
  for (let k = 0; k < 20; k++) rig.update(s, 0.05);
  // camera: right shoulder, 3 m back, a bit up (hip-fire third person); character faces +Z; right = -X
  cam.position.set(process.env.CX ? +process.env.CX : -0.9, process.env.CY ? +process.env.CY : 1.95, process.env.CZ ? +process.env.CZ : -3.0); cam.lookAt(process.env.LX ? +process.env.LX : -0.5, process.env.LY ? +process.env.LY : 1.7, process.env.LZ ? +process.env.LZ : 8);
  const img = render(scene, cam, W, H, { sky: 0xb8d8f0 });
  tiles.push(img);
}
// stitch horizontally
const w = W * tiles.length, out = new Uint8ClampedArray(w * H * 4);
tiles.forEach((t, i) => { for (let y = 0; y < H; y++) out.set(t.rgba.subarray(y * W * 4, (y + 1) * W * 4), (y * w + i * W) * 4); });
writePNG(OUT + `/ots_${mode}.png`, { w, h: H, rgba: out });
console.log('ok');
