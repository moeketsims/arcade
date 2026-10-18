// Unit tests for the collision world (run: node src/royale/tools/t_colliders.mjs)
import { Terrain } from '../terrain.js';
import { CollisionWorld, makeBox, makeRamp, makePyramid, rayVsSolid, topAt } from '../colliders.js';
import { mulberry32 } from '../noise.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-4) => (a === b) || Math.abs(a - b) < e;

const T = new Terrain(7);
const cw = new CollisionWorld(T);

// box ray
const b = makeBox(10, 0, -1, 12, 3, 1);
let n = {};
let t = rayVsSolid(b, 0, 1, 0, 1, 0, 0, 100, n);
ok(near(t, 10) && n.x === -1, 'box hit from -x ' + t + JSON.stringify(n));
t = rayVsSolid(b, 20, 1, 0, -1, 0, 0, 100, n); ok(near(t, 8) && n.x === 1, 'box hit from +x');
t = rayVsSolid(b, 11, 10, 0, 0, -1, 0, 100, n); ok(near(t, 7) && n.y === 1, 'box hit from above');
t = rayVsSolid(b, 0, 5, 0, 1, 0, 0, 100, n); ok(t === -1, 'box miss above');
t = rayVsSolid(b, 11, 1, 0, 1, 0, 0, 100, n); ok(t === -1, 'ray from inside ignored');

// ramp rising +z from y0 to y3, footprint x:[0,4] z:[0,4]
const r = makeRamp(0, -0.4, 0, 4, 0, 4, 0, 0, 3, null);
ok(near(topAt(r, 2, 0), 0) && near(topAt(r, 2, 2), 1.5) && near(topAt(r, 2, 4), 3), 'ramp top dir0');
t = rayVsSolid(r, 2, 10, 2, 0, -1, 0, 50, n); ok(near(t, 8.5), 'ray down onto ramp mid = ' + t); ok(n.y > 0.7 && n.z < 0, 'ramp normal tilts toward -z: ' + JSON.stringify(n));
t = rayVsSolid(r, 2, 1, -5, 0, 0, 1, 50, n); ok(t === -1 || t > 6, 'ray at y=1 hits ramp only after z>1.33 (t=' + t + ')');
t = rayVsSolid(r, 2, 2, 9, 0, 0, -1, 50, n); ok(near(t, 5, 1e-3), 'ray from high side hits vertical back face at z=4: ' + t);
for (const dir of [1, 2, 3]) {
  const rr = makeRamp(0, -0.4, 0, 4, 0, 4, dir, 0, 3, null);
  const mid = topAt(rr, 2, 2); ok(near(mid, 1.5), 'ramp mid ' + dir);
  t = rayVsSolid(rr, 2, 10, 2, 0, -1, 0, 50, n); ok(near(t, 8.5), 'ramp down ray dir' + dir);
}
ok(near(topAt(makeRamp(0, 0, 0, 4, 0, 4, 1, 0, 3), 4, 2), 3) && near(topAt(makeRamp(0, 0, 0, 4, 0, 4, 2, 0, 3), 2, 0), 3) && near(topAt(makeRamp(0, 0, 0, 4, 0, 4, 3, 0, 3), 0, 2), 3), 'ramp high edges');

// pyramid base y=0 peak 2 footprint [0,4]
const p = makePyramid(0, 0, 0, 4, 2, 4);
ok(near(topAt(p, 2, 2), 2) && near(topAt(p, 0, 2), 0) && near(topAt(p, 1, 2), 1), 'pyr tops');
t = rayVsSolid(p, 2, 10, 2, 0, -1, 0, 50, n); ok(near(t, 8), 'ray down onto pyr peak');
t = rayVsSolid(p, 1, 10, 2, 0, -1, 0, 50, n); ok(near(t, 9), 'ray down onto pyr slope ' + t);
ok(n.x < -0.3 && n.y > 0.5, 'pyr normal faces -x');
t = rayVsSolid(p, -5, 1, 2, 1, 0, 0, 50, n); ok(near(t, 5 + 2 * 0.5, 1e-3) || near(t, 6.0, 1e-3), 'horizontal ray at y=1 enters slope at x=2*? ' + t);

// DDA vs brute force
const rng = mulberry32(5);
const solids = [];
for (let i = 0; i < 400; i++) {
  const x = (rng() - 0.5) * 500, z = (rng() - 0.5) * 500, w = 0.5 + rng() * 6, d = 0.5 + rng() * 6, y = rng() * 10, k = Math.floor(rng() * 3);
  const s = k === 0 ? makeBox(x, y, z, x + w, y + 1 + rng() * 5, z + d) : k === 1 ? makeRamp(x, y, z, x + 4, 0, z + 4, Math.floor(rng() * 4), y, y + 3) : makePyramid(x, y, z, x + 4, y + 2, z + 4);
  solids.push(s); cw.add(s);
}
let bad = 0;
for (let i = 0; i < 600; i++) {
  const ox = (rng() - 0.5) * 400, oz = (rng() - 0.5) * 400, oy = 1 + rng() * 14, a = rng() * 6.283, el = (rng() - 0.5) * 0.4;
  const dx = Math.cos(a) * Math.cos(el), dz = Math.sin(a) * Math.cos(el), dy = Math.sin(el), maxT = 40 + rng() * 200;
  const h = cw.raycast(ox, oy, oz, dx, dy, dz, maxT, { terrain: false });
  let bt = Infinity; const nn = {};
  for (const s of solids) { const tt = rayVsSolid(s, ox, oy, oz, dx, dy, dz, maxT, nn); if (tt >= 0 && tt < bt) bt = tt; }
  const got = h ? h.t : Infinity; if (!near(got, bt, 1e-3)) { bad++; if (bad < 4) console.log('mismatch', got, bt); }
}
ok(bad === 0, 'DDA raycast matches brute force, mismatches=' + bad);

// terrain ray: shoot from above straight down
const c = cw.raycast(0, 80, 0, 0, -1, 0, 200, { solids: false });
ok(c && c.terrain && near(c.y, Math.max(T.heightAt(0, 0), 0), 0.05), 'terrain ray down ' + JSON.stringify(c && [c.t, c.y]));
const w = cw.raycast(300, 10, 300, 0, -1, 0, 100, { solids: false }); ok(w && w.water, 'water hit far out');
const grazing = cw.raycast(-200, Math.max(T.heightAt(-200, 0), 0) + 3, 0, 1, -0.02, 0, 400); ok(grazing !== null, 'grazing ray hits something');

// collision: ramp support + wall push
const cw2 = new CollisionWorld(T);
const G = T.heightAt(102, 102) + 20; // float everything 20 m above terrain so terrain never interferes
const ramp = makeRamp(100, G - 0.4, 100, 104, 0, 104, 0, G, G + 3, 'r'); cw2.add(ramp);
ok(near(cw2.supportAt(102, 102, G + 1.4, 0.55), G + 1.5), 'support on ramp mid, from y=G+1.4: ' + cw2.supportAt(102, 102, G + 1.4, 0.55));
ok(cw2.supportAt(102, 102, G - 5, 0.55) < G, 'cannot snap up onto ramp from far below');
const GW = Math.max(T.heightAt(202, 200), 0);
const wall = makeBox(200, GW, 200, 204, GW + 3, 200.3); cw2.add(wall);
const pos = { x: 202, z: 199.9 };
const pushed = cw2.collide(pos, GW, 1.8, 0.4, 0.55); ok(pushed && pos.z <= 199.6 + 1e-6, 'pushed out of wall: ' + pos.z);
const inside = { x: 202, z: 200.1 }; cw2.collide(inside, GW, 1.8, 0.4, 0.55); ok(Math.abs(inside.z - 200.1) > 0.25 && (inside.z <= 199.6 + 1e-6 || inside.z >= 200.7 - 1e-6), 'pushed out when centre inside: ' + inside.z);
const above = { x: 202, z: 200.1 }; ok(!cw2.collide(above, GW + 3.0, 1.8, 0.4, 0.55) && above.z === 200.1, 'standing on top is not pushed');
// ramp side wall: character beside high end of a ramp is blocked, at low end walks on
const side = { x: 99.7, z: 103.5 }; cw2.collide(side, G, 1.8, 0.4, 0.55); ok(side.x < 99.7 + 1e-9, 'blocked by tall side of ramp');
const low = { x: 102, z: 99.7 }; const before = low.z; cw2.collide(low, G, 1.8, 0.4, 0.55); ok(low.z === before, 'low end of ramp does not block ' + low.z);
// ceiling
const slab = makeBox(250, 2.5, 250, 254, 2.9, 254); cw2.add(slab);
ok(near(cw2.ceilingAt(252, 252, 1.8), 2.5), 'ceiling above head');
// blocked line
cw2.add(makeBox(298, 0, 298, 302, 5, 300.3));
ok(cw2.blocked(300, 1.5, 295, 300, 1.5, 305), 'blocked by wall');
ok(!cw2.blocked(290, 1.5, 295, 290, 1.5, 305), 'clear line over the sea');
cw2.smokes.push({ x: 280, y: 3, z: 280, r: 6, until: 1e9 }); ok(cw2.blocked(280, 3, 270, 280, 3, 290), 'smoke blocks sight');
// perf
const t0 = performance.now(); let cnt = 0;
for (let i = 0; i < 20000; i++) { cw.raycast(rng() * 200 - 100, 5, rng() * 200 - 100, Math.cos(i), 0.01, Math.sin(i), 150); cnt++; }
console.log('20000 raycasts ms', (performance.now() - t0).toFixed(0));
console.log(fails ? `${fails} FAILURES` : 'colliders: all ok');
process.exit(fails ? 1 : 0);
