// Procedural island content: enterable houses, towers, piers, containers and the six named points of interest.
import * as THREE from 'three';
import { GRID, STORY } from './config.js';
import { pick, range, shuffle } from './noise.js';
import { makeBox } from './colliders.js';

const WOOD_T = [0xece0bc, 0xcfe3ef, 0xdcc7a2, 0xeabfa8, 0xc4dbb4, 0xf3ead2, 0xd8d0e4];
const STONE_T = [0xd6d6d8, 0xdccdbd, 0xcad2da, 0xe0d8c8];
const METAL_T = [0xa3b5cc, 0xcbd5df, 0xbacbaa, 0xd0b69a];
const ROOF_T = [0xb85a40, 0x4f6d8f, 0x6f5440, 0x7f8f5f, 0x8a4a4a, 0x3f5f5a];
const CONT_C = [0xd9533b, 0x3b7bd9, 0xe0b23a, 0x3fae6a, 0x8a5bd0, 0xd9d9d9, 0xe27d3a];

function tintFor(mat, rng) { return pick(rng, mat === 0 ? WOOD_T : mat === 1 ? STONE_T : METAL_T); }

/** Whether a rectangular footprint (cells) is free and inside the flat zone of `poi`. */
function fits(ctx, gx, gz, w, d, poi, margin = 0) {
  const x0 = gx * GRID, z0 = gz * GRID, x1 = (gx + w) * GRID, z1 = (gz + d) * GRID;
  const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2], [x0 - margin, z0 - margin], [x1 + margin, z1 + margin], [x0 - margin, z1 + margin], [x1 + margin, z0 - margin]];
  for (const [x, z] of pts) {
    if (!ctx.occ.free(x, z)) return false;
    if (poi && Math.hypot(x - poi.x, z - poi.z) > poi.flat - 3) return false;
    if (!ctx.T.isLand(x, z, 0.9)) return false;
  }
  return true;
}

/**
 * Build a house out of pieces. o: {gx, gz, w, d, front 0:+z 1:+x 2:-z 3:-x, y, mat, tint?, roof?, chest (prob), doorsBoth, windows (prob), poi}
 * Returns house info (bounds, doors, chest/loot spots) and registers it in ctx.out.
 */
export function house(ctx, o) {
  const { pieces, occ, rng, out, decor, props } = ctx, G = GRID;
  const w = o.w, d = o.d, x0 = o.gx * G, z0 = o.gz * G, x1 = (o.gx + w) * G, z1 = (o.gz + d) * G, y0 = o.y + 0.08;
  const tint = o.tint ?? tintFor(o.mat, rng), roofTint = o.roof ?? pick(rng, ROOF_T);
  const NORM = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  // pick the front side: the preferred one if the strip in front of its door is clear, otherwise the next side that is (no house is ever sealed shut)
  const edgeAt = (s, i) => (s === 0 ? [x0 + i * G + G / 2, z1] : s === 2 ? [x0 + i * G + G / 2, z0] : s === 1 ? [x1, z0 + i * G + G / 2] : [x0, z0 + i * G + G / 2]);
  const apronOk = s => {
    const n = (s & 1) ? d : w, [ex, ez] = edgeAt(s, Math.floor((n - 1) / 2 + (n % 2 === 0 ? 1 : 0))), [nx, nz] = NORM[s], ax = ex + nx * 5.6, az = ez + nz * 5.6;
    return occ.freeRect(Math.min(ex, ax) - (nx ? 0 : 1.7), Math.min(ez, az) - (nz ? 0 : 1.7), Math.max(ex, ax) + (nx ? 0 : 1.7), Math.max(ez, az) + (nz ? 0 : 1.7));
  };
  const want = o.front ?? 0; let front = -1;
  for (const s of [want, (want + 1) % 4, (want + 3) % 4, (want + 2) % 4]) if (apronOk(s)) { front = s; break; }
  if (front < 0) return null;
  const info = { id: out.houses.length, x0, z0, x1, z1, y: y0, doors: [], chestSpots: [], lootSpots: [], poi: o.poi?.id || null, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  occ.mark(x0, z0, x1, z1, 3.2);
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
    const cx = x0 + i * G + G / 2, cz = z0 + j * G + G / 2;
    pieces.add({ kind: 'floor', mat: o.mat, x: cx, y: y0, z: cz, isStatic: true, tint: o.floorTint ?? 0xb08a62 });
    if (!o.noRoof) pieces.add({ kind: 'roof', mat: o.mat, x: cx, y: y0 + STORY, z: cz, isStatic: true, tint: roofTint });
  }
  const edges = [];
  for (let i = 0; i < w; i++) { edges.push({ x: x0 + i * G + G / 2, z: z1, rot: 0, side: 0, idx: i, n: w }); edges.push({ x: x0 + i * G + G / 2, z: z0, rot: 0, side: 2, idx: i, n: w }); }
  for (let j = 0; j < d; j++) { edges.push({ x: x1, z: z0 + j * G + G / 2, rot: 1, side: 1, idx: j, n: d }); edges.push({ x: x0, z: z0 + j * G + G / 2, rot: 1, side: 3, idx: j, n: d }); }
  const back = (front + 2) % 4;
  let windows = 0;
  for (const e of edges) {
    let kind = 'wall';
    const isDoor = (e.side === front && e.idx === Math.floor((e.n - 1) / 2 + (e.n % 2 === 0 ? 1 : 0))) || (o.doorsBoth && e.side === back && e.idx === Math.floor((e.n - 1) / 2));
    if (isDoor) kind = 'door'; else if (rng() < (o.windows ?? 0.55)) { kind = 'window'; windows++; }
    if (kind === 'door') { const [nx, nz] = NORM[e.side]; info.doors.push({ ox: e.x + nx * 2.6, oz: e.z + nz * 2.6, ix: e.x - nx * 2.2, iz: e.z - nz * 2.2, x: e.x, z: e.z, nx, nz }); }
    e.kind = kind;
  }
  if (!windows) { const e = edges.find(q => q.kind === 'wall' && q.side !== front); if (e) e.kind = 'window'; }
  for (const e of edges) pieces.add({ kind: e.kind, mat: o.mat, x: e.x, y: y0, z: e.z, rot: e.rot, isStatic: true, tint });
  // chests in the back row / corners, away from the door
  const [bx, bz] = NORM[back];
  const nChest = rng() < (o.chest ?? 0.85) ? (w * d >= 6 && rng() < 0.5 ? 2 : 1) : 0;
  const cells = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) cells.push([i, j]);
  const rank = c => { const cx = x0 + c[0] * G + G / 2, cz = z0 + c[1] * G + G / 2; return (cx - info.cx) * bx + (cz - info.cz) * bz + rng() * 1.5; };
  cells.sort((a, b) => rank(b) - rank(a));
  const used = new Set();
  for (let k = 0; k < nChest && k < cells.length; k++) {
    const [i, j] = cells[k], cx = x0 + i * G + G / 2, cz = z0 + j * G + G / 2;
    // push toward the wall behind (corner) so the doorway stays clear
    const px = cx + bx * 1.0 + (bx === 0 ? (rng() < 0.5 ? -1 : 1) * 0.9 : 0), pz = cz + bz * 1.0 + (bz === 0 ? (rng() < 0.5 ? -1 : 1) * 0.9 : 0);
    const spot = { x: px, y: y0, z: pz, dx: -bx, dz: -bz, house: info, tier: 'house' }; info.chestSpots.push(spot); out.chestSpots.push(spot); used.add(i * 100 + j);
  }
  // floor loot + a little furniture
  const rest = cells.filter(([i, j]) => !used.has(i * 100 + j)); shuffle(rng, rest);
  const nLoot = Math.min(rest.length, 1 + Math.floor(rng() * 2.5));
  for (let k = 0; k < nLoot; k++) { const [i, j] = rest[k], s = { x: x0 + i * G + G / 2 + range(rng, -1, 1), y: y0, z: z0 + j * G + G / 2 + range(rng, -1, 1), house: info }; info.lootSpots.push(s); out.lootSpots.push(s); }
  if (!o.noFurniture && rest.length) {
    const [i, j] = rest[rest.length - 1], cx = x0 + i * G + G / 2, cz = z0 + j * G + G / 2;
    decor.add(cx, y0, cz, 1.7, 0.75, 0.9, 0x8a5a32, { ry: (front & 1) ? Math.PI / 2 : 0 });                      // table
    if (rng() < 0.55) {   // a crate in a corner that is clear of chests and doorways
      for (const [qx, qz] of [[x0 + 1.1, z0 + 1.1], [x1 - 1.1, z0 + 1.1], [x0 + 1.1, z1 - 1.1], [x1 - 1.1, z1 - 1.1]]) {
        if (info.chestSpots.some(c => Math.hypot(c.x - qx, c.z - qz) < 2.4) || info.doors.some(d => Math.hypot(d.ix - qx, d.iz - qz) < 2.4)) continue;
        props.crate(decor, qx, y0, qz, 1.0, 1.0, 1.0, 0x9c6b3a); break;
      }
    }
  }
  out.houses.push(info); return info;
}

// ---------- towers, piers, containers ----------
/** Lookout tower: 2x2 platform on pillars, ramp chain up one side, railings, hut + chest on top. */
export function tower(ctx, o) {
  const { pieces, decor, rng, out, occ } = ctx, G = GRID, lv = o.levels ?? 3, y0 = o.y + 0.08, top = y0 + lv * STORY;
  const gx = o.gx, gz = o.gz, x0 = gx * G, z0 = gz * G;
  occ.mark(x0 - lv * G, z0, x0 + 2 * G, z0 + 2 * G, 3);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) pieces.add({ kind: 'floor', mat: o.mat ?? 2, x: x0 + i * G + 2, y: top, z: z0 + j * G + 2, isStatic: true, tint: 0x8d99a8 });
  for (const [px, pz] of [[x0 + 0.5, z0 + 0.5], [x0 + 7.5, z0 + 0.5], [x0 + 0.5, z0 + 7.5], [x0 + 7.5, z0 + 7.5]]) decor.add(px, o.y - 0.3, pz, 0.6, lv * STORY + 0.6, 0.6, 0x7b8796, { solid: true, walk: false });
  decor.add(x0 + 4, o.y + lv * STORY * 0.5, z0 + 0.4, 7.2, 0.25, 0.25, 0x6c7886, {}); decor.add(x0 + 4, o.y + lv * STORY * 0.5, z0 + 7.6, 7.2, 0.25, 0.25, 0x6c7886, {});
  for (let k = 0; k < lv; k++) pieces.add({ kind: 'ramp', mat: o.mat ?? 2, x: x0 - G / 2 - k * G, y: y0 + (lv - 1 - k) * STORY, z: z0 + G / 2 + (k === 0 ? 0 : 0), rot: 1, isStatic: true, tint: 0x9aa5b3 });
  // ramps sit one cell wide at gz row 0; the first ramp's high edge touches the platform floor at x0
  // railings: three sides (open toward the ramp side -x row 0)
  const rail = (x, z, sx, sz) => decor.add(x, top, z, sx, 1.1, sz, 0x6a7482, { solid: true, walk: false });
  rail(x0 + 4, z0 + 0.1, 8, 0.2); rail(x0 + 4, z0 + 7.9, 8, 0.2); rail(x0 + 7.9, z0 + 4, 0.2, 8); rail(x0 + 0.1, z0 + 6.2, 0.2, 3.6);
  // hut cover on the far side + roof
  pieces.add({ kind: 'wall', mat: o.mat ?? 2, x: x0 + 6, y: top, z: z0 + 4 * 2, rot: 0, isStatic: true, tint: 0x9aa7b8 });
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) pieces.add({ kind: 'roof', mat: o.mat ?? 2, x: x0 + i * G + 2, y: top + STORY, z: z0 + j * G + 2, isStatic: true, tint: 0x5a6a7f });
  for (const [x, z] of [[x0 + 8, z0 + 2], [x0 + 8, z0 + 6]]) pieces.add({ kind: 'wall', mat: o.mat ?? 2, x, y: top, z, rot: 1, isStatic: true, tint: 0x9aa7b8 });
  const spot = { x: x0 + 6, y: top, z: z0 + 2.2, dx: 0, dz: 1, tier: 'tower', house: null }; out.chestSpots.push(spot);
  const t = { x: x0 + 4, z: z0 + 4, top, rampX: x0 - lv * G, rampZ: z0 + G / 2, y: o.y }; out.towers.push(t); return t;
}

export function pier(ctx, sx, sz, axis, sign, cells, y, mat = 0) {
  const { pieces, decor, rng } = ctx, G = GRID;
  for (let k = 0; k < cells; k++) {
    const x = axis === 'x' ? sx + sign * (k * G + G / 2) : sx, z = axis === 'z' ? sz + sign * (k * G + G / 2) : sz;
    pieces.add({ kind: 'floor', mat, x, y, z, isStatic: true, tint: 0x8a6a44 });
    for (const s of [-1, 1]) { const rx = axis === 'x' ? x : x + s * 1.9, rz = axis === 'z' ? z : z + s * 1.9; decor.add(rx, y, rz, axis === 'x' ? 4 : 0.15, 0.9, axis === 'x' ? 0.15 : 4, 0x6a5238, { solid: true, walk: false }); }
  }
}
function container(ctx, x, y, z, rot, color) {
  const sx = rot ? 2.5 : 6.1, sz = rot ? 6.1 : 2.5; ctx.decor.add(x, y, z, sx, 2.6, sz, color, { solid: true });
  ctx.occ.mark(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, 1.5);
}

// ---------- POI generators ----------
const side = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2));      // side of a house facing direction (dx,dz)
function scatterHouses(ctx, p, count, sizes, mats, o = {}) {
  const { rng } = ctx; let made = 0, tries = 0;
  while (made < count && tries++ < 400) {
    const a = rng() * Math.PI * 2, r = (o.minR ?? 12) + rng() * (p.flat - (o.minR ?? 12) - 10), cx = p.x + Math.cos(a) * r, cz = p.z + Math.sin(a) * r;
    const [w, d] = pick(rng, sizes), gx = Math.round(cx / GRID - w / 2), gz = Math.round(cz / GRID - d / 2);
    if (!fits(ctx, gx, gz, w, d, p, 0)) continue;
    const hx = (gx + w / 2) * GRID, hz = (gz + d / 2) * GRID, front = side(p.x - hx, p.z - hz);
    if (house(ctx, { gx, gz, w, d, front, y: p.y, mat: pick(rng, mats), poi: p, chest: o.chest ?? 0.85, windows: o.windows })) made++;
  }
  return made;
}

const POI_GEN = {
  village(ctx, p) {
    const { decor, occ, props } = ctx;
    // plaza: well and benches
    decor.add(p.x, p.y, p.z, 2.4, 1.0, 2.4, 0x9a9aa2, { solid: true }); decor.add(p.x, p.y + 1.0, p.z, 0.3, 2.0, 0.3, 0x6a5238, {}); decor.add(p.x, p.y + 2.5, p.z, 2.8, 0.25, 1.6, 0xb85a40, {});
    for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) decor.add(p.x + dx, p.y, p.z + dz, dx ? 0.6 : 2.0, 0.5, dx ? 2.0 : 0.6, 0x7a5a38, {});
    occ.markCircle(p.x, p.z, 7);
    // town hall
    const gx = Math.round(p.x / GRID - 1.5), gz = Math.round((p.z - 16) / GRID - 1.5);
    if (fits(ctx, gx, gz, 3, 3, p)) house(ctx, { gx, gz, w: 3, d: 3, front: 0, y: p.y, mat: 1, chest: 1, windows: 0.8, poi: p, roof: 0x4f6d8f });
    scatterHouses(ctx, p, 11, [[2, 2], [2, 2], [2, 2], [1, 2], [2, 1], [3, 2], [2, 3]], [0, 0, 0, 1]);
    props.crate(decor, p.x + 6, p.y, p.z + 8, 1, 1, 1, 0x9c6b3a); props.crate(decor, p.x + 7.1, p.y, p.z + 8, 1, 1, 1, 0xa87745); props.crate(decor, p.x + 6.5, p.y + 1, p.z + 8, 1, 1, 1, 0x9c6b3a);
  },
  docks(ctx, p) {
    const { T, decor, rng, out, occ, props } = ctx;
    scatterHouses(ctx, p, 3, [[3, 2], [3, 3], [2, 3]], [2], { minR: 8, windows: 0.3 });
    scatterHouses(ctx, p, 2, [[1, 2], [2, 2]], [0, 2], { minR: 8 });
    // containers in rows
    let n = 0; for (let tries = 0; tries < 80 && n < 9; tries++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (p.flat - 14), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, rot = rng() < 0.5 ? 0 : 1;
      const hx = rot ? 1.25 : 3.05, hz = rot ? 3.05 : 1.25;
      if (!occ.freeRect(x - hx - 0.6, z - hz - 0.6, x + hx + 0.6, z + hz + 0.6) || ![[x - hx, z - hz], [x + hx, z + hz], [x - hx, z + hz], [x + hx, z - hz]].every(([a2, b]) => T.isLand(a2, b, 0.9))) continue;
      container(ctx, x, p.y, z, rot, pick(rng, CONT_C)); if (rng() < 0.4) decor.add(x, p.y + 2.6, z, rot ? 2.5 : 6.1, 2.6, rot ? 6.1 : 2.5, pick(rng, CONT_C), { solid: true }); n++;
    }
    // pier from the shore line outwards
    let sx = p.x, sz = p.z; const ox = p.outX, oz = p.outZ, axis = Math.abs(ox) > Math.abs(oz) ? 'x' : 'z', sign = axis === 'x' ? Math.sign(ox) : Math.sign(oz);
    for (let r = 0; r < 90; r += 1) { const x = p.x + ox * r, z = p.z + oz * r; if (T.heightAt(x, z) < 0.6) { sx = x; sz = z; break; } }
    sx = Math.round(sx / GRID) * GRID + (axis === 'x' ? 0 : GRID / 2) - (axis === 'x' ? sign * GRID * 1.5 : 0); sz = Math.round(sz / GRID) * GRID + (axis === 'z' ? 0 : GRID / 2) - (axis === 'z' ? sign * GRID * 1.5 : 0);
    pier(ctx, sx, sz, axis, sign, 9, 1.35, 0);
    const bx = axis === 'x' ? sx + sign * 20 : sx + 4.5, bz = axis === 'z' ? sz + sign * 20 : sz + 4.5;
    decor.add(bx, 0.2, bz, axis === 'x' ? 6 : 2.4, 0.8, axis === 'x' ? 2.4 : 6, 0xf2f2f2, { solid: true }); decor.add(bx, 1.0, bz, axis === 'x' ? 2 : 1.6, 1.2, axis === 'x' ? 1.6 : 2, 0xd9533b, { solid: true });
    out.chestSpots.push({ x: sx + (axis === 'x' ? sign * 30 : 0), y: 1.43, z: sz + (axis === 'z' ? sign * 30 : 0), dx: 0, dz: 1, tier: 'camp', house: null });
    // crane
    const cxp = p.x - ox * 8 + oz * 14, czp = p.z - oz * 8 - ox * 14;
    if (occ.freeRect(cxp - 2, czp - 2, cxp + 2, czp + 2)) { decor.add(cxp, p.y, czp, 1.4, 16, 1.4, 0xd9a53a, { solid: true, walk: false }); decor.add(cxp + 3, p.y + 15, czp, 10, 0.8, 0.8, 0xd9a53a, {}); decor.add(cxp + 8, p.y + 9, czp, 0.12, 6, 0.12, 0x222222, {}); occ.mark(cxp - 2, czp - 2, cxp + 2, czp + 2, 1); }
    for (let i = 0; i < 4; i++) { const x = p.x + range(rng, -10, 10), z = p.z + range(rng, -10, 10); if (occ.freeRect(x - 1, z - 1, x + 1, z + 1) && T.isLand(x, z, 0.9)) { props.crate(decor, x, p.y, z, 1.1, 1.1, 1.1, 0x8a6a40, 'crate'); occ.mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.4); } }
    for (let i = 0; i < 3; i++) { const x = p.x + range(rng, -12, 12), z = p.z + range(rng, -12, 12); if (occ.freeRect(x - 1, z - 1, x + 1, z + 1) && T.isLand(x, z, 0.9)) { props.crate(decor, x, p.y, z, 0.9, 1.1, 0.9, 0x3a5fa8, 'barrel', 2); occ.mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.4); } }
  },
  farm(ctx, p) {
    const { decor, rng, out, props, occ } = ctx;
    // barn: 3 x 4, doors at both short ends, red
    const gx = Math.round(p.x / GRID - 1.5) + 1, gz = Math.round(p.z / GRID - 2) - 2;
    if (fits(ctx, gx, gz, 3, 4, p)) house(ctx, { gx, gz, w: 3, d: 4, front: 0, doorsBoth: true, y: p.y, mat: 0, tint: 0xc0503f, roof: 0x5b4636, chest: 1, windows: 0.2, poi: p });
    scatterHouses(ctx, p, 4, [[2, 2], [2, 2], [1, 2]], [0], { minR: 10 });
    // silo + windmill landmarks, slid to a free patch so they never stand on a house or in front of a door
    const freePatch = (bx, bz, r) => { for (const k of [0, 7, 12, 18]) for (let q = 0; q < (k ? 8 : 1); q++) { const a = q * Math.PI / 4, x = bx + Math.cos(a) * k, z = bz + Math.sin(a) * k; if (occ.freeRect(x - r, z - r, x + r, z + r) && ctx.T.isLand(x, z, 3) && ctx.T.slopeAt(x, z) < 0.3) return [x, z]; } return null; };
    const silop = freePatch(p.x + 12, p.z - 18, 4);
    if (silop) {
    const sx = silop[0], sz = silop[1];
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 11, 14), new THREE.MeshStandardMaterial({ color: 0xc9d1d9, roughness: 0.6, metalness: 0.3 })); silo.position.set(sx, p.y + 5.5, sz); silo.castShadow = true; out.landmarks.add(silo);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa7b0b9, roughness: 0.5, metalness: 0.4 })); cap.position.set(sx, p.y + 11, sz); out.landmarks.add(cap);
    ctx.cw.add(makeBox(sx - 1.9, p.y, sz - 1.9, sx + 1.9, p.y + 11, sz + 1.9, null, { walk: true })); occ.mark(sx - 3, sz - 3, sx + 3, sz + 3, 1);
    }
    const windp = freePatch(p.x - 16, p.z - 16, 5);
    if (windp) {
    const wx = windp[0], wz = windp[1];
    for (let i = 0; i < 5; i++) { const s = 4.2 - i * 0.55; decor.add(wx, p.y + i * 2.0, wz, s, 2.0, s, i % 2 ? 0xe9dcc0 : 0xd8c9a8, { solid: i < 3 }); }
    const hub = new THREE.Group(); hub.position.set(wx, p.y + 9.2, wz + 2.4);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.8 });
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.12), bladeMat); b.position.y = 3.5; const pv = new THREE.Group(); pv.rotation.z = i * Math.PI / 2; pv.add(b); hub.add(pv); }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2c })); hub.add(core); out.landmarks.add(hub); out.windmill = hub; occ.mark(wx - 3, wz - 3, wx + 3, wz + 3, 1);
    }
    for (let i = 0; i < 7; i++) { const x = p.x + range(rng, -20, 20), z = p.z + range(rng, -6, 22); if (occ.freeRect(x - 1.2, z - 1.2, x + 1.2, z + 1.2)) { props.crate(decor, x, p.y, z, 1.5, 1.2, 1.2, 0xd9b45a, 'hay'); occ.mark(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 0.4); } }
    ctx.out.campSpots.push({ x: p.x + 24, z: p.z + 6 });
  },
  quarry(ctx, p) {
    const { decor, rng, out, occ, props } = ctx;
    scatterHouses(ctx, p, 4, [[2, 2], [2, 2], [3, 2], [2, 3]], [1, 1, 2], { minR: 10, windows: 0.35 });
    for (let i = 0; i < 4; i++) { const x = p.x + range(rng, -14, 14), z = p.z + range(rng, -14, 14); if (occ.freeRect(x - 3.2, z - 2.7, x + 3.2, z + 2.7)) { decor.add(x, p.y, z, 5, 2.6, 4, 0x9a8a6a, { solid: true }); occ.mark(x - 3, z - 2.5, x + 3, z + 2.5, 1); } }
    const cx = p.x + 8, cz = p.z + 12; if (occ.freeRect(cx - 7, cz - 2, cx + 2, cz + 2)) { decor.add(cx, p.y, cz, 1.6, 18, 1.6, 0xd9a53a, { solid: true, walk: false }); decor.add(cx - 5, p.y + 17, cz, 12, 0.9, 0.9, 0xd9a53a, {}); occ.mark(cx - 2, cz - 2, cx + 2, cz + 2, 1); }
    for (let i = 0; i < 8; i++) { const x = p.x + range(rng, -16, 16), z = p.z + range(rng, -16, 16); if (occ.freeRect(x - 1, z - 1, x + 1, z + 1)) { props.crate(decor, x, p.y, z, 1.1, 1.1, 1.1, 0x8a6a40, 'crate'); occ.mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.4); } }
    out.campSpots.push({ x: p.x - 18, z: p.z - 4 });
  },
  hills(ctx, p) {
    const { decor, out, occ, rng } = ctx, G = GRID;
    // beacon tower: tall stone landmark with a glowing lamp
    const bx = Math.round(p.x / G) * G, bz = Math.round(p.z / G) * G;
    decor.add(bx, p.y, bz, 6.4, 9, 6.4, 0xd8d4c8, { solid: true }); decor.add(bx, p.y + 9, bz, 4.6, 8, 4.6, 0xe6e2d6, { solid: true }); decor.add(bx, p.y + 17, bz, 5.6, 0.7, 5.6, 0x8a4a4a, { solid: true });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 3.4), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); lamp.position.set(bx, p.y + 19.1, bz); out.landmarks.add(lamp); out.beacon = lamp;
    decor.add(bx, p.y + 20.6, bz, 4.2, 0.6, 4.2, 0x8a4a4a, {}); decor.add(bx, p.y + 21.2, bz, 0.25, 6, 0.25, 0x555555, {});
    ctx.cw.add(makeBox(bx - 1.7, p.y + 17.7, bz - 1.7, bx + 1.7, p.y + 20.6, bz + 1.7)); occ.mark(bx - 5, bz - 5, bx + 5, bz + 5, 2);
    // beacon door: ramp-less access via the lookout towers; ground floor chest outside
    out.chestSpots.push({ x: bx + 5, y: p.y, z: bz + 1, dx: -1, dz: 0, tier: 'camp', house: null });
    scatterHouses(ctx, p, 4, [[2, 2], [2, 2], [3, 2]], [1], { minR: 12 });
    let placed = 0; for (let k = 0; k < 60 && placed < 2; k++) {
      const a = rng() * Math.PI * 2, r = 14 + rng() * (p.flat - 30), gx = Math.round((p.x + Math.cos(a) * r) / G), gz = Math.round((p.z + Math.sin(a) * r) / G), x0 = gx * G, z0 = gz * G;
      const pts = [[x0 - 3 * G - 1, z0 - 1], [x0 + 2 * G + 1, z0 - 1], [x0 - 3 * G - 1, z0 + 2 * G + 1], [x0 + 2 * G + 1, z0 + 2 * G + 1]];
      if (!pts.every(([x, z]) => Math.hypot(x - p.x, z - p.z) < p.flat - 3) || !occ.freeRect(x0 - 3 * G - 3, z0 - 3, x0 + 2 * G + 3, z0 + 2 * G + 3)) continue;
      tower(ctx, { gx, gz, y: p.y, levels: 3, mat: 2 }); placed++;
    }
  },
  lodge(ctx, p) {
    const { T, decor, out, occ } = ctx, G = GRID;
    const gx = Math.round(p.x / G - 1.5), gz = Math.round(p.z / G - 1.5);
    if (fits(ctx, gx, gz, 3, 3, p)) house(ctx, { gx, gz, w: 3, d: 3, front: 3, doorsBoth: true, y: p.y, mat: 0, tint: 0xb48a5a, roof: 0x4a3a2c, chest: 1, windows: 0.8, poi: p });
    scatterHouses(ctx, p, 4, [[2, 2], [2, 2], [1, 2]], [0], { minR: 11 });
    // dock toward the lake
    const L = T.lake, dx = L.x - p.x, dz = L.z - p.z, axis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z', sign = axis === 'x' ? Math.sign(dx) : Math.sign(dz);
    let sx = p.x, sz = p.z; for (let r = 0; r < 120; r++) { const x = p.x + dx / Math.hypot(dx, dz) * r, z = p.z + dz / Math.hypot(dx, dz) * r; if (T.heightAt(x, z) < 0.6) { sx = x; sz = z; break; } }
    sx = Math.round(sx / G) * G + (axis === 'x' ? 0 : G / 2); sz = Math.round(sz / G) * G + (axis === 'z' ? 0 : G / 2);
    pier(ctx, sx - (axis === 'x' ? sign * G * 1.5 : 0), sz - (axis === 'z' ? sign * G * 1.5 : 0), axis, sign, 5, 1.25, 0);
    out.chestSpots.push({ x: sx + (axis === 'x' ? sign * 12 : 0), y: 1.33, z: sz + (axis === 'z' ? sign * 12 : 0), dx: 0, dz: 1, tier: 'camp', house: null });
  },
};

function cabin(ctx, s) {
  const { rng } = ctx, w = 2, d = 2, gx = Math.round(s.x / GRID - w / 2), gz = Math.round(s.z / GRID - d / 2);
  if (!fits(ctx, gx, gz, w, d, null, 0)) return;
  house(ctx, { gx, gz, w, d, front: Math.floor(rng() * 4), y: s.y, mat: rng() < 0.2 ? 1 : 0, chest: 0.95, windows: 0.5 });
}

function camps(ctx) {
  const { T, rng, pieces, decor, out, occ } = ctx; let n = 0, tries = 0;
  const spots = [...out.campSpots];
  while (spots.length < 11 && tries++ < 400) {
    const a = rng() * 6.283, r = 30 + rng() * 190, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!T.isLand(x, z, 2.2) || T.slopeAt(x, z) > 0.25 || !occ.free(x, z) || T.roadDist(x, z) < 4) continue;
    if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 40)) continue; spots.push({ x, z });
  }
  for (const s of spots) {
    // POI-defined spots may land on a house or a doorway: slide them to a clear patch (or drop the camp)
    if (!occ.freeRect(s.x - 3, s.z - 4, s.x + 6, s.z + 4)) {
      let found = false;
      for (const rr of [6, 10, 14, 20]) { for (let k = 0; k < 8 && !found; k++) { const a = k * Math.PI / 4, x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr; if (occ.freeRect(x - 3, z - 4, x + 6, z + 4) && T.isLand(x, z, 2.2) && T.slopeAt(x, z) < 0.3) { s.x = x; s.z = z; found = true; } } if (found) break; }
      if (!found) continue;
    }
    const y = T.heightAt(s.x, s.z); if (y < 1.5) continue;
    pieces.add({ kind: 'roof', mat: 0, x: Math.round(s.x / 4) * 4 + 2, y: y - 0.1, z: Math.round(s.z / 4) * 4 + 2, isStatic: true, tint: pick(rng, [0xe0a43a, 0x3a8cc9, 0xc9503a, 0x5aa86a]) });
    decor.add(s.x + 4, y, s.z, 0.6, 0.35, 0.6, 0x4a2f1a, {}); decor.add(s.x + 4, y + 0.35, s.z, 0.35, 0.4, 0.35, 0xff8a2a, {});
    out.chestSpots.push({ x: s.x + 2, y, z: s.z - 3, dx: 0, dz: 1, tier: 'camp', house: null }); occ.mark(s.x - 3, s.z - 4, s.x + 6, s.z + 4, 1); n++;
  }
}

/** Lone lookout towers on flat ground away from the POIs (sniper nests with a chest on top). */
function watchtowers(ctx, want = 4) {
  const { T, rng, occ } = ctx, G = GRID, lv = 3; let n = 0, tries = 0;
  while (n < want && tries++ < 1500) {
    const x = (rng() - 0.5) * 430, z = (rng() - 0.5) * 430; if (!T.isLand(x, z, 4)) continue;
    const gx = Math.round(x / G), gz = Math.round(z / G), x0 = gx * G, z0 = gz * G, y = T.heightAt(x0 + 4, z0 + 4);
    if (T.pois.some(p => Math.hypot(p.x - x0, p.z - z0) < p.flat + 28) || ctx.out.towers.some(t => Math.hypot(t.x - x0, t.z - z0) < 80)) continue;
    if (!occ.freeRect(x0 - lv * G - 3, z0 - 3, x0 + 2 * G + 3, z0 + 2 * G + 3)) continue;
    let flat = true; for (let dx = -lv * G; dx <= 2 * G && flat; dx += 4) for (let dz = 0; dz <= 2 * G; dz += 4) { if (Math.abs(T.heightAt(x0 + dx, z0 + dz) - y) > 0.8 || !T.isLand(x0 + dx, z0 + dz, 1.5)) { flat = false; break; } }
    if (!flat || y < 2.5) continue;
    tower(ctx, { gx, gz, y, levels: lv, mat: 2 }); n++;
  }
  return n;
}

/** Generate everything. ctx: {T, pieces, decor, props, occ, rng, cw} */
export function generateWorld(ctx) {
  ctx.out = { houses: [], chestSpots: [], lootSpots: [], campSpots: [], towers: [], landmarks: new THREE.Group(), windmill: null, beacon: null };
  for (const p of ctx.T.pois) { ctx.occ.markCircle(p.x, p.z, 0.1, 0); }
  for (const p of ctx.T.pois) POI_GEN[p.kind](ctx, p);
  for (const s of ctx.T.sites) cabin(ctx, s);
  watchtowers(ctx, 4);
  camps(ctx);
  return ctx.out;
}
