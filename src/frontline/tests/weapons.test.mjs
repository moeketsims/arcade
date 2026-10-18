import { WEAPONS, MELEE, LETHALS, TACTICALS, STREAKS, PRIMARIES, SECONDARIES, deriveWeapon, damageAt, statBars, allowedAtts, sanitizeLoadout, DEFAULT_LOADOUT, OPTICS, MUZZLES, MAGS, STOCKS } from '../data.js';
import { Weapon, spreadDir } from '../weapons.js';
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
console.log('weapons', Object.keys(WEAPONS).length, 'primaries', PRIMARIES.length, 'secondaries', SECONDARIES.length);
ok(Object.keys(WEAPONS).length === 22, '22 guns');
for (const id of Object.keys(WEAPONS)) {
  const w = new Weapon(id), d = 1 / 60;
  // hold trigger 3 s of game time
  let shots = 0, t = 0; let pressed = true;
  while (t < 3) {
    w.update(d);
    const ev = w.trigger(pressed, true); shots += ev.length; pressed = false;
    // refill ammo to measure pure rate
    if (w.ammo <= 0) { w.ammo = w.stats.mag; }
    t += d;
  }
  const rate = shots / 3 * 60;
  const exp = w.stats.bolt ? 60 / Math.max(w.stats.bolt, w.stats.interval) : (w.mode === 'semi' ? 'semi' : w.mode === 'burst' ? 'burst' : w.stats.rpm);
  // semi weapons: only the first pressed shot fires when holding
  console.log(id.padEnd(14), w.mode.padEnd(6), 'shots in 3s held:', String(shots).padStart(3), ' rate/min', rate.toFixed(0).padStart(5), ' expected', exp, ' mag', w.stats.mag, 'ads', w.stats.ads.toFixed(2), 'speed', w.stats.speed.toFixed(2));
  // chest damage and shots-to-kill at several distances
  const stk = [5, 20, 40, 70].map(dist => { const dm = w.damage(dist) * w.stats.pellets * (w.stats.pellets > 1 ? 0.6 : 1); return Math.ceil(100 / Math.max(1, dm)); });
  console.log('    dmg0', w.damage(0).toFixed(0), 'dmg40', w.damage(40).toFixed(0), 'STK(5,20,40,70)', stk.join(','), 'bars', Object.entries(statBars(w.stats)).filter(([k]) => k !== 'dps').map(([k, v]) => k[0] + v.toFixed(2)).join(' '));
}
// auto weapon accuracy of fire rate
{
  const w = new Weapon('vanguard4'); let shots = 0; const d = 1 / 30; let pressed = true;
  for (let t = 0; t < 2; t += d) { w.update(d); shots += w.trigger(pressed, true).length; pressed = false; if (w.ammo <= 0) w.ammo = 30; }
  console.log('vanguard at 30fps shots in 2s', shots, 'expected', 24); ok(Math.abs(shots - 24) <= 2, 'fps independence');
}
// burst
{
  const w = new Weapon('ranger556'); w.update(0.016); let shots = 0; const d = 1 / 60; let pressed = true; const times = [];
  for (let t = 0; t < 1.0; t += d) { w.update(d); const ev = w.trigger(pressed, true); pressed = false; if (ev.length) times.push(t.toFixed(3)); shots += ev.length; }
  console.log('ranger burst mode', w.mode, 'shots in 1s with one press:', shots, times.join(' ')); ok(shots === 3, 'burst of 3');
  ok(w.cycleMode() && w.mode === 'auto', 'cycle to auto');
}
// reload
{
  const w = new Weapon('vanguard4'); w.ammo = 10; ok(w.startReload(), 'start reload'); let t = 0; while (w.reloading && t < 10) { w.update(0.016); t += 0.016; }
  console.log('tac reload time', t.toFixed(2), 'ammo', w.ammo, 'reserve', w.reserve); ok(w.ammo === 31, 'tac reload gives +1');
  w.ammo = 0; w.startReload(); t = 0; while (w.reloading && t < 10) { w.update(0.016); t += 0.016; }
  console.log('empty reload time', t.toFixed(2), 'ammo', w.ammo); ok(w.ammo === 30, 'empty reload full');
}
// shell reload and interrupt
{
  const w = new Weapon('breacher12'); w.ammo = 1; ok(w.startReload(), 'shell reload'); let t = 0; let fired = 0;
  while (w.reloading && t < 10) { w.update(0.016); t += 0.016; if (w.ammo >= 3 && !fired) { const ev = w.trigger(true, true); fired = ev.length; } }
  console.log('shell reload interrupted at ammo', w.ammo, 'fired', fired, 'reloading', w.reloading); ok(fired === 1, 'shell reload interrupt fires');
}
// bolt action cycle
{
  const w = new Weapon('phantom50'); w.update(0.016); let n = 0; const ts = []; const d = 1 / 60;
  for (let t = 0; t < 3.5; t += d) { w.update(d); const ev = w.trigger(true, true); if (ev.length) { n++; ts.push(t.toFixed(2)); } if (w.ammo === 0) w.ammo = 5; }
  console.log('phantom shots with mashing in 3.5s', n, ts.join(' ')); ok(n === 3 || n === 4, 'bolt cycle');
}
// double barrel, revolver, launcher
{
  const w = new Weapon('doublebarrel'); w.update(0.016); const e1 = w.trigger(true, true).length; for (let i = 0; i < 20; i++) w.update(0.016); const e2 = w.trigger(true, true).length; for (let i = 0; i < 40; i++) w.update(0.016); const e3 = w.trigger(true, true).length;
  console.log('double barrel', e1, e2, e3, 'ammo', w.ammo); ok(e1 === 1 && w.ammo === 0, 'db shots');
}
// attachments
{
  const base = deriveWeapon(WEAPONS.vanguard4, {});
  const x8 = deriveWeapon(WEAPONS.vanguard4, { optic: 'x8', muzzle: 'supp', mag: 'ext', stock: 'light' });
  console.log('vanguard base ads', base.ads.toFixed(3), 'mag', base.mag, 'zoom', base.zoom.toFixed(2), '| loaded ads', x8.ads.toFixed(3), 'mag', x8.mag, 'zoom', x8.zoom, 'supp', x8.suppressed, 'speed', x8.speed.toFixed(3), 'recoilMul', x8.recoilMul.toFixed(2), 'scope', x8.scope);
  ok(x8.mag === 45 && x8.suppressed && x8.zoom > 5, 'attachments apply');
  ok(!allowedAtts(WEAPONS.magnum, 'stock').includes('light'), 'magnum no light stock');
  const sn = new Weapon('phantom50'); ok(sn.att.optic === 'x8', 'sniper default scope');
}
// loadout sanitize
{ const l = sanitizeLoadout({ primary: 'nope', secondary: 'ram', streaks: ['drone', 'zzz'], att: { vanguard4: { optic: 'x4', muzzle: 'bad' } } }); console.log(JSON.stringify({ p: l.primary, s: l.secondary, st: l.streaks, att: l.att.vanguard4 })); ok(l.primary === 'vanguard4' && l.secondary === 'ram' && l.streaks[0] === 'drone' && l.att.vanguard4.optic === 'x4' && l.att.vanguard4.muzzle === 'none', 'sanitize'); }
// spreadDir distribution
{
  const o = { x: 0, y: 0, z: 0 }; let max = 0; for (let i = 0; i < 2000; i++) { spreadDir(0, 0, 1, 3, o); const a = Math.acos(o.z) * 180 / Math.PI; max = Math.max(max, a); ok(Math.abs(Math.hypot(o.x, o.y, o.z) - 1) < 1e-9, 'unit'); }
  console.log('spreadDir max angle for 3deg cone', max.toFixed(2)); ok(max <= 3.01, 'cone bound');
}
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
