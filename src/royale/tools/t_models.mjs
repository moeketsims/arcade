import * as THREE from 'three';
import { render, writePNG } from './raster.mjs';
import { weaponModel } from '../models.js';
import { ORDER, ITEMS } from '../items.js';
const OUT = process.argv[2] || '.';
const mode = process.argv[3] || 'side';
const ids = ORDER;
const cols = 6, rows = Math.ceil(ids.length / cols);
const scene = new THREE.Scene();
const t0 = performance.now();
ids.forEach((id, i) => {
  const m = weaponModel(id, (i * 3) % 5);
  const c = i % cols, r = Math.floor(i / cols);
  m.position.set(0, -r * 0.7, (c - cols / 2) * 1.5 + 0.9);
  if (mode === 'iso') m.rotation.y = -0.6;
  scene.add(m);
});
console.log('built', ids.length, 'models in', (performance.now() - t0).toFixed(0), 'ms');
const W = 1500, H = Math.round(W * (rows * 0.7 + 0.3) / (cols * 1.5));
let cam;
if (mode === 'side') {
  cam = new THREE.OrthographicCamera(-cols * 0.75, cols * 0.75, 0.35, -(rows - 1) * 0.7 - 0.35, 0.1, 50);
  cam.position.set(-10, 0, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
  // orthographic bounds already set around camera look target (0,0,0) in z; shift frustum
  cam.left = -cols * 0.75 + 0.2; cam.right = cols * 0.75 + 0.2;
} else {
  cam = new THREE.PerspectiveCamera(22, W / H, 0.1, 100); cam.position.set(-9, 3.2, 3); cam.lookAt(0, -1.5, 0.3);
}
cam.updateProjectionMatrix();
const img = render(scene, cam, W, H, { sky: 0xdde6f0 });
writePNG(OUT + `/models_${mode}.png`, img);
console.log('rendered', img.tris, 'tris', ids.map((id, i) => `${i}:${id}`).join(' '));
