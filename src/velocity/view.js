// Velocity Divide: everything drawn with Three.js. Stage meshes from the simulation's boxes, the six character models
// (built from primitives), the chase camera, effects, and the turntable used by the character selector.
import * as THREE from 'three';

const PAL = {
  dawn: { sky: '#8ecbff', sun: '#fff2d6', k: ['#efe3c8', '#b98d5a', '#ff9d3c', '#5fe3ff'] },
  umbra: { sky: '#1a1433', sun: '#c9b6ff', k: ['#3a3560', '#231f42', '#b06cff', '#ff5fd0'] },
  garden: { sky: '#a6e3c9', sun: '#fffbe0', k: ['#7cc47a', '#5a9c62', '#d9c48a', '#5fe3ff'] },
  archive: { sky: '#241a2e', sun: '#ffd9a0', k: ['#6a5a78', '#4c3f5c', '#8a6f4a', '#ff5fd0'] },
  kiln: { sky: '#ffc59a', sun: '#fff0d0', k: ['#c9b8a8', '#7a6a60', '#e0a070', '#5fe3ff'] },
  cinder: { sky: '#2a1414', sun: '#ffb08a', k: ['#5a4444', '#332626', '#7a4a3a', '#ff5fd0'] },
  gyre: { sky: '#3a2a5c', sun: '#e0d0ff', k: ['#57508a', '#2c2850', '#8a7ad0', '#ff5fd0'] },
  bastion: { sky: '#bfe6ff', sun: '#ffffff', k: ['#f2f2f7', '#aab4c8', '#ffd76a', '#5fe3ff'] },
  tide: { sky: '#06121c', sun: '#9ff5ff', k: ['#1d3a4a', '#0e2230', '#2f6a80', '#9ff5ff'] },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const M = (geo, color, parent, x = 0, y = 0, z = 0, o = {}) => {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: o.glow ? color : '#000000', emissiveIntensity: o.glow || 0, transparent: !!o.a, opacity: o.a || 1 }));
  m.position.set(x, y, z); if (o.s) m.scale.set(...o.s); if (o.r) m.rotation.set(...o.r); if (parent) parent.add(m); return m;
};
const Grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const sph = r => new THREE.SphereGeometry(r, 14, 10), cyl = (a, b, h, n = 12) => new THREE.CylinderGeometry(a, b, h, n), bx = (w, h, d) => new THREE.BoxGeometry(w, h, d), cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);

/** A character model facing +z, feet at y = 0. userData holds the parts that pose() moves. */
export function makeCharacter(c) {
  const [c1, c2, c3] = c.colors, root = new THREE.Group(), baseY = c.role === 'mech' ? 1.0 : 0.8, spin = Grp(root, 0, baseY, 0), u = root.userData = { spin, baseY };
  const limb = (x, y, len, w, col, foot) => { const g = Grp(spin, x, y, 0); M(cyl(w, w * 0.8, len, 8), col, g, 0, -len / 2, 0); if (foot) M(bx(w * 2.4, w * 1.4, w * 4), foot, g, 0, -len, w); return g; };
  if (c.role === 'runner') {
    M(cyl(0.26, 0.2, 0.62, 10), c1, spin, 0, 0.12, 0); M(sph(0.27), c3, spin, 0, 0.66, 0);
    M(bx(0.5, 0.12, 0.3), '#10131c', spin, 0, 0.68, 0.13); M(bx(0.42, 0.05, 0.3), c2, spin, 0, 0.68, 0.15, { glow: 0.8 });
    u.legL = limb(-0.14, -0.18, 0.62, 0.085, c3, c2); u.legR = limb(0.14, -0.18, 0.62, 0.085, c3, c2);
    u.armL = limb(-0.33, 0.36, 0.5, 0.06, c1); u.armR = limb(0.33, 0.36, 0.5, 0.06, c1);
    if (c.id === 'kite') M(cone(0.3, 1.0, 4), c2, spin, 0, 0.36, -0.5, { r: [-1.9, 0, 0], s: [1, 1, 0.2] });   // a kite-tail streamer
    else { for (const sx of [-1, 1]) M(cone(0.12, 0.8, 5), c2, spin, sx * 0.2, 0.84, -0.3, { r: [-2.2, 0, sx * 0.3] }); M(bx(0.6, 0.7, 0.04), c2, spin, 0, 0.1, -0.24, { r: [0.25, 0, 0] }); }   // swept crest and half-cape
  } else if (c.role === 'seeker') {
    M(sph(0.42), c1, spin, 0, 0, 0, { s: [1, 1.1, 0.95] }); M(sph(0.3), c3, spin, 0, 0.56, 0);
    for (const sx of [-1, 1]) M(cyl(0.11, 0.11, 0.1, 12), c2, spin, sx * 0.13, 0.6, 0.26, { r: [Math.PI / 2, 0, 0], glow: 0.6 });   // goggles
    M(bx(0.5, 0.5, 0.26), c3, spin, 0, 0.05, -0.42); M(sph(0.12), c2, spin, 0.3, 0.42, -0.42, { glow: 1.2 });   // pack and lantern
    u.legL = limb(-0.18, -0.35, 0.45, 0.1, c3, c2); u.legR = limb(0.18, -0.35, 0.45, 0.1, c3, c2);
    u.armL = limb(-0.46, 0.2, 0.42, 0.08, c1); u.armR = limb(0.46, 0.2, 0.42, 0.08, c1);
    if (c.id === 'quill') { M(cyl(0.5, 0.5, 0.04, 20), c3, spin, 0, 0.8, 0); M(cone(0.26, 0.4, 12), c3, spin, 0, 1.0, 0); }   // wide-brimmed hat
    else M(cyl(0.05, 0.05, 0.7, 6), c2, spin, -0.22, 0.4, -0.42);   // rolled map
  } else {
    const wide = c.id === 'ogre' ? 1.15 : 1;
    M(bx(1.3 * wide, 0.8, 1.1), c1, spin, 0, 0.25, 0); M(sph(0.38), c2, spin, 0, 0.75, 0.1, { glow: 0.35 }); M(bx(0.9, 0.2, 0.3), c3, spin, 0, 0.1, 0.56);
    u.legL = limb(-0.5 * wide, -0.1, 0.9, 0.13, c3, c2); u.legR = limb(0.5 * wide, -0.1, 0.9, 0.13, c3, c2);
    u.pods = [-1, 1].map(sx => M(cyl(0.2, 0.24, 0.8, 10), c2, spin, sx * 0.85 * wide, 0.4, 0.15, { r: [Math.PI / 2, 0, 0], glow: 0.15 }));
    u.jets = Grp(spin, 0, -0.2, 0); for (const sx of [-1, 1]) M(cone(0.2, 0.7, 8), '#9fe8ff', u.jets, sx * 0.35, -0.3, -0.2, { r: [Math.PI, 0, 0], glow: 1.5 }); u.jets.visible = false;
    if (c.id === 'ogre') for (const sx of [-1, 1]) M(bx(0.1, 0.5, 0.1), c2, spin, sx * 0.3, 1.1, 0.05, { r: [0, 0, -sx * 0.5] });   // sensor horns
    else M(cyl(0.02, 0.02, 0.6, 5), c3, spin, 0.4, 0.95, -0.3);   // aerial
  }
  return root;
}
/** a = { ph, sp, ground, ball, glide, dig, hover, lock } */
export function pose(root, a, dt) {
  const u = root.userData, sw = Math.sin(a.ph) * Math.min(1, a.sp / 7) * 0.95, air = !a.ground && !a.ball;
  u.spin.rotation.x = a.ball ? u.spin.rotation.x + dt * 22 : a.glide ? 0.9 : Math.min(0.35, a.sp * 0.012);
  u.spin.rotation.y = a.dig ? u.spin.rotation.y + dt * 18 : 0;
  u.spin.position.y = u.baseY + (a.ground && !a.ball ? Math.abs(Math.sin(a.ph)) * 0.06 * Math.min(1, a.sp / 6) : 0) - (a.dig ? 0.2 : 0);
  u.legL.rotation.x = air ? 0.7 : sw; u.legR.rotation.x = air ? -0.4 : -sw;
  if (u.armL) { u.armL.rotation.x = a.glide ? 0 : -sw; u.armR.rotation.x = a.glide ? 0 : sw; u.armL.rotation.z = a.glide ? -1.4 : -0.12; u.armR.rotation.z = a.glide ? 1.4 : 0.12; }
  if (u.jets) u.jets.visible = !!a.hover;
  if (u.pods) for (const p of u.pods) p.material.emissiveIntensity = a.lock ? 1.3 : 0.15;
}

const FX = { spark: ['#ffe066', 3], boom: ['#ff9d3c', 10], hurt: ['#ff4466', 7], shard: ['#5fe3ff', 14], check: ['#6af08a', 8], bosshit: ['#ffffff', 8], spring: ['#ffd23f', 5], gate: ['#5fe3ff', 10], heart: ['#ff6b8a', 6], clang: ['#aab4c8', 4], stomp: ['#ffffff', 6] };

export class View {
  constructor(renderer) {
    this.r = renderer; this.cam = new THREE.PerspectiveCamera(62, 1, 0.2, 700); this.scene = null; this.low = false; this.t = 0; this.w = 1; this.h = 1;
    this.pv = new THREE.Scene(); this.pv.background = new THREE.Color('#0c1022'); this.pv.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.4));
    const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(3, 6, 5); this.pv.add(d);
    M(cyl(1.5, 1.7, 0.2, 40), '#2a3150', this.pv, 0, -0.1, 0); this.pvCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); this.pvChar = null;
  }
  resize(w, h) { this.w = w; this.h = h; this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  showChar(c) { if (this.pvId === c.id) return; this.pvId = c.id; if (this.pvChar) this.pv.remove(this.pvChar); this.pvChar = makeCharacter(c); this.pv.add(this.pvChar); }
  /** The selector's turntable: the model sits right of the menu panel in landscape, above it in portrait. */
  renderPreview(dt) {
    this.t += dt; const g = this.pvChar, w = this.w, h = this.h, port = h > w, c = this.pvCam;
    if (g) { g.rotation.y += dt * 0.8; pose(g, { ph: this.t * 7, sp: 5, ground: true }, dt); }
    c.aspect = w / h; c.fov = port ? 38 : 30; c.position.set(0, 1.5, port ? 9 : 6.6); c.lookAt(0, 0.95, 0);
    if (port) c.setViewOffset(w, h, 0, h * 0.24, w, h); else c.setViewOffset(w, h, -w * 0.2, 0, w, h);
    this.r.render(this.pv, c);
  }

  load(sim, char) {
    this.scene?.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); });
    const lv = sim.lv, P = this.P = PAL[lv.theme] || PAL.dawn, sc = this.scene = new THREE.Scene(), col = new THREE.Color(), mx = new THREE.Matrix4();
    sc.background = new THREE.Color(P.sky); sc.fog = new THREE.Fog(P.sky, this.low ? 45 : 70, this.low ? 190 : 320);
    sc.add(new THREE.HemisphereLight('#ffffff', P.k[1], 2.3)); const sun = new THREE.DirectionalLight(P.sun, 2.4); sun.position.set(40, 80, 30); sc.add(sun);
    const fixed = lv.solids.filter(b => b.gate === undefined), im = new THREE.InstancedMesh(bx(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), Math.max(1, fixed.length));
    fixed.forEach((b, i) => { mx.makeScale(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); im.setMatrixAt(i, mx); im.setColorAt(i, col.set(P.k[b.k] || P.k[0]).multiplyScalar(0.86 + ((i * 37) % 10) * 0.028)); });
    im.frustumCulled = false; sc.add(im);
    this.gates = lv.solids.filter(b => b.gate !== undefined).map(b => ({ b, m: M(bx(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), P.k[3], sc, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, { glow: 0.9, a: 0.55 }) }));
    const sp = this.sparkIM = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.36), new THREE.MeshBasicMaterial({ color: '#ffe066' }), Math.max(1, lv.sparks.length));
    lv.sparks.forEach((s, i) => { mx.makeScale(1, 1, 1).setPosition(s.x, s.y, s.z); sp.setMatrixAt(i, mx); s.hid = false; }); sp.frustumCulled = false; sp.count = lv.sparks.length; sc.add(sp);
    this.heartM = lv.hearts.map(h => M(sph(0.4), '#ff6b8a', sc, h.x, h.y, h.z, { glow: 0.8 }));
    for (const s of lv.springs) { M(cyl(0.9, 1.1, 0.4, 16), '#d9363e', sc, s.x, s.y + 0.2, s.z); M(cyl(0.75, 0.75, 0.12, 16), '#ffd23f', sc, s.x, s.y + 0.46, s.z, { glow: 0.6 }); }
    for (const d of lv.pads) { M(bx(3.6, 0.08, 3.6), P.k[3], sc, d.x, d.y + 0.05, d.z, { glow: 0.7 }); M(cone(0.8, 1.6, 3), '#ffffff', sc, d.x, d.y + 0.12, d.z, { r: [Math.PI / 2, 0, Math.atan2(-d.dx, d.dz)], s: [1, 1, 0.08] }); }
    this.checkM = lv.checks.map(c => { M(cyl(0.2, 0.25, 3, 8), '#dfe6f5', sc, c.x + 2.6, c.y + 1.5, c.z); return M(sph(0.45), '#ff9d3c', sc, c.x + 2.6, c.y + 3.2, c.z, { glow: 1 }); });
    this.hazM = lv.hazards.map(h => M(bx(h.x1 - h.x0, h.y1 - h.y0, h.z1 - h.z0), '#ff2f8a', sc, (h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, (h.z0 + h.z1) / 2, { glow: 1.2, a: 0.75 }));
    if (lv.goal) { const g = lv.goal; this.goalM = M(new THREE.TorusGeometry(2.6, 0.22, 8, 32), '#6af08a', sc, g.x, g.y + 2.4, g.z, { glow: 1.2, r: [Math.PI / 2, 0, 0] }); M(cyl(2.4, 2.4, 60, 20), '#6af08a', sc, g.x, g.y + 30, g.z, { glow: 1, a: 0.12 }); } else this.goalM = null;
    this.shardM = sim.shards.map(s => ({ s, gem: M(new THREE.OctahedronGeometry(0.7), '#5fe3ff', sc, s.x, s.y, s.z, { glow: 1.2 }), mound: M(cone(1.3, 0.5, 9), P.k[1], sc, s.x, s.y + 0.25, s.z) }));
    const b = sim.boss; this.bossG = null;
    if (b) { const g = this.bossG = Grp(sc); g.userData.core = M(new THREE.IcosahedronGeometry(b.r, 1), P.k[2], g, 0, 0, 0, { glow: 0.4 }); g.userData.rings = [M(new THREE.TorusGeometry(3.3, 0.15, 6, 28), P.k[3], g, 0, 0, 0, { glow: 1 }), M(new THREE.TorusGeometry(3.7, 0.1, 6, 28), '#ffffff', g, 0, 0, 0, { glow: 0.6 })]; g.userData.shield = M(sph(b.r + 0.9), P.k[3], g, 0, 0, 0, { glow: 0.5, a: 0.3 }); }
    this.pl = makeCharacter(char); sc.add(this.pl);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; sc.add(this.shadow);
    this.arrow = M(cone(0.35, 1.2, 8).rotateX(Math.PI / 2), '#5fe3ff', sc, 0, 0, 0, { glow: 1.4 }); this.arrow.visible = false;
    this.em = {}; this.pools = {}; this.ph = 0; this.k = 1; this.idle = 9; this.pi = 0;
    this.parts = Array.from({ length: this.low ? 24 : 48 }, () => { const m = new THREE.Mesh(sph(0.14), new THREE.MeshBasicMaterial({ color: '#ffffff' })); m.visible = false; sc.add(m); return { m, vx: 0, vy: 0, vz: 0, life: 0 }; });
    this.snap(sim);
  }
  snap(sim) { const p = sim.p; this.yaw = sim.check.yaw || 0; this.pitch = 0.3; this.ty = p.y; this.face = Math.atan2(p.fx, p.fz); this.idle = 9; }
  behind(sim) { this.yaw = Math.atan2(-sim.p.fx, -sim.p.fz); this.pitch = 0.3; this.idle = 9; }
  fx(e) {
    if (e.t === 'respawn') return; const f = FX[e.t]; if (!f || !this.scene) return;
    for (let i = 0; i < (this.low ? Math.ceil(f[1] / 2) : f[1]); i++) { const q = this.parts[this.pi = (this.pi + 1) % this.parts.length]; q.m.position.set(e.x, e.y + 0.6, e.z); q.m.material.color.set(f[0]); q.vx = (Math.random() - 0.5) * 9; q.vy = 3 + Math.random() * 6; q.vz = (Math.random() - 0.5) * 9; q.life = 0.5; }
  }
  set(name, list, make, place) {
    const a = this.pools[name] || (this.pools[name] = []);
    while (a.length < list.length) { const m = make(); this.scene.add(m); a.push(m); }
    a.forEach((m, i) => { m.visible = i < list.length; if (m.visible) place(m, list[i]); });
  }
  mkEnemy(e) {
    const g = Grp(this.scene), P = this.P;
    if (e.kind === 'spit') { M(cone(0.9, 1.2, 8), '#3a4258', g, 0, -0.4, 0); M(sph(0.55), P.k[3], g, 0, 0.4, 0, { glow: 0.8 }); }
    else { M(sph(0.7), '#2b3142', g); M(new THREE.TorusGeometry(0.95, 0.1, 6, 18), P.k[2], g, 0, 0, 0, { r: [Math.PI / 2, 0, 0], glow: 0.5 }); M(sph(0.22), '#ff4f6a', g, 0, 0.05, 0.62, { glow: 1.4 }); }
    return g;
  }

  /** look = { x, y (right stick), mdx, mdy (mouse / drag), speed, invert } */
  update(sim, dt, look) {
    const p = sim.p, lv = sim.lv, sp = Math.hypot(p.vx, p.vz), mx = this.mx || (this.mx = new THREE.Matrix4()); this.t += dt;
    // camera: the right stick or a drag turns it; left alone it swings round behind the way you move (or to face a boss)
    const turn = look.x * look.speed * dt + look.mdx * 0.0042, tilt = (look.y * look.speed * 0.6 * dt + look.mdy * 0.003) * (look.invert ? -1 : 1);
    this.yaw -= turn; this.pitch = clamp(this.pitch + tilt, -0.15, 1.25); this.idle = turn || tilt ? 0 : this.idle + dt;
    let want = null, rate = 0; const b = sim.boss;
    if (b && b.alive) { want = Math.atan2(-(b.x - p.x), -(b.z - p.z)); rate = 1.2; }
    else if (sp > 3) { want = Math.atan2(-p.vx, -p.vz); rate = (sim.role === 'runner' ? 2.4 : 1.1) * Math.min(1, sp / 10); }
    if (want !== null && this.idle > 0.9) { let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 2.5 || b) this.yaw += d * Math.min(1, rate * dt); }
    const dist = (sim.role === 'mech' ? 10.5 : 9) + Math.min(3, sp * 0.08), cp = Math.cos(this.pitch);
    this.ty += (p.y - this.ty) * Math.min(1, (p.ground ? 10 : 5) * dt);
    const tx = p.x, ty = this.ty + 1.7, tz = p.z, ox = Math.sin(this.yaw) * cp, oy = Math.sin(this.pitch), oz = Math.cos(this.yaw) * cp;
    let k = 1; for (let i = 1; i <= 6; i++) { const f = i / 6; if (sim.inside(tx + ox * dist * f, ty + oy * dist * f, tz + oz * dist * f)) { k = Math.max(0.25, (i - 1) / 6); break; } }
    this.k += (k - this.k) * Math.min(1, (k < this.k ? 30 : 4) * dt);
    this.cam.position.set(tx + ox * dist * this.k, ty + oy * dist * this.k, tz + oz * dist * this.k); this.cam.lookAt(tx, ty, tz);
    const fov = 62 + clamp((sp - 18) * 0.9, 0, 14); if (Math.abs(fov - this.cam.fov) > 0.2) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, 4 * dt); this.cam.updateProjectionMatrix(); }
    // player
    const g = this.pl; g.position.set(p.x, p.y, p.z); let d = Math.atan2(p.fx, p.fz) - this.face; d = Math.atan2(Math.sin(d), Math.cos(d)); this.face += d * Math.min(1, 16 * dt); g.rotation.y = this.face;
    this.ph += sp * dt * (sim.role === 'mech' ? 0.9 : 1.1);
    pose(g, { ph: this.ph, sp, ground: p.ground, ball: sim.role === 'runner' && (p.spin || p.stomp || !!p.homing || (p.atk > 0 && !p.ground)), glide: p.glide, dig: p.dig > 0 || (sim.role === 'seeker' && p.stomp), hover: p.hovering, lock: p.locks.length > 0 }, dt);
    g.visible = p.dead <= 0 && !(p.inv > 0 && Math.floor(this.t * 16) % 2);
    const fl = sim.floorAt(p.x, p.z, p.y + 0.5, 40); this.shadow.visible = fl > -1e8 && p.dead <= 0; this.shadow.position.set(p.x, fl + 0.04, p.z); this.shadow.scale.setScalar(clamp(1.2 - (p.y - fl) * 0.06, 0.4, 1.2) * (sim.role === 'mech' ? 1.6 : 1));
    // pickups and props
    let dirty = false; lv.sparks.forEach((s, i) => { if (s.got && !s.hid) { s.hid = true; mx.makeScale(0, 0, 0); this.sparkIM.setMatrixAt(i, mx); dirty = true; } }); if (dirty) this.sparkIM.instanceMatrix.needsUpdate = true;
    this.sparkIM.position.y = Math.sin(this.t * 3) * 0.12;
    this.heartM.forEach((m, i) => { m.visible = !lv.hearts[i].got; });
    this.checkM.forEach((m, i) => { m.material.color.set(i === sim.checkId ? '#6af08a' : '#ff9d3c'); m.material.emissive.copy(m.material.color); });
    for (const h of this.hazM) h.material.opacity = 0.55 + Math.sin(this.t * 9) * 0.2;
    for (const q of this.gates) q.m.visible = !q.b.open;
    if (this.goalM) this.goalM.rotation.z += dt * 1.5;
    const scan = p.scan > 0;
    for (const q of this.shardM) { q.gem.visible = !q.s.got && !q.s.buried; q.gem.rotation.y += dt * 2; q.mound.visible = !q.s.got && q.s.buried && (scan || Math.hypot(q.s.x - p.x, q.s.z - p.z) < 14); }
    const tgt = scan && sim.shards.filter(s => !s.got).sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
    this.arrow.visible = !!tgt; if (tgt) { this.arrow.position.set(p.x, p.y + 2.7, p.z); this.arrow.lookAt(tgt.x, p.y + 2.7, tgt.z); }
    // enemies, shots, boss
    for (const e of sim.enemies) { const m = this.em[e.id] || (this.em[e.id] = this.mkEnemy(e)); m.visible = e.alive; if (e.alive) { m.position.set(e.x, e.y, e.z); m.rotation.y += dt * 2; m.scale.setScalar(e.hurt > 0 ? 1.25 : 1); } }
    this.set('orb', sim.orbs, () => M(sph(0.42), '#ff4f9a', null, 0, 0, 0, { glow: 1.2 }), (m, o) => m.position.set(o.x, o.y, o.z));
    this.set('bolt', sim.bolts.filter(q => q.delay <= 0), () => M(sph(0.28), '#ffef5a', null, 0, 0, 0, { glow: 1.5 }), (m, o) => m.position.set(o.x, o.y, o.z));
    this.set('ring', sim.rings, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.6, 48, 1, true), new THREE.MeshBasicMaterial({ color: this.P.k[3], side: THREE.DoubleSide, transparent: true, opacity: 0.8 })); return m; }, (m, r) => { m.position.set(r.x, r.y + 0.3, r.z); m.scale.set(r.r, 1, r.r); });
    const lockT = sim.role === 'runner' ? (p.homing ? [p.homing] : !p.ground ? [sim.lockTarget(sim.s.lock, 0.1)].filter(Boolean) : []) : [...new Set(p.locks)];
    this.set('ret', lockT, () => M(new THREE.TorusGeometry(1.25, 0.07, 6, 20), '#ffef5a', null, 0, 0, 0, { glow: 1.5 }), (m, t) => { m.position.set(t.x, t.y, t.z); m.quaternion.copy(this.cam.quaternion); });
    if (this.bossG) {
      const u = this.bossG.userData; this.bossG.visible = b.alive; this.bossG.position.set(b.x, b.y, b.z);
      u.shield.visible = b.state !== 'open'; u.core.rotation.y += dt; u.core.material.emissiveIntensity = b.hurt > 0 ? 2 : b.state === 'attack' && b.t > b.atkTime - 1 ? 1.2 : 0.4;
      u.rings[0].rotation.x += dt * 1.3; u.rings[1].rotation.y += dt * 1.7; u.core.scale.setScalar(b.state === 'open' ? 0.92 + Math.sin(this.t * 10) * 0.04 : 1);
    }
    for (const q of this.parts) { if (q.life <= 0) { q.m.visible = false; continue; } q.life -= dt; q.vy -= 18 * dt; q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt; q.m.visible = true; q.m.scale.setScalar(Math.max(0.1, q.life * 2)); }
  }
  render() { if (this.scene) this.r.render(this.scene, this.cam); }
}
