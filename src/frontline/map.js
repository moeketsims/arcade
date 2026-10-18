// Frontline Ops maps: "Saltworks Docks" (the match map) and the "Training Yard" (firing range).
// Maps are described with axis-aligned boxes so collision, bullets, AI navigation and rendering share one source of truth.
import { Box, Level } from './collision.js';
import { mulberry32 } from './util.js';

export const PALETTE = {
  red: 0xb5382f, blue: 0x2f5fa8, orange: 0xd9822b, green: 0x3d7a4a, white: 0xd5d9dc, yellow: 0xd6b02f, teal: 0x2b8a8a, brown: 0x7a4a2b, gray: 0x6b7480, rust: 0x8e4a2a, navy: 0x25365a,
};
const CONTAINER = { L: 6.06, W: 2.44, H: 2.59 };
export const MAP_NAMES = { saltworks: 'Saltworks Docks', range: 'Training Yard' };

export class MapBuilder {
  constructor(name) {
    this.name = name; this.level = new Level(); this.decor = [];
    this.spawns = []; this.nodes = []; this.ammo = []; this.lamps = []; this.zones = [];
    this.rng = mulberry32(1337);
    this.bounds = { x0: -50, x1: 50, z0: -30, z1: 34 };
  }
  /** Solid box. */
  box(x0, y0, z0, x1, y1, z1, p = {}) { return this.level.add(new Box(x0, y0, z0, x1, y1, z1, p)); }
  /** Solid box from centre footprint (cx, cz), size (sx, sz), height h, base y. */
  c(cx, cz, sx, sz, h, p = {}) { const y = p.y ?? 0; return this.box(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + h, cz + sz / 2, p); }
  /** Visual-only box (no collision). */
  deco(x0, y0, z0, x1, y1, z1, p = {}) { const b = new Box(x0, y0, z0, x1, y1, z1, p); this.decor.push(b); return b; }
  decoC(cx, cz, sx, sz, h, p = {}) { const y = p.y ?? 0; return this.deco(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + h, cz + sz / 2, p); }
  node(x, y, z, tag = '') { this.nodes.push({ x, y, z, tag }); }
  spawn(team, x, z, h) { this.spawns.push({ team, x, y: this.level.floorY(x, 0.1, z, 0.5), z, h }); }
  lamp(x, y, z) { this.lamps.push({ x, y, z }); }
  /** Named area used by the AI to pick interesting destinations (buildings, tower). */
  zone(name, x0, z0, x1, z1, weight = 1) { this.zones.push({ name, x0, z0, x1, z1, weight }); }

  /** Wall running along X at depth z (thickness t) from a..b, vertical span y0..y1, with openings [{c,w,sill,top}]. */
  wallX(z, a, b, y0, y1, t, openings = [], p = {}) { this._wall(0, z, a, b, y0, y1, t, openings, p); }
  /** Wall running along Z at x, from a..b. */
  wallZ(x, a, b, y0, y1, t, openings = [], p = {}) { this._wall(1, x, a, b, y0, y1, t, openings, p); }
  _wall(axis, at, a, b, y0, y1, t, openings, p) {
    const ops = openings.map(o => ({ ...o, sill: o.sill ?? 0 })).map(o => ({ ...o, top: o.top ?? (o.sill === 0 ? 2.7 : o.sill + 1.4) })).sort((q, r) => q.c - r.c);
    const mk = (u0, u1, v0, v1) => {
      if (u1 - u0 < 0.01 || v1 - v0 < 0.01) return;
      if (axis === 0) this.box(u0, v0, at - t / 2, u1, v1, at + t / 2, p); else this.box(at - t / 2, v0, u0, at + t / 2, v1, u1, p);
    };
    let cur = a;
    for (const o of ops) {
      const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
      mk(cur, o0, y0, y1);
      if (o.sill > 0.01) mk(o0, o1, y0, y0 + o.sill);
      if (y0 + o.top < y1 - 0.01) mk(o0, o1, y0 + o.top, y1);
      if (o.sill <= 0.01) {
        if (axis === 0) { this.node(o.c, y0, at, 'door'); this.node(o.c, y0, at - t / 2 - 1.1, 'door'); this.node(o.c, y0, at + t / 2 + 1.1, 'door'); }
        else { this.node(at, y0, o.c, 'door'); this.node(at - t / 2 - 1.1, y0, o.c, 'door'); this.node(at + t / 2 + 1.1, y0, o.c, 'door'); }
      }
      cur = o1;
    }
    mk(cur, b, y0, y1);
  }

  /** Stairs: `steps` risers climbing `rise` metres, each `run` long, `w` wide, direction dir ('+x','-x','+z','-z'). (x, z) = start of the first step (centre line). */
  stairs({ x, z, dir, w, y0 = 0, rise, steps, run = 0.5, mat = 'concrete', color = 0x8b8f94, rail = false }) {
    const h = rise / steps;
    for (let i = 0; i < steps; i++) {
      const top = y0 + h * (i + 1), d0 = i * run, d1 = (i + 1) * run, p = { mat, color, tag: 'stairs', mantle: false };
      if (dir === '+x') this.box(x + d0, y0 - 0.2, z - w / 2, x + d1, top, z + w / 2, p);
      else if (dir === '-x') this.box(x - d1, y0 - 0.2, z - w / 2, x - d0, top, z + w / 2, p);
      else if (dir === '+z') this.box(x - w / 2, y0 - 0.2, z + d0, x + w / 2, top, z + d1, p);
      else this.box(x - w / 2, y0 - 0.2, z - d1, x + w / 2, top, z - d0, p);
    }
    const L = run * steps, sgn = dir[0] === '+' ? 1 : -1, alongX = dir[1] === 'x';
    const ox = alongX ? sgn : 0, oz = alongX ? 0 : sgn;
    this.node(x - ox * 0.7, y0, z - oz * 0.7, 'stairs');
    const cnt = Math.max(2, Math.ceil(L / 1.4));
    for (let i = 0; i <= cnt; i++) {
      const d = L * i / cnt, k = Math.min(steps, Math.floor(d / run + 1e-6) + 1);
      this.node(x + ox * d, y0 + h * k, z + oz * d, 'stairs');
    }
    this.node(x + ox * (L + 0.8), y0 + rise, z + oz * (L + 0.8), 'stairs');
    if (rail) {
      for (const s of [-1, 1]) {
        const px = alongX ? 0 : s * (w / 2 + 0.05), pz = alongX ? s * (w / 2 + 0.05) : 0;
        const ax = x + px, az = z + pz, bx = x + ox * L + px, bz = z + oz * L + pz;
        this.deco(Math.min(ax, bx) - 0.03, y0 + 0.4, Math.min(az, bz) - 0.03, Math.max(ax, bx) + 0.03, y0 + rise + 0.9, Math.max(az, bz) + 0.03, { mat: 'fence', color: 0x3b4048, group: 'rail' });
      }
    }
  }

  container(x, z, along = 'x', colorKey = 'red', lvl = 0) {
    const sx = along === 'x' ? CONTAINER.L : CONTAINER.W, sz = along === 'x' ? CONTAINER.W : CONTAINER.L;
    const col = typeof colorKey === 'number' ? colorKey : PALETTE[colorKey] ?? PALETTE.red;
    return this.box(x - sx / 2, lvl * CONTAINER.H, z - sz / 2, x + sx / 2, (lvl + 1) * CONTAINER.H, z + sz / 2, { mat: 'metal', color: col, tag: 'container', along });
  }
  crate(x, z, s = 1.2, lvl = 0, h = null, color = 0x9a7646) { return this.box(x - s / 2, lvl * s, z - s / 2, x + s / 2, lvl * s + (h ?? s), z + s / 2, { mat: 'wood', color, tag: 'crate' }); }
  barrel(x, z, color = 0x3f6fa0, h = 1.0) { return this.box(x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3, { mat: 'metal', shape: 'cyl', color, tag: 'barrel' }); }
  jersey(x, z, along = 'x', len = 3.0) {
    const sx = along === 'x' ? len : 0.6, sz = along === 'x' ? 0.6 : len;
    return this.box(x - sx / 2, 0, z - sz / 2, x + sx / 2, 0.85, z + sz / 2, { mat: 'concrete', color: 0xb4b4ac, tag: 'barrier' });
  }
  pallet(x, z, stack = 1) { for (let i = 0; i < stack; i++) this.box(x - 0.6, i * 0.9, z - 0.5, x + 0.6, i * 0.9 + 0.85, z + 0.5, { mat: 'wood', color: 0xb69462, tag: 'crate' }); }
  ammoCrate(x, z) { this.ammo.push({ x, z }); this.box(x - 0.45, 0, z - 0.3, x + 0.45, 0.5, z + 0.3, { mat: 'metal', color: 0x4d5d3a, tag: 'ammo' }); }
}

// ---------------------------------------------------------------------------------------------------------------
// Saltworks Docks
// ---------------------------------------------------------------------------------------------------------------
export function buildSaltworks() {
  const B = new MapBuilder('Saltworks Docks');
  const W = 54, N = -36, S = 38;
  B.bounds = { x0: -W + 1, x1: W - 1, z0: N + 1, z1: S - 1 };

  // ---- ground, perimeter, sea edge ----
  B.box(-W - 6, -3, N - 2, W + 6, 0, S + 2, { mat: 'ground', color: 0x8c8c85, tag: 'ground', mantle: false });
  B.box(-W - 2, 0, N - 2, -W, 9, S + 2, { mat: 'concrete', color: 0x7e8288, tag: 'perimeter', mantle: false });
  B.box(W, 0, N - 2, W + 2, 9, S + 2, { mat: 'concrete', color: 0x7e8288, tag: 'perimeter', mantle: false });
  B.box(-W, 0, S, W, 9, S + 2, { mat: 'concrete', color: 0x7e8288, tag: 'perimeter', mantle: false });
  B.box(-W, 0, N - 0.2, W, 3.0, N + 0.2, { mat: 'fence', color: 0x4a4f55, tag: 'fence', mantle: false });
  B.box(-W, 3.0, N - 0.2, W, 40, N + 0.2, { mat: 'fence', visible: false, tag: 'ceiling', mantle: false });
  B.deco(-W, 0, N + 0.4, W, 0.25, N + 1.0, { mat: 'concrete', color: 0xc4c1b4 });
  B.deco(-W, 0.012, N + 3.6, W, 0.02, N + 3.8, { mat: 'ground', color: 0xe0c040, group: 'paint' });

  // =============================================================================================================
  // WAREHOUSE (west): x -26..-8, z -12..8. Ground floor + mezzanine over the north half. Roof at y 9.
  // =============================================================================================================
  {
    const x0 = -26, x1 = -8, z0 = -12, z1 = 8, T = 0.4, MZ = 4.4, TOP = 9.0;
    const P = { mat: 'concrete', color: 0xb9b4a6, tag: 'wall', mantle: false };
    const win = (c, sill = 1.1, top = 2.5, w = 1.8) => ({ c, w, sill, top });
    const uw = c => ({ c, w: 1.6, sill: 0.9, top: 2.4 });
    B.wallX(z1, x0 - T / 2, x1 + T / 2, 0, MZ, T, [win(-23.8), { c: -20, w: 1.4 }, { c: -14.5, w: 3.2, top: 3.4 }, win(-10.6)], P);
    B.wallX(z1, x0 - T / 2, x1 + T / 2, MZ, TOP, T, [uw(-23), uw(-17), uw(-11.5)], P);
    B.wallX(z0, x0 - T / 2, x1 + T / 2, 0, MZ, T, [win(-22.5), { c: -16, w: 1.4 }, win(-11)], P);
    B.wallX(z0, x0 - T / 2, x1 + T / 2, MZ, TOP, T, [uw(-23), uw(-18), uw(-13), uw(-9.5)], P);
    B.wallZ(x0, z0 - T / 2, z1 + T / 2, 0, MZ, T, [{ c: 5.2, w: 3.0, top: 3.4 }, win(-8.5)], P);
    B.wallZ(x0, z0 - T / 2, z1 + T / 2, MZ, TOP, T, [uw(-9.5), uw(-6.5), uw(2), uw(5.5)], P);
    B.wallZ(x1, z0 - T / 2, z1 + T / 2, 0, MZ, T, [{ c: -3.2, w: 2.2, top: 2.9 }, { c: 4.8, w: 1.4 }, win(-9), win(0.8)], P);
    B.wallZ(x1, z0 - T / 2, z1 + T / 2, MZ, TOP, T, [uw(-10), uw(-6), uw(-2), uw(2), uw(6)], P);
    B.box(x0 - T / 2, TOP, z0 - T / 2, x1 + T / 2, TOP + 0.4, z1 + T / 2, { mat: 'sheet', color: 0x6d747d, tag: 'roof', mantle: false });
    B.deco(x0 - 0.6, TOP + 0.4, z0 - 0.6, x1 + 0.6, TOP + 0.7, z1 + 0.6, { mat: 'sheet', color: 0x5d646d });
    B.deco(x0 - 0.25, 0, z1 + 0.2, x1 + 0.25, 0.5, z1 + 0.45, { mat: 'concrete', color: 0x8a8f95 });
    // mezzanine slab (north half), pillars, railing
    const mz0 = -11.6, mz1 = -4.6;
    B.box(x0 + 0.2, MZ - 0.35, mz0, x1 - 0.2, MZ, mz1, { mat: 'concrete', color: 0x9c9a94, tag: 'floor', mantle: false });
    for (const px of [-22, -16, -10.2]) B.box(px - 0.3, 0, mz1 - 0.3, px + 0.3, MZ - 0.35, mz1 + 0.3, { mat: 'concrete', color: 0x8c8f93, tag: 'pillar', mantle: false });
    B.box(-23.9, MZ, mz1 - 0.06, x1 - 0.2, MZ + 1.05, mz1 + 0.06, { mat: 'fence', color: 0x3b4048, tag: 'rail' });
    B.stairs({ x: -24.85, z: 2.4, dir: '-z', w: 1.3, y0: 0, rise: MZ, steps: 14, run: 0.5, color: 0x777b82, rail: true });
    // stock on the ground floor
    for (const [cx, cz, s, l] of [[-19, 0.5, 1.4, 0], [-19, 0.5, 1.4, 1], [-13.5, -1.5, 1.6, 0], [-13.5, -1.5, 1.6, 1], [-16.4, 5.6, 1.2, 0], [-10.8, 3, 1.2, 0], [-10.8, 3, 1.2, 1], [-22, 6, 1.2, 0], [-21.9, 4.7, 1.0, 0]]) B.crate(cx, cz, s, l);
    B.pallet(-12, -7.5, 2); B.pallet(-14.5, -9.5, 1); B.pallet(-19.5, -8, 2); B.pallet(-22.5, -9.5, 1);
    for (const rz of [-9.8, -7.4]) B.box(-21, 0, rz - 0.15, -12.5, 2.2, rz + 0.15, { mat: 'wood', color: 0x6b5a45, tag: 'rack' });
    B.box(-17.2, 0.2, 2.2, -15.6, 1.4, 3.6, { mat: 'metal', color: 0xd6a31f, tag: 'vehicle' }); // forklift
    // mezzanine cover
    B.box(-20.6, MZ, -10.2, -19.4, MZ + 1.2, -9.0, { mat: 'wood', color: 0x9a7646, tag: 'crate' });
    B.box(-14.6, MZ, -8.4, -13.4, MZ + 1.0, -7.2, { mat: 'wood', color: 0x9a7646, tag: 'crate' });
    B.box(-11.6, MZ, -11.1, -9.2, MZ + 1.1, -10.1, { mat: 'metal', color: 0x59616c, tag: 'cabinet' });
    B.box(-23.2, MZ, -8.0, -22.2, MZ + 1.3, -6.4, { mat: 'metal', color: 0x59616c, tag: 'cabinet' });
    for (const lx of [-22, -17, -12]) for (const lz of [-8, -1, 5]) B.lamp(lx, TOP - 0.5, lz);
    for (const lx of [-22, -16, -10]) B.lamp(lx, MZ - 0.45, -8);
    B.ammoCrate(-12.5, 5.8);
  }

  // =============================================================================================================
  // OFFICE (east): x 8..26, z -10..6. Two floors, stairs in the hall. Floor 2 at y 4.0, roof at 7.8.
  // =============================================================================================================
  {
    const x0 = 8, x1 = 26, z0 = -10, z1 = 6, T = 0.35, F2 = 4.0, TOP = 7.8;
    const P = { mat: 'brick', color: 0xa8694f, tag: 'wall', mantle: false };
    const D = { mat: 'drywall', color: 0xddd8c8, tag: 'partition', mantle: false };
    const lw = c => ({ c, w: 1.6, sill: 1.0, top: 2.3 });
    const uw = c => ({ c, w: 1.5, sill: 0.9, top: 2.2 });
    B.wallZ(x0, z0 - T / 2, z1 + T / 2, 0, F2, T, [{ c: -2, w: 1.8, top: 2.6 }, lw(-7.2), lw(3.2)], P);
    B.wallZ(x0, z0 - T / 2, z1 + T / 2, F2, TOP, T, [uw(-8), uw(-5), uw(-2), uw(1), uw(4)], P);
    B.wallZ(x1, z0 - T / 2, z1 + T / 2, 0, F2, T, [{ c: -6, w: 1.4, top: 2.6 }, lw(0), lw(3.5)], P);
    B.wallZ(x1, z0 - T / 2, z1 + T / 2, F2, TOP, T, [uw(-8), uw(-4), uw(0), uw(3.5)], P);
    B.wallX(z1, x0 - T / 2, x1 + T / 2, 0, F2, T, [{ c: 22.5, w: 1.4, top: 2.6 }, lw(12.5), lw(17)], P);
    B.wallX(z1, x0 - T / 2, x1 + T / 2, F2, TOP, T, [uw(11.5), uw(15), uw(18.5), uw(22)], P);
    B.wallX(z0, x0 - T / 2, x1 + T / 2, 0, F2, T, [{ c: 13.5, w: 1.4, top: 2.6 }, lw(19.5), lw(23.5)], P);
    B.wallX(z0, x0 - T / 2, x1 + T / 2, F2, TOP, T, [uw(11.5), uw(15.5), uw(19.5), uw(23.5)], P);
    B.box(x0 - T / 2, TOP, z0 - T / 2, x1 + T / 2, TOP + 0.35, z1 + T / 2, { mat: 'concrete', color: 0x6f747a, tag: 'roof', mantle: false });
    B.deco(x0 - 0.5, TOP + 0.35, z0 - 0.5, x1 + 0.5, TOP + 0.6, z1 + 0.5, { mat: 'concrete', color: 0x888c92 });
    // floor 2 slab with a stairwell void x 15.2..17.1, z -1.4..5.7
    const sl = { mat: 'concrete', color: 0x9b9a95, tag: 'floor', mantle: false }, fy0 = F2 - 0.35;
    B.box(x0, fy0, z0, 15.2, F2, z1, sl);
    B.box(17.1, fy0, z0, x1, F2, z1, sl);
    B.box(15.2, fy0, z0, 17.1, F2, -1.4, sl);
    B.stairs({ x: 16.15, z: 4.6, dir: '-z', w: 1.5, y0: 0, rise: F2, steps: 13, run: 0.46, color: 0x7a7e84 });
    // partitions: floor 1 then floor 2
    B.wallZ(14.7, z0, z1, 0, F2 - 0.35, 0.2, [{ c: -6, w: 1.2 }, { c: -0.8, w: 1.2 }, { c: 3.6, w: 1.2 }], D);
    B.wallZ(21.3, z0, z1, 0, F2 - 0.35, 0.2, [{ c: -4, w: 1.2 }, { c: 1.6, w: 1.2 }], D);
    B.wallX(-3.4, x0, 14.7, 0, F2 - 0.35, 0.2, [{ c: 11.2, w: 1.2 }], D);
    B.wallX(1.6, x0, 14.7, 0, F2 - 0.35, 0.2, [{ c: 10.6, w: 1.2 }], D);
    B.wallX(-3.0, 21.3, x1, 0, F2 - 0.35, 0.2, [{ c: 23.8, w: 1.2 }], D);
    B.wallX(2.4, 21.3, x1, 0, F2 - 0.35, 0.2, [{ c: 24, w: 1.2 }], D);
    B.wallZ(14.7, z0, z1, F2, TOP, 0.2, [{ c: -7, w: 1.2 }, { c: -2.5, w: 1.2 }, { c: 2.8, w: 1.2 }], D);
    B.wallZ(21.3, z0, z1, F2, TOP, 0.2, [{ c: -5, w: 1.2 }, { c: 0, w: 1.2 }, { c: 4, w: 1.2 }], D);
    B.wallX(-4, x0, 14.7, F2, TOP, 0.2, [{ c: 11.4, w: 1.2 }], D);
    B.wallX(1.2, x0, 14.7, F2, TOP, 0.2, [{ c: 10.8, w: 1.2 }], D);
    B.wallX(-2, 21.3, x1, F2, TOP, 0.2, [{ c: 23.8, w: 1.2 }], D);
    // furniture
    for (const [bx, bz, sx, sz] of [[11.5, -7, 2.4, 0.9], [11, 4, 1.6, 0.9], [24, -7.5, 1.8, 0.9], [24, 4.5, 2.4, 0.9], [18.5, -6.5, 1.6, 1.0], [18.5, -3, 1.6, 1.0]]) B.c(bx, bz, sx, sz, 0.85, { mat: 'wood', color: 0x7b6144, tag: 'desk' });
    for (const [bx, bz, sx, sz] of [[11.5, -7.5, 2.2, 0.9], [11.5, 4.5, 2.4, 0.9], [24, -8, 2.0, 0.9], [24, 4.5, 2.4, 0.9], [18.5, -8, 1.6, 1.0], [18.5, 3, 1.4, 1.0]]) B.c(bx, bz, sx, sz, 0.9, { y: F2, mat: 'wood', color: 0x7b6144, tag: 'desk' });
    for (const lx of [11.5, 18, 24]) for (const lz of [-7, -1, 4]) { B.lamp(lx, F2 - 0.5, lz); B.lamp(lx, TOP - 0.4, lz); }
    B.ammoCrate(22.5, 5.2);
  }

  // =============================================================================================================
  // GUARD HUT (centre north)
  // =============================================================================================================
  {
    const x0 = -3.5, x1 = 3.5, z0 = -23, z1 = -18, T = 0.3, H = 3.0;
    const P = { mat: 'concrete', color: 0xc9c5b6, tag: 'wall', mantle: false };
    B.wallX(z1, x0, x1, 0, H, T, [{ c: -0.8, w: 1.2 }, { c: 2.2, w: 1.5, sill: 1.0, top: 2.2 }], P);
    B.wallX(z0, x0, x1, 0, H, T, [{ c: 1, w: 1.5, sill: 1.0, top: 2.2 }], P);
    B.wallZ(x0, z0, z1, 0, H, T, [{ c: -20.5, w: 1.2 }, { c: -22, w: 1.2, sill: 1.1, top: 2.2 }], P);
    B.wallZ(x1, z0, z1, 0, H, T, [{ c: -20.5, w: 1.2, sill: 1.1, top: 2.2 }], P);
    B.box(x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.3, z1 + 0.3, { mat: 'concrete', color: 0x7e8288, tag: 'roof', mantle: false });
    B.c(1.8, -21.8, 2.2, 0.8, 0.85, { mat: 'wood', color: 0x7b6144, tag: 'desk' });
    B.lamp(0, H - 0.3, -20.5);
  }

  // =============================================================================================================
  // WATCH TOWER (south centre) with a stair run, plus salt piles
  // =============================================================================================================
  {
    const cx = 0, cz = 25, H = 4.4;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(cx + dx * 2.2 - 0.3, 0, cz + dz * 2.2 - 0.3, cx + dx * 2.2 + 0.3, H - 0.3, cz + dz * 2.2 + 0.3, { mat: 'metal', color: 0x4a5560, tag: 'leg', mantle: false });
    B.box(cx - 2.8, H - 0.3, cz - 2.8, cx + 2.8, H, cz + 2.8, { mat: 'concrete', color: 0x9c9a94, tag: 'floor', mantle: false });
    const rail = { mat: 'fence', color: 0x3b4048, tag: 'rail' };
    B.box(cx - 2.8, H, cz + 2.7, cx + 2.8, H + 1.05, cz + 2.8, rail);
    B.box(cx - 2.8, H, cz - 2.8, cx + 2.8, H + 1.05, cz - 2.7, rail);
    B.box(cx + 2.7, H, cz - 2.8, cx + 2.8, H + 1.05, cz + 2.8, rail);
    B.box(cx - 2.8, H, cz - 2.8, cx - 2.7, H + 1.05, cz - 0.85, rail); B.box(cx - 2.8, H, cz + 0.85, cx - 2.7, H + 1.05, cz + 2.8, rail);   // gap for the stairs
    B.deco(cx - 3.1, H + 2.7, cz - 3.1, cx + 3.1, H + 2.9, cz + 3.1, { mat: 'sheet', color: 0x59616c });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.deco(cx + dx * 2.7 - 0.05, H, cz + dz * 2.7 - 0.05, cx + dx * 2.7 + 0.05, H + 2.7, cz + dz * 2.7 + 0.05, { mat: 'metal', color: 0x3b4048 });
    B.stairs({ x: cx - 2.8 - 7.5, z: cz, dir: '+x', w: 1.3, y0: 0, rise: H, steps: 15, run: 0.5, color: 0x777b82, rail: true });
    // salt piles (stepped mounds: each layer is mantle height)
    const pile = (px, pz, a, b, c) => {
      B.box(px - a, 0, pz - a, px + a, 1.2, pz + a, { mat: 'salt', color: 0xf0f0ec, tag: 'salt' });
      B.box(px - b, 1.2, pz - b, px + b, 2.4, pz + b, { mat: 'salt', color: 0xf4f4f0, tag: 'salt' });
      if (c) B.box(px - c, 2.4, pz - c, px + c, 3.4, pz + c, { mat: 'salt', color: 0xf8f8f4, tag: 'salt' });
    };
    for (const m of [-1, 1]) { pile(m * 17, 24, 4.0, 2.6, 1.2); pile(m * 38, 1.5, 3.0, 1.8, 0); }
    B.ammoCrate(0, 29);
  }

  // =============================================================================================================
  // CONTAINER YARDS, QUAY, SPAWN COMPOUNDS. West half is authored; the east half mirrors it with swapped colours.
  // =============================================================================================================
  const swap = { red: 'blue', blue: 'orange', orange: 'green', green: 'red', white: 'yellow', yellow: 'teal', teal: 'white', brown: 'gray', gray: 'brown', rust: 'navy', navy: 'rust' };
  const both = (x, z, along, col, lvl = 0) => { B.container(x, z, along, col, lvl); B.container(-x, z, along, swap[col] || col, lvl); };
  // quay row (z -30.5)
  both(-47, -30.5, 'x', 'blue'); both(-40.9, -30.5, 'x', 'orange');
  both(-30, -30.5, 'x', 'red'); both(-23.9, -30.5, 'x', 'green'); both(-23.9, -30.5, 'x', 'white', 1); both(-17.8, -30.5, 'x', 'teal');
  both(-9.5, -29.8, 'z', 'yellow');
  // second row (z -25)
  both(-44, -24.8, 'x', 'gray'); both(-44, -24.8, 'x', 'red', 1); both(-35.5, -24.8, 'x', 'brown');
  both(-26.5, -25.2, 'x', 'navy'); both(-14.5, -25, 'z', 'rust');
  // north yard blockers
  both(-34, -16.5, 'z', 'green'); both(-17, -17.2, 'x', 'orange'); both(-40, -14, 'z', 'white');
  // west/east spawn compounds (x 34..50)
  both(-35.5, -7, 'z', 'red'); both(-35.5, 7.5, 'z', 'blue'); both(-35.5, 13.6, 'z', 'blue');
  both(-48, -16, 'x', 'teal'); both(-48, 17, 'x', 'orange'); both(-42, 21.5, 'x', 'red'); both(-47.5, 25.5, 'x', 'gray');
  // south yard
  both(-30.1, 16.5, 'x', 'white'); both(-23.9, 16.5, 'x', 'rust', 1); both(-23.9, 16.5, 'x', 'yellow'); both(-30, 29.5, 'x', 'brown'); both(-23.9, 29.5, 'x', 'blue');
  both(-36, 25, 'z', 'orange'); both(-17, 32, 'x', 'green'); both(-8, 17.5, 'z', 'gray');
  // cover: crates, barriers, barrels (also mirrored)
  const cover = (fn) => { fn(1); fn(-1); };
  cover(m => {
    B.jersey(m * 4.2, -5.5, 'z', 3.4); B.jersey(m * 4.2, 3.5, 'z', 3.4); B.jersey(m * 1.5, 12.5, 'x', 3.0);
    B.crate(m * 5.5, -11, 1.4); B.crate(m * 5.5, -11, 1.4, 1); B.crate(m * 6.9, -11.2, 1.0);
    B.crate(m * 6.0, 9.6, 1.2); B.crate(m * 7.3, 10.2, 1.2); B.crate(m * 6.6, 9.9, 1.2, 1);
    B.crate(m * 28, -19, 1.4); B.crate(m * 28, -19, 1.4, 1); B.crate(m * 29.8, -19.2, 1.4);
    B.crate(m * 31, 11, 1.2); B.crate(m * 32.4, 11.5, 1.2); B.crate(m * 31.5, 12.3, 1.0);
    B.pallet(m * 13.5, -16, 2); B.pallet(m * 29, 5, 1); B.pallet(m * 30.5, 5.2, 2);
    B.barrel(m * 42, -3, 0x3f6fa0); B.barrel(m * 42.8, -2.4, 0xb5382f); B.barrel(m * 42.2, -1.7, 0x3f6fa0);
    B.barrel(m * 11.2, 14, 0xd6a31f); B.barrel(m * 11.9, 14.6, 0xd6a31f);
    B.jersey(m * 40, -10.5, 'x', 3.0); B.jersey(m * 40, 10.5, 'x', 3.0); B.jersey(m * 42.5, 0, 'z', 3.4);
    B.crate(m * 43.5, -6, 1.2); B.crate(m * 43.5, 6.4, 1.2); B.crate(m * 44.7, 6.4, 1.2);
    B.jersey(m * 20, 14, 'z', 3.4); B.jersey(m * 20, -18, 'z', 3.4);
    B.ammoCrate(m * 45.5, -9.8);
  });
  // wrecked truck on the plaza (centre), a fuel tank pair, and flatbed cover
  B.box(-3.2, 0.5, -10.8, 3.2, 3.0, -8.4, { mat: 'metal', color: 0x59616c, tag: 'vehicle' });
  B.box(-3.2, 0.5, -8.4, 3.2, 1.4, -6.9, { mat: 'metal', color: 0x59616c, tag: 'vehicle' });
  B.box(-3.2, 0, -10.8, 3.2, 0.5, -6.9, { mat: 'metal', color: 0x2f343b, tag: 'vehicle', visible: true });
  B.box(-1.5, 0, -1.6, 1.5, 1.2, 1.6, { mat: 'concrete', color: 0xb6b2a3, tag: 'plinth' });
  B.box(-0.55, 1.2, -0.55, 0.55, 2.2, 0.55, { mat: 'metal', color: 0xd6a31f, tag: 'monument', shape: 'cyl' });
  B.c(0, 8.5, 5.0, 1.4, 0.95, { mat: 'wood', color: 0x7b6144, tag: 'bench' });
  // quay crane legs (collide) and bridge (visual)
  for (const cxm of [-32, 32]) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(cxm + dx * 3 - 0.45, 0, -33 + dz * 1.4 - 0.45, cxm + dx * 3 + 0.45, 9, -33 + dz * 1.4 + 0.45, { mat: 'metal', color: 0xd6a31f, tag: 'crane', mantle: false });
    B.deco(cxm - 3.8, 9, -35.2, cxm + 3.8, 10.2, -30.8, { mat: 'metal', color: 0xd6a31f });
    B.deco(cxm - 0.4, 10.2, -60, cxm + 0.4, 11.2, -31, { mat: 'metal', color: 0xc9961c });
  }

  B.zone('warehouse', -26, -12, -8, 8, 2.4); B.zone('office', 8, -10, 26, 6, 2.4); B.zone('hut', -3.5, -23, 3.5, -18, 0.8); B.zone('tower', -3, 22, 3, 28, 1.2);
  // ---- spawns ----
  const ys = [-12, -7.5, -3, 1.5, 6, 10.5];
  ys.forEach((z, i) => { B.spawn('A', -49 + (i % 2) * 2.2, z, Math.PI / 2); B.spawn('B', 49 - (i % 2) * 2.2, z, -Math.PI / 2); });
  for (const [x, z] of [[-30, -21], [30, -21], [-5, -27], [5, -27], [-5, 18], [5, 18], [-30, 22], [30, 22], [0, -14], [0, 6], [-20.5, 3.4], [18, -1], [-15.5, -4], [-40, 28], [40, 28], [-18, 12], [18, 12], [-12, -20], [12, -20], [22, -6], [-34, -27], [34, -27]]) B.spawn('F', x, z, 0);
  // mezzanine / upstairs spawns for FFA variety
  B.spawns.push({ team: 'F', x: -17, y: 4.4, z: -8.2, h: 0 }, { team: 'F', x: 13.2, y: 4.0, z: -6, h: 0 }, { team: 'F', x: 22, y: 4.0, z: 3, h: Math.PI });
  return B;
}

// ---------------------------------------------------------------------------------------------------------------
// Training Yard (firing range)
// ---------------------------------------------------------------------------------------------------------------
export function buildRange() {
  const B = new MapBuilder('Training Yard');
  const X0 = -48, X1 = 48, ZN = -74, ZS = 52;
  B.bounds = { x0: X0 + 1, x1: X1 - 1, z0: ZN + 1, z1: ZS - 1 };
  B.range = { targets: [], moving: [], gates: [], wall: null, course: null };
  const gnd = { mat: 'ground', color: 0x8f8f86, tag: 'ground', mantle: false };
  // ground with a pit cut out for the obstacle course (x -44..-28, z -5.2..-2.2)
  const PIT = { x0: -44, x1: -28, z0: -5.2, z1: -2.2 };
  B.box(X0 - 4, -3, PIT.z1, X1 + 4, 0, ZS + 2, gnd);
  B.box(X0 - 4, -3, ZN - 2, X1 + 4, 0, PIT.z0, gnd);
  B.box(X0 - 4, -3, PIT.z0, PIT.x0, 0, PIT.z1, gnd);
  B.box(PIT.x1, -3, PIT.z0, X1 + 4, 0, PIT.z1, gnd);
  B.box(PIT.x0, -3.0, PIT.z0, PIT.x1, -2.2, PIT.z1, { mat: 'concrete', color: 0x3a3d42, tag: 'pit', mantle: false });
  // perimeter
  const wall = { mat: 'concrete', color: 0x7e8288, tag: 'perimeter', mantle: false };
  B.box(X0 - 2, 0, ZN - 2, X0, 8, ZS + 2, wall); B.box(X1, 0, ZN - 2, X1 + 2, 8, ZS + 2, wall);
  B.box(X0, 0, ZN - 2, X1, 8, ZN, wall); B.box(X0, 0, ZS, X1, 8, ZS + 2, wall);

  // ---- firing line (z 44) with lane dividers ----
  const FL = 44;
  for (const lx of [-24, -12, 0, 12, 24]) B.box(lx - 0.15, 0, FL - 0.2, lx + 0.15, 1.1, FL + 2.2, { mat: 'concrete', color: 0xb9b6aa, tag: 'divider' });
  for (let i = 0; i < 4; i++) {
    const lx = -18 + i * 12;
    B.box(lx - 1.0, 0, FL + 1.2, lx + 1.0, 1.0, FL + 1.8, { mat: 'concrete', color: 0xa9a79c, tag: 'bench' });
    B.deco(lx - 1.0, 1.0, FL + 1.2, lx + 1.0, 1.05, FL + 1.8, { mat: 'metal', color: 0x2f343b });
    B.deco(lx - 0.8, 0.012, FL - 0.8, lx + 0.8, 0.02, FL - 0.2, { mat: 'ground', color: 0xf2f2f2, group: 'paint' });
  }
  // distance marker walls (low) every lane at 10/25/40/60 m so range is readable
  for (const d of [10, 25, 40, 60]) for (let i = 0; i < 4; i++) {
    const lx = -18 + i * 12;
    B.deco(lx - 2.2, 0.012, FL - d - 0.15, lx + 2.2, 0.02, FL - d + 0.15, { mat: 'ground', color: 0xf2d640, group: 'paint' });
  }
  // ---- pop-up targets in 5 lanes ----
  const dist = [12, 25, 40, 60];
  for (let i = 0; i < 4; i++) for (const d of dist) {
    const x = -18 + i * 12 + (d % 2 ? 2.2 : -2.2) * (i % 2 ? 1 : -1);
    B.range.targets.push({ x, z: FL - d, h: 0, kind: 'popup', dist: d, lane: i });
    B.box(x - 0.5, 0, FL - d + 0.9, x + 0.5, 0.35, FL - d + 1.3, { mat: 'concrete', color: 0x6d7076, tag: 'base' });
  }
  // ---- moving targets on rails (two rails) ----
  for (const [rz, spd, d] of [[FL - 32, 3.0, 32], [FL - 52, 4.4, 52]]) {
    B.range.moving.push({ z: rz, x0: -26, x1: 26, speed: spd, dist: d });
    B.deco(-27, 0.0, rz - 0.4, 27, 0.12, rz + 0.4, { mat: 'metal', color: 0x2f343b });
    B.box(-28.5, 0, rz - 0.8, -27, 1.0, rz + 0.8, { mat: 'concrete', color: 0x6d7076, tag: 'stop' });
    B.box(27, 0, rz - 0.8, 28.5, 1.0, rz + 0.8, { mat: 'concrete', color: 0x6d7076, tag: 'stop' });
  }
  // ---- back berm so misses stop ----
  B.box(-34, 0, ZN + 4, 34, 6, ZN + 8, { mat: 'concrete', color: 0x6c655c, tag: 'berm', mantle: false });

  // ---- recoil wall bay (east): shoot from (36, 44) at the wall 25 m away ----
  {
    const wz = FL - 25; // 19
    B.box(26, 0, wz - 0.4, 46, 7, wz, { mat: 'concrete', color: 0xcfcdc4, tag: 'recoilwall', mantle: false });
    B.range.wall = { x0: 26, x1: 46, y0: 0, y1: 7, z: wz, cx: 36, standX: 36, standZ: FL };
    // paint a grid and a centre cross
    for (let gx = 28; gx <= 44; gx += 2) B.deco(gx - 0.02, 0.0, wz + 0.01, gx + 0.02, 7, wz + 0.02, { mat: 'ground', color: 0x2a2d31, group: 'paint' });
    for (let gy = 1; gy <= 6; gy += 1) B.deco(26, gy - 0.02, wz + 0.01, 46, gy + 0.02, wz + 0.02, { mat: 'ground', color: 0x2a2d31, group: 'paint' });
    B.deco(35.9, 0.0, wz + 0.02, 36.1, 7, wz + 0.03, { mat: 'ground', color: 0xd63a2f, group: 'paint' });
    B.deco(26, 1.64, wz + 0.02, 46, 1.76, wz + 0.03, { mat: 'ground', color: 0xd63a2f, group: 'paint' });
    // bay side walls and a stand marker
    B.box(25.6, 0, wz, 26, 3, FL + 2, { mat: 'concrete', color: 0xb9b6aa, tag: 'divider' });
    B.box(46, 0, wz, 46.4, 3, FL + 2, { mat: 'concrete', color: 0xb9b6aa, tag: 'divider' });
    B.deco(34.8, 0.012, FL - 0.8, 37.2, 0.02, FL - 0.2, { mat: 'ground', color: 0xd63a2f, group: 'paint' });
  }

  // ---- obstacle course (west lane, runs north from the start gate at z 40) ----
  {
    const cx = -36, wd = 14; // course centre line and width (x -43..-29)
    const lx0 = cx - wd / 2, lx1 = cx + wd / 2;
    const side = { mat: 'concrete', color: 0x8a8d92, tag: 'course', mantle: false };
    B.box(lx0 - 0.4, 0, -66, lx0, 3, 44, side); B.box(lx1, 0, -66, lx1 + 0.4, 3, 44, side);
    B.deco(lx0, 0.012, 40, lx1, 0.02, 40.4, { mat: 'ground', color: 0x39d36a, group: 'paint' });      // start line
    B.deco(lx0, 0.012, -62, lx1, 0.02, -61.6, { mat: 'ground', color: 0xf2f2f2, group: 'paint' });   // finish line
    const ob = { mat: 'wood', color: 0x9a7646, tag: 'obstacle' };
    // 1. low wall: vault it (0.9 m) at z 33
    B.box(lx0, 0, 32.7, lx1, 0.95, 33.4, { ...ob, color: 0x5d7a9a });
    // 2. slide bar: a beam at 1.05..1.3 m at z 24 (slide or go prone under it)
    B.box(lx0, 1.05, 23.8, lx1, 1.35, 24.2, { mat: 'metal', color: 0xd6a31f, tag: 'obstacle' });
    B.box(lx0, 0, 23.8, lx0 + 0.3, 1.05, 24.2, { mat: 'metal', color: 0x444a52, tag: 'obstacle' }); B.box(lx1 - 0.3, 0, 23.8, lx1, 1.05, 24.2, { mat: 'metal', color: 0x444a52, tag: 'obstacle' });
    // 3. crawl tunnel z 12..18, roof 0.72 m (prone only)
    B.box(lx0, 0.72, 12, lx1, 1.0, 18, { mat: 'concrete', color: 0x7b7e84, tag: 'obstacle' });
    B.box(lx0, 0, 12, lx0 + 0.6, 0.72, 18, { mat: 'concrete', color: 0x6c6f75, tag: 'obstacle' }); B.box(lx1 - 0.6, 0, 12, lx1, 0.72, 18, { mat: 'concrete', color: 0x6c6f75, tag: 'obstacle' });
    // 4. high wall (1.55 m) with a crate step (0.6): mantle it at z 6
    B.box(lx0, 0, 5.7, lx1, 1.55, 6.3, { ...ob, color: 0x7a5a3a });
    // 5. pit jump (z -6..-2, gap in the ground) with ramp-ups either side: nothing to build, the ground has a hole.
    B.deco(PIT.x0, -2.19, PIT.z0, PIT.x1, -2.18, PIT.z1, { mat: 'ground', color: 0x1f2a3a, group: 'paint' });
    // 6. stairs up to a platform (y 2.2) with stepping blocks, then a drop
    B.stairs({ x: cx, z: -10, dir: '-z', w: 3, y0: 0, rise: 2.2, steps: 8, run: 0.7, color: 0x7e8187 });
    B.box(lx0, 1.9, -22, lx1, 2.2, -15.7, { mat: 'concrete', color: 0x8a8d92, tag: 'obstacle', mantle: false });
    for (const [bx, bz] of [[-3, -25.5], [1, -29.5], [-3, -33.5], [1.5, -37.5]]) B.box(cx + bx - 1.5, 1.9, bz - 1.5, cx + bx + 1.5, 2.2, bz + 1.5, { mat: 'concrete', color: 0x8a8d92, tag: 'obstacle', mantle: false });
    // 7. slalom crates on the ground z -44..-56
    for (let i = 0; i < 5; i++) B.crate(cx + (i % 2 ? 2.6 : -2.6), -44 - i * 3, 1.5, 0, 1.7);
    // gates (checkpoints). Order matters.
    B.range.gates = [
      { id: 'start', x: cx, z: 40, w: wd, kind: 'start' },
      { id: 'cp1', x: cx, z: 21, w: wd, kind: 'check' },
      { id: 'cp2', x: cx, z: 9, w: wd, kind: 'check' },
      { id: 'cp3', x: cx, z: -8, w: wd, kind: 'check' },
      { id: 'cp4', x: cx, z: -40, w: wd, kind: 'check' },
      { id: 'finish', x: cx, z: -62, w: wd, kind: 'finish' },
    ];
    B.range.course = { startX: cx, startZ: 42, startH: Math.PI, killY: -1.2, labels: [
      { z: 36, text: 'START' }, { z: 33, text: 'VAULT' }, { z: 24, text: 'SLIDE' }, { z: 15, text: 'CRAWL' }, { z: 6, text: 'MANTLE' }, { z: -4, text: 'JUMP' }, { z: -12, text: 'CLIMB' }, { z: -60, text: 'FINISH' }] };
  }
  // ammo supply and spawn
  B.ammoCrate(-9.5, 48.5); B.ammoCrate(3.5, 48.5); B.ammoCrate(30, 49);
  B.spawn('A', -3, 48.5, Math.PI);
  return B;
}
