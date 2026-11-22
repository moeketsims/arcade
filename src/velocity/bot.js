// Velocity Divide: a simple autopilot for each kind of mission. The Node tests and ?auto=1 in the browser both use it.
import { DT } from './sim.js';
const H = Math.hypot;

export class Bot {
  constructor(sim) { this.s = sim; this.i = 0; this.t = 0; this.hold = 0; this.ph = 0; this.path = null; this.tg = null; this.re = false; }
  input() {
    const s = this.s, k = s.m.kind; this.t += DT; this.ph = (this.ph + 1) % 6;
    if (s.p.dead > 0) this.re = true; else if (this.re) { this.re = false; this.respawned(); }
    const o = s.p.dead > 0 || s.done ? {} : k === 'boss' ? this.boss() : k === 'seek' ? this.seek() : k === 'mech' ? this.mech() : this.run();
    return { x: o.x || 0, y: -(o.z || 0), yaw: 0, jump: !!o.jump, act: !!o.act, dash: false };
  }
  respawned() {
    const rt = this.s.lv.route, c = this.s.check; this.path = null; this.hold = 0; if (!rt.length) return;
    let j = 0, bd = 1e9; rt.forEach((w, i) => { const d = H(w.x - c.x, w.z - c.z); if (d < bd) { bd = d; j = i; } });
    this.i = Math.min(rt.length - 1, j + 1);
  }

  run() {
    const s = this.s, p = s.p, rt = s.lv.route, sp = H(p.vx, p.vz), cap = Math.max(4, sp * 0.3);
    while (this.i < rt.length - 1 && H(rt[this.i].x - p.x, rt[this.i].z - p.z) < cap) this.i++;
    const w = this.i >= rt.length - 1 ? s.lv.goal : rt[this.i];
    let dx = w.x - p.x, dz = w.z - p.z; const d = H(dx, dz) || 1; dx /= d; dz /= d;
    const look = 1.2 + sp * 0.12, ahead = s.floorAt(p.x + dx * look, p.z + dz * look, p.y, 6) > -1e8;
    const onLine = e => { const ex = e.x - p.x, ez = e.z - p.z, a = ex * dx + ez * dz; return a > 0 && a < 12 && Math.abs(ex * dz - ez * dx) < 3.5 && Math.abs(e.y - p.y) < 4; };
    const foe = s.enemies.find(e => e.alive && onLine(e)), spring = s.lv.springs.some(onLine), reach = 1.5 + sp * 0.16;
    const hz = [0.6, 1].some(f => { const x = p.x + dx * reach * f, z = p.z + dz * reach * f; return s.lv.hazards.some(h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1 && Math.abs(h.y0 - p.y) < 2); });
    let jump = false, act = false;
    if (p.ground) { if (!ahead && !spring) this.hold = 0.2; else if (hz) this.hold = 0.1; act = !!foe; }   // gaps and zap bars: hop; drones: roll through
    if (this.hold > 0) { this.hold -= DT; jump = true; }
    if (!p.ground && !p.homing && foe && s.lockTarget(s.s.lock, 0.1, false) === foe) jump = this.ph >= 3;   // in the air: homing dash
    return { x: dx, z: dz, jump, act };
  }

  seek() {
    const s = this.s, p = s.p, g = s.lv.grid, tgt = s.shards.find(h => !h.got); if (!tgt) return {};
    const ht = (c, r) => { const ch = g.rows[r]?.[c]; return ch >= '1' && ch <= '9' ? +ch : 0; }, key = (c, r) => c + ',' + r;
    const pc = Math.floor((p.x - g.x0) / g.C), pr = Math.floor((p.z - g.z0) / g.C);
    if (!this.path || this.tg !== tgt || !this.path.some(n => n[0] === pc && n[1] === pr)) {   // shortest walk over the terraces
      const from = new Map([[key(pc, pr), null]]), q = [[pc, pr]]; let end = null;
      while (q.length) {
        const n = q.shift(); if (n[0] === tgt.c && n[1] === tgt.r) { end = n; break; }
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = [n[0] + dc, n[1] + dr]; if (!from.has(key(...m)) && ht(...m) && ht(...m) - ht(...n) <= 2) { from.set(key(...m), n); q.push(m); } }
      }
      this.path = []; for (let n = end; n; n = from.get(key(...n))) this.path.unshift(n);
      if (!this.path.length) this.path = [[pc, pr]]; this.tg = tgt;
    }
    const k = this.path.findIndex(n => n[0] === pc && n[1] === pr), nx = this.path[k + 1];
    const wx = nx ? g.x0 + (nx[0] + 0.5) * g.C : tgt.x, wz = nx ? g.z0 + (nx[1] + 0.5) * g.C : tgt.z, up = nx ? ht(...nx) * g.U - p.y : 0;
    let dx = wx - p.x, dz = wz - p.z; const d = H(dx, dz) || 1; dx /= d; dz /= d;
    const pulse = this.ph >= 3; let jump = false, act = false;
    if (up > 0.4) jump = p.ground ? d < 6.6 && pulse : p.vy > 1 || pulse;   // jump at the wall, hold for height, tap again for the double jump
    const foe = s.enemies.some(e => e.alive && H(e.x - p.x, e.z - p.z) < 3.2 && Math.abs(e.y - p.y) < 3);
    if (p.ground && (foe || (!nx && tgt.buried && d < 1.6))) act = pulse;
    return { x: d < 0.3 ? 0 : dx, z: d < 0.3 ? 0 : dz, jump, act };
  }

  mech() {
    const s = this.s, p = s.p, rt = s.lv.route;
    let foe = null, fd = 28; for (const e of s.enemies) { if (!e.alive) continue; const d = H(e.x - p.x, e.z - p.z); if (d < fd) { fd = d; foe = e; } }
    while (this.i < rt.length - 1 && H(rt[this.i].x - p.x, rt[this.i].z - p.z) < 3) this.i++;
    const w = foe || (this.i >= rt.length - 1 ? s.lv.goal : rt[this.i]);
    let dx = w.x - p.x, dz = w.z - p.z; const d = H(dx, dz) || 1; dx /= d; dz /= d;
    const stop = foe && fd < 14, ahead = s.floorAt(p.x + dx * 1.6, p.z + dz * 1.6, p.y, 4) > -1e8, below = s.floorAt(p.x, p.z, p.y, 30) > -1e8;
    return { x: stop ? 0 : dx, z: stop ? 0 : dz, jump: !stop && (!ahead || !below), act: !!foe && (this.t % 1) < 0.85 };
  }

  boss() {
    const s = this.s, p = s.p, b = s.boss, pulse = this.ph >= 3; let dx = b.x - p.x, dz = b.z - p.z; const d = H(dx, dz) || 1; dx /= d; dz /= d;
    const open = b.state === 'open', ring = s.rings.some(r => { const g = H(p.x - r.x, p.z - r.z) - r.r; return g > 0.2 && g < 4; });
    if (ring && p.ground) this.hold = 0.45;
    let jump = false, act = false, rad = 0, tan = 0.7;
    if (this.hold > 0) { this.hold -= DT; jump = true; }
    const near = s.enemies.some(e => e.alive && H(e.x - p.x, e.z - p.z) < 3.4);
    if (s.role === 'mech') { rad = d > 19 ? 1 : d < 15 ? -1 : 0; act = (open || s.enemies.some(e => e.alive)) && (this.t % 1) < 0.85; }
    else if (open) { rad = 1; tan = 0; if (s.role === 'runner') { if (p.ground && d < 11) this.hold = Math.max(this.hold, 0.25); } else act = d < b.r + 2.6 && pulse; }
    else { rad = d > 17 ? 1 : d < 13 ? -1 : 0; act = near && p.ground && (s.role === 'runner' || pulse); }
    if (s.role === 'runner' && !p.ground && !p.homing && s.lockTarget(s.s.lock, 0.1, false)) jump = pulse;
    return { x: dx * rad - dz * tan, z: dz * rad + dx * tan, jump, act };
  }
}
