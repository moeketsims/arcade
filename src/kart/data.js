// Dash Derby: racers, karts, tracks, cups, items and engine classes. Plain data, no rendering (the race simulation
// and the headless tests import this too). Every name, character, track and item is original to the Arcade.

// Stats run 1..5. speed = top speed, accel = acceleration, handling = steering, weight = who wins a bump,
// drift = how fast a drift charges its mini-turbo.
export const RACERS = [
  { id: 'bolt', name: 'Bolt', blurb: 'Starbolt\'s tiny robot, on loan from the mothership.', kind: 'robot', color: '#46f0ff', accent: '#f4f6fb', size: 'light', stats: { speed: 2, accel: 5, handling: 4, weight: 1, drift: 4 } },
  { id: 'mango', name: 'Mango', blurb: 'A fox who reads racing lines like bedtime stories.', kind: 'fox', color: '#ff8a2b', accent: '#fff3e0', size: 'medium', stats: { speed: 3, accel: 3, handling: 4, weight: 3, drift: 3 } },
  { id: 'brick', name: 'Brick', blurb: 'A rhino with a soft heart and a very hard bumper.', kind: 'rhino', color: '#8d99ae', accent: '#d8dee9', size: 'heavy', stats: { speed: 5, accel: 1, handling: 2, weight: 5, drift: 2 } },
  { id: 'juno', name: 'Juno', blurb: 'Cat astronaut. Landed, refuelled, entered.', kind: 'cat', color: '#c77dff', accent: '#ffffff', size: 'light', stats: { speed: 2, accel: 4, handling: 5, weight: 2, drift: 4 } },
  { id: 'rook', name: 'Rook', blurb: 'A crow who collects shiny trophies. And bumpers.', kind: 'crow', color: '#2b2d42', accent: '#ffd166', size: 'medium', stats: { speed: 4, accel: 3, handling: 3, weight: 3, drift: 3 } },
  { id: 'shelby', name: 'Shelby', blurb: 'A tortoise mechanic. Slow? Only on the way to the garage.', kind: 'tortoise', color: '#2a9d8f', accent: '#e9c46a', size: 'heavy', stats: { speed: 4, accel: 2, handling: 2, weight: 5, drift: 3 } },
  { id: 'kiki', name: 'Kiki', blurb: 'An axolotl who smiles all the way to the podium.', kind: 'axolotl', color: '#ff7eb6', accent: '#ffd6e8', size: 'light', stats: { speed: 2, accel: 5, handling: 3, weight: 1, drift: 5 } },
  { id: 'otto', name: 'Otto', blurb: 'River otter. Practises drifts on frozen ponds.', kind: 'otter', color: '#9c6644', accent: '#ede0d4', size: 'medium', stats: { speed: 3, accel: 3, handling: 3, weight: 3, drift: 4 } },
];

// Kart bodies add to the racer's stats (clamped to 1..6 when used).
export const KARTS = [
  { id: 'zipper', name: 'Zipper', blurb: 'Light frame, quick off the line.', mods: { speed: -1, accel: 1, handling: 1, weight: -1, drift: 0 } },
  { id: 'roadster', name: 'Roadster', blurb: 'Balanced all-rounder.', mods: { speed: 0, accel: 0, handling: 0, weight: 0, drift: 0 } },
  { id: 'bruiser', name: 'Bruiser', blurb: 'Big engine, big bumpers, wide turns.', mods: { speed: 1, accel: -1, handling: -1, weight: 1, drift: 0 } },
  { id: 'slider', name: 'Slider', blurb: 'Low and loose: built to drift.', mods: { speed: 0, accel: 0, handling: -1, weight: 0, drift: 2 } },
];

// Engine classes: top speed and CPU skill.
export const CLASSES = [
  { id: 'cruise', name: 'Cruise', cc: 'Easy', speed: 0.86, cpu: 0.80 },
  { id: 'swift', name: 'Swift', cc: 'Normal', speed: 1.0, cpu: 0.92 },
  { id: 'blaze', name: 'Blaze', cc: 'Hard', speed: 1.12, cpu: 1.0 },
];

// Tracks: a closed loop through control points [x, z, height]. Features are placed by fraction of the lap (0..1,
// 0 = start line). half = half the road width, shoulder = grass / sand beyond the road before the barrier.
// edge 'drop' sections have no barrier: drive off and the rescue drone puts you back.
export const TRACKS = [
  {
    id: 'meadow', name: 'Clover Meadows', theme: 'meadow', laps: 3, half: 8, shoulder: 9,
    blurb: 'Rolling hills, wide corners and a farm bridge. The perfect warm-up.',
    pts: [[0, 0, 0], [60, 0, 0], [110, 10, 2], [140, 50, 5], [130, 100, 6], [90, 120, 4], [60, 100, 2], [30, 110, 1], [0, 140, 0], [-50, 140, 0], [-90, 110, 1], [-100, 60, 2], [-80, 20, 1], [-40, 0, 0]],
    items: [0.17, 0.46, 0.74], boosts: [{ s: 0.62, lat: 0.45 }, { s: 0.93, lat: -0.4 }],
    ramps: [], gaps: [], ice: [], drops: [],
    movers: [{ kind: 'sheep', s: 0.33, amp: 0.7, speed: 0.7 }, { kind: 'sheep', s: 0.86, amp: 0.6, speed: 0.9 }],
  },
  {
    id: 'seaside', name: 'Coral Coast', theme: 'beach', laps: 3, half: 8, shoulder: 9,
    blurb: 'Sun, sand and a cliff-top jump over the bay. Watch for crabs.',
    pts: [[0, 0, 1], [80, 0, 1], [150, -10, 1], [200, -40, 2], [210, -100, 4], [170, -140, 6], [110, -130, 8], [70, -90, 8], [20, -110, 6], [-30, -150, 3], [-90, -140, 1], [-130, -90, 1], [-120, -30, 1], [-70, 0, 1]],
    items: [0.15, 0.42, 0.7], boosts: [{ s: 0.06, lat: 0 }, { s: 0.53, lat: -0.35 }, { s: 0.81, lat: 0.35 }],
    ramps: [{ s: 0.565, v: 9 }], gaps: [], ice: [], drops: [],
    movers: [{ kind: 'crab', s: 0.28, amp: 0.75, speed: 1.1 }, { kind: 'crab', s: 0.31, amp: 0.75, speed: 1.3, phase: 2 }, { kind: 'crab', s: 0.88, amp: 0.7, speed: 1.0 }],
  },
  {
    id: 'canyon', name: 'Redrock Canyon', theme: 'canyon', laps: 3, half: 7.5, shoulder: 8,
    blurb: 'Tight hairpins between towering mesas. Rolling boulders, no mercy.',
    pts: [[0, 0, 0], [90, 0, 0], [150, -20, 3], [170, -70, 6], [130, -100, 8], [60, -90, 9], [30, -130, 10], [60, -180, 9], [130, -190, 7], [190, -160, 5], [240, -190, 3], [250, -250, 2], [180, -280, 1], [60, -270, 0], [-40, -230, 0], [-70, -160, 0], [-60, -80, 0], [-40, -20, 0]],
    items: [0.12, 0.37, 0.63, 0.86], boosts: [{ s: 0.3, lat: 0 }, { s: 0.72, lat: -0.3 }],
    ramps: [], gaps: [], ice: [], drops: [],
    movers: [{ kind: 'boulder', s: 0.5, amp: 0.8, speed: 0.6 }, { kind: 'boulder', s: 0.78, amp: 0.75, speed: 0.75, phase: 1.5 }],
  },
  {
    id: 'frost', name: 'Frostbite Pass', theme: 'snow', laps: 3, half: 8, shoulder: 9,
    blurb: 'A mountain pass with a frozen lake. Ice is slippery: drift early.',
    pts: [[0, 0, 10], [70, 0, 12], [130, 20, 16], [170, 70, 20], [150, 130, 22], [90, 150, 20], [40, 120, 17], [-10, 150, 14], [-60, 190, 12], [-120, 170, 10], [-150, 110, 8], [-130, 50, 7], [-80, 40, 8], [-50, 0, 9]],
    items: [0.18, 0.47, 0.76], boosts: [{ s: 0.36, lat: 0.4 }, { s: 0.9, lat: 0 }],
    ramps: [], gaps: [], ice: [[0.53, 0.68]], drops: [],
    movers: [{ kind: 'snowball', s: 0.26, amp: 0.8, speed: 0.8 }, { kind: 'snowman', s: 0.6, amp: 0.55, speed: 0.5 }],
  },
  {
    id: 'neon', name: 'Neon Boulevard', theme: 'city', laps: 3, half: 7.5, shoulder: 6,
    blurb: 'Night streets, glowing towers and chicanes lined with boost strips.',
    pts: [[0, 0, 0], [100, 0, 0], [130, 20, 0], [130, 80, 0], [110, 100, 0], [60, 100, 0], [40, 120, 0], [40, 170, 0], [20, 190, 0], [-60, 190, 0], [-80, 170, 0], [-80, 120, 4], [-60, 90, 4], [-90, 60, 4], [-110, 30, 2], [-90, 0, 0], [-40, -10, 0]],
    items: [0.14, 0.4, 0.66, 0.88], boosts: [{ s: 0.08, lat: -0.4 }, { s: 0.08, lat: 0.4 }, { s: 0.48, lat: 0 }, { s: 0.72, lat: 0.3 }, { s: 0.95, lat: -0.3 }],
    ramps: [], gaps: [], ice: [], drops: [],
    movers: [{ kind: 'hovercar', s: 0.23, amp: 0.85, speed: 0.9 }, { kind: 'hovercar', s: 0.56, amp: 0.85, speed: 1.1, phase: 1 }, { kind: 'hovercar', s: 0.8, amp: 0.8, speed: 0.8, phase: 2.5 }],
  },
  {
    id: 'sky', name: 'Sky Garden', theme: 'sky', laps: 3, half: 7.5, shoulder: 5,
    blurb: 'Floating islands, no guard rails and a leap between gardens.',
    pts: [[0, 0, 30], [70, 0, 30], [130, -20, 34], [160, -70, 38], [140, -120, 40], [80, -130, 38], [40, -170, 36], [60, -220, 34], [120, -240, 32], [170, -210, 30], [220, -230, 28], [230, -290, 30], [170, -320, 32], [80, -310, 34], [0, -280, 32], [-50, -230, 30], [-60, -160, 30], [-50, -90, 30], [-30, -30, 30]],
    items: [0.1, 0.36, 0.6, 0.84], boosts: [{ s: 0.875, lat: 0 }, { s: 0.3, lat: 0.35 }],
    ramps: [{ s: 0.893, v: 9 }], gaps: [[0.897, 0.905]], ice: [], drops: [[0.2, 0.55], [0.6, 0.8]],
    movers: [{ kind: 'bumper', s: 0.45, amp: 0.7, speed: 0.9 }, { kind: 'bumper', s: 0.7, amp: 0.7, speed: 0.7, phase: 2 }],
  },
];

export const CUPS = [
  { id: 'sun', name: 'Sunburst Cup', color: '#ffd166', tracks: ['meadow', 'seaside', 'canyon'] },
  { id: 'star', name: 'Starlight Cup', color: '#7fb4ff', tracks: ['frost', 'neon', 'sky'] },
  { id: 'grand', name: 'Grand Tour', color: '#ff7eb6', tracks: ['meadow', 'seaside', 'canyon', 'frost', 'neon', 'sky'] },
];

export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

// Items. weights: [leader, middle of the pack, back of the pack]
export const ITEMS = {
  pepper: { name: 'Zip Pepper', uses: 1, desc: 'A burst of speed', weights: [10, 14, 14] },
  pepper3: { name: 'Triple Pepper', uses: 3, desc: 'Three bursts of speed', weights: [0, 8, 22] },
  puddle: { name: 'Goo Puddle', uses: 1, desc: 'Drop it behind you (hold up to toss it ahead)', weights: [36, 14, 2] },
  puck: { name: 'Bumper Puck', uses: 1, desc: 'Fires straight ahead and bounces off walls (hold down to fire back)', weights: [28, 20, 6] },
  puck3: { name: 'Triple Puck', uses: 3, desc: 'Three pucks', weights: [0, 10, 14] },
  shield: { name: 'Bubble Shield', uses: 1, desc: 'Blocks one hit for 10 seconds', weights: [26, 10, 4] },
  comet: { name: 'Seeker Comet', uses: 1, desc: 'Chases the racer one place ahead', weights: [0, 14, 18] },
  nova: { name: 'Nova Rush', uses: 1, desc: 'Six seconds of speed: bump anyone out of the way', weights: [0, 2, 14] },
  storm: { name: 'Static Storm', uses: 1, desc: 'Zaps every racer ahead of you', weights: [0, 1, 8] },
};

export const LAPS = 3;
export const N_RACERS = 8;
export const ordinal = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
export const fmtTime = t => { if (!isFinite(t)) return '--:--.---'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`; };

/** Combined stats for a racer in a kart, each 1..6. */
export function kartStats(racer, kart) {
  const r = typeof racer === 'string' ? RACERS.find(x => x.id === racer) : racer, k = typeof kart === 'string' ? KARTS.find(x => x.id === kart) : kart;
  const o = {}; for (const s of ['speed', 'accel', 'handling', 'weight', 'drift']) o[s] = Math.max(1, Math.min(6, r.stats[s] + (k?.mods[s] || 0)));
  return o;
}
