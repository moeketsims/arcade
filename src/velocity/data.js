// Velocity Divide: cast, missions, story and ranks. Every name, character and place here is original to this game.
export const SIDES = {
  dawn: { name: 'Dawnline Couriers', tag: 'Hero' },
  umbra: { name: 'Umbra Circuit', tag: 'Villain' },
};
const RUN = { r: 0.45, h: 1.5, hearts: 3, air: 0.7, brake: 40, bleed: 6, turn: 3.6, lock: 13, homing: 38, airDash: 24 };
const SEEK = { r: 0.5, h: 1.4, hearts: 4, air: 0.85, brake: 50, airJumps: 1, scanTime: 4 };
const MECH = { r: 0.8, h: 2.0, air: 0.6, brake: 45, lockRate: 0.11 };

export const CHARS = [
  { id: 'kite', name: 'Kite Rennow', side: 'dawn', role: 'runner', title: 'Speed runner', mission: 'd1', colors: ['#2f9bff', '#ffd23f', '#f5f7ff'],
    blurb: 'The fastest courier on the Dawnline. Quick off the mark and easy to steer in the air.',
    moves: [['A', 'Jump. In the air: homing dash at the marked target, or an air dash'], ['B', 'Hold to tuck and roll through drones. In the air: dive'], ['L1', 'Burst of speed (either shoulder button)'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / homing dash'], ['B', 'Roll / dive'], ['L1', 'Burst']], touch: { A: 'JUMP', B: 'ROLL', X: 'ROLL', L1: 'BURST', R1: 'BURST', Y: 'CAM' },
    stats: { ...RUN, top: 20, accel: 36, jumpH: 3.4, burst: 30 } },
  { id: 'mossa', name: 'Mossa Tell', side: 'dawn', role: 'seeker', title: 'Treasure seeker', mission: 'd2', colors: ['#3fbf7f', '#ffb347', '#fff4d6'],
    blurb: 'A cartographer who hears Core shards hum. Slow, patient glide and a careful dig.',
    moves: [['A', 'Jump, double jump. Hold while falling to glide'], ['B', 'Dig where the signal peaks, or punch. In the air: drill dive'], ['L1', 'Scan: an arrow points at the nearest shard'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / hold: glide'], ['B', 'Dig / punch'], ['L1', 'Scan']], touch: { A: 'JUMP', B: 'DIG', X: 'DIG', L1: 'SCAN', R1: 'SCAN', Y: 'CAM' },
    stats: { ...SEEK, top: 11, accel: 60, jumpH: 3.0, jump2: 2.25, glideFall: 2.4, glideSpeed: 12, digTime: 0.6, scanCd: 6 } },
  { id: 'pallet', name: 'Pallet', side: 'dawn', role: 'mech', title: 'Mech walker', mission: 'd3', colors: ['#f2a23a', '#5fe3ff', '#e8ecf5'],
    blurb: 'A cargo walker that volunteered. Thick plating, long hover, five spark lobbers.',
    moves: [['A', 'Jump. Hold in the air to hover'], ['B', 'Hold to lock on to up to 5 targets, let go to fire. Tap for one bolt'], ['L1', 'Thruster dash: a quick dodge that shrugs off hits'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / hold: hover'], ['B', 'Hold: lock, release: fire'], ['L1', 'Dash']], touch: { A: 'JUMP', B: 'FIRE', X: 'FIRE', L1: 'DASH', R1: 'DASH', Y: 'CAM' },
    stats: { ...MECH, hearts: 7, top: 9, accel: 45, jumpH: 2.6, hover: 1.8, locks: 5, lockRange: 30, dash: 20 } },
  { id: 'vesper', name: 'Vesper Null', side: 'umbra', role: 'runner', title: 'Speed runner', mission: 'u1', colors: ['#5b2ea8', '#ff5fd0', '#1c1730'],
    blurb: 'Leader of the Umbra Circuit. A higher top speed than anyone, and wider turns to match.',
    moves: [['A', 'Jump. In the air: homing dash at the marked target, or an air dash'], ['B', 'Hold to tuck and roll through drones. In the air: dive'], ['L1', 'Burst of speed (either shoulder button)'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / homing dash'], ['B', 'Roll / dive'], ['L1', 'Burst']], touch: { A: 'JUMP', B: 'ROLL', X: 'ROLL', L1: 'BURST', R1: 'BURST', Y: 'CAM' },
    stats: { ...RUN, top: 22, accel: 32, jumpH: 3.2, burst: 33, turn: 3.2 } },
  { id: 'quill', name: 'Quill Sable', side: 'umbra', role: 'seeker', title: 'Treasure seeker', mission: 'u2', colors: ['#7a4fd0', '#9ff5ff', '#2a2440'],
    blurb: 'An archivist who takes what the Span forgot. Higher second jump, faster dig and scan, shorter glide.',
    moves: [['A', 'Jump, high double jump. Hold while falling to glide'], ['B', 'Dig where the signal peaks, or punch. In the air: drill dive'], ['L1', 'Scan: an arrow points at the nearest shard'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / hold: glide'], ['B', 'Dig / punch'], ['L1', 'Scan']], touch: { A: 'JUMP', B: 'DIG', X: 'DIG', L1: 'SCAN', R1: 'SCAN', Y: 'CAM' },
    stats: { ...SEEK, top: 12, accel: 60, jumpH: 3.0, jump2: 2.8, glideFall: 3.4, glideSpeed: 14, digTime: 0.4, scanCd: 4 } },
  { id: 'ogre', name: 'Ogre-9', side: 'umbra', role: 'mech', title: 'Mech walker', mission: 'u3', colors: ['#8a2f4a', '#ff9d3c', '#2b2230'],
    blurb: 'The Circuit\'s grudge engine. Faster, eight locks at once, thinner plating and a short hover.',
    moves: [['A', 'Jump. Hold in the air to hover'], ['B', 'Hold to lock on to up to 8 targets, let go to fire. Tap for one bolt'], ['L1', 'Thruster dash: a quick dodge that shrugs off hits'], ['Y', 'Camera behind you']],
    hint: [['A', 'Jump / hold: hover'], ['B', 'Hold: lock, release: fire'], ['L1', 'Dash']], touch: { A: 'JUMP', B: 'FIRE', X: 'FIRE', L1: 'DASH', R1: 'DASH', Y: 'CAM' },
    stats: { ...MECH, hearts: 5, top: 10.5, accel: 45, jumpH: 2.6, hover: 1.2, locks: 8, lockRange: 32, dash: 22 } },
];

export const MISSIONS = [
  { id: 'd1', side: 'dawn', char: 'kite', stage: 'causeway', kind: 'run', name: 'Sunspire Causeway', par: 60,
    brief: 'The Meridian Core has split, and half its light fell into the under-city. Kite has one job: get the alarm to the relay ring before the Span goes dark.', outro: 'The relay rings out. Every courier on the Dawnline knows now: the Core must be made whole.' },
  { id: 'd2', side: 'dawn', char: 'mossa', stage: 'terraces', kind: 'seek', name: 'Lantern Terraces', par: 150,
    brief: 'Three Core shards landed in the old terrace gardens. Mossa can hear them hum. Follow the signal, dig where it peaks, and mind the moat.', outro: 'Three shards, still warm. Mossa wraps them in a map and runs.' },
  { id: 'd3', side: 'dawn', char: 'pallet', stage: 'kiln', kind: 'mech', name: 'Kiln Yard', par: 170,
    brief: 'The Umbra Circuit has sealed the Kiln Yard lift with its drones. Pallet was built to carry crates. Today it carries the day.', outro: 'The lift is open. Above it, the Circuit\'s storm machine is already turning.' },
  { id: 'd4', side: 'dawn', char: null, stage: 'gyre', kind: 'boss', name: 'Finale: The Gyre Engine', par: 100, needs: ['d1', 'd2', 'd3'], ending: 'dawn',
    brief: 'Vesper\'s Gyre Engine is pulling the fallen light downward for good. Wait out its storm, then strike when the shield drops.', outro: 'The Gyre winds down.' },
  { id: 'u1', side: 'umbra', char: 'vesper', stage: 'viaduct', kind: 'run', name: 'Blackglass Viaduct', par: 65,
    brief: 'For a generation the under-city has lived on the Span\'s leftovers. Tonight half the Core fell into its lap. Vesper means to reach it before the couriers do.', outro: 'Vesper stands in the fallen light. For once, the under-city can see its own streets.' },
  { id: 'u2', side: 'umbra', char: 'quill', stage: 'archive', kind: 'seek', name: 'Hollow Archive', par: 150,
    brief: 'The shards that hold the fallen half together are scattered through the Hollow Archive. Quill knows every shelf. Find three before the Span\'s sentries do.', outro: 'Quill pockets the last shard. "Filed," she says, "under ours."' },
  { id: 'u3', side: 'umbra', char: 'ogre', stage: 'cinder', kind: 'mech', name: 'Cinder Works', par: 180,
    brief: 'The Span has locked the Cinder Works to starve the Gyre of power. Ogre-9 has been asked, politely, to unlock it.', outro: 'The Works roar back to life. Up on the Span, something very large has noticed.' },
  { id: 'u4', side: 'umbra', char: null, stage: 'bastion', kind: 'boss', name: 'Finale: Bastion Lumen', par: 100, needs: ['u1', 'u2', 'u3'], ending: 'umbra',
    brief: 'Bastion Lumen, the Span\'s sentinel, has come down to take the light back. Dodge its rings, clear its escorts, and hit it while it recharges.', outro: 'The sentinel folds its wings.' },
  { id: 'x1', side: 'both', char: null, stage: 'tide', kind: 'boss', name: 'Last Mission: Null Tide', par: 130, needs: ['d4', 'u4'], ending: 'both',
    brief: 'Two halves of the Core, pulled in two directions, have woken its failsafe. Null Tide will switch off every light on the Span and below it. Pick anyone. This one is everybody\'s problem.', outro: 'The tide goes out.' },
];

export const ENDINGS = {
  dawn: ['Dawnline ending', 'The Gyre Engine stops, and the fallen light hangs free. Kite is first to the edge and sees, far below, streets lit for the first time in her life. Nobody on the Span had ever looked down. The couriers carry the news home: the Core can be mended, but not the way it was.', 'Play the Umbra Circuit\'s side to see why they fought for it.'],
  umbra: ['Umbra ending', 'Bastion Lumen powers down at Vesper\'s feet. The under-city keeps its light tonight. But the two halves of the Core are still reaching for each other, and the air between them has started to hum. Quill checks her notes. Nothing in the Archive says what happens next.', 'Play the Dawnline Couriers\' side to see what they were trying to warn you about.'],
  both: ['The Divide, closed', 'Null Tide breaks like a wave on a wall, and the two halves of the Core drift together. It does not go back up to the Span and it does not stay below. It settles between, where a courier and a thief agree to build it a house with doors on both sides. The Dawnline runs all the way down now. The Circuit runs all the way up. Kite and Vesper still race. Nobody has agreed who is winning.', 'Thank you for playing Velocity Divide. Every stage can be replayed for a better rank.'],
};

export const charById = id => CHARS.find(c => c.id === id);
export const missionById = id => MISSIONS.find(m => m.id === id);
/** Score out of 100: up to 50 for time against par, 35 for sparks, 15 for a run without retries. */
export function rankOf(r, par) {
  const score = Math.round(Math.min(1, par / Math.max(1, r.time)) * 50 + (r.total ? r.sparks / r.total : 1) * 35 + Math.max(0, 15 - r.retries * 5));
  return { score, rank: score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D' };
}
