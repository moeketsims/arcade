// Contact sheet of reload choreography: node reloadsheet.mjs <outDir> [id:kind ...]
import './fakedom.mjs';
import * as THREE from 'three';
import { Viewmodel } from '../viewmodel.js';
import { Weapon } from '../weapons.js';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2];
const args = process.argv.slice(3).map(s => s.split(':'));
const rows = args.length ? args : [['vanguard4', 'empty'], ['sidewinder', 'tac'], ['breacher12', 'shell'], ['magnum', 'tac'], ['doublebarrel', 'tac'], ['ram', 'tac']];
const prog = (process.env.PROG || '0,0.12,0.25,0.4,0.55,0.7,0.85').split(',').map(Number);
const TW = +(process.env.TW || 340), TH = Math.round(TW / 1.7); const sheet = new Canvas(prog.length * TW, rows.length * TH, [30, 34, 44]);
rows.forEach(([id, kind], r) => {
  const vm = new Viewmodel(); vm.resize(TW / TH); const w = new Weapon(id); vm.setWeapon(w);
  prog.forEach((P, c) => {
    const st = { adsT: 0, sprintT: 0, tacT: 0, slideT: 0, bobAmp: 0, bobPhase: 0, lookYaw: 0, lookPitch: 0, moveX: 0, equip: 1, reload: { active: true, progress: P, kind, t: P * 2, per: 0.4, phase: P < 0.1 ? 'start' : 'load' } };
    for (let i = 0; i < 3; i++) vm.update(0.016, st, w);
    vm.camera.updateMatrixWorld(true);
    const { cv } = renderScene(null, vm.scene, vm.camera, TW, TH, { bg: [92, 120, 150], light: new THREE.Vector3(0.6, 1, 0.7) });
    blit(sheet, cv, c * TW, r * TH);
  });
});
sheet.save(`${OUT}/reload.png`); console.log('ok');
