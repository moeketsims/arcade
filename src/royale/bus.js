// The battle bus: an original hot-air-balloon bus that crosses the island on a random line.
import * as THREE from 'three';
import { Parts } from './parts.js';

const ALT = 205, SPEED = 27;

function buildBus() {
  const g = new THREE.Group();
  // balloon envelope with coloured gores
  const geo = new THREE.SphereGeometry(6, 28, 18); geo.scale(1, 1.2, 1);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(0x8e44ff), b = new THREE.Color(0xffd23f), c3 = new THREE.Color(0x35e0ff);
  for (let i = 0; i < pos.count; i++) { const ang = Math.atan2(pos.getZ(i), pos.getX(i)), k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 3, c = k === 0 ? a : k === 1 ? b : c3; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const env = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })); env.position.y = 14; env.castShadow = false; g.add(env);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 14), new THREE.MeshStandardMaterial({ color: 0xff5e8a, roughness: 0.6 })); cap.position.y = 21.6; g.add(cap);
  // gondola: a little bus
  const P = new Parts();
  P.box(0xffd23f, [7.2, 1.7, 2.8], [0, 0.85, 0]); P.box(0x8e44ff, [7.3, 0.5, 2.9], [0, 0.35, 0]); P.box(0xffd23f, [6.2, 1.0, 2.6], [-0.3, 2.1, 0]); P.box(0x8e44ff, [6.3, 0.2, 2.7], [-0.3, 2.7, 0]);
  for (let i = 0; i < 5; i++) { P.box(0x26405a, [0.8, 0.65, 2.85], [-2.4 + i * 1.15, 1.9, 0]); }
  P.box(0x26405a, [0.1, 0.8, 2.3], [3.0, 1.7, 0]); P.box(0xfff1b0, [0.12, 0.3, 0.5], [3.62, 0.8, 0.9]); P.box(0xfff1b0, [0.12, 0.3, 0.5], [3.62, 0.8, -0.9]);
  for (const x of [-2.4, 2.4]) for (const z of [-1.5, 1.5]) P.cyl(0x15181d, 0.45, 0.35, [x, 0.0, z], 'z', { seg: 10 });
  for (const [x, z] of [[-2.9, -1.2], [-2.9, 1.2], [2.9, -1.2], [2.9, 1.2]]) P.seg(0xe8dcc0, 0.08, [x, 3.0, z], [x * 0.9, 9.0, z * 0.9]);
  P.box(0xff5e8a, [0.06, 1.4, 0.06], [0, 3.5, 0]); P.box(0xff5e8a, [1.3, 0.8, 0.06], [0.65, 4.0, 0]);
  const body = P.build(0xffffff); g.add(body);
  const prop = new THREE.Group(); prop.position.set(-3.8, 1.2, 0); for (let i = 0; i < 3; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.28), new THREE.MeshStandardMaterial({ color: 0xdddddd })); bl.position.y = 1.1; const pv = new THREE.Group(); pv.rotation.x = i * Math.PI * 2 / 3; pv.add(bl); prop.add(pv); }
  g.add(prop); g.userData.prop = prop;
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export class Bus {
  constructor(scene) { this.scene = scene; this.mesh = buildBus(); this.mesh.visible = false; scene.add(this.mesh); this.pos = new THREE.Vector3(); this.dir = new THREE.Vector3(1, 0, 0); this.vel = new THREE.Vector3(); this.active = false; this.s = 0; this.len = 700; this.start = new THREE.Vector3(); this.riders = []; }
  /** Pick a random line across the island. */
  begin(rng = Math.random) {
    const ang = rng() * Math.PI * 2, off = (rng() - 0.5) * 150, dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx;
    this.len = 720; this.dir.set(dx, 0, dz); this.start.set(-dx * this.len / 2 + px * off, ALT, -dz * this.len / 2 + pz * off); this.s = 0; this.active = true; this.mesh.visible = true; this.speed = SPEED;
    this.vel.copy(this.dir).multiplyScalar(this.speed); this.update(0);
  }
  pointAt(s, out = new THREE.Vector3()) { return out.copy(this.start).addScaledVector(this.dir, s); }
  update(dt) {
    if (!this.active) return; this.s += this.speed * dt; this.pointAt(this.s, this.pos); this.mesh.position.copy(this.pos); this.mesh.rotation.y = Math.atan2(-this.dir.z, this.dir.x);
    this.mesh.userData.prop.rotation.x += dt * 25; this.mesh.position.y += Math.sin(this.s * 0.06) * 0.3;
    if (this.s >= this.len) { this.active = false; this.mesh.visible = false; }
  }
  get done() { return !this.active; }
  /** Closest approach distance and path parameter to a point. */
  closest(x, z) { const vx = x - this.start.x, vz = z - this.start.z, s = vx * this.dir.x + vz * this.dir.z, dx = vx - this.dir.x * s, dz = vz - this.dir.z * s; return { s, d: Math.hypot(dx, dz) }; }
  dispose() { this.mesh.visible = false; this.active = false; }
}
