import { Terrain } from '../terrain.js';
import { writePNG } from './raster.mjs';
const OUT = process.argv[2] || '.';
const t0 = performance.now();
const T = new Terrain(7);
console.log('terrain ms', (performance.now() - t0).toFixed(0));
for (const p of T.pois) console.log(p.id, p.name, p.x.toFixed(1), p.z.toFixed(1), 'y', p.y.toFixed(2), 'flat', p.flat);
console.log('sites', T.sites.map(s => `${s.x},${s.z},${s.y.toFixed(1)}`).join(' | '));
let min = 1e9, max = -1e9, land = 0, tot = 0;
for (let z = -300; z <= 300; z += 5) for (let x = -300; x <= 300; x += 5) { const h = T.heightAt(x, z); min = Math.min(min, h); max = Math.max(max, h); tot++; if (h > 0.3) land++; }
console.log('height range', min.toFixed(1), max.toFixed(1), 'land fraction', (land / tot).toFixed(2));
// land extents
let xs = [1e9, -1e9], zs = [1e9, -1e9];
for (let z = -320; z <= 320; z += 2.5) for (let x = -320; x <= 320; x += 2.5) if (T.heightAt(x, z) > 0.3) { xs = [Math.min(xs[0], x), Math.max(xs[1], x)]; zs = [Math.min(zs[0], z), Math.max(zs[1], z)]; }
console.log('land extents x', xs, 'z', zs);
const S = 512, px = T.minimapPixels(S, 640);
// mark POIs
for (const p of T.pois) { const i = Math.round((p.x / 640 + 0.5) * (S - 1)), j = Math.round((p.z / 640 + 0.5) * (S - 1)); for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const k = ((j + b) * S + (i + a)) * 4; px[k] = 255; px[k + 1] = 0; px[k + 2] = 80; } }
for (const s of T.sites) { const i = Math.round((s.x / 640 + 0.5) * (S - 1)), j = Math.round((s.z / 640 + 0.5) * (S - 1)); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const k = ((j + b) * S + (i + a)) * 4; px[k] = 255; px[k + 1] = 255; px[k + 2] = 0; } }
writePNG(OUT + '/terrain_map.png', { w: S, h: S, rgba: px });
console.log('wrote map');
