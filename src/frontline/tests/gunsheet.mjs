import * as THREE from 'three';
import { buildGun, buildKnife } from '../guns.js';
import { WEAPONS, MELEE } from '../data.js';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2], which = process.argv[3] || 'default';
const ids = Object.keys(WEAPONS);
const atts = which === 'loaded' ? { optic: 'x4', muzzle: 'supp', mag: 'ext', stock: 'light' } : which === 'dot' ? { optic: 'dot', muzzle: 'comp' } : which === 'holo' ? { optic: 'holo' } : which === 'x8' ? { optic: 'x8', muzzle: 'comp', mag: 'ext' } : null;
const cols = 4, TW = 400, TH = 190, rows = Math.ceil(ids.length / cols);
const sheet = new Canvas(cols * TW, rows * TH, [40, 46, 58]);
ids.forEach((id, i) => {
  const scene = new THREE.Scene(); const g = buildGun(id, atts); scene.add(g);
  const cam = new THREE.OrthographicCamera(-0.72, 0.72, 0.34, -0.34, 0.1, 10);
  cam.position.set(3, 0.04, -0.28); cam.lookAt(0, 0.04, -0.28); cam.up.set(0, 1, 0);
  const aspect = TW / TH; cam.left = -0.7 * aspect / 1.0 * 0.62; cam.right = 0.7 * aspect * 0.62; cam.top = 0.34 * 1.0; cam.bottom = -0.34; cam.updateProjectionMatrix();
  const { cv } = renderScene(null, scene, cam, TW, TH, { bg: [70, 84, 100], light: new THREE.Vector3(1, 1.2, 0.4) });
  blit(sheet, cv, (i % cols) * TW, Math.floor(i / cols) * TH);
});
sheet.save(`${OUT}/guns_${which}.png`);
// knives
{
  const kids = Object.keys(MELEE); const sh = new Canvas(kids.length * 300, 200, [40, 46, 58]);
  kids.forEach((id, i) => {
    const scene = new THREE.Scene(); const g = buildKnife(id); scene.add(g);
    const cam = new THREE.OrthographicCamera(-0.3, 0.3, 0.2, -0.2, 0.1, 10); cam.position.set(2, 0.0, -0.05); cam.lookAt(0, 0, -0.05);
    cam.left = -0.3; cam.right = 0.3; cam.top = 0.2; cam.bottom = -0.2; cam.updateProjectionMatrix();
    const { cv } = renderScene(null, scene, cam, 300, 200, { bg: [70, 84, 100], light: new THREE.Vector3(1, 1.2, 0.4) });
    blit(sh, cv, i * 300, 0);
  });
  sh.save(`${OUT}/knives.png`);
}
console.log('done');
