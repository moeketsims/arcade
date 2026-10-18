import { makeGame, step } from './harness.mjs';
const { game } = await makeGame('?seed=1', { seed: 1, god: true });
game.startMatch();
// instrument bot updates and pathfinding
let astar = [], botT = [];
const nav = game.world.nav, origFind = nav.find.bind(nav); nav.find = (...a) => { const t = performance.now(); const r = origFind(...a); astar.push([performance.now() - t, !!r]); return r; };
for (const b of game.bots) { const o = b.update.bind(b); b.update = (dt, t) => { const t0 = performance.now(); o(dt, t); const d = performance.now() - t0; if (d > 3) botT.push([d, b.state, b.goal && b.goal.kind]); }; }
const frames = []; const secs = +(process.argv[2] || 90);
for (let i = 0; i < secs * 60; i++) { const t0 = performance.now(); game.frame(1 / 60); frames.push(performance.now() - t0); }
frames.sort((a, b) => b - a);
console.log('frames', frames.length, 'avg', (frames.reduce((s, x) => s + x, 0) / frames.length).toFixed(2), 'p50', frames[Math.floor(frames.length / 2)].toFixed(2), 'p99', frames[Math.floor(frames.length * 0.01)].toFixed(2), 'worst', frames.slice(0, 6).map(x => x.toFixed(1)).join(','));
astar.sort((a, b) => b[0] - a[0]); console.log('A* calls', astar.length, 'slowest', astar.slice(0, 6).map(x => x[0].toFixed(1) + (x[1] ? '' : '(null)')).join(','), 'total ms', astar.reduce((s, x) => s + x[0], 0).toFixed(0));
botT.sort((a, b) => b[0] - a[0]); console.log('slow bot updates', botT.length, botT.slice(0, 6).map(x => x[0].toFixed(1) + ':' + x[1] + '/' + x[2]).join(' | '));
process.exit(0);
