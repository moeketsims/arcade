// Smoke test: boot the game headless, run a quick match, then a full bus match; report errors and statistics.
import { makeGame, press, release, step, THREE } from './harness.mjs';

const mode = process.argv[2] || 'quick';
const secs = +(process.argv[3] || 30);
process.on('unhandledRejection', e => { console.log('UNHANDLED', e); process.exit(1); });

const errors = [];
const origErr = console.error; console.error = (...a) => { errors.push(a.map(x => (x && x.stack) || x).join(' ')); if (errors.length < 6) origErr(...a); };

const t0 = performance.now();
const { game } = await makeGame(mode === 'quick' ? '?quick=1' : '', mode === 'quick' ? { quick: true } : {});
console.log('init ms', (performance.now() - t0).toFixed(0), 'state', game.state);
game.startMatch();
console.log('match started: state', game.state, 'fighters', game.fighters.length, 'alive', game.alive.length, 'chests', game.loot.chests.length, 'drops', game.loot.drops.length);
const p = game.player;
let last = 0, sim0 = performance.now(), worst = 0;
for (let i = 0; i < secs * 60; i++) {
  const t = i / 60;
  const ft = performance.now(); game.frame(1 / 60); worst = Math.max(worst, performance.now() - ft);
  if (mode === 'bus') { if (t > 8 && p.state === 'bus') press(game, 'Space'); else release(game, 'Space'); }
  if (t - last >= 5) {
    last = t; const st = game.storm;
    const states = {}; for (const b of game.bots) { const k = b.f.alive ? b.f.state + '/' + b.state : 'dead'; states[k] = (states[k] || 0) + 1; }
    console.log(`t=${t.toFixed(0)}s alive=${game.alive.length} player=${p.state} hp=${p.hp.toFixed(0)} pos=${p.pos.x.toFixed(0)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(0)} storm=${st.active ? st.state + ':' + st.phase + ' r=' + st.radius.toFixed(0) : 'off'} bots=${JSON.stringify(states)} drops=${game.loot.drops.length} projs=${game.combat.projs.length} pieces=${game.world.pieces.all.size}`);
  }
}
const ms = performance.now() - sim0;
console.log('simulated', secs, 's in', ms.toFixed(0), 'ms (', (ms / (secs * 60)).toFixed(2), 'ms/frame avg, worst', worst.toFixed(1), ')');
console.log('player: kills', p.kills, 'damage', p.damageDealt.toFixed(0), 'alive', p.alive, 'state', game.state);
const kills = game.bots.reduce((s, b) => s + b.f.kills, 0); console.log('total bot kills', kills, 'alive', game.alive.length);
console.log('errors:', errors.length); errors.slice(0, 5).forEach(e => console.log(e));
process.exit(errors.length ? 1 : 0);
