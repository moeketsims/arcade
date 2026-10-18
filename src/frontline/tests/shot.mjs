import './fakedom.mjs';
import * as THREE from 'three';
import { makeEnv, step, run } from './sim.mjs';
import { renderScene, Canvas, blit } from './raster.mjs';
const OUT = process.argv[2];
const W = 640, H = 360;
const env = makeEnv('tdm', { loadout: { primary: process.argv[3] || 'vanguard4' } });
const m = env.match; while (m.state !== 'playing') step(env);
const p = m.player;
const sheet = new Canvas(W * 2, H * 2, [0, 0, 0]);
function shot(idx, label, setup, ads = 0) {
  setup();
  for (const b of m.bots) { b.updateShapes(); }
  run(env, 0.5, c => { c.ads = ads > 0; });
  for (const b of m.bots) b.animate && b.alive && b.animate(0.016);
  m.camera.updateMatrixWorld(true); env.vm.camera.updateMatrixWorld(true);
  const cv = new Canvas(W, H, [150, 190, 225]);
  renderScene(null, m.scene, m.camera, W, H, { canvas: cv, light: new THREE.Vector3(-0.4, 0.8, 0.5) });
  cv.z.fill(Infinity);
  if (p.alive && !p.scoped) renderScene(null, env.vm.scene, env.vm.camera, W, H, { canvas: cv, light: new THREE.Vector3(0.6, 1, 0.7) });
  blit(sheet, cv, (idx % 2) * W, Math.floor(idx / 2) * H);
}
const enemies = m.bots.filter(b => b.team === 1), allies = m.bots.filter(b => b.team === 0);
for (const b of m.bots) { b.update = () => {}; }
shot(0, 'spawn', () => { p.body.x = -47; p.body.z = -3; p.body.y = 0; p.heading = Math.PI / 2; p.pitch = 0; allies.forEach((a, i) => { a.body.x = -45 + i * 1.5; a.body.z = -6 + i * 2.2; a.body.y = 0; a.heading = Math.PI / 2; }); });
shot(1, 'combat hip', () => { p.body.x = 0; p.body.z = 2; p.body.y = 0; p.heading = 0; p.pitch = 0; const e = enemies[0]; e.body.x = 1.5; e.body.z = 12; e.body.y = 0; e.heading = Math.PI; e.state = 'engage'; e.target = p; e.aimPitch = 0; const e2 = enemies[1]; e2.body.x = -3; e2.body.z = 16; e2.body.y = 0; e2.heading = Math.PI - 0.5; });
shot(2, 'ads', () => { const e = enemies[0]; const dx = e.body.x - p.body.x, dz = e.body.z - p.body.z; p.heading = Math.atan2(dx, dz); p.pitch = Math.atan2(1.25 - p.eye, Math.hypot(dx, dz)); }, 1);
shot(3, 'close', () => { const e = enemies[2]; e.body.x = 0.4; e.body.z = 5.0; e.body.y = 0; e.heading = Math.PI + 0.4; p.heading = 0.05; p.pitch = 0.0; });
sheet.save(`${OUT}/game_view_${process.argv[3] || 'vanguard4'}.png`);
console.log('ok');
