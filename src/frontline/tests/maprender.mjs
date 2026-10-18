import * as THREE from 'three';
import { buildSaltworks, buildRange } from '../map.js';
import { buildLevelMeshes, makeFarScenery } from '../levelmesh.js';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2];
const which = process.argv[3] || 'salt';
const m = which === 'range' ? buildRange() : buildSaltworks();
const scene = new THREE.Scene();
const t0 = performance.now();
const { group, meshes } = buildLevelMeshes(m); scene.add(group);
console.log('level meshes', meshes.map(x => x.name + ':' + x.geometry.attributes.position.count).join(' '), (performance.now() - t0).toFixed(0) + 'ms');
const W = 640, H = 360;
const views = which === 'range' ? [
  { n: 'firing line', p: [0, 1.65, 48], t: [0, 1.4, 0] },
  { n: 'course start', p: [-36, 1.65, 43], t: [-36, 1.2, 20] },
  { n: 'course mid', p: [-36, 6, 2], t: [-36, 0, -22] },
  { n: 'recoil bay', p: [36, 1.65, 46], t: [36, 3, 19] },
] : [
  { n: 'west spawn', p: [-48, 1.65, 0], t: [-20, 1.5, 0] },
  { n: 'plaza from W door', p: [-6, 1.65, -3], t: [12, 1.5, -2] },
  { n: 'overview', p: [0, 70, 62], t: [0, 0, 0] },
  { n: 'overview SW', p: [-70, 50, 40], t: [0, 0, 0] },
  { n: 'warehouse inside', p: [-22, 1.65, 6], t: [-14, 2, -6] },
  { n: 'mezz', p: [-24, 6.0, -9], t: [-12, 5, -9] },
  { n: 'office hall', p: [18, 1.65, 5], t: [18, 1.8, -8] },
  { n: 'tower view', p: [0, 6.1, 25], t: [0, 2, -5] },
  { n: 'quay', p: [0, 1.65, -27], t: [0, 2, -34] },
];
const cols = 3, rows = Math.ceil(views.length / cols);
const sheet = new Canvas(cols * W, rows * H, [20, 20, 30]);
views.forEach((v, i) => {
  const cam = new THREE.PerspectiveCamera(v.n.startsWith('overview') ? 55 : 80, W / H, 0.1, 500);
  cam.position.set(...v.p); cam.lookAt(...v.t); cam.updateMatrixWorld(true);
  const { cv } = renderScene(null, scene, cam, W, H, { bg: [150, 190, 225], light: new THREE.Vector3(-0.4, 0.8, 0.5) });
  blit(sheet, cv, (i % cols) * W, Math.floor(i / cols) * H);
});
sheet.save(`${OUT}/render_${which}.png`);
console.log('saved');
