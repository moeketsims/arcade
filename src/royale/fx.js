// Visual effects: pooled particles (normal + additive), tracers, muzzle flashes, explosions, light bursts, rings.
import * as THREE from 'three';

const hasDom = typeof document !== 'undefined' && !!document.createElement;
const VERT = `attribute float size; attribute float alpha; attribute vec3 color; uniform float scale; varying vec3 vCol; varying float vA;
void main(){ vCol = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * scale / max(0.1, -mv.z), 0.0, 220.0); gl_Position = projectionMatrix * mv; }`;
const FRAG = `varying vec3 vCol; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0; this.max = 0;
    const f = k => new Float32Array(n * k);
    this.p = f(3); this.v = f(3); this.life = f(1); this.maxLife = f(1); this.s0 = f(1); this.s1 = f(1); this.col = f(3); this.a0 = f(1); this.grav = f(1); this.drag = f(1);
    this.size = f(1); this.alpha = f(1);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { scale: { value: 600 } } });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 6 : 5; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, s0, s1, life, r, g, b, a = 1, grav = 0, drag = 0) {
    const i = this.i; this.i = (this.i + 1) % this.n; if (i >= this.max) this.max = i + 1;
    const k = i * 3; this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b; this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    let top = 0;
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      l -= dt; this.life[i] = l; top = i + 1;
      if (l <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      const k = i * 3, d = this.drag[i]; const dm = d ? Math.max(0, 1 - d * dt) : 1;
      this.v[k] *= dm; this.v[k + 1] = this.v[k + 1] * dm - this.grav[i] * dt; this.v[k + 2] *= dm;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const age = 1 - l / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * age; this.alpha[i] = this.a0[i] * (1 - age * age);
    }
    this.max = top;
    const a = this.geo.attributes; a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.max = 0; this.i = 0; }
}

function glowTexture() {
  if (!hasDom) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,160,0.9)'); g.addColorStop(1, 'rgba(255,160,40,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  c.translate(64, 64); c.fillStyle = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, -4); c.lineTo(58, 0); c.lineTo(0, 4); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3(), _c = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene; this.soft = new Particles(scene, 1400, false); this.glow = new Particles(scene, 1800, true);
    // tracers
    const tg = new THREE.BoxGeometry(1, 1, 1); this.tmax = 96; this.tracers = [];
    this.tm = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), this.tmax);
    this.tm.frustumCulled = false; this.tm.count = 0; this.tm.setColorAt(0, new THREE.Color(1, 1, 1)); this.tm.renderOrder = 7; scene.add(this.tm);
    // muzzle flashes
    this.tex = glowTexture(); this.flashes = [];
    for (let i = 0; i < 10; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); s.visible = false; s.userData.t = 0; scene.add(s); this.flashes.push(s); }
    // explosion meshes
    this.balls = []; const bg = new THREE.SphereGeometry(1, 14, 10), rg = new THREE.RingGeometry(0.85, 1.0, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.visible = false; m.userData = { t: 0, life: 0, r: 1, kind: 'ball' }; scene.add(m); this.balls.push(m);
      const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); r.visible = false; r.userData = { t: 0, life: 0, r: 1, kind: 'ring' }; scene.add(r); this.balls.push(r);
    }
    // light columns (eliminations / loot pings)
    this.cols = []; const cg = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); cg.translate(0, 0.5, 0);
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; m.userData = { t: 0, life: 0 }; scene.add(m); this.cols.push(m); }
    this.shake = 0; this.time = 0;
  }
  setView(heightPx, fovDeg) { const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); this.soft.mat.uniforms.scale.value = s; this.glow.mat.uniforms.scale.value = s; }
  clear() { this.soft.clear(); this.glow.clear(); this.tracers.length = 0; this.tm.count = 0; for (const f of this.flashes) f.visible = false; for (const b of this.balls) b.visible = false; for (const c of this.cols) c.visible = false; this.shake = 0; }

  // ---- particle helpers ----
  spark(p, n = 5, color = 0xffd27a, spd = 5, nx = 0, ny = 1, nz = 0) {
    _c.set(color);
    for (let i = 0; i < n; i++) this.glow.emit(p.x, p.y, p.z, (nx + (Math.random() - 0.5) * 1.6) * spd * (0.4 + Math.random()), (ny + (Math.random() - 0.3) * 1.2) * spd * (0.4 + Math.random()), (nz + (Math.random() - 0.5) * 1.6) * spd * (0.4 + Math.random()), 0.09, 0.02, 0.25 + Math.random() * 0.2, _c.r, _c.g, _c.b, 1, 14, 0.4);
  }
  dust(p, n = 4, color = 0xb59a72, size = 0.7, nx = 0, ny = 1, nz = 0) {
    _c.set(color);
    for (let i = 0; i < n; i++) this.soft.emit(p.x, p.y, p.z, (nx + (Math.random() - 0.5)) * 1.4, (ny + Math.random()) * 1.3, (nz + (Math.random() - 0.5)) * 1.4, size * 0.5, size * 1.5, 0.5 + Math.random() * 0.4, _c.r, _c.g, _c.b, 0.55, -0.5, 1.2);
  }
  debris(p, color, n = 8, spd = 5) {
    _c.set(color);
    for (let i = 0; i < n; i++) this.soft.emit(p.x, p.y, p.z, (Math.random() - 0.5) * spd, Math.random() * spd * 0.9 + 1, (Math.random() - 0.5) * spd, 0.28, 0.2, 0.7 + Math.random() * 0.5, _c.r, _c.g, _c.b, 1, 18, 0.2);
  }
  leaves(p, n = 14) {
    for (let i = 0; i < n; i++) { const g = 0.4 + Math.random() * 0.4; this.soft.emit(p.x + (Math.random() - 0.5) * 2, p.y + Math.random() * 3, p.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.32, 0.2, 1.1 + Math.random() * 0.6, 0.2, g, 0.2, 1, 6, 0.5); }
  }
  smokePuff(p, size = 2, life = 2, shade = 0.55, a = 0.55, vy = 0.6) {
    this.soft.emit(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, vy + Math.random() * 0.4, (Math.random() - 0.5) * 0.5, size * 0.5, size * 1.6, life, shade, shade, shade, a, -0.2, 0.3);
  }
  splash(p, n = 12) { for (let i = 0; i < n; i++) this.soft.emit(p.x, p.y + 0.05, p.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 4, (Math.random() - 0.5) * 3, 0.45, 0.2, 0.7, 0.85, 0.95, 1, 0.8, 14, 0.2); }
  /** Burst of light (elimination dissolve): rising golden/cyan motes. */
  burst(p, color = 0x9fe8ff, n = 46) {
    _c.set(color);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.random(); this.glow.emit(p.x + Math.cos(a) * r * 0.4, p.y + Math.random() * 1.6, p.z + Math.sin(a) * r * 0.4, Math.cos(a) * 1.5 * r, 1.5 + Math.random() * 4, Math.sin(a) * 1.5 * r, 0.3 + Math.random() * 0.25, 0.04, 0.8 + Math.random() * 0.7, _c.r, _c.g, _c.b, 1, -1.0, 0.6); }
    for (let i = 0; i < 14; i++) this.glow.emit(p.x, p.y + 1, p.z, (Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9, 0.34, 0.05, 0.6, 1, 0.95, 0.7, 1, 6, 1.2);
    this.column(p, color, 1.0, 14, 0.9);
  }
  muzzle(p, size = 1, color = 0xffe0a0) {
    const f = this.flashes.find(s => !s.visible) || this.flashes[0]; f.visible = true; f.position.copy(p); f.userData.t = 0.055; f.userData.size = size; f.material.color.set(color); f.scale.setScalar(size * (0.7 + Math.random() * 0.5)); f.material.rotation = Math.random() * 6.28;
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, size * 0.55, size * 0.1, 0.07, 1, 0.85, 0.5, 0.9);
  }
  tracer(a, b, color = 0xffe6a0, width = 0.04, len = 7) {
    const L = a.distanceTo(b); if (L < 1.5) return;
    if (this.tracers.length >= this.tmax) this.tracers.shift();
    this.tracers.push({ a: a.clone(), dir: _d.subVectors(b, a).normalize().clone(), L, age: 0, spd: 520, color, width, len });
  }
  explosion(p, r = 4, shakeAmt = 1) {
    this._ball(p, r, 0.28, 'ball', 0xffb050); this._ball(p, r * 0.55, 0.18, 'ball', 0xfff2c0); this._ball({ x: p.x, y: p.y + 0.1, z: p.z }, r * 1.5, 0.45, 'ring', 0xffd9a0);
    const n = Math.min(60, Math.round(18 + r * 6));
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = (Math.random() - 0.2) * 1.2, sp = (3 + Math.random() * 9) * (r / 4); this.glow.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * sp, e * sp + 2, Math.sin(a) * sp, 0.55 * r / 3 + 0.2, 0.05, 0.4 + Math.random() * 0.4, 1, 0.5 + Math.random() * 0.4, 0.15, 1, 8, 1.5); }
    for (let i = 0; i < Math.round(8 + r * 2); i++) this.smokePuff({ x: p.x + (Math.random() - 0.5) * r, y: p.y + Math.random() * r * 0.5, z: p.z + (Math.random() - 0.5) * r }, r * 0.9, 1.6 + Math.random(), 0.3, 0.6, 1.2);
    this.shake = Math.max(this.shake, shakeAmt);
  }
  _ball(p, r, life, kind, color) {
    const m = this.balls.find(b => !b.visible && b.userData.kind === kind); if (!m) return;
    m.visible = true; m.position.set(p.x, p.y, p.z); m.userData.t = 0; m.userData.life = life; m.userData.r = r; m.material.color.set(color); m.scale.setScalar(0.1);
  }
  ring(p, color = 0xffffff, r = 4, life = 0.5) { this._ball(p, r, life, 'ring', color); }
  column(p, color = 0x9fe8ff, radius = 1, height = 14, life = 0.8) {
    const m = this.cols.find(c => !c.visible); if (!m) return; m.visible = true; m.position.set(p.x, p.y, p.z); m.userData.t = 0; m.userData.life = life; m.userData.r = radius; m.userData.h = height; m.material.color.set(color);
  }

  update(dt) {
    this.time += dt;
    this.soft.update(dt); this.glow.update(dt);
    // tracers
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.age += dt; const head = t.age * t.spd;
      if (head - t.len > t.L) { this.tracers.splice(i, 1); continue; }
    }
    for (const t of this.tracers) {
      const head = Math.min(t.L, t.age * t.spd), tail = Math.max(0, Math.min(t.L, t.age * t.spd - t.len)), l = head - tail; if (l < 0.05) continue;
      _p.copy(t.a).addScaledVector(t.dir, (head + tail) / 2); _q.setFromUnitVectors(_z, t.dir); _s.set(t.width, t.width, l);
      this.tm.setMatrixAt(n, _m.compose(_p, _q, _s)); this.tm.setColorAt(n, _c.set(t.color)); n++;
    }
    this.tm.count = n; this.tm.instanceMatrix.needsUpdate = true; if (this.tm.instanceColor) this.tm.instanceColor.needsUpdate = true;
    for (const f of this.flashes) if (f.visible) { f.userData.t -= dt; if (f.userData.t <= 0) f.visible = false; }
    for (const b of this.balls) {
      if (!b.visible) continue; const u = b.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { b.visible = false; continue; }
      const e = 1 - (1 - k) * (1 - k); b.scale.setScalar(Math.max(0.05, u.r * (u.kind === 'ring' ? e : 0.3 + 0.7 * e))); b.material.opacity = 0.85 * (1 - k * k);
    }
    for (const c of this.cols) {
      if (!c.visible) continue; const u = c.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { c.visible = false; continue; }
      c.scale.set(u.r * (1 - k * 0.7), u.h * (0.3 + 0.9 * Math.min(1, k * 3)), u.r * (1 - k * 0.7)); c.material.opacity = 0.6 * (1 - k);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
