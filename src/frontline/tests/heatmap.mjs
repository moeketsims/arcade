import './fakedom.mjs';
import { makeEnv, step, run } from './sim.mjs';
import { Canvas } from './raster.mjs';
import { makeAuto } from './autoplay.mjs';
const OUT = process.argv[2], secs = +(process.argv[3] || 240);
const env = makeEnv('tdm', { difficulty: 'regular' }); const m = env.match;
while (m.state !== 'playing') step(env);
const b = m.map.bounds, S = 9, pad = 4, x0 = b.x0 - pad, z0 = b.z0 - pad, W = Math.ceil((b.x1 - b.x0 + pad * 2) * S), H = Math.ceil((b.z1 - b.z0 + pad * 2) * S);
const heat = new Float32Array(W * H), heatUp = new Float32Array(W * H), deaths = [];
let upSamples = 0, total = 0; const auto = makeAuto(m);
const prevDeaths = new Map(m.actors.map(a => [a, a.stats.deaths]));
for (let i = 0; i < secs * 60; i++) {
  step(env, 1 / 60, (c, mm) => auto(c, mm, 1 / 60));
  if (i % 15 === 0) for (const a of m.bots) { if (!a.alive) continue; const px = Math.floor((a.body.x - x0) * S), pz = Math.floor((a.body.z - z0) * S); if (px < 0 || pz < 0 || px >= W || pz >= H) continue; total++; if (a.body.y > 3.2) { upSamples++; heatUp[pz * W + px] += 1; } heat[pz * W + px] += 1; }
  for (const a of m.actors) { if (a.stats.deaths !== prevDeaths.get(a)) { prevDeaths.set(a, a.stats.deaths); deaths.push([a.body.x, a.body.z, a.team]); } }
}
const cv = new Canvas(W, H, [24, 28, 36]);
for (const bx of m.level.boxes) { if (bx.tag === 'ground' || bx.tag === 'ceiling' || bx.miny > 3 || bx.maxy < 0.4) continue; cv.rect((bx.minx - x0) * S, (bz = (bx.minz - z0) * S), (bx.maxx - x0) * S, (bx.maxz - z0) * S, [58, 64, 78]); }
var bz;
let mx = 0; for (const v of heat) mx = Math.max(mx, v);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = heat[y * W + x]; if (v > 0) { const k = Math.min(1, v / (mx * 0.35)); const up = heatUp[y * W + x] > 0; cv.dot(x, y, 1, up ? [255, 80 + k * 100, 255] : [255 * k, 200 * k + 40, 60]); } }
for (const [x, z, t] of deaths) cv.dot((x - x0) * S, (z - z0) * S, 3, t === 0 ? [60, 140, 255] : [255, 60, 60]);
cv.save(`${OUT}/heat.png`);
console.log(`samples ${total}, upstairs ${upSamples} (${(100 * upSamples / total).toFixed(1)}%), deaths ${deaths.length}, kills score`, m.mode.score);
