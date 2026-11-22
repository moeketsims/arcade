// Velocity Divide: every stage, built in code from boxes. No Three.js here, so the simulation and the Node tests share it.
const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, YAW = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };
const blank = theme => ({ theme, solids: [], sparks: [], hearts: [], springs: [], pads: [], enemies: [], checks: [], hazards: [], shards: [], route: [], goal: null, boss: null, grid: null, spawn: { x: 0, y: 0.1, z: 0, yaw: 0 }, killY: -14 });
function box(lv, x0, x1, y0, y1, z0, z1, k = 0, extra) {
  const s = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1), k, ...extra };
  lv.solids.push(s); return s;
}

// A road laid segment by segment from a cursor: a = metres along the heading, s = metres to the right of the centre line.
class Path {
  constructor(lv, x, y, z, dir, w) { Object.assign(this, { lv, x, y, z, dir, w }); lv.route.push({ x, y, z }); }
  at(a, s = 0) { const [dx, dz] = DIRS[this.dir]; return { x: this.x + dx * a - dz * s, y: this.y, z: this.z + dz * a + dx * s }; }
  adv(len) { const q = this.at(len); this.x = q.x; this.z = q.z; this.lv.route.push({ x: q.x, y: this.y, z: q.z }); return this; }
  flat(len, o = {}) {
    const lv = this.lv, w = this.w, a = this.at(0, -w / 2), b = this.at(len, w / 2), [dx, dz] = DIRS[this.dir], y = this.y;
    box(lv, a.x, b.x, y - 2, y, a.z, b.z, o.k || 0);
    if (o.check) { const c = this.at(2); lv.checks.push({ x: c.x, y, z: c.z, yaw: YAW[this.dir] }); }
    if (o.pad) { const c = this.at(3); lv.pads.push({ x: c.x, y, z: c.z, dx, dz, v: o.pad }); }
    for (let i = 0; i < (o.sparks || 0); i++) { const c = this.at(len * (i + 0.5) / o.sparks, o.side || 0); lv.sparks.push({ x: c.x, y: y + 1, z: c.z }); }
    for (const [da, ds, h = 1.3, patrol = 0] of o.drones || []) { const c = this.at(da, ds); lv.enemies.push({ kind: 'drone', x: c.x, y: y + h, z: c.z, r: 0.9, hp: 1, px: -dz * patrol, pz: dx * patrol }); }
    // zap strips: 1.2 m long, "half" metres to each side of their centre (half = w / 2 makes a bar to jump)
    for (const [da, ds, half] of o.zaps || []) { const c = this.at(da, ds), ex = Math.abs(dx) * 0.6 + Math.abs(dz) * half, ez = Math.abs(dz) * 0.6 + Math.abs(dx) * half; lv.hazards.push({ x0: c.x - ex, x1: c.x + ex, y0: y, y1: y + 0.7, z0: c.z - ez, z1: c.z + ez }); }
    return this.adv(len);
  }
  gap(len) { return this.adv(len); }
  drop(dy) { this.y -= dy; return this; }
  stairs(n) {
    for (let i = 0; i < n; i++) { this.y += 0.5; const a = this.at(0, -this.w / 2), b = this.at(1.6, this.w / 2); box(this.lv, a.x, b.x, this.y - 2.5, this.y, a.z, b.z, 2); const q = this.at(1.6); this.x = q.x; this.z = q.z; }
    this.lv.route.push({ x: this.x, y: this.y, z: this.z }); return this;
  }
  /** A spring near the end of the last segment that throws the player up to a road dy metres higher. */
  spring(dy) { const c = this.at(-2.5); this.lv.springs.push({ kind: 'spring', x: c.x, y: this.y, z: c.z, v: Math.sqrt(64 * (dy + 2.6)) }); this.y += dy; return this.adv(3); }
  /** A wide corner plaza, then carry on in a new direction. */
  turn(dir) {
    const c = this.at(this.w / 2), h = this.w / 2 + 4; box(this.lv, c.x - h, c.x + h, this.y - 2, this.y, c.z - h, c.z + h, 2);
    this.x = c.x; this.z = c.z; this.lv.route.push({ x: c.x, y: this.y, z: c.z }); this.dir = dir; return this.adv(this.w / 2);
  }
  goal() { const c = this.at(-4); this.lv.goal = { x: c.x, y: this.y, z: c.z, r: 3 }; return this; }
}
// A line of drones over open air between two road edges: a shortcut for a chain of homing dashes.
function chain(lv, a, b, y, n) {
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), u = (i - 0.5) / (n + 1);
    lv.enemies.push({ kind: 'drone', x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t, r: 0.9, hp: 1 });
    lv.sparks.push({ x: a.x + (b.x - a.x) * u, y: y + 0.6, z: a.z + (b.z - a.z) * u });
  }
}

function causeway() {
  const lv = blank('dawn'), p = new Path(lv, 0, 0, 6, 'N', 10); lv.spawn = { x: 0, y: 0.1, z: 2, yaw: 0 };
  const hops = n => { for (let i = 0; i < n; i++) p.gap(5).flat(15, { sparks: 3 }); };
  p.flat(44, { sparks: 8 }).flat(40, { pad: 34, sparks: 8 }); hops(2);
  p.gap(5).flat(30, { sparks: 5, drones: [[14, 0]] }).stairs(6).flat(30, { check: true, sparks: 5, zaps: [[14, -3, 2]] });
  const s1 = p.at(22, 0);
  p.flat(44, { sparks: 8, side: -2, zaps: [[20, 0, 5]] }).turn('E').flat(38, { pad: 32, sparks: 7 });
  const s2 = p.at(-6, 0); chain(lv, { x: s1.x + 5, z: s1.z }, { x: s2.x, z: s2.z + 5 }, p.y + 2.2, 4);
  hops(3);
  p.gap(6).flat(30, { sparks: 5, drones: [[10, 2.5], [20, -2.5]] }).turn('N').flat(34, { check: true, sparks: 6, zaps: [[12, 3, 2], [18, 0, 5]] })
    .spring(5).flat(60, { pad: 36, sparks: 10 }).drop(3).gap(5).flat(40, { sparks: 7, drones: [[18, 0, 1.3, 3]] });
  hops(2);
  p.gap(5).flat(30, { check: true, sparks: 5 }).turn('W').flat(40, { pad: 34, sparks: 8, zaps: [[26, 0, 5]] }).stairs(8)
    .flat(36, { sparks: 6, zaps: [[12, -3, 2], [24, 3, 2]] }).turn('N').flat(30, { check: true, sparks: 5 }).spring(6).flat(70, { pad: 38, sparks: 14 }).goal();
  return lv;
}

function viaduct() {
  const lv = blank('umbra'), p = new Path(lv, 0, 12, 6, 'N', 9); lv.spawn = { x: 0, y: 12.1, z: 2, yaw: 0 }; lv.killY = -8;
  const hops = (n, len) => { for (let i = 0; i < n; i++) p.gap(5).flat(len, { sparks: 3 }); };
  p.flat(40, { sparks: 8 }); hops(2, 14);
  p.gap(5).flat(34, { pad: 34, sparks: 6 }).drop(3).gap(4).flat(40, { sparks: 7, drones: [[14, -2], [24, 2]] }).turn('W').flat(32, { check: true, sparks: 6, zaps: [[16, 0, 4.5]] });
  hops(3, 16); p.gap(5);
  const s1 = p.at(8, 0);
  p.flat(34, { pad: 32, sparks: 6 }).turn('N').flat(36, { check: true, sparks: 6, zaps: [[10, -2.5, 1.5], [22, 2.5, 1.5]] });
  const s2 = p.at(-10, 0); chain(lv, { x: s1.x, z: s1.z - 4.5 }, { x: s2.x + 4.5, z: s2.z }, p.y + 2.2, 4);
  p.spring(6).flat(50, { sparks: 8, drones: [[30, 0, 1.3, 3]] }).drop(3).gap(5).flat(36, { check: true, sparks: 6 }).turn('E').flat(40, { pad: 34, sparks: 8, zaps: [[16, 0, 4.5]] });
  hops(2, 16);
  p.gap(5).flat(30, { check: true, sparks: 5, drones: [[12, 2], [20, -2]] }).drop(3).gap(4).flat(34, { sparks: 6 }).turn('N')
    .flat(30, { check: true, sparks: 5, zaps: [[14, 0, 4.5]] }).spring(5).flat(64, { pad: 38, sparks: 12, zaps: [[30, 0, 4.5]] }).goal();
  return lv;
}

// Treasure stages: a grid of terraces. A digit is a height level, a dot is open air. cand = [col, row, buried].
function terraces(theme, rows, cand, foes, checks, seed) {
  const lv = blank(theme), C = 8, U = 2.2, W = rows[0].length, H = rows.length, x0 = -W * C / 2, z0 = -H * C / 2; lv.killY = -10;
  const ht = (c, r) => { const ch = rows[r]?.[c]; return ch >= '1' && ch <= '9' ? +ch : 0; };
  const mid = (c, r) => ({ x: x0 + (c + 0.5) * C, y: ht(c, r) * U, z: z0 + (r + 0.5) * C });
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const h = ht(c, r); if (!h) continue;
    box(lv, x0 + c * C, x0 + (c + 1) * C, -6, h * U, z0 + r * C, z0 + (r + 1) * C, h % 3);
    if ((c + r) % 2 === 0) { const m = mid(c, r); lv.sparks.push({ x: m.x - 2, y: m.y + 1, z: m.z - 2 }); }
  }
  // cells that can be walked to from the start (a double jump climbs two levels): shards are only ever hidden there
  const sc = 5, sr = H - 1, seen = new Set([sc + ',' + sr]), q = [[sc, sr]];
  while (q.length) { const [c, r] = q.shift(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c + dc, r + dr], k = n[0] + ',' + n[1]; if (!seen.has(k) && ht(...n) && ht(...n) - ht(c, r) <= 2) { seen.add(k); q.push(n); } } }
  const pool = cand.filter(([c, r]) => seen.has(c + ',' + r));
  let s = (seed * 9301 + 49297) % 233280; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 3 && pool.length; i++) { const [c, r, buried] = pool.splice(Math.floor(rnd() * pool.length), 1)[0], m = mid(c, r); lv.shards.push({ x: m.x, y: m.y + (buried ? 0 : 1.3), z: m.z, buried: !!buried, c, r }); }
  for (const [c, r, kind] of foes) { const m = mid(c, r); lv.enemies.push(kind === 's' ? { kind: 'spit', x: m.x + 2, y: m.y + 1, z: m.z + 2, r: 1, hp: 2 } : { kind: 'drone', x: m.x, y: m.y + 1.3, z: m.z, r: 0.9, hp: 1, px: 2.5 }); }
  for (const [c, r] of checks) { const m = mid(c, r); lv.checks.push({ x: m.x + 2, y: m.y, z: m.z + 2, yaw: 0 }); }
  const sp = mid(sc, sr); lv.spawn = { x: sp.x, y: sp.y + 0.1, z: sp.z, yaw: 0 };
  lv.grid = { rows, C, U, x0, z0, W, H, reach: seen.size, cand: pool.length + lv.shards.length };
  return lv;
}

// Mech stages: halls, pits to hover across (with a catwalk above for the curious) and rooms whose gate opens when they are clear.
function works(theme, plan) {
  const lv = blank(theme), W = 5; let z = 10, g = 0; lv.killY = -12; lv.spawn = { x: 0, y: 0.1, z: 6, yaw: 0 };
  box(lv, -W - 1.5, W + 1.5, -2, 5, z, z + 1.5, 1);
  const walls = (len, hw) => { box(lv, -hw - 1.5, -hw, -2, 5, z - len, z, 1); box(lv, hw, hw + 1.5, -2, 5, z - len, z, 1); };
  const floor = (len, hw, k) => { box(lv, -hw, hw, -2, 0, z - len, z, k); walls(len, hw); z -= len; lv.route.push({ x: 0, y: 0, z }); };
  for (const [kind, len, hw, foes] of plan) {
    if (kind === 'hall') { lv.checks.push({ x: 0, y: 0, z: z - 2, yaw: 0, hw: W, zEnd: z - len }); for (let i = 0; i < 4; i++) lv.sparks.push({ x: i % 2 ? 2 : -2, y: 1, z: z - len * (i + 0.5) / 4 }); floor(len, W, 0); }
    else if (kind === 'pit') {
      walls(len, W); box(lv, 1.6, W, 3.4, 4, z - len - 3, z + 3, 2); lv.hearts.push({ x: 3.3, y: 5, z: z - len / 2 });
      for (let i = 0; i < 4; i++) lv.sparks.push({ x: 3.3, y: 5, z: z + 2 - (len + 4) * i / 3 });
      z -= len; lv.route.push({ x: 0, y: 0, z });
    } else {
      const zs = z; floor(len, hw, 2);
      for (const zz of [zs, z + 1.5]) { box(lv, -hw - 1.5, -W, -2, 5, zz - 1.5, zz, 1); box(lv, W, hw + 1.5, -2, 5, zz - 1.5, zz, 1); }
      box(lv, -W, W, 0, 5, z, z + 1.2, 3, { gate: g });
      for (const [fx, fz, t] of foes) lv.enemies.push(t === 's' ? { kind: 'spit', x: fx, y: 1, z: zs - fz, r: 1, hp: 2, g } : { kind: 'drone', x: fx, y: 1.4, z: zs - fz, r: 0.9, hp: t === 'h' ? 2 : 1, g, chase: 3.2 });
      for (let i = 0; i < 6; i++) lv.sparks.push({ x: Math.cos(i * 1.05) * hw * 0.6, y: 1, z: zs - len / 2 + Math.sin(i * 1.05) * len * 0.3 });
      g++;
    }
  }
  box(lv, -W - 1.5, W + 1.5, -2, 5, z - 1.5, z, 1);
  lv.goal = { x: 0, y: 0, z: z + 4, r: 3 };
  return lv;
}

function arena(theme, boss) {
  const lv = blank(theme), R = 30;
  box(lv, -R, R, -3, 0, -R, R, 0);
  box(lv, -R - 2, -R, -3, 4, -R - 2, R + 2, 1); box(lv, R, R + 2, -3, 4, -R - 2, R + 2, 1); box(lv, -R, R, -3, 4, -R - 2, -R, 1); box(lv, -R, R, -3, 4, R, R + 2, 1);
  for (let i = 0; i < 24; i++) lv.sparks.push({ x: Math.sin(i / 24 * 6.2832) * 24, y: 1, z: Math.cos(i / 24 * 6.2832) * 24 });
  lv.hearts.push({ x: -22, y: 1, z: 0 }, { x: 22, y: 1, z: 0 });
  lv.spawn = { x: 0, y: 0.1, z: 20, yaw: 0 };
  lv.boss = { x: 0, z: 0, r: 2.4, hi: 7.5, lo: 2.3, floor: 0, reach: 36, ...boss };
  return lv;
}

export function buildStage(id, seed = 1) {
  switch (id) {
    case 'causeway': return causeway();
    case 'viaduct': return viaduct();
    case 'terraces': return terraces('garden', ['33221112233', '32211.11223', '2211...1122', '111..2..111', '11..232..11', '111..2..111', '2211.1.1122', '32211111223', '33221112233'],
      [[5, 4], [0, 0, 1], [10, 0], [0, 8, 1], [10, 8], [5, 0, 1], [1, 4, 1], [9, 4]], [[3, 7], [7, 7], [4, 1, 's'], [2, 2], [8, 2], [5, 5, 's']], [[5, 8], [5, 6], [1, 1], [9, 1]], seed);
    case 'archive': return terraces('archive', ['22111112233', '211..111223', '11..1211.12', '1111.3...11', '1.12.32.1.1', '11.12321111', '1...12...11', '11221112211', '33211111233'],
      [[5, 3], [0, 0, 1], [10, 0], [0, 8, 1], [10, 8], [4, 2, 1], [8, 4], [2, 4, 1], [10, 4, 1]], [[4, 7], [6, 7], [5, 5, 's'], [1, 2], [9, 5], [6, 4, 's']], [[5, 8], [5, 6], [0, 3], [10, 2]], seed);
    case 'kiln': return works('kiln', [['hall', 14], ['arena', 30, 15, [[-6, 14], [6, 14], [0, 24, 's']]], ['hall', 14], ['pit', 7], ['hall', 10],
      ['arena', 34, 16, [[-8, 12], [8, 12], [0, 18, 'h'], [-10, 27, 's'], [10, 27, 's']]], ['hall', 14],
      ['arena', 36, 17, [[-9, 12], [9, 12], [-5, 20, 'h'], [5, 20, 'h'], [-11, 30, 's'], [11, 30, 's'], [0, 31, 's']]], ['hall', 14]]);
    case 'cinder': return works('cinder', [['hall', 12], ['pit', 6], ['hall', 8], ['arena', 28, 14, [[-5, 12, 'h'], [5, 12, 'h'], [-9, 22, 's'], [9, 22, 's']]], ['hall', 12],
      ['arena', 34, 17, [[-10, 10], [10, 10], [0, 14], [-6, 24, 's'], [6, 24, 's'], [0, 28, 'h']]], ['hall', 10], ['pit', 8], ['hall', 10],
      ['arena', 38, 18, [[-10, 10], [10, 10], [-4, 16, 'h'], [4, 16, 'h'], [0, 22], [-12, 32, 's'], [12, 32, 's'], [0, 33, 's']]], ['hall', 14]]);
    case 'gyre': return arena('gyre', { name: 'the Gyre Engine', hp: 22, ring: [2.4, 1.8, 1.3], orb: [2.0, 1.5, 1.0], atkTime: 6, openTime: 5.5 });
    case 'bastion': return arena('bastion', { name: 'Bastion Lumen', hp: 22, ring: [2.0, 1.6, 1.2], orb: [2.6, 1.8, 1.2], atkTime: 6.5, openTime: 5, minions: true });
    case 'tide': return arena('tide', { name: 'Null Tide', hp: 32, ring: [1.9, 1.4, 1.0], orb: [1.8, 1.3, 0.9], atkTime: 7, openTime: 5, minions: true, spread: true });
    default: throw new Error('Unknown stage: ' + id);
  }
}
