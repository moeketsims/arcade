// Item definitions: every weapon, melee, throwable and consumable in Storm Royale (all original names and stats).
import { RARITY, AMMO } from './config.js';

export const ITEMS = {};
export const ORDER = [];
function def(id, o) {
  const base = { id, type: 'gun', rar: [0, 4], w: 5, noise: 90, falloff: null, zoom: 1.25, scope: 0, recoil: [0.4, 0.25], head: 1.5, pellets: 1, spread: 1.2, ads: 0.4, bloom: 0.4, maxBloom: 3.5, move: 1, struct: 1, tracer: 0xffe6a0, range: 400, sound: 'rifle', burst: null, ai: { min: 0, max: 90, pref: 1 } };
  ITEMS[id] = { ...base, ...o }; ORDER.push(id);
}

// ---------------- assault rifles ----------------
def('striker', { name: 'Striker AR', cls: 'Assault Rifle', ammo: 'medium', dmg: 31, rate: 5.5, mag: 30, reload: 2.3, mode: 'auto', spread: 1.1, bloom: 0.42, maxBloom: 3.6, falloff: [45, 130, 0.62], zoom: 1.4, recoil: [0.5, 0.3], sound: 'rifle', noise: 105, model: 'ar', w: 12, ai: { min: 8, max: 85, pref: 1.0 } });
def('burst', { name: 'Burst AR', cls: 'Assault Rifle', ammo: 'medium', dmg: 36, rate: 1.9, mag: 30, reload: 2.2, mode: 'burst', burst: { n: 3, gap: 0.07 }, spread: 0.9, bloom: 0.6, maxBloom: 3.0, falloff: [50, 140, 0.62], zoom: 1.45, recoil: [0.45, 0.2], sound: 'rifle', noise: 105, model: 'burstar', w: 8, ai: { min: 10, max: 95, pref: 1.0 } });
def('heavyar', { name: 'Heavy AR', cls: 'Assault Rifle', ammo: 'heavy', dmg: 41, rate: 3.7, mag: 25, reload: 2.8, mode: 'auto', spread: 1.3, bloom: 0.6, maxBloom: 4.2, falloff: [60, 160, 0.66], zoom: 1.45, recoil: [0.75, 0.4], sound: 'lmg', noise: 115, model: 'heavyar', rar: [1, 4], w: 5, ai: { min: 10, max: 100, pref: 1.05 } });
def('scopedar', { name: 'Scoped AR', cls: 'Assault Rifle', ammo: 'medium', dmg: 34, rate: 4.0, mag: 20, reload: 2.5, mode: 'auto', spread: 0.8, bloom: 0.5, maxBloom: 3.0, falloff: [70, 170, 0.7], zoom: 2.6, scope: 1, recoil: [0.55, 0.25], sound: 'rifle', noise: 105, model: 'scopear', rar: [1, 4], w: 6, ai: { min: 20, max: 120, pref: 1.05 } });
// ---------------- SMGs ----------------
def('rapidsmg', { name: 'Rapid SMG', cls: 'SMG', ammo: 'light', dmg: 17, rate: 12, mag: 30, reload: 2.0, mode: 'auto', spread: 2.0, bloom: 0.3, maxBloom: 4.6, falloff: [18, 55, 0.5], zoom: 1.25, recoil: [0.32, 0.4], sound: 'smg', noise: 85, model: 'smgrapid', w: 10, ai: { min: 0, max: 35, pref: 0.95 } });
def('compactsmg', { name: 'Compact SMG', cls: 'SMG', ammo: 'light', dmg: 20, rate: 9, mag: 24, reload: 1.7, mode: 'auto', spread: 1.6, bloom: 0.34, maxBloom: 4.0, falloff: [22, 65, 0.52], zoom: 1.25, recoil: [0.34, 0.3], sound: 'smg', noise: 85, model: 'smgcompact', w: 8, ai: { min: 0, max: 40, pref: 0.95 } });
def('suppsmg', { name: 'Suppressed SMG', cls: 'SMG', ammo: 'light', dmg: 19, rate: 10, mag: 30, reload: 2.0, mode: 'auto', spread: 1.5, bloom: 0.3, maxBloom: 3.8, falloff: [25, 75, 0.55], zoom: 1.3, recoil: [0.3, 0.3], sound: 'suppressed', noise: 24, tracer: 0xb9f1ff, model: 'smgsupp', rar: [1, 4], w: 5, ai: { min: 0, max: 45, pref: 1.0 } });
// ---------------- shotguns ----------------
def('pump', { name: 'Pump Shotgun', cls: 'Shotgun', ammo: 'shells', dmg: 11, pellets: 10, rate: 0.75, mag: 5, reload: 3.4, reloadMode: 'shell', shell: 0.62, mode: 'semi', spread: 3.2, ads: 0.7, bloom: 1.2, maxBloom: 2.5, falloff: [7, 28, 0.22], zoom: 1.2, recoil: [3.0, 0.8], head: 1.4, sound: 'shotgun', noise: 120, struct: 0.7, model: 'pump', w: 10, ai: { min: 0, max: 16, pref: 1.2 } });
def('tactical', { name: 'Tactical Shotgun', cls: 'Shotgun', ammo: 'shells', dmg: 8, pellets: 8, rate: 2.3, mag: 8, reload: 4.2, reloadMode: 'shell', shell: 0.5, mode: 'semi', spread: 3.6, ads: 0.7, bloom: 1.0, maxBloom: 3.0, falloff: [6, 24, 0.2], zoom: 1.2, recoil: [1.8, 0.8], head: 1.4, sound: 'shotgun', noise: 115, struct: 0.7, model: 'tactical', w: 8, ai: { min: 0, max: 15, pref: 1.15 } });
def('heavysg', { name: 'Heavy Shotgun', cls: 'Shotgun', ammo: 'shells', dmg: 12.5, pellets: 12, rate: 0.9, mag: 3, reload: 3.0, reloadMode: 'shell', shell: 0.8, mode: 'semi', spread: 3.4, ads: 0.7, bloom: 1.5, maxBloom: 2.5, falloff: [8, 30, 0.22], zoom: 1.2, recoil: [3.6, 1.0], head: 1.4, sound: 'shotgun', noise: 125, struct: 0.7, model: 'heavysg', rar: [1, 4], w: 5, ai: { min: 0, max: 18, pref: 1.3 } });
def('doublebarrel', { name: 'Double Barrel', cls: 'Shotgun', ammo: 'shells', dmg: 10, pellets: 10, rate: 3.2, mag: 2, reload: 2.6, mode: 'semi', spread: 4.4, ads: 0.75, bloom: 0.8, maxBloom: 2.0, falloff: [6, 24, 0.2], zoom: 1.2, recoil: [2.8, 0.8], head: 1.4, sound: 'shotgun', noise: 120, struct: 0.7, model: 'dbl', w: 6, ai: { min: 0, max: 14, pref: 1.1 } });
// ---------------- pistols ----------------
def('sidearm', { name: 'Sidearm Pistol', cls: 'Pistol', ammo: 'light', dmg: 24, rate: 6.5, mag: 16, reload: 1.6, mode: 'semi', spread: 0.9, bloom: 0.55, maxBloom: 3.0, falloff: [22, 75, 0.55], head: 2.0, zoom: 1.25, recoil: [0.5, 0.2], sound: 'pistol', noise: 80, rar: [0, 3], model: 'pistol', w: 10, ai: { min: 0, max: 40, pref: 0.8 } });
def('handcannon', { name: 'Hand Cannon', cls: 'Pistol', ammo: 'medium', dmg: 66, rate: 1.9, mag: 7, reload: 2.3, mode: 'semi', spread: 0.8, bloom: 1.6, maxBloom: 4.0, falloff: [28, 90, 0.6], head: 2.0, zoom: 1.3, recoil: [2.6, 0.5], sound: 'pistol', noise: 95, rar: [2, 4], model: 'handcannon', w: 4, ai: { min: 0, max: 50, pref: 1.0 } });
def('revolver', { name: 'Revolver', cls: 'Pistol', ammo: 'medium', dmg: 54, rate: 2.0, mag: 6, reload: 3.0, mode: 'semi', spread: 0.7, bloom: 1.2, maxBloom: 3.6, falloff: [30, 95, 0.6], head: 2.1, zoom: 1.3, recoil: [2.0, 0.4], sound: 'pistol', noise: 95, rar: [0, 4], model: 'revolver', w: 6, ai: { min: 0, max: 50, pref: 0.95 } });
def('dualpistols', { name: 'Dual Pistols', cls: 'Pistol', ammo: 'light', dmg: 21, rate: 8, mag: 24, reload: 2.7, mode: 'semi', spread: 1.3, bloom: 0.5, maxBloom: 3.4, falloff: [20, 65, 0.5], head: 1.8, zoom: 1.2, recoil: [0.4, 0.5], sound: 'pistol', noise: 85, rar: [1, 4], model: 'dualpistol', dual: true, w: 4, ai: { min: 0, max: 35, pref: 0.95 } });
// ---------------- snipers (projectiles with drop) ----------------
def('bolt', { name: 'Bolt Sniper', cls: 'Sniper', ammo: 'heavy', dmg: 105, rate: 0.75, mag: 1, reload: 2.9, mode: 'semi', spread: 0.6, ads: 0.0, bloom: 1.0, maxBloom: 2.0, proj: { speed: 380, grav: 9.8, life: 2.2 }, head: 2.5, zoom: 6.0, scope: 2, recoil: [4.2, 0.6], sound: 'sniper', noise: 170, tracer: 0xfff3c0, rar: [1, 4], model: 'bolt', w: 5, ai: { min: 45, max: 200, pref: 1.1 } });
def('semisniper', { name: 'Semi-Auto Sniper', cls: 'Sniper', ammo: 'heavy', dmg: 64, rate: 1.7, mag: 10, reload: 3.1, mode: 'semi', spread: 0.6, ads: 0.0, bloom: 0.9, maxBloom: 2.4, proj: { speed: 330, grav: 9.8, life: 2.2 }, head: 2.3, zoom: 4.0, scope: 2, recoil: [2.4, 0.4], sound: 'sniper', noise: 165, tracer: 0xfff3c0, rar: [2, 4], model: 'semisniper', w: 4, ai: { min: 35, max: 180, pref: 1.1 } });
def('huntrifle', { name: 'Hunting Rifle', cls: 'Sniper', ammo: 'heavy', dmg: 92, rate: 1.0, mag: 5, reload: 3.2, mode: 'semi', spread: 0.7, ads: 0.15, bloom: 1.0, maxBloom: 2.4, proj: { speed: 340, grav: 9.8, life: 2.2 }, head: 2.3, zoom: 1.8, scope: 0, recoil: [3.2, 0.5], sound: 'sniper', noise: 160, tracer: 0xfff3c0, rar: [0, 4], model: 'huntrifle', w: 6, ai: { min: 30, max: 150, pref: 1.05 } });
// ---------------- heavy ----------------
def('rocket', { name: 'Rocket Launcher', cls: 'Heavy', ammo: 'rockets', dmg: 100, rate: 0.55, mag: 1, reload: 3.6, mode: 'semi', spread: 0.5, ads: 0.2, bloom: 0, maxBloom: 0, proj: { speed: 52, grav: 0.0, life: 6, explode: { r: 5.2, dmg: 100, self: 0.4, struct: 4.5, knock: 14 } }, head: 1, zoom: 1.35, recoil: [4.5, 0.8], sound: 'rocket', noise: 150, rar: [2, 4], model: 'rocket', w: 3, ai: { min: 12, max: 90, pref: 1.15 } });
def('grenadel', { name: 'Grenade Launcher', cls: 'Heavy', ammo: 'rockets', dmg: 70, rate: 1.6, mag: 6, reload: 4.2, mode: 'semi', spread: 0.8, ads: 0.3, bloom: 0, maxBloom: 0, proj: { speed: 60, grav: 10, life: 3.2, bounce: true, explode: { r: 4.4, dmg: 70, self: 0.4, struct: 2.4, knock: 9 } }, head: 1, zoom: 1.3, recoil: [2.4, 0.6], sound: 'rocket', noise: 130, rar: [2, 4], model: 'gl', w: 3, ai: { min: 8, max: 60, pref: 1.0 } });
def('minigun', { name: 'Minigun', cls: 'Heavy', ammo: 'medium', dmg: 17, rate: 15, mag: 90, reload: 5.0, mode: 'spin', spin: 0.85, spread: 2.6, bloom: 0.2, maxBloom: 4.6, falloff: [40, 110, 0.55], zoom: 1.2, move: 0.7, recoil: [0.25, 0.5], sound: 'minigun', noise: 135, rar: [2, 4], model: 'minigun', w: 2, ai: { min: 6, max: 70, pref: 1.15 } });
def('lmg', { name: 'LMG', cls: 'Light Machine Gun', ammo: 'medium', dmg: 24, rate: 8.5, mag: 75, reload: 4.6, mode: 'auto', spread: 1.5, bloom: 0.3, maxBloom: 4.0, falloff: [50, 140, 0.6], zoom: 1.35, recoil: [0.42, 0.35], sound: 'lmg', noise: 115, rar: [1, 4], model: 'lmg', w: 4, ai: { min: 10, max: 90, pref: 1.0 } });
// ---------------- bows ----------------
def('crossbow', { name: 'Crossbow', cls: 'Bow', ammo: 'arrows', dmg: 92, rate: 0.9, mag: 1, reload: 2.4, mode: 'semi', spread: 0.4, ads: 0.1, bloom: 0, maxBloom: 0, proj: { speed: 120, grav: 5.5, life: 3.5, arrow: true }, head: 2.0, zoom: 1.7, recoil: [1.0, 0.2], sound: 'bow', noise: 22, tracer: 0xcff7ff, model: 'crossbow', w: 4, ai: { min: 8, max: 80, pref: 0.95 } });
def('bow', { name: 'Bow', cls: 'Bow', ammo: 'arrows', dmg: 100, dmgMin: 38, rate: 1.4, mag: 1, reload: 0.5, mode: 'charge', charge: 0.85, spread: 0.3, ads: 0.1, bloom: 0, maxBloom: 0, proj: { speed: 105, speedMin: 48, grav: 7, life: 3.5, arrow: true }, head: 2.0, zoom: 1.6, recoil: [0.6, 0.1], sound: 'bow', noise: 18, tracer: 0xcff7ff, model: 'bow', w: 4, ai: { min: 8, max: 70, pref: 0.9 } });
// ---------------- melee & knives ----------------
def('pickaxe', { name: 'Harvest Pickaxe', cls: 'Melee', type: 'melee', dmg: 13, struct: 3.85, harvest: 1.55, rate: 1.7, reach: 3.0, arc: 70, sound: 'pickaxe', model: 'pickaxe', swing: 'overhead', w: 0, noise: 12, ai: { min: 0, max: 3, pref: 0.1 } });
def('knife', { name: 'Combat Knife', cls: 'Melee', type: 'melee', dmg: 36, struct: 0.6, harvest: 0, rate: 3.0, reach: 2.3, arc: 60, backstab: 2.0, sound: 'knife', model: 'knife', swing: 'slash', w: 6, noise: 10, ai: { min: 0, max: 2.6, pref: 0.35 } });
def('tknives', { name: 'Throwing Knives', cls: 'Throwing', type: 'throwknife', dmg: 55, head: 1.6, rate: 2.0, stack: 10, give: 5, proj: { speed: 34, grav: 8, life: 2.2 }, sound: 'knife', model: 'tknife', w: 4, rar: [1, 2], fixed: 1, noise: 10, ai: { min: 3, max: 30, pref: 0.55 } });
def('blade', { name: 'Energy Blade', cls: 'Melee', type: 'melee', dmg: 58, struct: 1.0, harvest: 0, rate: 1.9, reach: 2.9, arc: 85, dash: { dist: 8, dmg: 80, cd: 3.0 }, sound: 'knife', model: 'blade', swing: 'slash', rar: [2, 4], w: 3, noise: 14, ai: { min: 0, max: 3.2, pref: 0.55 } });
def('machete', { name: 'Machete', cls: 'Melee', type: 'melee', dmg: 48, struct: 0.8, harvest: 0, rate: 1.7, reach: 2.8, arc: 110, sound: 'knife', model: 'machete', swing: 'slash', w: 6, noise: 12, ai: { min: 0, max: 3.0, pref: 0.4 } });
// ---------------- throwables ----------------
def('frag', { name: 'Frag Grenade', cls: 'Throwable', type: 'throw', kind: 'frag', stack: 6, give: 2, fuse: 2.0, explode: { r: 4.6, dmg: 100, self: 0.5, struct: 2.6, knock: 8 }, speed: 17, rate: 1.0, rarity: 1, model: 'frag', w: 6, ai: { min: 6, max: 30, pref: 0.7 } });
def('impulse', { name: 'Impulse Grenade', cls: 'Throwable', type: 'throw', kind: 'impulse', stack: 6, give: 2, fuse: 1.3, explode: { r: 6.5, dmg: 8, self: 0, struct: 0.3, knock: 22 }, speed: 17, rate: 1.0, rarity: 2, model: 'impulse', w: 4, ai: { min: 3, max: 25, pref: 0.4 } });
def('smoke', { name: 'Smoke Grenade', cls: 'Throwable', type: 'throw', kind: 'smoke', stack: 4, give: 2, fuse: 1.1, smoke: { r: 7, time: 18 }, speed: 15, rate: 1.0, rarity: 0, model: 'smoke', w: 3, ai: { min: 3, max: 30, pref: 0.2 } });
// ---------------- consumables ----------------
def('bandage', { name: 'Bandages', cls: 'Heal', type: 'med', hp: 15, hpCap: 75, shield: 0, time: 2.4, stack: 15, give: 5, rarity: 0, model: 'bandage', w: 10 });
def('medkit', { name: 'Medkit', cls: 'Heal', type: 'med', hp: 100, hpCap: 100, shield: 0, time: 5.0, stack: 3, give: 1, rarity: 1, model: 'medkit', w: 4 });
def('smallshield', { name: 'Small Shield', cls: 'Shield', type: 'med', hp: 0, shield: 25, shieldCap: 50, time: 2.0, stack: 6, give: 2, rarity: 1, model: 'smallshield', w: 8 });
def('potion', { name: 'Shield Potion', cls: 'Shield', type: 'med', hp: 0, shield: 50, shieldCap: 100, time: 3.5, stack: 2, give: 1, rarity: 2, model: 'potion', w: 4 });

export const GUNS = ORDER.filter(i => ITEMS[i].type === 'gun');
export const MELEE = ORDER.filter(i => ITEMS[i].type === 'melee' && i !== 'pickaxe');
export const isStack = id => { const t = ITEMS[id].type; return t === 'med' || t === 'throw' || t === 'throwknife'; };
export const isWeapon = id => { const t = ITEMS[id].type; return t === 'gun' || t === 'melee'; };

/** Create an inventory item. mag = full magazine for guns; n = stack count. */
export function makeItem(id, rarity = 0, n = null) {
  const d = ITEMS[id]; if (!d) throw new Error('unknown item ' + id);
  const r = d.rarity !== undefined ? d.rarity : Math.max(d.rar ? d.rar[0] : 0, Math.min(d.rar ? d.rar[1] : 4, rarity));
  return { id, rarity: r, n: n ?? (isStack(id) ? d.give : 1), mag: d.type === 'gun' ? d.mag : 0 };
}
export const rarityOf = it => RARITY[it.rarity];
export const damageOf = (d, rarity) => d.dmg * RARITY[rarity].dmg;
export const reloadOf = (d, rarity) => d.reload * RARITY[rarity].reload;
export const itemName = it => ITEMS[it.id].name;
/** Rough desirability used by bots (and auto-swap): higher is better. */
export function scoreItem(it) {
  const d = ITEMS[it.id];
  if (d.type === 'gun') { const dps = d.dmg * (d.pellets || 1) * Math.min(d.rate, 8) * 0.35; return (30 + dps * 0.5) * (d.ai.pref || 1) * (1 + it.rarity * 0.2); }
  if (d.type === 'melee') return 8 + it.rarity * 3;
  if (d.type === 'throw' || d.type === 'throwknife') return 12;
  if (d.type === 'med') return d.id === 'medkit' ? 22 : d.id === 'potion' ? 24 : 18;
  return 1;
}
export function ammoFor(id) { return ITEMS[id].ammo || null; }
export { AMMO };
