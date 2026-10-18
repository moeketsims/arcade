// Shared constants for Storm Royale.
export const GRID = 4;          // build grid cell (m)
export const STORY = 3;         // wall height / level height (m)
export const SEA = 0;           // sea level (y)

export const RARITY = [
  { id: 'common', name: 'Common', css: '#b8bcc4', color: 0xb8bcc4, dmg: 1.0, reload: 1.0 },
  { id: 'uncommon', name: 'Uncommon', css: '#4cd94c', color: 0x4cd94c, dmg: 1.07, reload: 0.97 },
  { id: 'rare', name: 'Rare', css: '#3aa0ff', color: 0x3aa0ff, dmg: 1.14, reload: 0.94 },
  { id: 'epic', name: 'Epic', css: '#b655ff', color: 0xb655ff, dmg: 1.21, reload: 0.91 },
  { id: 'legendary', name: 'Legendary', css: '#ffc02e', color: 0xffc02e, dmg: 1.29, reload: 0.88 },
];

export const AMMO = {
  light: { name: 'Light', css: '#f5d76e', color: 0xf5d76e, cap: 250, pack: 30 },
  medium: { name: 'Medium', css: '#7bd16a', color: 0x7bd16a, cap: 220, pack: 30 },
  heavy: { name: 'Heavy', css: '#ff8a5c', color: 0xff8a5c, cap: 60, pack: 8 },
  shells: { name: 'Shells', css: '#ff5d5d', color: 0xff5d5d, cap: 50, pack: 8 },
  rockets: { name: 'Rockets', css: '#c9a7ff', color: 0xc9a7ff, cap: 12, pack: 2 },
  arrows: { name: 'Arrows', css: '#9fe8e0', color: 0x9fe8e0, cap: 30, pack: 8 },
};
export const AMMO_TYPES = Object.keys(AMMO);

// build materials: hp per piece, seconds to finish building
export const MATS = [
  { id: 'wood', name: 'Wood', css: '#c99a5b', color: 0xb9895b, hp: 150, time: 0.30 },
  { id: 'stone', name: 'Stone', css: '#b9c0c9', color: 0x9aa3ad, hp: 300, time: 0.55 },
  { id: 'metal', name: 'Metal', css: '#7fb6ff', color: 0x7a93b3, hp: 450, time: 0.90 },
];
export const BUILD_COST = 10;

// character body
export const BODY = {
  radius: 0.4, height: 1.8, crouchHeight: 1.25, eye: 1.62, crouchEye: 1.1, step: 0.55,
  gravity: 24, jump: 8.2, walk: 5.4, sprint: 8.2, crouch: 2.8, swimMul: 0.55,
};

export const MAX_HP = 100, MAX_SHIELD = 100;
export const CAMERA_FOV = 58;

// island layout lives in terrain.js; world extents:
export const WORLD_HALF = 320;
