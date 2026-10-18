// Axis-aligned-box world: collision for walking bodies, ray casts for bullets and sight lines, hit-shape tests.
// Plain numbers only (no THREE objects) so it is fast and runs in Node.

const EPS = 1e-4;

/** Surface materials: how bullets treat them. penCost = effective wood-metres per metre of material (0 = stops everything). */
export const SURFACES = {
  concrete: { penCost: 0, color: 0x9a9a94, fx: 'dust' },
  brick: { penCost: 0, color: 0x8a5b49, fx: 'dust' },
  metal: { penCost: 0, color: 0x5f6b7a, fx: 'spark' },
  sheet: { penCost: 2.5, color: 0x7b8794, fx: 'spark' },   // thin corrugated sheet: stops weak rounds only
  wood: { penCost: 1.0, color: 0x8a6a3f, fx: 'chip' },
  drywall: { penCost: 0.4, color: 0xd8d3c4, fx: 'dust' },
  glass: { penCost: 0, color: 0x9fd8e8, fx: 'glass' },
  fence: { penCost: 0, color: 0x555a60, fx: 'spark', bulletPass: true },
  ground: { penCost: 0, color: 0x777770, fx: 'dust' },
  salt: { penCost: 0, color: 0xeeeeee, fx: 'dust' },
};

let BOX_ID = 0;
export class Box {
  /**
   * props: mat (SURFACES key), color (hex tint), shape ('box'|'cyl'), tag, visible (false = collision only),
   *        solid (false = visual only, skipped by the level), mantle (default true), group (render batch override)
   */
  constructor(x0, y0, z0, x1, y1, z1, props = {}) {
    this.minx = Math.min(x0, x1); this.maxx = Math.max(x0, x1);
    this.miny = Math.min(y0, y1); this.maxy = Math.max(y0, y1);
    this.minz = Math.min(z0, z1); this.maxz = Math.max(z0, z1);
    this.mat = props.mat || 'concrete';
    this.color = props.color ?? SURFACES[this.mat]?.color ?? 0x888888;
    this.shape = props.shape || 'box';
    this.tag = props.tag || '';
    this.visible = props.visible !== false;
    this.mantle = props.mantle !== false;
    this.group = props.group || null;
    this.uv = props.uv || null;
    this.nofaces = props.nofaces || 0; // bit mask of faces not to draw (1:-x 2:+x 4:-y 8:+y 16:-z 32:+z)
    const s = SURFACES[this.mat] || SURFACES.concrete;
    this.penCost = props.penCost ?? s.penCost;
    this.bulletPass = props.bulletPass ?? !!s.bulletPass;
    this.id = BOX_ID++;
    this._stamp = 0;
  }
  get cx() { return (this.minx + this.maxx) / 2; }
  get cy() { return (this.miny + this.maxy) / 2; }
  get cz() { return (this.minz + this.maxz) / 2; }
  get sx() { return this.maxx - this.minx; }
  get sy() { return this.maxy - this.miny; }
  get sz() { return this.maxz - this.minz; }
}

const CELL = 4;
const key = (ix, iz) => ((ix + 1024) << 12) | (iz + 1024);

export class Level {
  constructor() {
    this.boxes = []; this.grid = new Map(); this.stamp = 1;
    this.min = { x: Infinity, z: Infinity }; this.max = { x: -Infinity, z: -Infinity };
    this._tmp = [];
  }
  add(box) {
    this.boxes.push(box);
    const x0 = Math.floor(box.minx / CELL), x1 = Math.floor(box.maxx / CELL), z0 = Math.floor(box.minz / CELL), z1 = Math.floor(box.maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = key(ix, iz); let a = this.grid.get(k); if (!a) this.grid.set(k, a = []); a.push(box);
    }
    this.min.x = Math.min(this.min.x, box.minx); this.min.z = Math.min(this.min.z, box.minz);
    this.max.x = Math.max(this.max.x, box.maxx); this.max.z = Math.max(this.max.z, box.maxz);
    return box;
  }

  /** Collect boxes whose volume overlaps the given AABB (strictly). Returns `out`. */
  query(minx, miny, minz, maxx, maxy, maxz, out = []) {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(key(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const b = a[i]; if (b._stamp === st) continue; b._stamp = st;
        if (minx < b.maxx - EPS && maxx > b.minx + EPS && miny < b.maxy - EPS && maxy > b.miny + EPS && minz < b.maxz - EPS && maxz > b.minz + EPS) out.push(b);
      }
    }
    return out;
  }
  /** Does any solid overlap this AABB? */
  overlaps(minx, miny, minz, maxx, maxy, maxz) {
    const st = ++this.stamp;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(key(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const b = a[i]; if (b._stamp === st) continue; b._stamp = st;
        if (minx < b.maxx - EPS && maxx > b.minx + EPS && miny < b.maxy - EPS && maxy > b.miny + EPS && minz < b.maxz - EPS && maxz > b.minz + EPS) return true;
      }
    }
    return false;
  }
  bodyOverlaps(b, h = b.h) { return this.overlaps(b.x - b.hw, b.y, b.z - b.hw, b.x + b.hw, b.y + h, b.z + b.hw); }
  firstOverlap(b) {
    const st = ++this.stamp, hw = b.hw;
    const minx = b.x - hw, maxx = b.x + hw, minz = b.z - hw, maxz = b.z + hw, miny = b.y, maxy = b.y + b.h;
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(key(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const o = a[i]; if (o._stamp === st) continue; o._stamp = st;
        if (minx < o.maxx - EPS && maxx > o.minx + EPS && miny < o.maxy - EPS && maxy > o.miny + EPS && minz < o.maxz - EPS && maxz > o.minz + EPS) return o;
      }
    }
    return null;
  }

  /** Highest surface top at (x,z) with footprint hw that lies in [yMin, yMax]; -Infinity if none. */
  topBetween(x, z, hw, yMin, yMax) {
    let best = -Infinity; const st = ++this.stamp;
    const x0 = Math.floor((x - hw) / CELL), x1 = Math.floor((x + hw) / CELL), z0 = Math.floor((z - hw) / CELL), z1 = Math.floor((z + hw) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(key(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const b = a[i]; if (b._stamp === st) continue; b._stamp = st;
        if (b.maxy < yMin || b.maxy > yMax) continue;
        if (x - hw < b.maxx - EPS && x + hw > b.minx + EPS && z - hw < b.maxz - EPS && z + hw > b.minz + EPS && b.maxy > best) best = b.maxy;
      }
    }
    return best;
  }
  /** Height of the floor under (x, z): highest top not above y + up. Defaults to 0 when nothing is there. */
  floorY(x, y, z, up = 0.3) {
    const t = this.topBetween(x, z, 0.05, -1000, y + up);
    return t === -Infinity ? 0 : t;
  }
  /** All distinct standing heights at (x, z) where a body of the given size fits (used by nav generation). */
  standHeights(x, z, hw, h, out = []) {
    out.length = 0;
    const tops = [];
    const st = ++this.stamp;
    const x0 = Math.floor((x - hw) / CELL), x1 = Math.floor((x + hw) / CELL), z0 = Math.floor((z - hw) / CELL), z1 = Math.floor((z + hw) / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = this.grid.get(key(ix, iz)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const b = a[i]; if (b._stamp === st) continue; b._stamp = st;
        if (x - hw < b.maxx - EPS && x + hw > b.minx + EPS && z - hw < b.maxz - EPS && z + hw > b.minz + EPS) tops.push(b.maxy);
      }
    }
    tops.sort((p, q) => p - q);
    let last = -99;
    for (const t of tops) {
      if (t - last < 0.05) continue; last = t;
      if (t < -0.01 || t > 30) continue;
      if (!this.overlaps(x - hw, t + 0.02, z - hw, x + hw, t + h, z + hw)) out.push(t);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Ray casts
  // ---------------------------------------------------------------------------------------------------------
  /** Nearest solid hit along a ray. Result object is reused between calls: copy what you need. */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 1000, skipPass = false) {
    const hit = RAY_HIT; hit.box = null; let best = maxT;
    const idx = dx === 0 ? 1e9 : 1 / dx, idy = dy === 0 ? 1e9 : 1 / dy, idz = dz === 0 ? 1e9 : 1 / dz;
    const bs = this.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (skipPass && b.bulletPass) continue;
      let t0 = (b.minx - ox) * idx, t1 = (b.maxx - ox) * idx, tn, tf, ax = 0;
      if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      tn = t0; tf = t1;
      let y0 = (b.miny - oy) * idy, y1 = (b.maxy - oy) * idy; if (y0 > y1) { const s = y0; y0 = y1; y1 = s; }
      if (y0 > tn) { tn = y0; ax = 1; } if (y1 < tf) tf = y1;
      if (tn > tf) continue;
      let z0 = (b.minz - oz) * idz, z1 = (b.maxz - oz) * idz; if (z0 > z1) { const s = z0; z0 = z1; z1 = s; }
      if (z0 > tn) { tn = z0; ax = 2; } if (z1 < tf) tf = z1;
      if (tn > tf || tf < 0 || tn >= best) continue;
      if (tn < 0) { tn = 0; ax = -1; }
      best = tn; hit.box = b; hit.t = tn; hit.tFar = tf; hit.axis = ax;
    }
    if (!hit.box) return null;
    hit.nx = 0; hit.ny = 0; hit.nz = 0;
    if (hit.axis === 0) hit.nx = dx > 0 ? -1 : 1; else if (hit.axis === 1) hit.ny = dy > 0 ? -1 : 1; else if (hit.axis === 2) hit.nz = dz > 0 ? -1 : 1;
    return hit;
  }
  /** Every box crossed by the ray (sorted by entry distance): [{box, t, tFar, nx, ny, nz}]. */
  raycastAll(ox, oy, oz, dx, dy, dz, maxT = 1000, out = []) {
    out.length = 0;
    const idx = dx === 0 ? 1e9 : 1 / dx, idy = dy === 0 ? 1e9 : 1 / dy, idz = dz === 0 ? 1e9 : 1 / dz;
    const bs = this.boxes;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let t0 = (b.minx - ox) * idx, t1 = (b.maxx - ox) * idx, tn, tf, ax = 0;
      if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      tn = t0; tf = t1;
      let y0 = (b.miny - oy) * idy, y1 = (b.maxy - oy) * idy; if (y0 > y1) { const s = y0; y0 = y1; y1 = s; }
      if (y0 > tn) { tn = y0; ax = 1; } if (y1 < tf) tf = y1;
      if (tn > tf) continue;
      let z0 = (b.minz - oz) * idz, z1 = (b.maxz - oz) * idz; if (z0 > z1) { const s = z0; z0 = z1; z1 = s; }
      if (z0 > tn) { tn = z0; ax = 2; } if (z1 < tf) tf = z1;
      if (tn > tf || tf < 0 || tn >= maxT) continue;
      let nx = 0, ny = 0, nz = 0;
      if (tn < 0) { tn = 0; ax = -1; } else if (ax === 0) nx = dx > 0 ? -1 : 1; else if (ax === 1) ny = dy > 0 ? -1 : 1; else nz = dz > 0 ? -1 : 1;
      out.push({ box: b, t: tn, tFar: Math.min(tf, maxT), nx, ny, nz });
    }
    out.sort((p, q) => p.t - q.t);
    return out;
  }
  /** True if a solid (not bullet-passable) lies between a and b. */
  blocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return false;
    const h = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.02, true);
    return !!h;
  }
}
const RAY_HIT = { box: null, t: 0, tFar: 0, axis: 0, nx: 0, ny: 0, nz: 0 };

// ---------------------------------------------------------------------------------------------------------------
// Walking bodies
// ---------------------------------------------------------------------------------------------------------------
/** Body: { x, y, z (feet), vx, vy, vz, hw, h, onGround, stepH } */
export function makeBody(hw = 0.3, h = 1.8) { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hw, h, onGround: false, stepH: 0.55, hitWall: false, hitHead: false, stepped: false, landed: false, fallSpeed: 0 }; }

function moveH(level, b, axis, d, canStep) {
  if (d === 0) return;
  const hw = b.hw, prev = axis === 0 ? b.x : b.z;
  if (axis === 0) b.x += d; else b.z += d;
  for (let it = 0; it < 5; it++) {
    const o = level.firstOverlap(b);
    if (!o) return;
    const rise = o.maxy - b.y;
    if (canStep && rise > 0.001 && rise <= b.stepH) {
      const oldY = b.y; b.y = o.maxy + 0.002;
      if (!level.bodyOverlaps(b)) { b.stepped = true; continue; }
      b.y = oldY;
    }
    if (axis === 0) { b.x = d > 0 ? o.minx - hw - EPS * 2 : o.maxx + hw + EPS * 2; b.vx = 0; } else { b.z = d > 0 ? o.minz - hw - EPS * 2 : o.maxz + hw + EPS * 2; b.vz = 0; }
    b.hitWall = true;
  }
  // could not resolve cleanly: undo the move
  if (level.firstOverlap(b)) { if (axis === 0) b.x = prev; else b.z = prev; }
}
function moveV(level, b, d) {
  if (d === 0) return;
  const prev = b.y;
  b.y += d;
  for (let it = 0; it < 4; it++) {
    const o = level.firstOverlap(b);
    if (!o) return;
    if (d < 0) { b.y = o.maxy; b.fallSpeed = -b.vy; b.vy = 0; b.onGround = true; } else { b.y = o.miny - b.h - EPS * 2; b.vy = Math.min(0, b.vy); b.hitHead = true; }
  }
  if (level.firstOverlap(b)) b.y = prev;
}

/** Advance a body by dt with gravity already applied to vy by the caller. */
export function moveBody(level, b, dt) {
  b.hitWall = false; b.hitHead = false; b.stepped = false; b.landed = false;
  const wasGround = b.onGround;
  const startVy = b.vy;
  moveH(level, b, 0, b.vx * dt, wasGround);
  moveH(level, b, 2, b.vz * dt, wasGround);
  b.onGround = false;
  b.fallSpeed = 0;
  moveV(level, b, b.vy * dt);
  if (!b.onGround && b.vy <= 0.001) {
    // standing on something within a hair?
    let top = level.topBetween(b.x, b.z, b.hw - 0.02, b.y - 0.035, b.y + 0.001);
    if (top === -Infinity && wasGround && startVy <= 0.001) top = level.topBetween(b.x, b.z, b.hw - 0.02, b.y - b.stepH, b.y + 0.001); // walking down stairs
    if (top !== -Infinity) { b.y = top; b.onGround = true; if (b.vy < 0) { b.fallSpeed = Math.max(b.fallSpeed, -b.vy); b.vy = 0; } }
  }
  if (b.onGround && !wasGround) b.landed = true;
}

/** Can a body walk from A to B (straight line, stairs allowed) without hitting walls or leaving the floor? */
export function walkClear(level, ax, ay, az, bx, by, bz, hw = 0.32, h = 1.8, step = 0.3) {
  const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(dist / step));
  let lastGround = ay;
  for (let i = 1; i <= n; i++) {
    const k = i / n, x = ax + dx * k, z = az + dz * k;
    const yExp = ay + (by - ay) * k;
    // floor under this sample must be close to where we expect to be (no gaps, no cliffs)
    const g = level.topBetween(x, z, 0.12, yExp - 0.75, yExp + 0.55);
    if (g === -Infinity) return false;
    if (Math.abs(g - lastGround) > 0.5) return false;
    lastGround = g;
    // body volume (lifted by the step height so stair risers don't count as walls)
    if (level.overlaps(x - hw, g + 0.58, z - hw, x + hw, g + h, z + hw)) return false;
    // low obstacle between 0.02..0.58 that is higher than a step: handled by the g continuity check above
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Hit shapes (rays vs spheres/capsules)
// ---------------------------------------------------------------------------------------------------------------
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz;
  const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  const s = Math.sqrt(h);
  let t = -b - s;
  if (t < 0) t = -b + s; // origin inside
  return t;
}
/** Ray vs capsule (segment a→b, radius r). Returns distance or -1. Direction must be normalised. */
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  if (baba < 1e-10) return raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r);
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  if (a > 1e-9) {
    let h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (y > 0 && y < baba) return t >= 0 ? t : -1;
      // end caps
      const ocx = y <= 0 ? oax : ox - bx, ocy = y <= 0 ? oay : oy - by, ocz = y <= 0 ? oaz : oz - bz;
      b = dx * ocx + dy * ocy + dz * ocz; c = ocx * ocx + ocy * ocy + ocz * ocz - r * r; h = b * b - c;
      if (h > 0) { const tt = -b - Math.sqrt(h); return tt >= 0 ? tt : -1; }
    }
    return -1;
  }
  // ray parallel to the axis: test both end spheres
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r), t2 = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r);
  if (t1 < 0) return t2; if (t2 < 0) return t1; return Math.min(t1, t2);
}

/** Squared distance from point p to segment a→b. */
export function distSegSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + abx * t - px, qy = ay + aby * t - py, qz = az + abz * t - pz;
  return qx * qx + qy * qy + qz * qz;
}
