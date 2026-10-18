// Estimate per-frame draw calls / triangles from the player's camera in a busy moment.
import { makeGame, step, THREE } from './harness.mjs';
const { game } = await makeGame('?seed=1', { seed: 1, god: true });
game.startMatch(); const p = game.player;
step(game, 40); // everyone on the ground fighting
const poi = game.world.terrain.poi('pinecrest'); p.placeAt(poi.x + 8, poi.z + 10); p.state = 'ground'; step(game, 1.5);
game.renderScene(0.01);
const cam = game.ctl.cam; cam.updateMatrixWorld(true);
const fr = new THREE.Frustum(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
let total = 0, visible = 0, tris = 0, inst = 0, points = 0, sprites = 0;
const rows = [];
game.scene.traverse(o => {
  let v = o.visible; let q = o.parent; while (v && q) { v = q.visible; q = q.parent; } if (!v) return;
  if (o.isMesh) {
    total++; const geo = o.geometry, tc = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    if (o.isInstancedMesh) { visible++; inst++; tris += tc * o.count; if (o.count) rows.push((o.name || '?').padEnd(8) + ' count ' + String(o.count).padStart(5) + ' x ' + Math.round(tc) + ' tris = ' + Math.round(tc * o.count / 1000) + 'k'); }
    else if (o.frustumCulled === false || fr.intersectsObject(o)) { visible++; tris += tc; }
  } else if (o.isPoints) { points++; visible++; } else if (o.isSprite) { sprites++; if (fr.intersectsObject(o)) visible++; }
});
console.log(rows.join('\n'));
let shadowCasters = 0; game.scene.traverse(o => { if (o.isMesh && o.castShadow && o.visible) shadowCasters++; });
console.log('meshes: ' + total + '; draw calls in view ~' + visible + ' (instanced ' + inst + ', points ' + points + ', sprites ' + sprites + '); triangles ~' + Math.round(tris / 1000) + 'k; shadow casters ' + shadowCasters);
console.log('visible fighters', game.fighters.filter(f => f.root.visible && f.alive).length, 'alive', game.alive.length);
process.exit(0);
