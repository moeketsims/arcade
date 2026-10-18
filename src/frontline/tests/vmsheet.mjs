import * as THREE from 'three';
import { Viewmodel } from '../viewmodel.js';
import { Weapon } from '../weapons.js';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2];
const ids = (process.argv[3] || 'vanguard4,sidewinder,breacher12,bulwark60').split(',');
const TW = 480, TH = 270;
const poses = [
  ['hip', { adsT: 0 }],
  ['ads', { adsT: 1 }],
  ['sprint', { adsT: 0, sprintT: 1 }],
  ['reload .3', { adsT: 0, reload: { active: true, progress: 0.3, kind: 'tac', t: 0.7, per: 0.4, phase: 'load' } }],
  ['reload .5', { adsT: 0, reload: { active: true, progress: 0.5, kind: 'empty', t: 1.3, per: 0.4, phase: 'load' } }],
];
const sheet = new Canvas(poses.length * TW, ids.length * TH, [30, 34, 44]);
ids.forEach((id, r) => {
  const vm = new Viewmodel(); vm.resize(TW / TH);
  const w = new Weapon(id); vm.setWeapon(w);
  poses.forEach(([name, st], c) => {
    const s = { adsT: 0, sprintT: 0, tacT: 0, slideT: 0, bobAmp: 0, bobPhase: 0, lookYaw: 0, lookPitch: 0, moveX: 0, equip: 1, ...st };
    for (let i = 0; i < 4; i++) vm.update(0.016, s, w);
    vm.camera.updateMatrixWorld(true);
    const { cv } = renderScene(null, vm.scene, vm.camera, TW, TH, { bg: [92, 120, 150], light: new THREE.Vector3(0.6, 1, 0.7) });
    // crosshair at centre
    cv.line(TW / 2 - 8, TH / 2, TW / 2 + 8, TH / 2, [255, 60, 60]); cv.line(TW / 2, TH / 2 - 8, TW / 2, TH / 2 + 8, [255, 60, 60]);
    blit(sheet, cv, c * TW, r * TH);
  });
});
sheet.save(`${OUT}/vm_${ids.join('_')}.png`);
console.log('ok');
