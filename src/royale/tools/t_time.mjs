import { makeGame } from './harness.mjs';
const t0 = performance.now(); const { game } = await makeGame('?seed=1', { seed: 1 }); console.log('boot+init ms', (performance.now() - t0).toFixed(0));
for (let i = 0; i < 3; i++) { const t1 = performance.now(); game.world.generate(10 + i); const t2 = performance.now(); game.world.nav.build(game.world.cw, game.world.terrain); const t3 = performance.now(); console.log('generate ms', (t2 - t1).toFixed(0), '(incl. nav build; extra nav build', (t3 - t2).toFixed(0), 'ms)'); }
const t4 = performance.now(); game.startMatch(); console.log('startMatch ms', (performance.now() - t4).toFixed(0));
const nav = game.world.nav; const t5 = performance.now(); let n = 0; for (let i = 0; i < 40; i++) { const a = nav.find(-150 + i * 3, -120, 150 - i * 2, 120); if (a) n++; } console.log('40 long A* queries ms', (performance.now() - t5).toFixed(0), 'found', n);
process.exit(0);
