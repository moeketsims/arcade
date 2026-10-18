import * as THREE from 'three';
import { render, writePNG } from './raster.mjs';
import { World } from '../world.js';
const OUT = process.argv[2] || '.';
const which = process.argv[3] || 'all';
const scene = new THREE.Scene();
let t0 = performance.now();
const world = new World(scene, 7);
console.log('env ms', (performance.now() - t0).toFixed(0)); t0 = performance.now();
const out = world.generate(1);
console.log('generate ms', (performance.now() - t0).toFixed(0));
console.log('houses', out.houses.length, 'chests', out.chestSpots.length, 'loot spots', out.lootSpots.length, 'towers', out.towers.length, 'pieces', world.pieces.all.size, 'solids', world.cw.count, 'harvs', world.props.harvs.length, 'decor', world.decor.set.mesh.count);
const byKind = {}; for (const p of world.pieces.all) byKind[p.kind] = (byKind[p.kind] || 0) + 1; console.log(byKind);
const props = world.props.sets; console.log(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.mesh.count])));
const hide = o => o === world.water || o.geometry?.type === 'SphereGeometry' && o.material.type === 'ShaderMaterial';
const tris = (() => { let n = 0; scene.traverse(o => { if (o.isMesh) { const g = o.geometry, c = g.index ? g.index.count / 3 : g.attributes.position.count / 3; n += c * (o.isInstancedMesh ? o.count : 1); } }); return n; })();
console.log('scene triangles', Math.round(tris));
const shots = {
  all: () => { const c = new THREE.OrthographicCamera(-290, 290, 290, -290, 1, 2000); c.position.set(0, 800, 0); c.up.set(0, 0, -1); c.lookAt(0, 0, 0); return [c, 900, 900]; },
  village: () => { const p = world.terrain.poi('pinecrest'); const c = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 900); c.position.set(p.x + 45, p.y + 38, p.z + 55); c.lookAt(p.x, p.y, p.z); return [c, 1280, 720]; },
  docks: () => { const p = world.terrain.poi('docks'); const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(p.x - 45, p.y + 40, p.z - 40); c.lookAt(p.x + 15, p.y, p.z + 5); return [c, 1280, 720]; },
  farm: () => { const p = world.terrain.poi('farm'); const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(p.x + 50, p.y + 35, p.z + 50); c.lookAt(p.x, p.y, p.z); return [c, 1280, 720]; },
  beacon: () => { const p = world.terrain.poi('beacon'); const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(p.x + 45, p.y + 30, p.z + 55); c.lookAt(p.x, p.y + 8, p.z); return [c, 1280, 720]; },
  quarry: () => { const p = world.terrain.poi('quarry'); const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(p.x - 45, p.y + 35, p.z + 55); c.lookAt(p.x, p.y, p.z); return [c, 1280, 720]; },
  lodge: () => { const p = world.terrain.poi('lodge'); const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(p.x + 40, p.y + 30, p.z - 45); c.lookAt(p.x, p.y, p.z); return [c, 1280, 720]; },
  tower: () => { const t = out.towers[0]; const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 900); c.position.set(t.x - 22, t.y + 14, t.z + 24); c.lookAt(t.x - 4, t.y + 5, t.z); return [c, 1280, 720]; },
};
for (const name of (which === 'every' ? Object.keys(shots) : [which])) {
  const [cam, w, h] = shots[name]();
  t0 = performance.now();
  const img = render(scene, cam, w, h, { sky: 0xbfdcf0, fog: 0xbfdcf0, fogFar: name === 'all' ? 0 : 500, filter: o => !(o === world.sky) });
  writePNG(OUT + `/world_${name}.png`, img);
  console.log(name, 'rendered', img.tris, 'tris in', (performance.now() - t0).toFixed(0), 'ms');
}
