// Frontline Ops: the whole arsenal and every tunable number (original designs, generic weapon types only).
// Pure data + a few pure helpers: safe to import in Node.
import { mulberry32, table, clamp } from './util.js';

// ---------------------------------------------------------------------------------------------------------------
// Recoil patterns: [pitch°, yaw°] kicked into the view for every shot. Learnable, not random: the recoil-control wall
// on the range lets you practise pulling against them. `loop` is the index the pattern repeats from.
// ---------------------------------------------------------------------------------------------------------------
function pattern(n, vert, horiz, seed, wave = 0.5, loop = 8) {
  const r = mulberry32(seed), out = [];
  for (let i = 0; i < n; i++) {
    const ramp = i < 5 ? 0.62 + i * 0.095 : 1;
    const p = vert * ramp * (0.9 + r() * 0.2);
    const y = Math.sin(i * wave + seed * 0.37) * horiz + (r() - 0.5) * horiz * 0.35;
    out.push([+p.toFixed(3), +y.toFixed(3)]);
  }
  out.loop = loop;
  return out;
}

const FALLBACK = {
  headMul: 2.0, limbMul: 0.8, pellets: 1, pelletSpread: 0, pen: 0.3, bolt: 0, burst: null, modes: ['auto', 'semi'],
  ads: 0.25, adsZoom: 1.3, hipSpread: 3.0, adsSpread: 0.12, moveSpread: 2.2, shotSpread: 0.3, spreadRecover: 9,
  speed: 1.0, sprintOut: 0.22, kick: 0.03, sway: 1.0, rumble: [0.2, 0.3, 40], snd: 'rifle', tracer: 0xffd27a,
  reserveMul: 1, shell: null, defaultOptic: 'iron', allow: {}, range: 1, flash: 1, kind: 'gun',
};

function W(o) {
  const d = { ...FALLBACK, ...o };
  d.recoil = { pat: o.recoil?.pat || pattern(30, 0.4, 0.14, 1), loop: o.recoil?.loop ?? o.recoil?.pat?.loop ?? 8, rand: o.recoil?.rand || [0.05, 0.05], recover: o.recoil?.recover ?? 7, max: o.recoil?.max ?? 14, delay: o.recoil?.delay ?? 0.09 };
  d.reload = o.reload || { tac: 2.2, empty: 2.9 };
  d.interval = 60 / d.rpm;
  return d;
}

// ---------------------------------------------------------------------------------------------------------------
// Guns
// ---------------------------------------------------------------------------------------------------------------
export const WEAPONS = {};
const add = (...defs) => { for (const d of defs) { const w = W(d); WEAPONS[w.id] = w; } };

add(
  // ---- Assault rifles ---------------------------------------------------------------------------------------
  { id: 'vanguard4', name: 'Vanguard 4', cls: 'Assault Rifle', slot: 'primary', model: 'ar', ammoType: '5.56',
    desc: 'Dependable all-rounder. Forgiving recoil, solid range.',
    dmg: [[0, 30], [25, 28], [50, 24], [80, 20]], rpm: 720, modes: ['auto', 'semi'], mag: 30, reserve: 150,
    reload: { tac: 2.2, empty: 2.9 }, ads: 0.24, adsZoom: 1.3, hipSpread: 3.4, adsSpread: 0.1, moveSpread: 2.4, shotSpread: 0.28, speed: 0.97, pen: 0.3,
    recoil: { pat: pattern(30, 0.42, 0.16, 11, 0.5, 10), recover: 8 }, kick: 0.028, snd: 'rifle', rumble: [0.18, 0.3, 40], look: { variant: 'std' } },
  { id: 'kestrel47', name: 'Kestrel 47', cls: 'Assault Rifle', slot: 'primary', model: 'ar', ammoType: '7.62',
    desc: 'Heavy hitter. Three-shot kills, strong kick you must pull against.',
    dmg: [[0, 37], [20, 34], [45, 28], [70, 24]], rpm: 600, modes: ['auto', 'semi'], mag: 30, reserve: 120,
    reload: { tac: 2.5, empty: 3.2 }, ads: 0.28, adsZoom: 1.3, hipSpread: 3.8, adsSpread: 0.14, moveSpread: 2.6, shotSpread: 0.4, speed: 0.93, pen: 0.4,
    recoil: { pat: pattern(30, 0.7, 0.22, 23, 0.42, 12), recover: 6.5 }, kick: 0.04, snd: 'rifle', rumble: [0.3, 0.5, 50], look: { variant: 'heavy' } },
  { id: 'ranger556', name: 'Ranger 556', cls: 'Assault Rifle', slot: 'primary', model: 'ar', ammoType: '5.56',
    desc: 'Burst or auto. Three-round bursts reward patient trigger control.',
    dmg: [[0, 30], [30, 29], [60, 25], [90, 22]], rpm: 640, modes: ['burst', 'auto', 'semi'], burst: { count: 3, rpm: 1050, gap: 0.14 },
    mag: 30, reserve: 150, reload: { tac: 2.1, empty: 2.8 }, ads: 0.25, adsZoom: 1.35, hipSpread: 3.2, adsSpread: 0.08, moveSpread: 2.3, shotSpread: 0.25, speed: 0.97, pen: 0.3,
    recoil: { pat: pattern(30, 0.36, 0.1, 37, 0.6, 9), recover: 9 }, kick: 0.026, snd: 'rifle', rumble: [0.16, 0.28, 40], look: { variant: 'carbine' } },
  { id: 'tempest', name: 'Tempest Bullpup', cls: 'Assault Rifle', slot: 'primary', model: 'bullpup', ammoType: '5.56',
    desc: 'Compact bullpup. Quick to aim, a little wild when hip-fired.',
    dmg: [[0, 27], [20, 26], [40, 22], [60, 18]], rpm: 760, modes: ['auto', 'semi'], mag: 30, reserve: 150,
    reload: { tac: 2.1, empty: 2.8 }, ads: 0.2, adsZoom: 1.3, hipSpread: 3.0, adsSpread: 0.14, moveSpread: 2.0, shotSpread: 0.3, speed: 1.0, pen: 0.28,
    recoil: { pat: pattern(30, 0.34, 0.2, 41, 0.7, 10), recover: 9 }, kick: 0.024, snd: 'rifle', rumble: [0.16, 0.26, 36], look: { variant: 'std' } },

  // ---- SMGs --------------------------------------------------------------------------------------------------
  { id: 'viper9', name: 'Viper 9', cls: 'SMG', slot: 'primary', model: 'smg', ammoType: '9mm',
    desc: 'Fast and light. Superb in corridors and around corners.',
    dmg: [[0, 25], [10, 24], [25, 18], [40, 14]], rpm: 900, modes: ['auto', 'semi'], mag: 32, reserve: 192,
    reload: { tac: 1.8, empty: 2.4 }, ads: 0.16, adsZoom: 1.2, hipSpread: 2.6, adsSpread: 0.12, moveSpread: 1.4, shotSpread: 0.22, speed: 1.07, pen: 0.2,
    recoil: { pat: pattern(32, 0.28, 0.16, 51, 0.5, 10), recover: 11 }, kick: 0.018, snd: 'smg', rumble: [0.14, 0.2, 30], look: { variant: 'std' } },
  { id: 'hornet', name: 'Hornet', cls: 'SMG', slot: 'primary', model: 'smg', ammoType: '9mm',
    desc: 'Absurd rate of fire. Melts at point-blank, runs dry in a blink.',
    dmg: [[0, 19], [8, 18], [20, 14], [35, 11]], rpm: 1250, modes: ['auto'], mag: 40, reserve: 200,
    reload: { tac: 2.2, empty: 2.9 }, ads: 0.17, adsZoom: 1.2, hipSpread: 3.2, adsSpread: 0.2, moveSpread: 1.6, shotSpread: 0.25, speed: 1.05, pen: 0.15,
    recoil: { pat: pattern(40, 0.24, 0.3, 61, 0.9, 12), recover: 12 }, kick: 0.016, snd: 'smg', rumble: [0.14, 0.18, 26], look: { variant: 'boxy' } },
  { id: 'wasp', name: 'Wasp PDW', cls: 'SMG', slot: 'primary', model: 'smg', ammoType: '5.7',
    desc: 'Personal defence weapon with surprising reach and calm recoil.',
    dmg: [[0, 25], [20, 24], [40, 20], [65, 16]], rpm: 800, modes: ['auto', 'semi'], mag: 25, reserve: 175,
    reload: { tac: 1.8, empty: 2.4 }, ads: 0.19, adsZoom: 1.25, hipSpread: 2.8, adsSpread: 0.1, moveSpread: 1.6, shotSpread: 0.2, speed: 1.04, pen: 0.3,
    recoil: { pat: pattern(25, 0.26, 0.1, 71, 0.5, 8), recover: 11 }, kick: 0.018, snd: 'smg', rumble: [0.14, 0.2, 30], look: { variant: 'pdw' } },

  // ---- LMGs --------------------------------------------------------------------------------------------------
  { id: 'bulwark60', name: 'Bulwark 60', cls: 'LMG', slot: 'primary', model: 'lmg', ammoType: '5.56',
    desc: 'Sixty rounds, steady beam. Heavy to swing and slow to reload.',
    dmg: [[0, 31], [30, 29], [60, 26], [100, 22]], rpm: 640, modes: ['auto', 'semi'], mag: 60, reserve: 240,
    reload: { tac: 4.6, empty: 5.4 }, ads: 0.38, adsZoom: 1.3, hipSpread: 4.2, adsSpread: 0.16, moveSpread: 3.0, shotSpread: 0.3, speed: 0.84, pen: 0.4,
    recoil: { pat: pattern(60, 0.36, 0.16, 81, 0.45, 14), recover: 6 }, kick: 0.036, sway: 1.5, snd: 'lmg', rumble: [0.3, 0.45, 50], look: { variant: 'std' } },
  { id: 'atlas', name: 'Atlas Belt-fed', cls: 'LMG', slot: 'primary', model: 'beltfed', ammoType: '7.62',
    desc: 'A hundred-round belt. Pins whole lanes down, but reloads forever.',
    dmg: [[0, 28], [35, 27], [70, 24], [110, 20]], rpm: 780, modes: ['auto'], mag: 100, reserve: 300,
    reload: { tac: 6.0, empty: 6.7 }, ads: 0.42, adsZoom: 1.3, hipSpread: 4.6, adsSpread: 0.2, moveSpread: 3.2, shotSpread: 0.34, speed: 0.78, pen: 0.45,
    recoil: { pat: pattern(100, 0.38, 0.2, 91, 0.4, 16), recover: 5.5 }, kick: 0.04, sway: 1.7, snd: 'lmg', rumble: [0.34, 0.5, 50], look: { variant: 'belt' } },

  // ---- Marksman rifles ---------------------------------------------------------------------------------------
  { id: 'longbow', name: 'Longbow DMR', cls: 'Marksman Rifle', slot: 'primary', model: 'dmr', ammoType: '7.62',
    desc: 'Semi-auto precision. Two chest hits at range, one to the head.',
    dmg: [[0, 55], [50, 52], [90, 50], [130, 46]], rpm: 340, modes: ['semi'], mag: 15, reserve: 75,
    reload: { tac: 2.4, empty: 3.1 }, ads: 0.27, adsZoom: 1.45, hipSpread: 4.4, adsSpread: 0.05, moveSpread: 2.8, shotSpread: 0.9, speed: 0.92, pen: 0.4,
    defaultOptic: 'dot', recoil: { pat: pattern(15, 0.85, 0.18, 101, 0.8, 4), recover: 7 }, kick: 0.045, snd: 'rifle', rumble: [0.3, 0.45, 50], look: { variant: 'std' } },
  { id: 'sentinel14', name: 'Sentinel 14', cls: 'Marksman Rifle', slot: 'primary', model: 'dmr', ammoType: '.308',
    desc: 'Battle rifle. Hits like a truck, kicks like a mule.',
    dmg: [[0, 70], [30, 66], [70, 56], [110, 50]], rpm: 280, modes: ['semi'], mag: 10, reserve: 60,
    reload: { tac: 2.7, empty: 3.4 }, ads: 0.3, adsZoom: 1.45, hipSpread: 4.8, adsSpread: 0.05, moveSpread: 3.0, shotSpread: 1.2, speed: 0.9, pen: 0.55,
    defaultOptic: 'dot', recoil: { pat: pattern(10, 1.35, 0.24, 111, 0.9, 3), recover: 6 }, kick: 0.06, snd: 'rifle', rumble: [0.4, 0.6, 60], look: { variant: 'wood' } },

  // ---- Snipers -----------------------------------------------------------------------------------------------
  { id: 'phantom50', name: 'Phantom .50', cls: 'Sniper Rifle', slot: 'primary', model: 'sniper', ammoType: '.50',
    desc: 'Bolt-action anti-material. One shot to the head or upper body at any range. Scope glints.',
    dmg: [[0, 115], [150, 115], [260, 110]], rpm: 52, modes: ['semi'], bolt: 1.15, mag: 5, reserve: 20, glint: true,
    reload: { tac: 3.4, empty: 3.9 }, ads: 0.46, adsZoom: 1.2, hipSpread: 7.5, adsSpread: 0.0, moveSpread: 5.0, shotSpread: 0, speed: 0.86, pen: 0.9,
    defaultOptic: 'x8', recoil: { pat: pattern(5, 3.2, 0.5, 121, 0.8, 1), recover: 4.5, max: 9 }, kick: 0.085, sway: 1.6, snd: 'sniper', tracer: 0xfff2c8, rumble: [0.5, 0.9, 90], look: { variant: 'heavy' } },
  { id: 'reconbolt', name: 'Recon Bolt', cls: 'Sniper Rifle', slot: 'primary', model: 'sniper', ammoType: '7.62',
    desc: 'Light bolt-action. Quick scope, one-shot kills inside 70 m.',
    dmg: [[0, 102], [70, 100], [120, 84], [180, 76]], rpm: 70, modes: ['semi'], bolt: 0.85, mag: 6, reserve: 30,
    reload: { tac: 2.8, empty: 3.3 }, ads: 0.32, adsZoom: 1.2, hipSpread: 6.5, adsSpread: 0.0, moveSpread: 4.0, shotSpread: 0, speed: 0.95, pen: 0.7,
    defaultOptic: 'x4', recoil: { pat: pattern(6, 2.4, 0.4, 131, 0.8, 1), recover: 5.5, max: 8 }, kick: 0.065, sway: 1.3, snd: 'sniper', tracer: 0xfff2c8, rumble: [0.4, 0.8, 80], look: { variant: 'light' } },

  // ---- Shotguns ----------------------------------------------------------------------------------------------
  { id: 'breacher12', name: 'Breacher 12', cls: 'Shotgun', slot: 'primary', model: 'pump', ammoType: '12 ga',
    desc: 'Pump-action. Devastating up close; rack it between shots.',
    dmg: [[0, 15], [8, 13], [14, 7], [22, 3]], pellets: 9, pelletSpread: 4.4, rpm: 75, modes: ['semi'], bolt: 0.62, mag: 6, reserve: 36,
    shell: { start: 0.45, per: 0.44, end: 0.4 }, ads: 0.27, adsZoom: 1.2, hipSpread: 2.2, adsSpread: 1.6, moveSpread: 1.4, shotSpread: 0, speed: 0.96, pen: 0.1,
    recoil: { pat: pattern(6, 2.6, 0.5, 141, 0.8, 1), recover: 6, max: 8 }, kick: 0.07, snd: 'shotgun', tracer: 0xffe1a0, rumble: [0.5, 0.8, 70], flash: 1.5, look: { variant: 'wood' } },
  { id: 'riotauto', name: 'Riot Auto', cls: 'Shotgun', slot: 'primary', model: 'autoshot', ammoType: '12 ga',
    desc: 'Semi-automatic combat shotgun. Faster follow-ups, shorter reach.',
    dmg: [[0, 10], [8, 9], [15, 5], [25, 2]], pellets: 8, pelletSpread: 6.2, rpm: 230, modes: ['semi'], mag: 8, reserve: 48,
    shell: { start: 0.4, per: 0.36, end: 0.35 }, ads: 0.26, adsZoom: 1.2, hipSpread: 2.4, adsSpread: 1.8, moveSpread: 1.5, shotSpread: 0, speed: 0.97, pen: 0.1,
    recoil: { pat: pattern(8, 1.7, 0.4, 151, 0.8, 2), recover: 7, max: 8 }, kick: 0.05, snd: 'shotgun', tracer: 0xffe1a0, rumble: [0.4, 0.65, 55], flash: 1.4, look: { variant: 'std' } },
  { id: 'doublebarrel', name: 'Double Barrel', cls: 'Shotgun', slot: 'primary', model: 'doublebarrel', ammoType: '12 ga',
    desc: 'Two barrels, two chances. Break-action reload.',
    dmg: [[0, 17], [8, 15], [16, 7], [28, 3]], pellets: 10, pelletSpread: 4.2, rpm: 210, modes: ['semi'], mag: 2, reserve: 24,
    reload: { tac: 2.3, empty: 2.3 }, ads: 0.24, adsZoom: 1.15, hipSpread: 2.0, adsSpread: 1.3, moveSpread: 1.3, shotSpread: 0, speed: 1.0, pen: 0.1,
    allow: { mag: ['std'] }, recoil: { pat: pattern(2, 3.0, 0.8, 161, 0.8, 1), recover: 6, max: 9 }, kick: 0.085, snd: 'shotgun', tracer: 0xffe1a0, rumble: [0.6, 0.9, 80], flash: 1.7, look: { variant: 'wood' } },

  // ---- Pistols -----------------------------------------------------------------------------------------------
  { id: 'sidewinder', name: 'Sidewinder .45', cls: 'Pistol', slot: 'secondary', model: 'pistol', ammoType: '.45',
    desc: 'Slow, heavy, accurate. Three hits for a kill.',
    dmg: [[0, 42], [15, 38], [30, 30], [50, 24]], rpm: 380, modes: ['semi'], mag: 10, reserve: 50,
    reload: { tac: 1.5, empty: 1.95 }, ads: 0.14, adsZoom: 1.12, hipSpread: 2.2, adsSpread: 0.08, moveSpread: 1.0, shotSpread: 0.5, speed: 1.02, pen: 0.2,
    allow: { stock: ['std'] }, recoil: { pat: pattern(10, 0.9, 0.2, 171, 0.8, 3), recover: 10 }, kick: 0.035, snd: 'pistol', rumble: [0.2, 0.35, 40], look: { variant: 'classic' } },
  { id: 'tactical9', name: 'Tactical 9', cls: 'Pistol', slot: 'secondary', model: 'pistol', ammoType: '9mm',
    desc: 'High-capacity sidearm with a tame kick.',
    dmg: [[0, 30], [15, 27], [30, 22], [45, 18]], rpm: 520, modes: ['semi'], mag: 15, reserve: 75,
    reload: { tac: 1.4, empty: 1.8 }, ads: 0.12, adsZoom: 1.12, hipSpread: 2.0, adsSpread: 0.07, moveSpread: 0.9, shotSpread: 0.35, speed: 1.03, pen: 0.2,
    allow: { stock: ['std'] }, recoil: { pat: pattern(15, 0.55, 0.14, 181, 0.8, 4), recover: 12 }, kick: 0.025, snd: 'pistol', rumble: [0.16, 0.28, 34], look: { variant: 'modern' } },
  { id: 'magnum', name: 'Magnum Revolver', cls: 'Pistol', slot: 'secondary', model: 'revolver', ammoType: '.357',
    desc: 'Six rounds of thunder. Two hits to the chest, one to the head.',
    dmg: [[0, 92], [20, 88], [40, 78], [60, 68]], rpm: 170, modes: ['semi'], mag: 6, reserve: 30,
    reload: { tac: 3.0, empty: 3.0 }, ads: 0.16, adsZoom: 1.15, hipSpread: 2.6, adsSpread: 0.05, moveSpread: 1.2, shotSpread: 0.7, speed: 1.0, pen: 0.5,
    allow: { stock: ['std'], mag: ['std'], muzzle: ['none', 'comp'], optic: ['iron', 'dot'] }, recoil: { pat: pattern(6, 2.6, 0.4, 191, 0.8, 1), recover: 6, max: 9 }, kick: 0.07, snd: 'sniper', tracer: 0xffe1a0, rumble: [0.5, 0.8, 80], flash: 1.5, look: { variant: 'std' } },
  { id: 'machinepistol', name: 'Machine Pistol', cls: 'Pistol', slot: 'secondary', model: 'pistol', ammoType: '9mm',
    desc: 'Fully automatic pocket rocket. Controllable only in bursts.',
    dmg: [[0, 20], [8, 19], [18, 14], [30, 10]], rpm: 1000, modes: ['auto', 'semi'], mag: 20, reserve: 100,
    reload: { tac: 1.6, empty: 2.1 }, ads: 0.13, adsZoom: 1.12, hipSpread: 3.0, adsSpread: 0.25, moveSpread: 1.2, shotSpread: 0.35, speed: 1.04, pen: 0.15,
    allow: { stock: ['std'] }, recoil: { pat: pattern(20, 0.34, 0.3, 201, 0.9, 6), recover: 12 }, kick: 0.02, snd: 'smg', rumble: [0.14, 0.2, 28], look: { variant: 'auto' } },

  // ---- Launchers ---------------------------------------------------------------------------------------------
  { id: 'ram', name: 'Ram Rocket Launcher', cls: 'Launcher', slot: 'secondary', model: 'rocket', ammoType: 'Rocket', kind: 'launcher',
    desc: 'Unguided rocket. Big splash; mind your own feet.',
    dmg: [[0, 220]], splash: { radius: 5.5, inner: 1.6, dmg: 200, min: 35 }, projSpeed: 42, rpm: 30, modes: ['semi'], mag: 1, reserve: 3,
    reload: { tac: 3.4, empty: 3.4 }, ads: 0.32, adsZoom: 1.25, hipSpread: 1.5, adsSpread: 0.2, moveSpread: 1.0, shotSpread: 0, speed: 0.82, pen: 0,
    allow: { optic: ['iron'], muzzle: ['none'], mag: ['std'], stock: ['std'] }, recoil: { pat: pattern(1, 3.6, 0.3, 211, 0.8, 0), recover: 5, max: 6 }, kick: 0.12, sway: 1.6, snd: 'rocket', rumble: [0.7, 1.0, 120], look: { variant: 'std' } },
  { id: 'skylock', name: 'Skylock', cls: 'Launcher', slot: 'secondary', model: 'skylock', ammoType: 'Missile', kind: 'launcher', lockOn: true,
    desc: 'Lock-on launcher for scorestreaks. Hold aim on a UAV, drone or sentry until it tones, then fire.',
    dmg: [[0, 160]], splash: { radius: 4.0, inner: 1.2, dmg: 150, min: 30 }, projSpeed: 52, homing: 6.5, rpm: 30, modes: ['semi'], mag: 1, reserve: 3, lockTime: 1.3, lockRange: 140,
    reload: { tac: 3.2, empty: 3.2 }, ads: 0.34, adsZoom: 1.3, hipSpread: 1.5, adsSpread: 0.2, moveSpread: 1.0, shotSpread: 0, speed: 0.84, pen: 0,
    allow: { optic: ['iron'], muzzle: ['none'], mag: ['std'], stock: ['std'] }, recoil: { pat: pattern(1, 2.8, 0.2, 221, 0.8, 0), recover: 5, max: 6 }, kick: 0.1, sway: 1.5, snd: 'rocket', rumble: [0.6, 0.9, 110], look: { variant: 'std' } },
);

export const PRIMARIES = Object.values(WEAPONS).filter(w => w.slot === 'primary');
export const SECONDARIES = Object.values(WEAPONS).filter(w => w.slot === 'secondary');
export const WEAPON_CLASSES = ['Assault Rifle', 'SMG', 'LMG', 'Marksman Rifle', 'Sniper Rifle', 'Shotgun', 'Pistol', 'Launcher'];

// ---------------------------------------------------------------------------------------------------------------
// Melee / knives
// ---------------------------------------------------------------------------------------------------------------
export const MELEE = {
  combat: { id: 'combat', name: 'Combat Knife', desc: 'Balanced fixed blade. Lunge for the one-hit kill.', reach: 2.2, lunge: 2.8, swing: 0.34, cool: 0.5, slash: 55, lunge_dmg: 100, speed: 1.0, snd: 'knife' },
  karambit: { id: 'karambit', name: 'Karambit', desc: 'Curved claw blade. Lightning-fast swipes.', reach: 2.0, lunge: 2.6, swing: 0.24, cool: 0.38, slash: 50, lunge_dmg: 100, speed: 1.06, snd: 'knife' },
  butterfly: { id: 'butterfly', name: 'Butterfly Knife', desc: 'Flip-open balisong. Flashy inspect, quick hands.', reach: 1.95, lunge: 2.5, swing: 0.26, cool: 0.4, slash: 45, lunge_dmg: 100, speed: 1.04, snd: 'knife' },
  machete: { id: 'machete', name: 'Machete', desc: 'Long chopping blade. Slow swing, huge reach.', reach: 2.6, lunge: 3.1, swing: 0.44, cool: 0.62, slash: 75, lunge_dmg: 100, speed: 0.98, snd: 'knife' },
  ballistic: { id: 'ballistic', name: 'Ballistic Knife', desc: 'Fires its blade once, then retrieve it. Handle stab as backup.', reach: 2.0, lunge: 2.5, swing: 0.34, cool: 0.5, slash: 40, lunge_dmg: 60, speed: 1.0, snd: 'knife', ranged: { speed: 62, dmg: 100, range: 70, gravity: 6 } },
};
export const MELEES = Object.values(MELEE);

// ---------------------------------------------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------------------------------------------
export const LETHALS = {
  frag: { id: 'frag', name: 'Frag Grenade', desc: 'Cook it to time the burst. Big radius.', count: 2, fuse: 3.6, radius: 5.5, dmg: 150, cook: true, kind: 'grenade', speed: 17 },
  sticky: { id: 'sticky', name: 'Sticky Grenade', desc: 'Adheres to walls, floors and robots.', count: 2, fuse: 2.2, radius: 4.5, dmg: 140, sticky: true, kind: 'grenade', speed: 17 },
  tknife: { id: 'tknife', name: 'Throwing Knife', desc: 'Silent one-hit kill. Pick it back up.', count: 3, dmg: 100, kind: 'knife', speed: 34, retrievable: true },
  mine: { id: 'mine', name: 'Proximity Mine', desc: 'Arms after a second. Detonates when enemies pass close.', count: 2, arm: 1.2, trigger: 2.5, radius: 4.5, dmg: 150, kind: 'mine', speed: 6 },
};
export const TACTICALS = {
  flash: { id: 'flash', name: 'Flashbang', desc: 'White-out and ringing for anyone looking at it.', count: 2, fuse: 1.5, radius: 28, kind: 'grenade', speed: 17 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', desc: 'Dense cloud that blocks sight for 14 s.', count: 2, fuse: 0.8, radius: 5.6, dur: 14, kind: 'grenade', speed: 17 },
  stun: { id: 'stun', name: 'Stun Grenade', desc: 'Slows and rattles everything in range.', count: 2, fuse: 1.3, radius: 13, dur: 4.5, kind: 'grenade', speed: 17 },
  sensor: { id: 'sensor', name: 'Heartbeat Sensor', desc: 'Pings moving robots within 32 m on your minimap for 25 s.', count: 2, dur: 25, radius: 32, kind: 'device' },
};
export const STREAKS = {
  uav: { id: 'uav', name: 'UAV', desc: 'Reveals every enemy on the minimap for 30 s.', cost: 4, dur: 30, color: '#6fe3ff' },
  airstrike: { id: 'airstrike', name: 'Precision Airstrike', desc: 'Mark a line on the ground; jets bomb it seconds later.', cost: 5, delay: 3.4, bombs: 8, spacing: 4.6, radius: 6.5, dmg: 220, color: '#ffb347' },
  sentry: { id: 'sentry', name: 'Sentry Gun', desc: 'Deploy an automated turret that guards a position for 60 s.', cost: 6, dur: 60, hp: 260, range: 48, dmg: 15, rpm: 560, color: '#8dff7a' },
  drone: { id: 'drone', name: 'Attack Drone', desc: 'A hunter drone circles overhead, strafing enemies for 45 s.', cost: 8, dur: 45, hp: 160, range: 46, dmg: 13, rpm: 420, color: '#ff7a8a' },
};
export const STREAK_LIST = Object.values(STREAKS);

// ---------------------------------------------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------------------------------------------
export const OPTICS = {
  iron: { id: 'iron', name: 'Iron Sights', desc: 'Standard sights, fast aim.', zoom: 0, ads: 0 },
  dot: { id: 'dot', name: 'Red Dot', desc: 'Clear dot reticle, slight zoom.', zoom: 1.45, ads: 0.012, reticle: 'dot' },
  holo: { id: 'holo', name: 'Holographic', desc: 'Wide ring reticle, bigger zoom.', zoom: 1.65, ads: 0.022, reticle: 'ring' },
  x4: { id: 'x4', name: '4x Scope', desc: 'Medium range magnification.', zoom: 3.6, ads: 0.06, reticle: 'x4', scope: 0.34 },
  x8: { id: 'x8', name: '8x Scope', desc: 'Long range. Narrow field of view.', zoom: 7.5, ads: 0.12, reticle: 'x8', scope: 0.24 },
};
export const MUZZLES = {
  none: { id: 'none', name: 'No Muzzle', desc: 'Stock muzzle.' },
  supp: { id: 'supp', name: 'Suppressor', desc: 'Quiet, no flash, hidden from the enemy radar. Shorter damage range.', suppressed: true, range: 0.9, ads: 0.01, flash: 0.1 },
  comp: { id: 'comp', name: 'Compensator', desc: 'Tames muzzle climb and sidewinding. Louder flash.', recoil: 0.8, recoilYaw: 0.7, ads: 0.01, flash: 1.5 },
};
export const MAGS = {
  std: { id: 'std', name: 'Standard Mag', desc: 'Factory magazine.' },
  ext: { id: 'ext', name: 'Extended Mag', desc: '+50% capacity. Slower reload and aim.', magMul: 1.5, magMin: 6, reload: 1.12, ads: 0.012, speed: -0.015 },
};
export const STOCKS = {
  std: { id: 'std', name: 'Standard Stock', desc: 'Best recoil control.' },
  light: { id: 'light', name: 'Light Stock', desc: 'Faster aim and movement; recoil bites harder.', ads: -0.045, speed: 0.03, recoil: 1.14, sway: 1.25, moveSpread: 0.85 },
};
export const SLOT_ATTS = { optic: OPTICS, muzzle: MUZZLES, mag: MAGS, stock: STOCKS };

export function allowedAtts(def, slot) {
  const all = Object.keys(SLOT_ATTS[slot]);
  const a = def.allow?.[slot];
  return a ? all.filter(k => a.includes(k)) : all;
}
export const defaultAtts = def => ({ optic: def.defaultOptic || 'iron', muzzle: 'none', mag: 'std', stock: 'std' });
export function sanitizeAtts(def, att) {
  att = att || {};
  const out = defaultAtts(def);
  for (const slot of Object.keys(SLOT_ATTS)) {
    const k = att[slot];
    if (k && SLOT_ATTS[slot][k] && allowedAtts(def, slot).includes(k)) out[slot] = k;
  }
  return out;
}

/** Apply attachments to a weapon definition and return a flattened stat block used at runtime. */
export function deriveWeapon(def, att) {
  const a = sanitizeAtts(def, att);
  const o = OPTICS[a.optic], mz = MUZZLES[a.muzzle], mg = MAGS[a.mag], st = STOCKS[a.stock];
  const s = Object.create(null);
  Object.assign(s, def);
  s.att = a;
  s.optic = a.optic;
  s.zoom = o.zoom || def.adsZoom;
  s.scope = o.scope || 0;
  s.reticle = o.reticle || null;
  s.ads = Math.max(0.08, def.ads + o.ads + (mz.ads || 0) + (mg.ads || 0) + (st.ads || 0));
  s.mag = mg.magMul ? Math.max(def.mag + (mg.magMin || 0), Math.round(def.mag * mg.magMul)) : def.mag;
  if (def.id === 'doublebarrel') s.mag = 2;
  s.reload = { tac: def.reload.tac * (mg.reload || 1), empty: def.reload.empty * (mg.reload || 1) };
  s.speed = def.speed + (mg.speed || 0) + (st.speed || 0);
  s.suppressed = !!mz.suppressed;
  s.rangeMul = (mz.range || 1);
  s.flash = def.flash * (mz.flash ?? 1);
  s.recoilMul = (mz.recoil || 1) * (st.recoil || 1);
  s.recoilYawMul = (mz.recoilYaw || 1) * (st.recoil || 1);
  s.swayMul = (st.sway || 1);
  s.moveSpread = def.moveSpread * (st.moveSpread || 1);
  s.snd = s.suppressed ? 'suppressed' : def.snd;
  return s;
}

/** Damage of one bullet/pellet at `dist` metres (before hit-zone multipliers). */
export function damageAt(s, dist) {
  return table(s.dmg, dist / (s.rangeMul || 1));
}

/** Normalised 0..1 bars for the loadout stat card. */
export function statBars(s) {
  const dps = (() => { const d = s.dmg[0][1] * (s.pellets > 1 ? s.pellets * 0.55 : 1); return d * (s.bolt ? 1 / s.bolt : s.rpm / 60); })();
  const dmgBar = clamp(s.dmg[0][1] * (s.pellets > 1 ? s.pellets * 0.45 : 1) / 120, 0.08, 1);
  const rateBar = clamp((s.bolt ? 60 / s.bolt / 1250 * 15 : s.rpm / 1250) * (s.rpm > 1000 ? 1 : 1.05), 0.06, 1);
  const rangeBar = clamp(s.dmg[s.dmg.length - 1][0] * (s.rangeMul || 1) / 150 + (s.dmg[s.dmg.length - 1][1] / Math.max(1, s.dmg[0][1])) * 0.25, 0.08, 1);
  const rec = s.recoil.pat.slice(0, 8).reduce((a, p) => a + Math.hypot(p[0], p[1]), 0) / Math.min(8, s.recoil.pat.length);
  const controlBar = clamp(1 - (rec * s.recoilMul) / 3.2, 0.1, 1);
  const accBar = clamp(1 - (s.hipSpread / 9) * 0.5 - (s.adsSpread / 2) * 0.25 - (s.pellets > 1 ? 0.1 : 0), 0.1, 1);
  const mobBar = clamp((s.speed - 0.7) / 0.45 * 0.7 + (0.4 - s.ads) / 0.4 * 0.3, 0.05, 1);
  return { Damage: dmgBar, 'Fire rate': rateBar, Range: rangeBar, Control: controlBar, Accuracy: accBar, Mobility: mobBar, dps };
}

// ---------------------------------------------------------------------------------------------------------------
// Modes and difficulty
// ---------------------------------------------------------------------------------------------------------------
export const MODES = {
  tdm: { id: 'tdm', name: 'Team Deathmatch', desc: 'You and five allies against six enemy robots. First to 40 kills or 8 minutes.', limit: 40, time: 480, allies: 5, enemies: 6 },
  ffa: { id: 'ffa', name: 'Free-for-All', desc: 'Every robot for itself: you against eight. First to 30 kills or 8 minutes.', limit: 30, time: 480, bots: 8 },
  range: { id: 'range', name: 'Firing Range', desc: 'Practise technique: pop-up and moving targets, a timed obstacle course and a recoil wall.' },
};

export const DIFFICULTY = {
  recruit: { id: 'recruit', name: 'Recruit', react: [0.9, 1.4], err: 4.6, dmg: 0.6, burst: [0.22, 0.55], pause: [0.6, 1.3], speed: 0.82, sight: 55, grenade: 0.25, aimLag: 5, head: 0.04 },
  regular: { id: 'regular', name: 'Regular', react: [0.5, 0.85], err: 2.6, dmg: 0.82, burst: [0.35, 0.9], pause: [0.35, 0.85], speed: 0.92, sight: 75, grenade: 0.6, aimLag: 8, head: 0.08 },
  veteran: { id: 'veteran', name: 'Veteran', react: [0.22, 0.5], err: 1.4, dmg: 1.0, burst: [0.5, 1.4], pause: [0.2, 0.55], speed: 1.0, sight: 95, grenade: 1.0, aimLag: 12, head: 0.16 },
};

export const BOT_NAMES = ['Rivet', 'Sprocket', 'Cog', 'Servo', 'Piston', 'Gizmo', 'Dynamo', 'Anvil', 'Bolt', 'Torque', 'Ratchet', 'Flux', 'Nova', 'Orbit', 'Static', 'Tinker'];

// ---------------------------------------------------------------------------------------------------------------
// Loadout
// ---------------------------------------------------------------------------------------------------------------
export const DEFAULT_LOADOUT = {
  primary: 'vanguard4', secondary: 'sidewinder', melee: 'combat', lethal: 'frag', tactical: 'flash',
  streaks: ['uav', 'airstrike', 'sentry'], att: {},
};

export function sanitizeLoadout(l = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_LOADOUT));
  if (WEAPONS[l.primary]?.slot === 'primary') out.primary = l.primary;
  if (WEAPONS[l.secondary]?.slot === 'secondary') out.secondary = l.secondary;
  if (MELEE[l.melee]) out.melee = l.melee;
  if (LETHALS[l.lethal]) out.lethal = l.lethal;
  if (TACTICALS[l.tactical]) out.tactical = l.tactical;
  if (Array.isArray(l.streaks)) {
    const s = l.streaks.filter(k => STREAKS[k]);
    for (let i = 0; i < 3; i++) out.streaks[i] = s[i] || out.streaks[i];
  }
  out.att = {};
  for (const id of Object.keys(WEAPONS)) out.att[id] = sanitizeAtts(WEAPONS[id], l.att?.[id]);
  return out;
}

export const LOADOUT_KEY = 'frontline-loadout-v1';
export const SETTINGS_KEY = 'frontline-settings-v1';
export const PROFILE_KEY = 'frontline-profile-v1';

export const DEFAULT_SETTINGS = { sensStick: 1.0, sensMouse: 1.0, invertY: false, aimAssist: true, fov: 80, difficulty: 'regular', rumble: true, volume: 0.7 };

/** Rank ladder (XP needed for each level). */
export function levelForXp(xp) {
  let lvl = 1, need = 1000, rem = xp;
  while (rem >= need && lvl < 99) { rem -= need; lvl++; need = 1000 + lvl * 150; }
  return { level: lvl, into: rem, need };
}
