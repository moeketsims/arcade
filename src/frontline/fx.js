// Pooled visual effects: tracers, sparks/dust/smoke particles, bullet-hole decals, shell casings, explosions, flashes.
// Everything is preallocated (instanced meshes / point buffers) so firing never allocates GPU objects.
import * as THREE from 'three';
import { Tex } from './textures.js';
import { clamp, rnd, lerp, pick } from './util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------------------------------------------
// Point-sprite particle system (one draw call per system)
// ---------------------------------------------------------------------------------------------------------------
const PVERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor; uniform float uScale;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 1.0, 900.0); vAlpha = aAlpha; vColor = aColor; }`;
const PFRAG = `
uniform sampler2D uMap; uniform float uHasMap; varying float vAlpha; varying vec3 vColor;
void main(){ vec4 t = vec4(1.0); if (uHasMap > 0.5) t = texture2D(uMap, gl_PointCoord); else { float d = length(gl_PointCoord - 0.5) * 2.0; t.a = 1.0 - smoothstep(0.2, 1.0, d); }
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha); }`;

export class Particles {
  constructor(max, { additive = true, map = null } = {}) {
    this.max = max; this.n = 0;
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uMap: { value: map }, uHasMap: { value: map ? 1 : 0 } },
      vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
    // per-particle simulation state
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.fadeIn = new Float32Array(max);
  }
  setScale(s) { this.mat.uniforms.uScale.value = s; }
  emit(x, y, z, vx, vy, vz, life, s0, s1, col0, col1, a0 = 1, grav = 0, drag = 0, fadeIn = 0.05) {
    if (this.n >= this.max) { // recycle the oldest-ish slot (index 0 is a fine victim in a ring-like compact array)
      this._copy(this.n - 1, 0); this.n--; }
    const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
    _c.set(col0); this.c0[i3] = _c.r; this.c0[i3 + 1] = _c.g; this.c0[i3 + 2] = _c.b;
    _c.set(col1 ?? col0); this.c1[i3] = _c.r; this.c1[i3 + 1] = _c.g; this.c1[i3 + 2] = _c.b;
    this.size[i] = s0; this.alpha[i] = 0;
  }
  _copy(from, to) {
    const f3 = from * 3, t3 = to * 3;
    for (let k = 0; k < 3; k++) { this.pos[t3 + k] = this.pos[f3 + k]; this.v[t3 + k] = this.v[f3 + k]; this.c0[t3 + k] = this.c0[f3 + k]; this.c1[t3 + k] = this.c1[f3 + k]; this.col[t3 + k] = this.col[f3 + k]; }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from]; this.fadeIn[to] = this.fadeIn[from];
  }
  update(dt) {
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._copy(this.n - 1, i); this.n--; continue; }
      const i3 = i * 3, k = 1 - this.life[i] / this.maxLife[i], d = Math.exp(-this.drag[i] * dt);
      this.v[i3] *= d; this.v[i3 + 1] = this.v[i3 + 1] * d - this.grav[i] * dt; this.v[i3 + 2] *= d;
      this.pos[i3] += this.v[i3] * dt; this.pos[i3 + 1] += this.v[i3 + 1] * dt; this.pos[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i3 + 1] = 0.02; this.v[i3 + 1] *= -0.3; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; }
      this.size[i] = lerp(this.s0[i], this.s1[i], k);
      const fin = this.fadeIn[i] > 0 ? Math.min(1, k / (this.fadeIn[i] / this.maxLife[i] * 1)) : 1;
      this.alpha[i] = this.a0[i] * (1 - k) * Math.min(1, fin);
      this.col[i3] = lerp(this.c0[i3], this.c1[i3], k); this.col[i3 + 1] = lerp(this.c0[i3 + 1], this.c1[i3 + 1], k); this.col[i3 + 2] = lerp(this.c0[i3 + 2], this.c1[i3 + 2], k);
      i++;
    }
    const g = this.geo; g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------------------------------------------
// FX hub
// ---------------------------------------------------------------------------------------------------------------
export class FX {
  constructor(scene, level) {
    this.scene = scene; this.level = level; this.time = 0;
    const soft = Tex.soft(), smoke = Tex.smoke(), flash = Tex.flash();
    this.sparks = new Particles(900, { additive: true, map: null });
    this.fire = new Particles(160, { additive: true, map: soft });
    this.dust = new Particles(500, { additive: false, map: soft });
    this.smoke = new Particles(520, { additive: false, map: smoke });
    for (const p of [this.sparks, this.fire, this.dust, this.smoke]) scene.add(p.points);

    // tracers
    const tm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), tm, 96); this.tracerMesh.count = 0; this.tracerMesh.frustumCulled = false; this.tracerMesh.renderOrder = 5;
    this.tracerMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3).fill(1), 3);
    scene.add(this.tracerMesh); this.tracers = [];

    // decals
    const dm = new THREE.MeshBasicMaterial({ map: Tex.hole(), color: Tex.hole() ? 0xffffff : 0x111111, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, 220); this.decalMesh.count = 0; this.decalMesh.frustumCulled = false; this.decalMesh.renderOrder = 2;
    scene.add(this.decalMesh); this.decals = []; this.decalHead = 0;

    // casings
    const cm = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.35 });
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.04, 6), cm, 48); this.casingMesh.count = 0; this.casingMesh.frustumCulled = false;
    this.casingMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3).fill(1), 3);
    scene.add(this.casingMesh); this.casings = [];

    // world muzzle flashes (for robots / turrets)
    const fm = new THREE.SpriteMaterial({ map: flash, color: flash ? 0xffffff : 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flashSprites = []; for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(fm.clone()); s.visible = false; s.scale.setScalar(0.5); s.userData.t = 0; scene.add(s); this.flashSprites.push(s); }
    this.flashIdx = 0;
    // one light for shots and explosions
    this.light = new THREE.PointLight(0xffb060, 0, 18, 1.5); scene.add(this.light); this.lightT = 0; this.lightPeak = 0;
    // shock rings
    const rm = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.rings = []; for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 32), rm.clone()); r.rotation.x = -Math.PI / 2; r.visible = false; r.userData = { t: 0, dur: 0.5, R: 5 }; scene.add(r); this.rings.push(r); }
    this.ringIdx = 0;
    // smoke clouds (grenades)
    this.clouds = [];
    // scratch
    this._dir = new THREE.Vector3();
  }
  setScale(s) { for (const p of [this.sparks, this.fire, this.dust, this.smoke]) p.setScale(s); }
  setLevel(level) { this.level = level; }
  clear() {
    for (const p of [this.sparks, this.fire, this.dust, this.smoke]) p.clear();
    this.tracers.length = 0; this.tracerMesh.count = 0; this.decals.length = 0; this.decalMesh.count = 0; this.decalHead = 0; this.casings.length = 0; this.casingMesh.count = 0; this.clouds.length = 0;
    for (const s of this.flashSprites) s.visible = false; for (const r of this.rings) r.visible = false; this.light.intensity = 0;
  }

  // ---- tracers -------------------------------------------------------------------------------------------------
  /** Streak from a to b. speed in m/s; len visual length; color hex; width m. */
  tracer(ax, ay, az, bx, by, bz, color = 0xffd27a, speed = 420, len = 5, width = 0.018) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 1.5) return;
    if (this.tracers.length >= 96) this.tracers.shift();
    this.tracers.push({ ax, ay, az, dx: dx / d, dy: dy / d, dz: dz / d, d, t: 0, speed, len: Math.min(len, d), w: width, color });
  }
  _updateTracers(dt) {
    const T = this.tracers; let n = 0;
    for (let i = 0; i < T.length;) {
      const t = T[i]; t.t += dt;
      const head = t.t * t.speed;
      if (head - t.len > t.d) { T[i] = T[T.length - 1]; T.pop(); continue; }
      const h = Math.min(head, t.d), tail = Math.max(0, head - t.len), L = h - tail;
      if (L > 0.01) {
        const mid = (h + tail) / 2;
        _p.set(t.ax + t.dx * mid, t.ay + t.dy * mid, t.az + t.dz * mid);
        _q.setFromUnitVectors(Z, this._dir.set(t.dx, t.dy, t.dz)); _s.set(t.w, t.w, L);
        _m.compose(_p, _q, _s); this.tracerMesh.setMatrixAt(n, _m);
        _c.set(t.color); this.tracerMesh.instanceColor.setXYZ(n, _c.r, _c.g, _c.b); n++;
      }
      i++;
    }
    this.tracerMesh.count = n; this.tracerMesh.instanceMatrix.needsUpdate = true; this.tracerMesh.instanceColor.needsUpdate = true;
  }

  // ---- decals --------------------------------------------------------------------------------------------------
  decal(x, y, z, nx, ny, nz, size = 0.12, life = 25, color = null) {
    const d = { x: x + nx * 0.012, y: y + ny * 0.012, z: z + nz * 0.012, nx, ny, nz, size, life, t: 0, roll: Math.random() * 6.28 };
    let idx;
    if (this.decals.length < 220) { idx = this.decals.length; this.decals.push(d); } else { idx = this.decalHead; this.decals[idx] = d; this.decalHead = (this.decalHead + 1) % 220; }
    this._setDecal(idx, d, 1);
    this.decalMesh.count = this.decals.length; this.decalMesh.instanceMatrix.needsUpdate = true;
  }
  _setDecal(i, d, k) {
    _q.setFromUnitVectors(Z, _p.set(d.nx, d.ny, d.nz)); _e.set(0, 0, d.roll); const rq = new THREE.Quaternion().setFromEuler(_e); _q.multiply(rq);
    _p.set(d.x, d.y, d.z); _s.setScalar(d.size * k); _m.compose(_p, _q, _s); this.decalMesh.setMatrixAt(i, _m);
  }
  _updateDecals(dt) {
    let dirty = false;
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i]; if (!d || d.dead) continue; d.t += dt;
      if (d.t > d.life - 1.5) { const k = clamp((d.life - d.t) / 1.5, 0, 1); this._setDecal(i, d, k); dirty = true; if (k <= 0) d.dead = true; }
    }
    if (dirty) this.decalMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- casings -------------------------------------------------------------------------------------------------
  casing(x, y, z, vx, vy, vz, shell = false) {
    if (this.casings.length >= 48) this.casings.shift();
    this.casings.push({ x, y, z, vx, vy, vz, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-18, 18), wy: rnd(-18, 18), wz: rnd(-18, 18), t: 0, life: 3.2, shell, bounces: 0 });
  }
  _updateCasings(dt) {
    const C = this.casings; let n = 0;
    for (let i = 0; i < C.length;) {
      const c = C[i]; c.t += dt;
      if (c.t > c.life) { C[i] = C[C.length - 1]; C.pop(); continue; }
      if (c.bounces < 4) {
        c.vy -= 9.8 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        const fy = this.level ? this.level.floorY(c.x, c.y, c.z, 0.2) : 0;
        if (c.y < fy + 0.01) { c.y = fy + 0.01; c.vy = -c.vy * 0.35; c.vx *= 0.55; c.vz *= 0.55; c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5; c.bounces++; if (c.bounces >= 3) { c.bounces = 9; } }
      }
      _p.set(c.x, c.y, c.z); _e.set(c.rx, c.ry, c.rz); _q.setFromEuler(_e); _s.set(1, 1, 1); if (c.shell) _s.set(1.5, 1.2, 1.5);
      _m.compose(_p, _q, _s); this.casingMesh.setMatrixAt(n, _m);
      _c.set(c.shell ? 0xb52f2f : 0xffffff); this.casingMesh.instanceColor.setXYZ(n, _c.r, _c.g, _c.b); n++; i++;
    }
    this.casingMesh.count = n; this.casingMesh.instanceMatrix.needsUpdate = true; this.casingMesh.instanceColor.needsUpdate = true;
  }

  // ---- flashes & lights ----------------------------------------------------------------------------------------
  muzzleFlash(x, y, z, scale = 1) {
    const s = this.flashSprites[this.flashIdx++ % this.flashSprites.length];
    s.position.set(x, y, z); s.scale.setScalar(0.45 * scale); s.userData.t = 0.05; s.visible = true; s.material.rotation = Math.random() * 6.28; s.material.opacity = 1;
  }
  flashLight(x, y, z, intensity = 3, dur = 0.08, color = 0xffb060, dist = 14) {
    this.light.position.set(x, y, z); this.light.color.set(color); this.light.distance = dist; this.light.intensity = intensity; this.lightT = dur; this.lightPeak = intensity; this.lightDur = dur;
  }
  ring(x, y, z, R = 6, dur = 0.45) {
    const r = this.rings[this.ringIdx++ % this.rings.length]; r.position.set(x, y + 0.15, z); r.userData.t = 0; r.userData.dur = dur; r.userData.R = R; r.visible = true; r.scale.setScalar(0.5);
  }

  // ---- impacts -------------------------------------------------------------------------------------------------
  /** Bullet hit on level geometry. kind: dust|spark|chip|glass. */
  impact(x, y, z, nx, ny, nz, kind = 'dust', big = 1) {
    const n = 4 + Math.floor(3 * big);
    if (kind === 'spark') {
      for (let i = 0; i < n + 3; i++) this.sparks.emit(x, y, z, nx * rnd(1, 4) + rnd(-2, 2), ny * rnd(1, 4) + rnd(0, 3), nz * rnd(1, 4) + rnd(-2, 2), rnd(0.15, 0.4), 0.05, 0.02, 0xfff0b0, 0xff7a20, 1, 9, 1);
      this.dust.emit(x, y, z, nx * 0.4, ny * 0.4 + 0.3, nz * 0.4, 0.5, 0.15, 0.4, 0x9a9a9a, 0x9a9a9a, 0.35, -0.4, 2);
    } else if (kind === 'chip') {
      for (let i = 0; i < n + 2; i++) this.sparks.emit(x, y, z, nx * rnd(1, 3) + rnd(-1.5, 1.5), ny * rnd(1, 3) + rnd(0, 2.5), nz * rnd(1, 3) + rnd(-1.5, 1.5), rnd(0.25, 0.6), 0.05, 0.03, 0xb08650, 0x8a6a3f, 0.9, 12, 0.5);
      this.dust.emit(x, y, z, nx * 0.5, ny * 0.5 + 0.4, nz * 0.5, 0.6, 0.18, 0.5, 0xb59a70, 0xb59a70, 0.35, -0.3, 2);
    } else if (kind === 'glass') {
      for (let i = 0; i < n + 3; i++) this.sparks.emit(x, y, z, nx * rnd(1, 3) + rnd(-2, 2), ny * rnd(0, 2) + rnd(0, 2), nz * rnd(1, 3) + rnd(-2, 2), rnd(0.3, 0.7), 0.04, 0.02, 0xcff2ff, 0x9fd8e8, 0.9, 9, 0.3);
    } else {
      for (let i = 0; i < n; i++) this.dust.emit(x, y, z, nx * rnd(0.3, 1.4) + rnd(-0.6, 0.6), ny * rnd(0.3, 1.4) + rnd(0, 0.8), nz * rnd(0.3, 1.4) + rnd(-0.6, 0.6), rnd(0.4, 0.9), 0.14, 0.5, 0xb8b4a6, 0xb8b4a6, 0.4, -0.2, 2.5);
      for (let i = 0; i < 3; i++) this.sparks.emit(x, y, z, nx * rnd(1, 3) + rnd(-1.5, 1.5), ny * rnd(1, 3) + rnd(0, 2), nz * rnd(1, 3) + rnd(-1.5, 1.5), rnd(0.2, 0.45), 0.04, 0.02, 0xd8d2c0, 0xb8b4a6, 0.9, 12, 0.6);
    }
  }
  /** Bullet hit on a robot: bright sparks, no gore. */
  robotHit(x, y, z, dx, dy, dz, head = false) {
    const n = head ? 14 : 9;
    for (let i = 0; i < n; i++) this.sparks.emit(x, y, z, -dx * rnd(1, 5) + rnd(-3, 3), -dy * rnd(0, 3) + rnd(0, 4), -dz * rnd(1, 5) + rnd(-3, 3), rnd(0.2, 0.55), 0.06, 0.02, head ? 0xffffff : 0xfff0a0, 0xff8a20, 1, 10, 0.8);
    this.fire.emit(x, y, z, 0, 0.2, 0, 0.12, 0.35, 0.7, 0xfff0c0, 0xffa040, 0.9, 0, 0);
  }
  /** A robot was destroyed: spark shower, small smoke, flash. */
  robotDeath(x, y, z) {
    for (let i = 0; i < 46; i++) { const a = Math.random() * 6.28, sp = rnd(1, 6); this.sparks.emit(x, y + rnd(0.2, 1.5), z, Math.cos(a) * sp, rnd(1, 6), Math.sin(a) * sp, rnd(0.4, 1.0), 0.07, 0.02, 0xfff0b0, 0xff5a1a, 1, 9, 0.6); }
    for (let i = 0; i < 8; i++) this.smoke.emit(x + rnd(-0.3, 0.3), y + rnd(0.5, 1.6), z + rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(0.5, 1.3), rnd(-0.3, 0.3), rnd(1.2, 2.2), 0.4, 1.6, 0x303236, 0x55575c, 0.55, -0.1, 0.8);
    this.fire.emit(x, y + 1.0, z, 0, 0.3, 0, 0.25, 0.6, 1.6, 0xfff0c0, 0xff7a20, 0.9);
    this.flashLight(x, y + 1.2, z, 2.2, 0.18, 0xffb060, 10);
  }
  /** Continuous damaged-robot sparks. */
  sparkTrickle(x, y, z) { this.sparks.emit(x, y, z, rnd(-1, 1), rnd(1, 3), rnd(-1, 1), rnd(0.2, 0.5), 0.05, 0.02, 0xfff0b0, 0xff6a20, 1, 8, 0.5); }
  explosion(x, y, z, R = 5) {
    const k = R / 5;
    for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.2, sp = rnd(1, 5) * k; this.fire.emit(x + rnd(-0.4, 0.4), y + rnd(0.2, 1.2), z + rnd(-0.4, 0.4), Math.cos(a) * sp, Math.sin(e) * sp * 0.8, Math.sin(a) * sp, rnd(0.35, 0.7), 1.6 * k, 4.4 * k, 0xfff2c8, 0xff5a10, 0.95, 0, 1.4, 0.03); }
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, e = Math.random() * 1.4, sp = rnd(4, 18) * k; this.sparks.emit(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp, rnd(0.5, 1.4), 0.09, 0.02, 0xfff0b0, 0xff5a1a, 1, 11, 0.5); }
    for (let i = 0; i < 28; i++) { const a = Math.random() * 6.28, sp = rnd(0.5, 4) * k; this.smoke.emit(x + rnd(-1, 1) * k, y + rnd(0.3, 1.5), z + rnd(-1, 1) * k, Math.cos(a) * sp, rnd(1, 4) * k, Math.sin(a) * sp, rnd(2.0, 4.0), 1.4 * k, 5.5 * k, 0x2a2b2e, 0x6a6c70, 0.7, -0.5, 0.9, 0.08); }
    for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = rnd(2, 8) * k; this.dust.emit(x, y + 0.2, z, Math.cos(a) * sp, rnd(0.2, 1.2), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8 * k, 2.4 * k, 0xa8a090, 0x8a8478, 0.5, 0, 3); }
    this.ring(x, y, z, R * 1.15, 0.5);
    this.flashLight(x, y + 1.2, z, 9, 0.3, 0xffa850, 34 * k);
    this.decal(x, y + 0.02, z, 0, 1, 0, 2.4 * k, 40);
  }
  /** Sparks along a line (grenade bounce, sentry hit etc.). */
  burst(x, y, z, n = 10, color = 0xfff0b0, speed = 4) { for (let i = 0; i < n; i++) this.sparks.emit(x, y, z, rnd(-1, 1) * speed, rnd(0, 1.2) * speed, rnd(-1, 1) * speed, rnd(0.2, 0.6), 0.06, 0.02, color, 0xff7a20, 1, 9, 0.7); }
  puff(x, y, z, n = 4, size = 0.6, color = 0xb0b0b0) { for (let i = 0; i < n; i++) this.dust.emit(x + rnd(-0.1, 0.1), y, z + rnd(-0.1, 0.1), rnd(-0.3, 0.3), rnd(0.2, 0.9), rnd(-0.3, 0.3), rnd(0.6, 1.2), size * 0.4, size, color, color, 0.35, -0.2, 1.5); }
  /** Rocket / missile exhaust. */
  trail(x, y, z, big = false) {
    this.smoke.emit(x + rnd(-0.04, 0.04), y + rnd(-0.04, 0.04), z + rnd(-0.04, 0.04), rnd(-0.2, 0.2), rnd(0, 0.3), rnd(-0.2, 0.2), rnd(0.8, 1.4), big ? 0.35 : 0.22, big ? 1.2 : 0.7, 0xd8d8d8, 0xa0a0a0, 0.5, 0, 0.5);
    this.fire.emit(x, y, z, 0, 0, 0, 0.08, big ? 0.5 : 0.3, 0.1, 0xffe0a0, 0xff7a20, 0.9);
  }

  // ---- smoke grenade cloud ---------------------------------------------------------------------------------------
  smokeCloud(x, y, z, R = 5.6, dur = 14) {
    const c = { x, y: y + 0.4, z, R, dur, t: 0, r: 0.3, acc: 0 }; this.clouds.push(c); return c;
  }
  _updateClouds(dt) {
    for (let i = 0; i < this.clouds.length;) {
      const c = this.clouds[i]; c.t += dt;
      if (c.t > c.dur + 5) { this.clouds.splice(i, 1); continue; }
      const grow = clamp(c.t / 1.6, 0, 1), shrink = c.t > c.dur ? clamp(1 - (c.t - c.dur) / 3.5, 0, 1) : 1;
      c.r = c.R * (0.3 + 0.7 * grow * grow * (3 - 2 * grow)) * shrink;
      if (c.t < c.dur) {
        c.acc += dt * (c.t < 1.6 ? 38 : 9);
        while (c.acc >= 1) {
          c.acc -= 1;
          const a = Math.random() * 6.28, e = Math.acos(rnd(-0.25, 1)), rr = Math.cbrt(Math.random()) * c.r * 0.75;
          this.smoke.emit(c.x + Math.sin(e) * Math.cos(a) * rr, c.y + Math.cos(e) * rr * 0.8, c.z + Math.sin(e) * Math.sin(a) * rr, rnd(-0.15, 0.15), rnd(0, 0.12), rnd(-0.15, 0.15), rnd(6, 9), c.R * 0.5, c.R * 0.95, 0xe6e8ea, 0xcfd2d6, 0.5, 0, 0.1, 0.5);
        }
      }
      i++;
    }
  }
  /** Is the segment a→b blocked by a smoke cloud? */
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const c of this.clouds) {
      if (c.r < 1.2) continue;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz;
      let t = l2 > 1e-9 ? ((c.x - ax) * dx + (c.y - ay) * dy + (c.z - az) * dz) / l2 : 0; t = clamp(t, 0, 1);
      const px = ax + dx * t - c.x, py = ay + dy * t - c.y, pz = az + dz * t - c.z;
      if (px * px + py * py + pz * pz < (c.r * 0.78) * (c.r * 0.78)) return true;
    }
    return false;
  }

  update(dt) {
    this.time += dt;
    this.sparks.update(dt); this.fire.update(dt); this.dust.update(dt); this.smoke.update(dt);
    this._updateTracers(dt); this._updateDecals(dt); this._updateCasings(dt); this._updateClouds(dt);
    for (const s of this.flashSprites) if (s.visible) { s.userData.t -= dt; if (s.userData.t <= 0) s.visible = false; else s.material.opacity = clamp(s.userData.t / 0.05, 0, 1); }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightPeak * (this.lightT / this.lightDur)); if (this.lightT <= 0) this.light.intensity = 0; }
    for (const r of this.rings) if (r.visible) { const u = r.userData; u.t += dt; const k = u.t / u.dur; if (k >= 1) { r.visible = false; continue; } r.scale.setScalar(0.5 + u.R * Math.sqrt(k)); r.material.opacity = 0.55 * (1 - k); }
  }
}
