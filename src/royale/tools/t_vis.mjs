import { makeGame, step } from './harness.mjs';
const { game } = await makeGame('?seed=2', { seed: 2, god: true });
game.startMatch(); const p = game.player;
step(game, 3);
const vis = () => game.fighters.filter(f => f.root.visible).length;
console.log('bus phase: player state', p.state, 'player root visible', p.root.visible, 'visible fighters', vis(), '(expect 0)');
step(game, 6); // bots start jumping
const states = {}; for (const f of game.fighters) { const k = f.state + ':' + (f.root.visible ? 'V' : 'h'); states[k] = (states[k] || 0) + 1; } console.log('during drop', states);
process.exit(0);
