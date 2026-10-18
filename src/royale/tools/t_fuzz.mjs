// Fuzz test: random inputs for a long match; fail on exceptions or NaN state.
import { makeGame, press, release, step, THREE } from './harness.mjs';
import { ITEMS, makeItem, ORDER } from '../items.js';
const seed = +(process.argv[2] || 1), secs = +(process.argv[3] || 300);
let s = seed * 7919 + 17; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const errors = []; const origErr = console.error; console.error = (...a) => { errors.push(a.map(x => (x && x.stack) || x).join(' ')); if (errors.length < 5) origErr(...a); };
const { game } = await makeGame('?seed=' + seed, { seed, god: true });
game.startMatch(); const p = game.player;
const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyC', 'KeyR', 'KeyE', 'KeyF', 'KeyQ', 'KeyZ', 'KeyX', 'KeyV', 'KeyG', 'KeyH', 'KeyT', 'KeyB', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Mouse0', 'Mouse2', 'WheelUp', 'WheelDown'];
const held = new Set();
let frames = 0, bad = 0;
const t0 = performance.now();
for (let f = 0; f < secs * 60; f++) {
  const t = f / 60;
  if (f % 6 === 0) {
    const k = KEYS[Math.floor(rnd() * KEYS.length)];
    if (k.startsWith('Wheel')) press(game, k);
    else if (held.has(k)) { release(game, k); held.delete(k); } else { press(game, k); held.add(k); }
    if (rnd() < 0.15) { game.ctl.yaw += (rnd() - 0.5) * 2; game.ctl.pitch = Math.max(-1.2, Math.min(1.2, game.ctl.pitch + (rnd() - 0.5) * 0.6)); }
    if (rnd() < 0.01) { press(game, 'Escape'); step(game, 0.05); release(game, 'Escape'); }
    if (rnd() < 0.01 && game.paused) { press(game, 'Escape'); step(game, 0.05); release(game, 'Escape'); }
    if (rnd() < 0.02) { // sometimes hand the player a random item
      const id = ORDER[Math.floor(rnd() * ORDER.length)]; if (id !== 'pickaxe') { const it = makeItem(id, Math.floor(rnd() * 5)); p.pickup(it); p.inv.ammo = { light: 200, medium: 200, heavy: 30, shells: 30, rockets: 6, arrows: 20 }; }
    }
  }
  game.frame(1 / 60); frames++;
  if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z) || !Number.isFinite(p.vel.x + p.vel.y + p.vel.z)) { bad++; if (bad < 3) console.log('NaN player state at', t.toFixed(1), p.pos, p.vel); break; }
  for (const b of game.bots) if (!Number.isFinite(b.f.pos.x + b.f.pos.y + b.f.pos.z)) { bad++; if (bad < 3) console.log('NaN bot', b.f.name, b.f.pos); }
  if (game.state === 'ended' && f % 120 === 0) { game.endMenu.onPick(0); }
  if (bad > 5) break;
}
console.log(`seed ${seed}: ${frames} frames in ${(performance.now() - t0).toFixed(0)} ms; state=${game.state} alive=${game.alive.length} player kills=${p.kills}; NaN=${bad}; errors=${errors.length}`);
errors.slice(0, 3).forEach(e => console.log(e));
process.exit(errors.length || bad ? 1 : 0);
