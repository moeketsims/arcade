import * as THREE from 'three';
import * as M from './models.js';

const sin = Math.sin, cos = Math.cos;

// Box helper reminder: B.box(x, yTop, z, width, height, depth, opts). Levels run along +z.
export const WORLDS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'meadow', name: 'Meadow Isles', sub: 'World 1', track: 'meadow', top: 0x7ad35a, side: 0xa8714a,
    sky: [0x3f8fe8, 0xdcefff], skyBelow: 0x9cc3e6, fog: [0xd3eafc, 90, 330], sun: 0xfff1d6, enemyColor: 0x8e5bd6, accent: 0x7ae582, spring: 0xff4f7b,
    sunDir: [-0.48, 0.34, 0.81], cloudSea: { y: -9, lit: 0xffffff, shade: 0xa9bfdc, haze: 0xdcefff }, clouds: 30, islands: 9, rocky: true, rock: 0x8a735e, bounce: 0x9fb4cc,
    killY: -14, spawn: [0, 0, -2],
    build(B) {
      const tree = (x, y, z, s = 1) => B.decor(M.makeTree(0x8b5a2b, [0x5fbf4a, 0x4fae5a, 0x7fcf4f][Math.abs(Math.round(x + z)) % 3], s), x, y, z);
      B.cyl(0, 0, 0, 6.5, 5); tree(-4, 0, 2); tree(4.2, 0, -1, 0.8); B.coinRing(0, 1, 2, 3, 8);
      B.box(5, 2, -5, 2.5, 2, 2.5); B.bot(5, 2, -5);                                   // bot 0: a hop behind the start
      B.box(0, 0, 10, 4, 3, 4); B.box(0, 0.8, 16, 4, 3, 4); B.box(-3, 1.6, 22, 4, 3, 4);
      B.coinLine([0, 1.5, 9], [0, 2.4, 16], 5);
      B.box(0, 1.6, 34, 14, 4, 14); tree(-5, 1.6, 38); tree(5.5, 1.6, 39, 1.2);
      B.enemy('walker', -3, 1.6, 33, { range: 3 }); B.enemy('walker', 3, 1.6, 37, { range: 2.5, axis: 'z' });
      B.crate(-5, 1.6, 29); B.crate(-6.1, 1.6, 29); B.crate(-5.5, 2.6, 29);
      B.spring(5, 1.6, 29); B.box(8, 9, 34, 4, 1, 4, { top: 0xffffff, side: 0xe6f2ff }); B.bot(8, 9, 34);   // bot 1: cloud
      B.coinArc([5, 3, 29], [8, 10, 33], 3, 6);
      B.mover(t => [sin(t * 0.8) * 5, 1.6, 47], 4, 1, 4, { top: 0xf2c94c, side: 0xc79a2b });
      B.coinLine([-4, 2.5, 47], [4, 2.5, 47], 5);
      B.cyl(0, 1.6, 57, 5.5, 5); B.checkpoint(-2.5, 1.6, 56); tree(3, 1.6, 59, 0.9);
      for (let i = 0; i < 8; i++) B.crumble(0, 1.6, 64 + i * 2.3, 2.6, 0.8, 2.1);
      B.coinLine([0, 2.6, 64], [0, 2.6, 80], 8);
      B.box(6, 3.6, 72, 2.5, 6, 2.5); B.bot(6, 3.6, 72);                                // bot 2: pillar beside the bridge
      B.enemy('flyer', -4, 4.5, 72, { range: 3 });
      B.box(0, 1.6, 89, 12, 4, 10); tree(-4.5, 1.6, 92); B.enemy('walker', 2, 1.6, 87); B.enemy('walker', -2, 1.6, 91, { axis: 'z' });
      B.coinRing(0, 2.6, 89, 3, 8, true);                                               // hidden: scan with Y
      B.crate(4.5, 1.6, 92); B.crate(4.5, 2.6, 92);
      const spiral = [[3, 3.6, 98], [-1, 5.6, 101], [-4, 7.6, 98], [-1, 9.6, 95]];
      spiral.forEach(([x, y, z]) => B.box(x, y, z, 2.6, 1, 2.6, { top: 0xf2c94c, side: 0xc79a2b }));
      B.cyl(3, 11.2, 98, 1.8, 1); B.bot(3, 11.2, 98);                                   // bot 3: top of the spiral
      B.coinArc([3, 12, 99], [0, 7.5, 117], 3, 9);
      B.cyl(0, 6, 118, 5, 9); B.checkpoint(0, 6, 116); tree(-3, 6, 120, 0.8);
      [[0, 3, 128], [3, 3.5, 134], [-1, 4, 140]].forEach(([x, y, z], i) => { B.cyl(x, y, z, 1.6, 5); B.spring(x, y, z, i === 2 ? 23 : 21); });
      B.box(2.6, 10.5, 144, 3, 1, 3, { top: 0xffffff, side: 0xe6f2ff }); B.bot(2.6, 10.5, 144); // bot 4: cloud beside the last mushroom
      B.coinLine([0, 6, 128], [-1, 9, 140], 6);
      B.box(0, 3, 152, 14, 5, 14); tree(5, 3, 156); tree(-5, 3, 147, 1.3);
      B.enemy('turret', -4, 3, 156, { rate: 2.6 }); B.goal(0, 3, 156);
    },
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'frost', name: 'Frost Peaks', sub: 'World 2', track: 'frost', top: 0xf4fbff, side: 0x8fa3c0, ice: 0xbfefff,
    sky: [0x5b97f0, 0xeaf6ff], skyBelow: 0xb4cde8, fog: [0xe8f4ff, 50, 170], sun: 0xffffff, enemyColor: 0x4f8ef7, accent: 0x9ad8ff, spring: 0x59c3ff,
    sunDir: [0.5, 0.3, 0.81], cloudSea: { y: -8, lit: 0xffffff, shade: 0xb3c4dc, haze: 0xeaf6ff }, clouds: 18, rocky: true, rock: 0x8b95a3, bounce: 0xa9bbd2,
    killY: -12, spawn: [0, 3, -2], power: 'rocket',
    build(B) {
      const pine = (x, y, z, s = 1) => B.decor(M.makePine(s), x, y, z);
      B.hazard(0, 0.5, 80, 120, 2, 240, 'water');
      B.cyl(0, 3, 0, 6.5, 6); pine(-4, 3, 2); pine(4, 3, -2, 1.3); B.powerup('rocket', 0, 4.4, 4.5);
      B.box(0, 3, 16, 6, 2, 14, { ice: true }); B.enemy('walker', 0, 3, 18, { range: 2 });
      B.coinLine([0, 4, 10], [0, 4, 22], 6);
      B.box(0, 5, 26, 4, 1, 2.5); B.box(-3.5, 8, 27, 3, 1, 2.5);
      B.box(0, 13, 33, 14, 9, 6); pine(-5, 13, 34); pine(5, 13, 33, 0.8);
      B.coinLine([0, 6, 27.5], [0, 13, 30], 6);
      B.box(6.5, 9, 28, 2, 1, 2); B.bot(6.5, 9, 28);                                    // bot 0: ledge on the cliff
      [[3, 13, 42], [-3, 13, 49], [3, 13, 56]].forEach(([x, y, z]) => B.cyl(x, y, z, 1.6, 12, { ice: true }));
      B.coinLine([0, 14.5, 38], [0, 14.5, 58], 7);
      B.box(-8, 8, 50, 3, 1, 3); B.bot(-8, 8, 50);                                      // bot 1: drop down, rocket back
      B.box(0, 13, 67, 10, 4, 10); B.checkpoint(-3, 13, 64); B.enemy('turret', 3, 13, 70, { pcolor: 0xffffff, rate: 2.4 });
      snowman(B, -3, 13, 70);
      B.box(0, 13, 84, 4, 2, 20, { ice: true }); B.enemy('walker', 0, 13, 80, { axis: 'z', range: 3 }); B.enemy('walker', 0, 13, 89, { axis: 'z', range: 3 });
      B.coinLine([0, 14, 76], [0, 14, 92], 8);
      for (let i = 0; i < 6; i++) B.crumble(i % 2 ? 1.2 : -1.2, 13, 98 + i * 2.6, 2.4, 1, 2.4);
      B.coinRing(0, 14, 104, 2.5, 6, true);
      B.box(0, 13, 116, 8, 3, 6); B.box(4, 17, 118, 3, 1, 3); B.box(-1, 21, 118, 3, 1, 3); B.box(3, 25, 117, 3, 1, 3);
      B.bot(3, 25, 117);                                                                // bot 2: rocket climb
      B.coinLine([4, 18, 118], [3, 26, 117], 6);
      B.box(0, 13, 128, 12, 4, 12); B.checkpoint(0, 13, 124); B.enemy('turret', -4, 13, 131, { pcolor: 0xffffff }); B.enemy('turret', 4, 13, 131, { pcolor: 0xffffff });
      B.box(0, 14.5, 133.5, 2, 1.5, 1); B.bot(0, 14.5, 133.5);                          // bot 3: between the turrets
      B.mover(t => [0, 13 + (sin(t * 0.9) * 0.5 + 0.5) * 6, 140], 4, 1, 4, { ice: true });
      B.box(0, 19, 152, 12, 4, 12); pine(-4.5, 19, 155); pine(4.5, 19, 149, 1.4);
      B.cyl(5, 21.6, 155, 1, 2.6, { top: 0xffffff }); B.bot(5, 21.6, 155);              // bot 4: on the snow stump
      B.goal(0, 19, 156);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.decor(mountain(0xdfe9f7, 30 + (i % 3) * 12), sin(a) * 140, -10, 80 + cos(a) * 140); }
    },
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'forge', name: 'Lava Forge', sub: 'World 3', track: 'forge', top: 0x5a6078, side: 0x2b2e3d,
    sky: [0x1a0606, 0x8a2a10], fog: [0x5a1e0a, 40, 150], sun: 0xffb27a, enemyColor: 0xff5a36, accent: 0xff8a2b, spring: 0xff8a2b,
    killY: -12, spawn: [0, 2, -2], power: 'magnet', ambient: 0.55,
    build(B) {
      B.hazard(0, -0.5, 90, 100, 2, 230, 'lava');
      B.box(0, 2, 0, 10, 5, 10); B.powerup('magnet', 0, 3.4, 4);
      B.box(-4, 4.5, -3.5, 2, 2.5, 2); B.bot(-4, 4.5, -3.5);                            // bot 0
      B.magnet(0, 7, 15); B.box(0, 2, 25, 8, 5, 8); B.coinLine([0, 7, 9], [0, 7, 21], 5);
      [0, 1, 2].forEach(i => B.mover(t => [0, 2 + (sin(t * 1.6 + i * 1.3) * 0.5 + 0.5) * 3.5, 33 + i * 5.5], 3, 6, 3, { top: 0xff8a2b, side: 0x3a3e52 }));
      B.coinLine([0, 6.5, 33], [0, 6.5, 44], 3);
      B.box(0, 2, 54, 10, 5, 10); B.checkpoint(-3, 2, 51); B.enemy('walker', 2, 2, 55); B.enemy('walker', -2, 2, 57, { axis: 'z' });
      B.crate(3.5, 2, 51); B.crate(3.5, 3, 51); B.crate(-3.5, 2, 57);
      B.magnet(0, 8, 64); B.magnet(5, 10, 72); B.magnet(0, 12, 80); B.box(0, 8, 89, 6, 3, 6);
      B.box(9.5, 9, 72, 2, 1, 2); B.bot(9.5, 9, 72);                                    // bot 1: off the magnet chain
      B.coinLine([0, 9, 64], [0, 13, 80], 6);
      B.box(0, 8, 104, 4, 2, 20, { conveyor: { x: 0, z: -3.5 }, top: 0x3a3e52 }); B.enemy('turret', 0, 8, 111, { pcolor: 0xff7a1f, rate: 2.0 }); B.box(0, 8, 118, 4, 2, 4);
      B.coinLine([0, 9, 96], [0, 9, 112], 7);
      for (let i = 0; i < 4; i++) B.mover(t => [(i % 2 ? 1 : -1) * 3, 6 + sin(t * 1.2 + i) * 2.5, 124 + i * 5], 3.5, 1, 3.5, { top: 0xff8a2b, side: 0x3a3e52 });
      B.enemy('flyer', 0, 10, 130, { range: 4, color: 0xff5a36 });
      B.box(9, 3, 128, 2.5, 4, 2.5); B.bot(9, 3, 128);                                  // bot 2: low pillar in the lava lake
      B.box(0, 8, 147, 10, 3, 10); B.checkpoint(0, 8, 144); B.enemy('walker', 3, 8, 149);
      B.magnet(0, 14, 157); for (let i = 0; i < 5; i++) B.crumble(0, 12, 164 + i * 2.6, 2.4, 1, 2.4);
      B.box(-7, 13, 166, 2, 1, 2); B.bot(-7, 13, 166);                                  // bot 3: beside the crumbles
      B.coinRing(0, 9, 147, 2.5, 6, true);
      B.box(0, 12, 182, 12, 4, 12); B.goal(0, 12, 185);
      B.box(5, 14, 188, 2, 2, 2); B.bot(5, 14, 188);                                    // bot 4: behind the portal
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; B.decor(volcano(), sin(a) * 120, -6, 90 + cos(a) * 120); }
      for (let i = 0; i < 16; i++) B.decor(pipe(), (i % 2 ? 1 : -1) * (14 + (i % 3) * 4), -1, i * 12);
    },
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'reef', name: 'Coral Reef', sub: 'World 4', track: 'reef', top: 0xf2d9a0, side: 0xd8b878,
    sky: [0x0a3d73, 0x2fa3d6], fog: [0x1f7fb8, 20, 110], sun: 0xbfefff, enemyColor: 0xff9f1c, accent: 0x4cc9f0, spring: 0xff7ad9,
    killY: -40, spawn: [0, 0, -2], underwater: true, ambient: 0.75,
    build(B) {
      B.water(-60, 60, -50, 26, -20, 190, 0x3fb3e6); B.box(0, -12, 85, 120, 3, 220, { top: 0xe8cf94, side: 0xc9ad72 });
      const coral = (x, y, z, c) => B.decor(M.makeCoral(c ?? [0xff6b8a, 0xffb347, 0xc77dff, 0x5ce1e6][Math.abs(Math.round(x * 3 + z)) % 4], 1 + (Math.abs(x + z) % 3) * 0.3), x, y, z);
      B.box(0, 0, 4, 14, 4, 18); [[-4, 0, 6], [4, 0, 9], [-3, 0, 11]].forEach(p => coral(...p));
      B.coinRing(0, 3, 8, 2, 8);
      B.box(0, -2, 26, 10, 4, 16); B.enemy('floater', 0, 1.5, 24, { amp: 1.5 }); B.enemy('floater', 3, 3, 30, { amp: 1 });
      B.coinLine([0, 4, 18], [0, 4, 32], 6);
      // coral cave with a bot inside
      B.box(-7, 3, 26, 1, 5, 6); B.box(-11, 3, 26, 1, 5, 6); B.box(-9, 3.5, 26, 5, 0.5, 6); B.box(-9, -2, 26, 5, 2, 6); B.bot(-9, -2, 26);    // bot 0
      B.box(0, -6, 44, 8, 4, 8); B.hazard(0, -5.5, 44, 3, 0.5, 3, 'spikes'); B.coinLine([0, -2, 40], [0, -2, 48], 4);
      B.box(0, 0, 58, 12, 4, 12); B.checkpoint(-3, 0, 55); coral(4, 0, 60); coral(-4, 0, 61);
      for (let i = 0; i < 6; i++) B.enemy('floater', (i % 3 - 1) * 4, 2 + (i % 2) * 4, 66 + i * 3, { amp: 1.8, drift: 2 });
      B.coinLine([0, 5, 64], [0, 5, 82], 8);
      B.box(0, 2, 88, 10, 4, 8); B.enemy('turret', 3, 2, 90, { pcolor: 0xffe066, rate: 2.4, pspeed: 6 });
      B.box(0, 12, 88, 4, 1, 4); B.bot(0, 12, 88);                                      // bot 1: swim up high
      B.coinLine([0, 4, 88], [0, 11, 88], 5);
      B.box(0, -8, 104, 8, 3, 18); B.hazard(-2, -7.5, 100, 3, 0.5, 4, 'spikes'); B.hazard(2, -7.5, 108, 3, 0.5, 4, 'spikes');
      B.bot(0, -8, 112);                                                                // bot 2: trench floor
      B.coinRing(0, -5, 104, 3, 8, true);
      B.box(0, 2, 124, 12, 4, 12); B.checkpoint(0, 2, 120); coral(-4, 2, 127); coral(4.5, 2, 126);
      B.enemy('flyer', 0, 6, 134, { range: 4, color: 0xff9f1c, speed: 0.9 }); B.enemy('flyer', 0, 9, 142, { range: 5, color: 0xffd166, speed: 1.2 });
      B.box(8, 6, 138, 3, 1, 3); B.bot(8, 6, 138);                                      // bot 3: side shelf
      B.box(0, 4, 156, 12, 4, 12); B.goal(0, 4, 159);
      clam(B, -4, 4, 154); B.bot(-4, 4.9, 154);                                         // bot 4: in the giant clam
      for (let i = 0; i < 40; i++) B.decor(kelp(4 + (i % 4) * 2), (i % 2 ? 1 : -1) * (9 + (i * 7) % 12), -10, i * 4.5);
    },
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'neon', name: 'Neon Station', sub: 'World 5', track: 'neon', top: 0x3a4060, side: 0x1e2236,
    sky: [0x05010f, 0x2a0b4a], fog: [0x120624, 50, 180], sun: 0xc9b6ff, enemyColor: 0x39ffd2, accent: 0xf72585, spring: 0x39ffd2,
    killY: -14, spawn: [0, 2, -2], power: 'slow', gravityScale: 0.62, stars: true, ambient: 0.6,
    build(B) {
      const edge = (x, y, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.08, d + 0.2), new THREE.MeshBasicMaterial({ color: 0x39ffd2 })); B.decor(m, x, y + 0.04, z); };
      const deck = (x, y, z, w, h, d, o) => { B.box(x, y, z, w, h, d, o); edge(x, y, z, w, d); };
      deck(0, 2, 0, 10, 4, 10); B.powerup('slow', 0, 3.4, 4);
      B.box(4, 4, -3.5, 1.8, 2, 1.8); B.bot(4, 4, -3.5);                               // bot 0
      deck(0, 2, 16, 6, 3, 14); B.laser(0, 2, 12, 6, 'x', 2.2, 0); B.laser(0, 2, 17, 6, 'x', 2.2, 1.1); B.laser(0, 2, 21, 6, 'x', 1.6, 0.4);
      B.coinLine([0, 3, 10], [0, 3, 22], 6);
      for (let i = 0; i < 3; i++) B.mover(t => [sin(t * 2.6 + i * 2) * 5, 2, 30 + i * 6], 3, 1, 3, { top: 0xf72585 });
      deck(0, 2, 50, 10, 4, 10); B.checkpoint(-3, 2, 47); B.enemy('flyer', 0, 4.5, 51, { range: 3, color: 0x39ffd2 });
      B.box(0, 13, 50, 3, 1, 3); B.bot(0, 13, 50); B.spring(3.5, 2, 52.5, 22); B.coinLine([3.5, 5, 52.5], [1, 12, 50.5], 5);   // bot 1: spring in low gravity
      deck(0, 2, 66, 4, 2, 18, { conveyor: { x: 4, z: 0 } }); B.laser(0, 2, 62, 4, 'x', 1.4, 0, 0.5); B.laser(0, 2, 70, 4, 'x', 1.4, 0.7, 0.5);
      B.coinLine([0, 3, 58], [0, 3, 74], 6);
      [[4, 4, 82], [-4, 6, 88], [3, 8, 94], [-2, 10, 100]].forEach(([x, y, z], i) => B.crumble(x, y, z, 3, 1, 3));
      B.box(-9, 9, 94, 2, 1, 2); B.bot(-9, 9, 94);                                      // bot 2: off the crumble steps
      deck(0, 10, 112, 10, 3, 10); B.checkpoint(0, 10, 108); B.enemy('turret', 3, 10, 115, { pcolor: 0xf72585, rate: 1.6, pspeed: 12 }); B.enemy('turret', -3, 10, 115, { pcolor: 0xf72585, rate: 1.6, pspeed: 12 });
      B.coinRing(0, 11, 112, 3, 8, true);
      for (let i = 0; i < 4; i++) B.mover(t => [0, 10, 122 + i * 5 + sin(t * 3.2 + i) * 2.2], 2.6, 1, 2.2, { top: 0xf72585 });
      B.laser(0, 10, 136, 8, 'x', 1.0, 0, 0.6);
      deck(0, 10, 144, 8, 3, 8);
      B.mover(t => [8 + sin(t * 2) * 2, 10 + (sin(t * 1.4) * 0.5 + 0.5) * 6, 144], 2.5, 1, 2.5, { top: 0x39ffd2 });
      B.box(8, 19, 144, 2, 1, 2); B.bot(8, 19, 144);                                    // bot 3: lift then leap
      deck(0, 10, 162, 12, 3, 12); B.goal(0, 10, 165);
      B.box(-5, 12, 160, 2, 2, 2); B.bot(-5, 12, 160);                                  // bot 4
      for (let i = 0; i < 6; i++) B.decor(planet([0xf72585, 0x4cc9f0, 0xffd166, 0x7ae582, 0xc77dff, 0xff9f1c][i], 6 + i * 2), sin(i * 1.7) * 120, 30 + i * 8, 80 + cos(i * 1.7) * 120);
    },
  },
  // ------------------------------------------------------------------ boss
  {
    id: 'void', name: 'Void Core', sub: 'Final battle', track: 'boss', top: 0x2a2f45, side: 0x14162a,
    sky: [0x020008, 0x3b0a5c], fog: [0x14031f, 40, 160], sun: 0xd9b8ff, enemyColor: 0xb44cff, accent: 0xb44cff,
    killY: -14, spawn: [0, 0, -11], stars: true, boss: true, ambient: 0.55, camDist: 17, camPitch: 0.26, camLift: 3.2,
    build(B) {
      B.cyl(0, 0, 0, 15, 6, { taper: 0.4, top: 0x3a3f66 });
      const grid = new THREE.Mesh(new THREE.CircleGeometry(14.9, 64), new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, depthWrite: false }));
      grid.rotation.x = -Math.PI / 2; B.decor(grid, 0, 0.02, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(15.2, 0.15, 8, 80), new THREE.MeshBasicMaterial({ color: 0xb44cff })); ring.rotation.x = Math.PI / 2; B.decor(ring, 0, 0.05, 0);
      B.checkpoint(-3, 0, -11);
      for (let i = 0; i < 8; i++) B.decor(planet([0xb44cff, 0x4cc9f0, 0xf72585][i % 3], 4 + i), sin(i) * 110, 10 + i * 6, cos(i) * 110);
    },
  },
];

export const HUB = {
  id: 'hub', name: 'The Mothership', sub: 'Hub', track: 'hub', top: 0xe8ecf4, side: 0x9aa6b8,
  sky: [0x050a1e, 0x1d3a7a], fog: [0x0d1838, 60, 220], sun: 0xffffff, stars: true, killY: -20, spawn: [0, 0, -6], ambient: 0.8,
  build(B, game) {
    B.cyl(0, 0, 0, 21, 4, { taper: 0.55 });
    [[20.2, 0x46f0ff], [13.5, 0xffd166], [7, 0xf72585]].forEach(([r, c]) => { const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 64), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; B.decor(ring, 0, 0.02, 0); });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: 0x46f0ff })); l.rotation.x = -Math.PI / 2; B.decor(l, Math.cos(a) * 17, 0.03, Math.sin(a) * 17); }
    const spire = new THREE.Group();
    spire.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, 7, 16), M.mat(0xdfe6f0, { metal: 0.4, rough: 0.3 })));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), M.mat(0x46f0ff, { emissive: 0x46f0ff, ei: 1.2 })); orb.position.y = 4.4; spire.add(orb);
    spire.children[0].position.y = 3.5; B.decor(spire, 0, 0, 4);
    B.phys.add({ kind: 'cyl', x: 0, z: 4, r: 1.6, y0: 0, y1: 7 });
    game.hubOrb = orb;
    const n = WORLDS.length;
    game.hubPortals = [];
    WORLDS.forEach((w, i) => {
      const a = (i - (n - 1) / 2) * 0.48, x = -sin(a) * 15, z = cos(a) * 15 + 3;
      const unlocked = game.isUnlocked(i), done = game.save.done.includes(w.id);
      const p = M.makePortal(unlocked ? w.accent : 0x555a70, 1.9); p.position.set(x, 2.3, z); p.lookAt(0, 2.3, 3); B.decor(p, x, 2.3, z, 0); p.lookAt(0, 2.3, 3);
      B.box(x, 0.3, z, 4.5, 0.3, 2, { top: unlocked ? w.accent : 0x555a70, side: 0x9aa6b8 });
      const bots = game.save.bots.filter(b => b.startsWith(w.id + ':')).length;
      const label = textSprite(`${i < 5 ? i + 1 : '★'}  ${w.name}`, unlocked ? (done ? `✓ cleared · bots ${bots}/5` : (w.boss ? 'Final battle' : `bots ${bots}/5`)) : '🔒 locked', unlocked ? w.accent : 0x888ea8);
      label.position.set(x, 5.4, z); B.decor(label, x, 5.4, z);
      game.hubPortals.push({ i, pos: new THREE.Vector3(x, 0.3, z), unlocked, disc: p.userData.disc, p });
    });
    B.coinRing(0, 1, -2, 5, 10);
    for (let i = 0; i < 6; i++) B.decor(planet([0x4cc9f0, 0xf72585, 0xffd166, 0x7ae582, 0xc77dff, 0xff9f1c][i], 5 + i * 3), sin(i * 2.1) * 130, -10 + i * 9, cos(i * 2.1) * 130);
  },
};

// ---------- scenery helpers ----------
function mountain(color, h) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.7, h, 7), M.mat(0x8fa3c0, { flat: true })); m.position.y = h / 2; g.add(m);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.4, 7), M.mat(color, { flat: true })); cap.position.y = h * 0.8; g.add(cap);
  return g;
}
function volcano() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 22, 30, 9), M.mat(0x2a1e1e, { flat: true })); m.position.y = 15; g.add(m);
  const l = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1, 9), new THREE.MeshBasicMaterial({ color: 0xff6a1f })); l.position.y = 30; g.add(l);
  return g;
}
function pipe() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 18, 12), M.mat(0x4a4f63, { metal: 0.6, rough: 0.4 })); m.position.y = 9; g.add(m);
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.15, 6, 16), M.mat(0xff8a2b, { emissive: 0xff5a00, ei: 0.6 })); r.rotation.x = Math.PI / 2; r.position.y = 12; g.add(r);
  return g;
}
function kelp(h) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 6), M.mat(0x2e8b57)); k.position.set(i * 0.4, h / 2, (i % 2) * 0.3); k.rotation.z = (i - 1) * 0.15; g.add(k); }
  return g;
}
function planet(color, r) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.8 })));
  if (r > 8) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, r * 0.08, 4, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })); ring.rotation.x = 1.2; g.add(ring); }
  return g;
}
function snowman(B, x, y, z) {
  const g = new THREE.Group(), w = M.mat(0xffffff);
  [[0.7, 0.7], [0.5, 1.75], [0.35, 2.5]].forEach(([r, h]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), w); s.position.y = h; s.castShadow = true; g.add(s); });
  const n = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 8), M.mat(0xff8a2b)); n.rotation.x = Math.PI / 2; n.position.set(0, 2.5, 0.4); g.add(n);
  B.decor(g, x, y, z);
}
function clam(B, x, y, z) {
  const g = new THREE.Group(), m = M.mat(0xf4a6c8, { rough: 0.4 });
  const bot = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m); g.add(bot);
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); top.rotation.x = -0.7; top.position.set(0, 0.1, -0.9); g.add(top);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), M.mat(0xffffff, { emissive: 0xffffff, ei: 0.4 })); pearl.position.set(0.8, 0.3, 0.6); g.add(pearl);
  g.position.set(x, y + 0.6, z); B.scene.add(g);
}
export function textSprite(title, sub, color = 0xffffff) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const c = cv.getContext('2d');
  c.fillStyle = 'rgba(8,14,34,0.72)'; roundRect(c, 4, 4, 504, 152, 30); c.fill();
  c.strokeStyle = '#' + new THREE.Color(color).getHexString(); c.lineWidth = 6; roundRect(c, 4, 4, 504, 152, 30); c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 46px Segoe UI, sans-serif'; c.textAlign = 'center'; c.fillText(title, 256, 68);
  c.font = '600 32px Segoe UI, sans-serif'; c.fillStyle = '#cfe6ff'; c.fillText(sub, 256, 118);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); s.scale.set(5, 1.56, 1);
  return s;
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function gridTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const c = cv.getContext('2d');
  c.strokeStyle = 'rgba(180,140,255,0.35)'; c.lineWidth = 2;
  for (let i = 0; i <= 512; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 512); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke(); }
  c.strokeStyle = 'rgba(70,240,255,0.5)'; c.lineWidth = 3; [80, 160, 240].forEach(r => { c.beginPath(); c.arc(256, 256, r, 0, Math.PI * 2); c.stroke(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
