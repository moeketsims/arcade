import { buildSaltworks } from '../map.js';
import { NavGraph } from '../nav.js';
import { plotTopDown } from './raster.mjs';
const OUT = process.argv[2];
const m = buildSaltworks();
let t0 = performance.now();
const g = NavGraph.build(m.level, { bounds: m.bounds, extra: m.nodes, seeds: m.spawns.filter(s => s.team !== 'F'), step: 2 });
console.log('nav nodes', g.nodes.length, 'dropped', g.dropped, 'build ms', (performance.now() - t0).toFixed(0));
let edges = 0; for (const n of g.nodes) edges += n.links.length; console.log('edges', edges / 2, 'avg', (edges / g.nodes.length).toFixed(2));
const A = m.spawns.filter(s => s.team === 'A'), B = m.spawns.filter(s => s.team === 'B'), F = m.spawns.filter(s => s.team === 'F');
let bad = 0;
for (const s of m.spawns) {
  const n = g.nearest(s.x, s.y, s.z); const d = Math.hypot(n.x - s.x, n.z - s.z);
  const ok = !m.level.overlaps(s.x - 0.3, s.y + 0.02, s.z - 0.3, s.x + 0.3, s.y + 1.8, s.z + 0.3);
  if (!ok || d > 4) { bad++; console.log('BAD spawn', s.team, s.x, s.y, s.z, 'free', ok, 'nearest', d.toFixed(1)); }
}
console.log('bad spawns', bad);
t0 = performance.now();
let cnt = 0, fail = 0, maxLen = 0;
for (const a of A) for (const b of B) { const na = g.nearest(a.x, a.y, a.z), nb = g.nearest(b.x, b.y, b.z); const p = g.path(na.id, nb.id); cnt++; if (!p) fail++; else maxLen = Math.max(maxLen, g.pathLength(p)); }
console.log('A->B paths', cnt, 'fail', fail, 'max length', maxLen.toFixed(1), 'ms', (performance.now() - t0).toFixed(1));
// reachability of mezzanine / second floors
const up = g.nodes.filter(n => n.y > 3.5), up2 = up.length;
console.log('upper nodes', up2, 'mezz', up.filter(n => n.x < 0).length, 'office', up.filter(n => n.x > 0).length);
const pts = [];
for (const n of g.nodes) for (const l of n.links) if (l.to > n.id) pts.push([n, g.nodes[l.to]]);
plotTopDown(OUT + '/nav_ground.png', m, { scale: 9, cutY: 1.0, nodes: g.nodes, edges: pts });
