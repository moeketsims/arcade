// Door reachability: every house door (outside + inside cell) and every house chest must be in the same walkable nav component as the open island.
// usage: node t_doors.mjs [seed ...]
import { makeGame } from './harness.mjs';
const seeds = process.argv.slice(2).map(Number); if (!seeds.length) seeds.push(5);
let bad = 0, houses = 0;
for (const SEED of seeds) {
  const { game } = await makeGame('?seed=' + SEED, { seed: SEED, god: true });
  game.startMatch(); const W = game.world, nav = W.nav, N = 641, R = 320;
  const comp = new Int32Array(N * N).fill(-1), sizes = [], stack = new Int32Array(N * N); const b = nav.blocked;
  for (let s0 = 0; s0 < N * N; s0++) {
    if (b[s0] || comp[s0] >= 0) continue; const id = sizes.length; let sp = 0, n = 0; stack[sp++] = s0; comp[s0] = id;
    while (sp) {
      const cur = stack[--sp]; n++; const cz = (cur / N) | 0, cx = cur - cz * N;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx; if (b[ni] || comp[ni] >= 0) continue; if (dx && dz && (b[cz * N + nx] || b[nz * N + cx])) continue;
        comp[ni] = id; stack[sp++] = ni;
      }
    }
    sizes.push(n);
  }
  let main = 0; sizes.forEach((s, i) => { if (s > sizes[main]) main = i; });
  const inMain = (x, z, r = 2) => { const c = nav.freeNear(x, z, r); return !!c && comp[nav.idx(c[0], c[1])] === main; };
  const fails = [];
  for (const h of W.out.houses) {
    houses++;
    for (const d of h.doors) {
      if (!inMain(d.ox, d.oz, 1)) fails.push(`seed ${SEED} ${h.poi || 'cabin'} house ${h.id}: door OUTSIDE cell (${d.ox.toFixed(1)},${d.oz.toFixed(1)}) not reachable`);
      else if (!inMain(d.ix, d.iz, 1)) fails.push(`seed ${SEED} ${h.poi || 'cabin'} house ${h.id}: door INSIDE cell (${d.ix.toFixed(1)},${d.iz.toFixed(1)}) not reachable`);
    }
    for (const c of h.chestSpots) if (!inMain(c.x + (c.dx || 0) * 0.9, c.z + (c.dz || 1) * 0.9, 2)) fails.push(`seed ${SEED} ${h.poi || 'cabin'} house ${h.id}: chest (${c.x.toFixed(1)},${c.z.toFixed(1)}) cannot be reached`);
  }
  console.log(`seed ${SEED}: ${W.out.houses.length} houses, ${sizes.length} nav regions, main region ${sizes[main]} cells, ${fails.length} problems`);
  fails.forEach(f => console.log('  ' + f)); bad += fails.length;
}
console.log(bad ? `FAIL: ${bad} problems over ${houses} houses` : `OK: all doors and chests reachable (${houses} houses)`);
process.exit(bad ? 1 : 0);
