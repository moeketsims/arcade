// Sparkplug GP: racers, karts, tracks, cups, items and race rules. All names, characters and places are original.

// ---- racers ------------------------------------------------------------------------------------------------------
// weight: 0 light, 1 middle, 2 heavy. Stats are 1..5 and add to the kart's.
export const RACERS = [
  { id: 'juni', name: 'Juniper', kind: 'fox', weight: 0, color: '#ff7a2f', accent: '#fff3e0', bio: 'Quick-witted fox mechanic from Sunpetal.' },
  { id: 'kiko', name: 'Kiko', kind: 'frog', weight: 0, color: '#47c25a', accent: '#f5e663', bio: 'Leaps first, brakes never.' },
  { id: 'bolt', name: 'Bolt-E', kind: 'robot', weight: 1, color: '#9fb6d6', accent: '#46f0ff', bio: 'A delivery bot that took a wrong turn onto the track.' },
  { id: 'nova', name: 'Nova', kind: 'alien', weight: 1, color: '#b77dff', accent: '#ffe066', bio: 'Came for the stars, stayed for the drifting.' },
  { id: 'pip', name: 'Pip', kind: 'penguin', weight: 1, color: '#283a5c', accent: '#ffb02e', bio: 'Frostbyte champion, three years running.' },
  { id: 'momo', name: 'Momo', kind: 'panda', weight: 0, color: '#c4522a', accent: '#f4e3cf', bio: 'Red panda with a very red kart.' },
  { id: 'bruno', name: 'Bruno', kind: 'bear', weight: 2, color: '#8a5a35', accent: '#f0d2a8', bio: 'Gentle giant. Not so gentle in a corner.' },
  { id: 'rexa', name: 'Rexa', kind: 'dino', weight: 2, color: '#2fb3a0', accent: '#ffd23f', bio: 'Tiny arms, enormous top speed.' },
];
export const WEIGHT_STATS = [
  { speed: 2, accel: 4, handling: 4, weight: 1, name: 'Light' },
  { speed: 3, accel: 3, handling: 3, weight: 3, name: 'Middle' },
  { speed: 4, accel: 2, handling: 2, weight: 5, name: 'Heavy' },
];

// ---- karts -------------------------------------------------------------------------------------------------------
export const KARTS = [
  { id: 'buggy', name: 'Dune Buggy', speed: 0, accel: 1, handling: 1, weight: 0, offroad: 1, desc: 'Light and grippy, shrugs off grass.' },
  { id: 'rocket', name: 'Rocket Rod', speed: 1, accel: -1, handling: 0, weight: 1, offroad: 0, desc: 'Top speed above all else.' },
  { id: 'scoot', name: 'Zip Scooter', speed: -1, accel: 1, handling: 2, weight: -1, offroad: 0, desc: 'Turns on a coin, charges drifts fast.' },
  { id: 'brick', name: 'Brickhauler', speed: 1, accel: 0, handling: -1, weight: 2, offroad: 0, desc: 'Heavy, stable and hard to push around.' },
];

/** Combined 1..6 stats for a racer + kart. */
export function kartStats(racer, kart) {
  const w = WEIGHT_STATS[racer.weight], c = v => Math.max(1, Math.min(6, v));
  return { speed: c(w.speed + kart.speed), accel: c(w.accel + kart.accel), handling: c(w.handling + kart.handling), weight: c(w.weight + kart.weight), offroad: kart.offroad };
}

// ---- engine classes ------------------------------------------------------------------------------------------------
export const CLASSES = [
  { id: 'rookie', name: 'Rookie', cc: '50 cc', speed: 0.84, ai: 0.82, desc: 'Gentle speed, relaxed rivals.' },
  { id: 'pro', name: 'Pro', cc: '100 cc', speed: 1.0, ai: 0.94, desc: 'The full race.' },
  { id: 'legend', name: 'Legend', cc: '150 cc', speed: 1.14, ai: 1.02, desc: 'Fast and fierce. Drift or be passed.' },
];

// ---- tracks --------------------------------------------------------------------------------------------------------
// points: [x, z, y, width] control points (metres) of a closed loop, start line at the first point heading to the
// second. Features use fractions of the lap (0..1): boxes [f, count], pads [f, lateral offset, length],
// ramps [f, power], voids [from, to] (no barrier: you can fall off), ice [from, to].
export const TRACKS = [
  {
    id: 'meadow', name: 'Sunpetal Meadow', theme: 'meadow', laps: 3, music: 0, shoulder: 8,
    blurb: 'Rolling flower fields and a lazy windmill. A gentle warm-up with wide bends.',
    points: [[0, 0, 0, 20], [110, 0, 0, 20], [190, 25, 1, 20], [225, 95, 3, 20], [200, 170, 4, 20], [130, 200, 3, 20], [70, 170, 2, 19],
      [10, 195, 2, 19], [-70, 200, 1, 20], [-140, 160, 0, 20], [-160, 80, 0, 20], [-110, 15, 0, 20]],
    boxes: [[0.12, 5], [0.47, 5], [0.78, 5]], pads: [[0.3, 0], [0.64, 4], [0.92, -4]], ramps: [],
  },
  {
    id: 'pier', name: 'Saltspray Pier', theme: 'beach', laps: 3, music: 1, shoulder: 6,
    blurb: 'Boardwalk sprints over the bay, sand traps and a lighthouse hairpin.',
    points: [[0, 0, 0, 18], [130, 0, 0, 18], [200, -30, 0, 17], [230, -100, 0, 17], [190, -160, 0, 16], [120, -150, 0, 16], [70, -190, 0, 16],
      [80, -260, 1, 17], [20, -310, 2, 18], [-80, -300, 2, 18], [-140, -240, 1, 17], [-130, -160, 0, 16], [-170, -90, 0, 17], [-120, -20, 0, 18]],
    boxes: [[0.1, 5], [0.42, 4], [0.7, 5]], pads: [[0.2, 0], [0.56, 0], [0.86, 3]], ramps: [[0.62, 0.8]],
  },
  {
    id: 'canyon', name: 'Cinder Canyon', theme: 'canyon', laps: 3, music: 2, shoulder: 6,
    blurb: 'Climb the red rock, fly the gap, drift the switchbacks down.',
    points: [[0, 0, 0, 18], [120, 0, 0, 18], [200, -10, 4, 18], [260, -70, 10, 17], [250, -150, 14, 16], [180, -190, 12, 16], [100, -160, 8, 17],
      [40, -200, 6, 17], [-40, -240, 10, 17], [-130, -220, 14, 18], [-180, -150, 10, 18], [-170, -60, 4, 18], [-100, -10, 0, 18]],
    boxes: [[0.14, 5], [0.45, 4], [0.76, 5]], pads: [[0.24, 0], [0.9, 0]], ramps: [[0.34, 1.1], [0.62, 1]],
  },
  {
    id: 'frost', name: 'Frostbyte Peaks', theme: 'snow', laps: 3, music: 3, shoulder: 6,
    blurb: 'Icy hairpins up the mountain. Lift early, drift late.',
    points: [[0, 0, 0, 18], [100, 0, 2, 18], [170, -40, 6, 17], [160, -110, 10, 16], [90, -120, 12, 16], [60, -170, 14, 16], [110, -230, 16, 16],
      [200, -240, 18, 17], [240, -310, 20, 17], [170, -370, 22, 17], [60, -360, 20, 16], [-30, -320, 16, 16], [-50, -240, 12, 16], [-120, -200, 8, 17],
      [-150, -110, 4, 18], [-100, -30, 1, 18]],
    boxes: [[0.1, 5], [0.4, 4], [0.68, 4], [0.9, 5]], pads: [[0.5, 0], [0.8, 0]], ramps: [[0.58, 0.9]], ice: [[0.3, 0.46]],
  },
  {
    id: 'neon', name: 'Neon Nightway', theme: 'city', laps: 3, music: 4, shoulder: 5,
    blurb: 'Downtown after dark: chicanes, glowing barriers and boost lanes.',
    points: [[0, 0, 0, 17], [120, 0, 0, 17], [165, -25, 0, 16], [175, -90, 0, 16], [220, -125, 0, 16], [280, -105, 0, 16], [300, -40, 0, 16],
      [290, 40, 0, 16], [230, 80, 0, 16], [150, 70, 0, 16], [105, 110, 0, 16], [60, 150, 0, 16], [-20, 145, 0, 16], [-65, 95, 0, 16],
      [-115, 70, 0, 16], [-135, 20, 0, 17], [-80, -5, 0, 17]],
    boxes: [[0.12, 4], [0.4, 4], [0.66, 4], [0.88, 4]], pads: [[0.06, 3], [0.33, -3], [0.55, 0], [0.75, 3]], ramps: [],
  },
  {
    id: 'sky', name: 'Starlight Skyway', theme: 'sky', laps: 3, music: 5, shoulder: 4,
    blurb: 'A ribbon of light above the clouds. Some edges have no rails.',
    points: [[0, 0, 30, 18], [130, 0, 30, 18], [210, -50, 36, 16], [230, -140, 44, 16], [170, -210, 50, 16], [80, -200, 46, 16], [20, -250, 40, 16],
      [-60, -290, 46, 16], [-160, -260, 54, 16], [-200, -170, 48, 16], [-150, -90, 38, 17], [-170, -20, 32, 17], [-100, 20, 30, 18]],
    boxes: [[0.1, 5], [0.38, 4], [0.66, 4], [0.88, 5]], pads: [[0.2, 0], [0.5, 0], [0.75, 0]], ramps: [[0.45, 1.1]],
    voids: [[0.22, 0.36], [0.52, 0.62], [0.78, 0.86]],
  },
];

export const CUPS = [
  { id: 'petal', name: 'Petal Cup', tracks: [0, 1, 2], color: '#ff9ec7' },
  { id: 'comet', name: 'Comet Cup', tracks: [3, 4, 5], color: '#7fd3ff' },
  { id: 'grand', name: 'Grand Cup', tracks: [0, 1, 2, 3, 4, 5], color: '#ffd23f' },
];
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

// ---- items ---------------------------------------------------------------------------------------------------------
export const ITEMS = {
  turbo: { name: 'Turbo Can', desc: 'A burst of speed.', icon: '🥫' },
  turbo3: { name: 'Triple Turbo', desc: 'Three bursts of speed.', icon: '🥫' },
  goo: { name: 'Goo Blob', desc: 'Drop it behind you (or throw it ahead). Spins out whoever hits it.', icon: '🟢' },
  puck: { name: 'Bounce Puck', desc: 'Fires straight and bounces off barriers.', icon: '🥏' },
  wasp: { name: 'Seeker Wasp', desc: 'Hunts down the racer in front of you.', icon: '🐝' },
  decoy: { name: 'Decoy Crystal', desc: 'Looks like an item crystal. It is not.', icon: '💎' },
  shield: { name: 'Prism Shield', desc: 'Invincible and faster for a few seconds. Bump rivals aside.', icon: '🔷' },
  thunder: { name: 'Thunderhead', desc: 'A storm zaps every racer ahead of you.', icon: '⛈️' },
};
// chance weights by place group: [leaders (1-2), mid-front (3-4), mid-back (5-6), back (7-8)]
export const ITEM_ODDS = {
  goo: [30, 18, 8, 2], puck: [26, 24, 14, 6], decoy: [16, 8, 2, 0], turbo: [14, 16, 18, 14], turbo3: [0, 8, 18, 22],
  wasp: [0, 12, 18, 18], shield: [0, 2, 12, 20], thunder: [0, 0, 4, 12],
};

export const RACE = { karts: 8, laps: 3, countdown: 3 };
