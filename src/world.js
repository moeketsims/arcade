import * as THREE from 'three';
import { mat } from './models.js';
import { rockGeometry } from './scenery.js';

// Colliders: axis-aligned boxes and vertical cylinders. The player is a vertical cylinder (feet position, radius, height).
// Box collider: { kind:'box', min, max, flags } ; Cyl collider: { kind:'cyl', x, z, r, y0, y1, flags }.
// flags: ice, spring (bounce velocity), conveyor {x,z}, hurt, crumble, mover (has delta), solidFromTopOnly.
export class Physics {
  constructor() { this.colliders = []; }
  clear() { this.colliders = []; }
  add(c) { c.delta = c.delta || new THREE.Vector3(); c.active = c.active ?? true; this.colliders.push(c); return c; }
  remove(c) { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); }

  // Moves body (pos = feet) by its velocity and resolves collisions. Returns ground collider or null.
  move(body, dt, stepH = 0.4) {
    const p = body.pos, v = body.vel, r = body.radius, h = body.height;
    const prevY = p.y;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    let ground = null;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        if (!c.active) continue;
        if (c.kind === 'box') {
          const top = c.max.y, bot = c.min.y;
          if (p.y + h <= bot || p.y > top + 0.001) continue;
          const cx = Math.max(c.min.x, Math.min(p.x, c.max.x)), cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
          const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (prevY >= top - 0.06 && p.y <= top + 0.001 && v.y <= 0.001) { p.y = top; if (v.y < 0) v.y = 0; ground = c; continue; }
          if (c.oneWay) continue;
          if (p.y < top && p.y + h > bot) {
            if (prevY + h <= bot + 0.06 && v.y > 0) { p.y = bot - h; v.y = 0; continue; }
            if (top - p.y <= stepH && body.grounded && v.y <= 0.01) { p.y = top; v.y = 0; ground = c; continue; }
            if (d2 > 1e-9) { const d = Math.sqrt(d2), push = r - d; p.x += dx / d * push; p.z += dz / d * push; }
            else {
              const ox = [p.x - c.min.x + r, c.max.x - p.x + r], oz = [p.z - c.min.z + r, c.max.z - p.z + r];
              const m = Math.min(ox[0], ox[1], oz[0], oz[1]);
              if (m === ox[0]) p.x = c.min.x - r; else if (m === ox[1]) p.x = c.max.x + r;
              else if (m === oz[0]) p.z = c.min.z - r; else p.z = c.max.z + r;
            }
            body.hitWall = c;
          }
        } else {
          const top = c.y1, bot = c.y0;
          if (p.y + h <= bot || p.y > top + 0.001) continue;
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
          if (d >= c.r + r) continue;
          if (prevY >= top - 0.06 && p.y <= top + 0.001 && v.y <= 0.001 && d < c.r + r * 0.6) { p.y = top; if (v.y < 0) v.y = 0; ground = c; continue; }
          if (c.oneWay) continue;
          if (p.y < top && p.y + h > bot) {
            if (prevY + h <= bot + 0.06 && v.y > 0) { p.y = bot - h; v.y = 0; continue; }
            if (top - p.y <= stepH && body.grounded && v.y <= 0.01 && d < c.r) { p.y = top; v.y = 0; ground = c; continue; }
            const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
            p.x = c.x + nx * (c.r + r); p.z = c.z + nz * (c.r + r); body.hitWall = c;
          }
        }
      }
    }
    return ground;
  }

  // Highest surface below a point (for shadows / enemy placement).
  groundBelow(x, y, z) {
    let best = -Infinity;
    for (const c of this.colliders) {
      if (!c.active) continue;
      if (c.kind === 'box') { if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= y + 0.01 && c.max.y > best) best = c.max.y; }
      else if (Math.hypot(x - c.x, z - c.z) <= c.r && c.y1 <= y + 0.01 && c.y1 > best) best = c.y1;
    }
    return best;
  }
}

// Level builder: creates meshes + colliders + entity descriptors from compact calls.
export class Builder {
  constructor(game, theme) {
    this.g = game; this.t = theme; this.scene = game.levelRoot; this.phys = game.phys;
    this.ents = game.entities; this.botCount = 0;
  }
  _addMesh(m) { this.scene.add(m); return m; }

  // Solid block with a coloured top slab (grass, snow, metal plate...).
  box(x, y, z, w, h, d, o = {}) {
    const t = this.t, topH = Math.min(0.25, h * 0.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - (o.noTop ? 0 : topH), d), mat(o.side ?? t.side, { rough: 0.85 }));
    body.position.set(x, y - h / 2 - (o.noTop ? 0 : topH / 2), z); body.castShadow = body.receiveShadow = true;
    const grp = new THREE.Group(); grp.add(body);
    if (!o.noTop) { const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, topH, d + 0.12), mat(o.top ?? (o.ice ? t.ice ?? 0xbfefff : t.top), { rough: o.ice ? 0.1 : 0.7, metal: o.ice ? 0.2 : 0 }));
      top.position.set(x, y - topH / 2, z); top.castShadow = top.receiveShadow = true; grp.add(top); }
    this._rock(grp, w * 0.62, d * 0.62,Math.min(9, Math.min(w, d) * 0.75), x, y - h, z, o, h);
    this._addMesh(grp);
    const c = this.phys.add({ kind: 'box', min: new THREE.Vector3(x - w / 2, y - h, z - d / 2), max: new THREE.Vector3(x + w / 2, y, z + d / 2), ...o, mesh: grp });
    return c;
  }
  // Rough rock hanging under terrain platforms (looks only, no collider). Themes opt in with `rocky`;
  // coloured special platforms (movers, crumbles, clouds) and thin slabs are left as they are.
  _rock(grp, rw, rd, depth, x, y, z, o, h, local = false) {
    if (!this.t.rocky || o.top !== undefined || o.noRock || h < 1.5) return;
    const seed = x * 0.73 + y * 0.31 + z * 0.17;
    const m = new THREE.Mesh(rockGeometry(seed), mat(this.t.rock ?? 0x6f5a48, { flat: true, rough: 1 }));
    m.scale.set(rw, depth * (0.85 + (Math.abs(Math.sin(seed * 12.9898)) % 1) * 0.3), rd);
    if (local) m.position.y = y; else m.position.set(x, y, z);
    grp.add(m);
  }
  // Round platform (top at y).
  cyl(x, y, z, r, h, o = {}) {
    const t = this.t, topH = Math.min(0.25, h * 0.4);
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * (o.taper ?? 0.7), h - topH, 28), mat(o.side ?? t.side, { rough: 0.85 }));
    body.position.y = -h / 2 - topH / 2; grp.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.06, topH, 28), mat(o.top ?? (o.ice ? t.ice ?? 0xbfefff : t.top), { rough: o.ice ? 0.1 : 0.7 }));
    top.position.y = -topH / 2; grp.add(top);
    grp.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    const rb = r * (o.taper ?? 0.7) * 0.98;
    this._rock(grp, rb, rb, Math.min(9, r * 1.2), x, -h, z, o, h, true);
    grp.position.set(x, y, z); this._addMesh(grp);
    return this.phys.add({ kind: 'cyl', x, z, r, y0: y - h, y1: y, ...o, mesh: grp });
  }
  // Moving platform: path(t) returns [x,y,z]; size w,h,d; mesh moves with collider.
  mover(path, w, h, d, o = {}) {
    const [x, y, z] = path(0);
    const c = o.round ? this.cyl(x, y, z, w / 2, h, o) : this.box(x, y, z, w, h, d, o);
    const base = c.kind === 'box' ? c.mesh.position.clone() : null;
    c.path = path; c.mover = true; c.home = [x, y, z]; c.size = [w, h, d];
    this.ents.push({ type: 'mover', c, base });
    return c;
  }
  // Platform that falls a moment after you stand on it.
  crumble(x, y, z, w, h, d) {
    const c = this.box(x, y, z, w, h, d, { top: this.t.crumble ?? 0xc9a36b, side: 0x9b7a4b });
    c.crumble = true; this.ents.push({ type: 'crumble', c, timer: -1, home: [x, y, z], fallen: 0 });
    return c;
  }
  hazard(x, y, z, w, h, d, kind = 'lava') {
    const colors = { lava: [0xe0480f, 0xb82a00], spikes: [0xc9d1de, 0x000000], water: [0x2f7fd6, 0x002266], laser: [0xff2d75, 0xff2d75], acid: [0x8cff3a, 0x2a8a00] };
    const [col, em] = colors[kind];
    let m;
    if (kind === 'spikes') {
      m = new THREE.Group();
      for (let i = -w / 2 + 0.3; i <= w / 2 - 0.3; i += 0.6) for (let j = -d / 2 + 0.3; j <= d / 2 - 0.3; j += 0.6) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), mat(col, { metal: 0.6, rough: 0.3 })); s.position.set(i, 0.35, j); s.castShadow = true; m.add(s); }
      m.position.set(x, y - h, z);
    } else {
      const lava = kind === 'lava', tex = lava ? lavaTexture(w, d) : null;
      m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: lava ? 0xffffff : col, map: tex, emissive: lava ? 0xffffff : em, emissiveMap: tex, emissiveIntensity: kind === 'water' ? 0.15 : lava ? 0.9 : 0.9, transparent: !lava, opacity: kind === 'water' ? 0.75 : 0.85, roughness: 0.6 }));
      m.position.set(x, y - h / 2, z);
    }
    this._addMesh(m);
    const hz = { kind, min: new THREE.Vector3(x - w / 2, y - h, z - d / 2), max: new THREE.Vector3(x + w / 2, y, z + d / 2), mesh: m, on: true };
    this.ents.push({ type: 'hazard', hz });
    return hz;
  }
  laser(x, y, z, len, axis = 'x', period = 3, phase = 0, duty = 0.55) {
    const w = axis === 'x' ? len : 0.25, d = axis === 'z' ? len : 0.25;
    const hz = this.hazard(x, y + 0.9, z, w, 0.25, d, 'laser');
    const posts = [];
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 10), mat(0x2a2f45, { metal: 0.6 }));
      p.position.set(x + (axis === 'x' ? s * len / 2 : 0), y + 0.8, z + (axis === 'z' ? s * len / 2 : 0)); p.castShadow = true; this._addMesh(p); posts.push(p); }
    this.ents.push({ type: 'laser', hz, period, phase, duty });
    return hz;
  }
  water(x0, x1, y0, y1, z0, z1, color = 0x2a8fd6) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, roughness: 0.1, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2); this._addMesh(m);
    this.g.waterVolumes.push({ min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1) });
  }
  coin(x, y, z, hidden = false) { this.ents.push({ type: 'coin', pos: new THREE.Vector3(x, y, z), hidden }); }
  coinLine(a, b, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); this.coin(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); } }
  coinRing(x, y, z, r, n, hidden = false) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.coin(x + Math.cos(a) * r, y, z + Math.sin(a) * r, hidden); } }
  coinArc(a, b, hgt, n) { for (let i = 0; i < n; i++) { const t = i / (n - 1); this.coin(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * hgt, a[2] + (b[2] - a[2]) * t); } }
  bot(x, y, z) { this.ents.push({ type: 'bot', pos: new THREE.Vector3(x, y, z), idx: this.botCount++ }); }
  crate(x, y, z) {
    const c = this.phys.add({ kind: 'box', min: new THREE.Vector3(x - 0.5, y, z - 0.5), max: new THREE.Vector3(x + 0.5, y + 1, z + 0.5) });
    this.ents.push({ type: 'crate', pos: new THREE.Vector3(x, y, z), c });
  }
  spring(x, y, z, power = 22, color) {
    const c = this.phys.add({ kind: 'cyl', x, z, r: 0.95, y0: y, y1: y + 0.95, spring: power });
    this.ents.push({ type: 'spring', pos: new THREE.Vector3(x, y, z), c, color: color ?? this.t.spring ?? 0xff4f7b });
  }
  checkpoint(x, y, z) { this.ents.push({ type: 'checkpoint', pos: new THREE.Vector3(x, y, z) }); }
  goal(x, y, z) { this.ents.push({ type: 'goal', pos: new THREE.Vector3(x, y, z) }); }
  powerup(kind, x, y, z) { this.ents.push({ type: 'powerup', kind, pos: new THREE.Vector3(x, y, z) }); }
  magnet(x, y, z) { this.ents.push({ type: 'magnet', pos: new THREE.Vector3(x, y, z) }); }
  enemy(kind, x, y, z, o = {}) { this.ents.push({ type: 'enemy', kind, pos: new THREE.Vector3(x, y, z), ...o }); }
  decor(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; this._addMesh(obj); return obj; }
}

let lavaBase = null;
function lavaTexture(w, d) {
  if (!lavaBase) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#ff6a1a'; c.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {            // dark cooled-rock plates, bright seams between them
      const x = rnd() * 256, y = rnd() * 256, r = 10 + rnd() * 26;
      c.fillStyle = `rgb(${60 + rnd() * 40 | 0},${22 + rnd() * 18 | 0},${12 + rnd() * 10 | 0})`;
      c.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.7 + rnd() * 0.4); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill();
    }
    lavaBase = cv;
  }
  const t = new THREE.CanvasTexture(lavaBase); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 12, d / 12); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
