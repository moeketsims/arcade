// Ball physics: gravity, air drag, curl (sideways spin), dip, knuckle wobble, bounces, rolling friction,
// posts/crossbar rebounds and nets that catch the ball.
import * as THREE from 'three';
import { HL, HW, GOAL_W, GOAL_H, GOAL_D } from './stadium.js';

export const R = 0.11;
const G = 9.81, DRAG = 0.0085, POST = 0.06;

function ballTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#f8f8f8'; c.fillRect(0, 0, 512, 256);
  const penta = (x, y, r) => { c.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); };
  c.fillStyle = '#16181d';
  for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) penta(i * 86 + (row % 2) * 43 + 20, 28 + row * 64, 18);
  c.strokeStyle = '#bbbbbb'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(i * 43, 0); c.lineTo(i * 43 + 30, 256); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Ball {
  constructor(scene, stadium, sfx) {
    this.stadium = stadium; this.sfx = sfx;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
    this.mesh.castShadow = true; scene.add(this.mesh);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.2, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; scene.add(this.shadow);
    // fading trail for hard shots
    this.trail = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.trailPts = []; scene.add(this.trail);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.reset(0, 0);
  }

  reset(x = 0, z = 0, y = R) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.curve = 0; this.dip = 0; this.wobble = 0;
    this.owner = null; this.lastTouch = null; this.kicker = null; this.kickT = 9; this.inNet = 0; this.held = null; this.trailOn = 0; this.trailPts = [];
  }

  /** Kick the ball. opts: curve (m/s² per m/s, + = bends to the kicker's left), dip, wobble, by (player). */
  kick(vel, o = {}) {
    this.owner = null; this.held = null; this.vel.copy(vel);
    this.curve = o.curve || 0; this.dip = o.dip || 0; this.wobble = o.wobble || 0;
    this.kicker = o.by || null; this.lastTouch = o.by || this.lastTouch; this.kickT = 0;
    this.trailOn = vel.length() > 24 ? 1.2 : 0; this.trailPts = [];
  }

  get speed() { return this.vel.length(); }
  get loose() { return !this.owner && !this.held; }

  /** Integrate one step. Returns events: 'post', 'bounce', 'net'. */
  step(dt) {
    this.kickT += dt;
    const ev = [];
    if (this.owner || this.held) return ev;
    const p = this.pos, v = this.vel;
    // forces
    const sp = v.length();
    v.addScaledVector(v, -DRAG * sp * dt);
    if (this.curve) {
      const hx = v.x, hz = v.z, h = Math.hypot(hx, hz);
      if (h > 0.5) { const k = this.curve * h * dt; v.x += -hz / h * k; v.z += hx / h * k; } // left-perpendicular of the horizontal velocity
      this.curve *= Math.pow(0.55, dt);
    }
    if (this.wobble && sp > 12) { v.x += (Math.random() - 0.5) * this.wobble * dt * 30; v.y += (Math.random() - 0.5) * this.wobble * dt * 20; v.z += (Math.random() - 0.5) * this.wobble * dt * 30; }
    v.y -= (G + this.dip) * dt;
    p.addScaledVector(v, dt);
    // ground
    if (p.y < R) {
      p.y = R;
      if (v.y < -1.5) { v.y = -v.y * 0.6; v.x *= 0.86; v.z *= 0.86; this.curve *= 0.4; this.dip = 0; ev.push('bounce'); }
      else {
        v.y = 0; const h = Math.hypot(v.x, v.z);
        if (h > 0) { const nh = Math.max(0, h - 2.6 * dt - 0.12 * h * dt); v.x *= nh / h; v.z *= nh / h; }
        this.curve *= Math.pow(0.1, dt);
      }
    }
    // goal frames
    for (const s of [-1, 1]) {
      const gx = s * HL;
      if (Math.abs(p.x - gx) > 3) continue;
      for (const pz of [-GOAL_W / 2, GOAL_W / 2]) {
        if (p.y > GOAL_H + R) continue;
        const dx = p.x - gx, dz = p.z - pz, d = Math.hypot(dx, dz);
        if (d < R + POST && d > 1e-5) { const nx = dx / d, nz = dz / d, vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= 1.65 * vn * nx; v.z -= 1.65 * vn * nz; ev.push('post'); } p.x = gx + nx * (R + POST); p.z = pz + nz * (R + POST); }
      }
      if (Math.abs(p.z) <= GOAL_W / 2) {
        const dx = p.x - gx, dy = p.y - GOAL_H, d = Math.hypot(dx, dy);
        if (d < R + POST && d > 1e-5) { const nx = dx / d, ny = dy / d, vn = v.x * nx + v.y * ny; if (vn < 0) { v.x -= 1.6 * vn * nx; v.y -= 1.6 * vn * ny; ev.push('post'); } p.x = gx + nx * (R + POST); p.y = GOAL_H + ny * (R + POST); }
      }
      // inside the net
      const inside = s * p.x > HL && Math.abs(p.z) < GOAL_W / 2 && p.y < GOAL_H;
      if (inside || this.inNet === s) {
        if (s * p.x > HL - R) this.inNet = s;
        const back = HL + GOAL_D - R;
        if (s * p.x > back) { p.x = s * back; if (s * v.x > 0) { this.stadium.bulge(s, p.z, p.y, Math.min(1.2, Math.abs(v.x) / 18)); ev.push('net'); v.x = -v.x * 0.08; v.y *= 0.4; v.z *= 0.4; } }
        if (Math.abs(p.z) > GOAL_W / 2 - R) { p.z = Math.sign(p.z) * (GOAL_W / 2 - R); v.z *= -0.15; v.x *= 0.6; }
        if (p.y > GOAL_H - R) { p.y = GOAL_H - R; v.y = -Math.abs(v.y) * 0.1; }
      }
    }
    return ev;
  }

  /** Visual update: position, roll, shadow, trail. */
  render(dt) {
    const m = this.mesh; m.position.copy(this.pos);
    const h = Math.hypot(this.vel.x, this.vel.z);
    if (h > 0.05) { const axis = new THREE.Vector3(this.vel.z, 0, -this.vel.x).normalize(); m.rotateOnWorldAxis(axis, h * dt / R); }
    if (this.curve) m.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), this.curve * dt * 25);
    this.shadow.position.set(this.pos.x, 0.02, this.pos.z); const k = Math.max(0.25, 1 - this.pos.y / 8); this.shadow.scale.setScalar(k); this.shadow.material.opacity = 0.35 * k;
    // trail
    this.trailOn = Math.max(0, this.trailOn - dt);
    if (this.trailOn > 0 && this.loose) { this.trailPts.push(this.pos.clone()); if (this.trailPts.length > 18) this.trailPts.shift(); }
    else if (this.trailPts.length) this.trailPts.shift();
    const pts = this.trailPts;
    if (pts.length > 2) {
      const verts = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], w = 0.12 * (i / pts.length);
        verts.push(a.x, a.y - w, a.z, a.x, a.y + w, a.z, b.x, b.y + w, b.z, a.x, a.y - w, a.z, b.x, b.y + w, b.z, b.x, b.y - w, b.z);
      }
      this.trail.geometry.dispose(); this.trail.geometry = new THREE.BufferGeometry(); this.trail.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      this.trail.visible = true; this.trail.material.opacity = 0.3 * Math.min(1, this.trailOn + 0.3);
    } else this.trail.visible = false;
  }

  /** Simulate a copy of the flight (no players) — used for aiming and predictions. */
  static simulate(pos, vel, o = {}, maxT = 3, dt = 1 / 60, stop = null) {
    const p = pos.clone(), v = vel.clone(); let curve = o.curve || 0; const dip = o.dip || 0; const out = [];
    for (let t = 0; t < maxT; t += dt) {
      const sp = v.length(); v.addScaledVector(v, -DRAG * sp * dt);
      if (curve) { const h = Math.hypot(v.x, v.z); if (h > 0.5) { const k = curve * h * dt; const vx = v.x; v.x += -v.z / h * k; v.z += vx / h * k; } curve *= Math.pow(0.55, dt); }
      v.y -= (G + dip) * dt; p.addScaledVector(v, dt);
      if (p.y < R) { p.y = R; if (v.y < -1.5) { v.y = -v.y * 0.6; v.x *= 0.86; v.z *= 0.86; curve *= 0.4; } else { v.y = 0; const h = Math.hypot(v.x, v.z); if (h > 0) { const nh = Math.max(0, h - 2.6 * dt - 0.12 * h * dt); v.x *= nh / h; v.z *= nh / h; } } }
      out.push({ t: t + dt, p: p.clone(), v: v.clone() });
      if (stop && stop(p, v)) break;
    }
    return out;
  }

  /**
   * Find a launch velocity so the ball reaches `target` (x,y,z) travelling at roughly `speed`, with the given curve/dip.
   * Uses a few shooting-method corrections against the full flight model (drag + curl).
   */
  static aim(from, target, speed, o = {}) {
    const d = new THREE.Vector3(target.x - from.x, 0, target.z - from.z), dist = d.length();
    let dir = d.clone().normalize(), elev = Math.atan2(target.y - from.y + 0.5 * G * (dist / speed) ** 2, dist) ;
    let aimPt = target.clone();
    for (let it = 0; it < 7; it++) {
      const ad = new THREE.Vector3(aimPt.x - from.x, 0, aimPt.z - from.z).normalize();
      const v = new THREE.Vector3(ad.x * Math.cos(elev), Math.sin(elev), ad.z * Math.cos(elev)).multiplyScalar(speed);
      const path = Ball.simulate(from, v, o, 4, 1 / 60, (p) => new THREE.Vector3(p.x - from.x, 0, p.z - from.z).length() >= dist);
      const end = path[path.length - 1]?.p; if (!end) break;
      // horizontal correction
      aimPt.x += (target.x - end.x) * 0.9; aimPt.z += (target.z - end.z) * 0.9;
      // vertical correction via elevation
      elev += Math.atan2(target.y - end.y, dist) * 0.85;
      elev = Math.max(-0.2, Math.min(1.25, elev));
      if (it === 6) return v;
    }
    const ad = new THREE.Vector3(aimPt.x - from.x, 0, aimPt.z - from.z).normalize();
    return new THREE.Vector3(ad.x * Math.cos(elev), Math.sin(elev), ad.z * Math.cos(elev)).multiplyScalar(speed);
  }
}
export { HL, HW };
