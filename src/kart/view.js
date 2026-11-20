// Sparkplug GP: the 3D view. Builds a track scene (road, curbs, barriers, terrain, scenery, sky), the karts and
// item meshes, particles and the cameras. It draws "frames" in the replay format from sim.js (live or recorded),
// so the same code shows the race and its replay.
import * as THREE from 'three';
import { makeKart, makeCrystal, makeProjectile, mat } from './models.js';
import { rng } from './sim.js';

// ---- themes ---------------------------------------------------------------------------------------------------------
const THEMES = {
  meadow: { sky: ['#5fb4ff', '#cfeeff'], fog: '#cfeeff', fogFar: 520, ground: '#5fbf4a', ground2: '#3f9a38', off: '#6cc24f', road: '#5d6170', curb: ['#ff4b4b', '#ffffff'], wall: '#d9a05b', sun: 2.6, hemi: 1.1, night: false },
  beach: { sky: ['#3fa9f5', '#fff1d6'], fog: '#f3eedb', fogFar: 560, ground: '#f2d49b', ground2: '#2aa7c9', off: '#efd08f', road: '#8a6a4a', curb: ['#2fb3ff', '#ffffff'], wall: '#f8f4ea', sun: 2.8, hemi: 1.1, night: false, water: '#2aa7c9' },
  canyon: { sky: ['#ff9a5a', '#ffe3b0'], fog: '#f6c896', fogFar: 520, ground: '#c4643a', ground2: '#9c4526', off: '#d98a55', road: '#6b5a55', curb: ['#ffd23f', '#3a2a24'], wall: '#8c3e22', sun: 2.6, hemi: 1.0, night: false },
  snow: { sky: ['#8fb8e8', '#eef6ff'], fog: '#e8f1fb', fogFar: 460, ground: '#f4f8ff', ground2: '#d6e4f5', off: '#ffffff', road: '#6d7686', curb: ['#3a7bff', '#ffffff'], wall: '#bfe3ff', sun: 2.3, hemi: 1.25, night: false },
  city: { sky: ['#0a0a2a', '#3b1d5c'], fog: '#241238', fogFar: 420, ground: '#1b1d29', ground2: '#14151f', off: '#2a2d3c', road: '#2c2f3d', curb: ['#ff2bd6', '#2be8ff'], wall: '#2be8ff', sun: 0.6, hemi: 0.55, night: true },
  sky: { sky: ['#1b1150', '#ff8fc7'], fog: '#9a74c9', fogFar: 600, ground: null, off: '#6d5bd0', road: '#4b4ba8', curb: ['#ffe066', '#ffffff'], wall: '#9ff0ff', sun: 1.8, hemi: 1.0, night: false },
};
export const THEME = THEMES;

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function roadTexture(th) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = th.road; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 2, 2); }
    if (th === THEMES.beach) { g.strokeStyle = '#0000002a'; g.lineWidth = 3; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
    g.fillStyle = th.night ? '#2be8ff' : '#ffffffd0'; g.fillRect(8, 0, 6, h); g.fillRect(w - 14, 0, 6, h);
    g.fillStyle = th.night ? '#ff2bd6aa' : '#ffffff66'; g.fillRect(w / 2 - 3, 0, 6, h / 2);
  });
}
function stripeTexture(a, b) { return canvasTex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 32); g.fillStyle = b; g.fillRect(0, 32, 64, 32); }); }
function checkerTexture() { return canvasTex(128, 32, (g) => { for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } }); }
function chevronTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#ff7a00'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14d'; for (let y = -64; y < h; y += 64) { g.beginPath(); g.moveTo(0, y + 64); g.lineTo(w / 2, y + 24); g.lineTo(w, y + 64); g.lineTo(w, y + 88); g.lineTo(w / 2, y + 48); g.lineTo(0, y + 88); g.fill(); }
  });
}
function skyTexture(th) {
  return canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, th.sky[0]); gr.addColorStop(0.55, th.sky[1]); gr.addColorStop(1, th.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

// ---- particles ------------------------------------------------------------------------------------------------------
class Particles {
  constructor(scene, max = 1400) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max); this.grav = new Float32Array(max); this.grow = new Float32Array(max);
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { scale: { value: 600 } },
      vertexShader: 'attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard; gl_FragColor = vec4(vC, vA * (1.0 - r * 4.0)); }',
    });
    this.mat = m; this.points = new THREE.Points(geo, m); this.points.frustumCulled = false; scene.add(this.points);
    this.soft = new THREE.Points(geo, m); // (kept for API symmetry)
    this._c = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, color, size = 0.5, life = 0.5, grav = 0, grow = 0) {
    const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(color); this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.size[i] = size; this.life[i] = this.life0[i] = life; this.grav[i] = grav; this.grow[i] = grow; this.alpha[i] = 1;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {   // swap-remove
        const j = --this.n; if (i === j) break;
        for (const [a, s] of [[this.pos, 3], [this.vel, 3], [this.col, 3]]) for (let k = 0; k < s; k++) a[i * s + k] = a[j * s + k];
        this.size[i] = this.size[j]; this.life[i] = this.life[j]; this.life0[i] = this.life0[j]; this.grav[i] = this.grav[j]; this.grow[i] = this.grow[j]; this.alpha[i] = this.alpha[j];
        i--; continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt; this.alpha[i] = Math.min(1, this.life[i] / this.life0[i] * 1.6);
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export const TIER_COLORS = ['#ffffff', '#4fe3ff', '#ffb020', '#c45bff'];

// ---- the view -------------------------------------------------------------------------------------------------------
export class View {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1400);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.shake = 0; this.fovKick = 0;
    this.lowSpec = false;
  }

  /** Build everything for one race. track: Track, racers: [{racer, kart}] per kart index. */
  build(track, kartDefs) {
    const old = this.scene; old.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose?.(); });
    const scene = this.scene = new THREE.Scene(); this.track = track;
    const th = this.theme = THEMES[track.def.theme];
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.MeshBasicMaterial({ map: skyTexture(th), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.material.map.mapping = THREE.UVMapping; this.sky = sky; scene.add(sky);
    scene.fog = new THREE.Fog(th.fog, 120, th.fogFar);
    // lights
    scene.add(new THREE.HemisphereLight(th.night ? '#6b5bd0' : '#e8f4ff', th.night ? '#120a20' : '#6b665c', th.hemi));
    const sun = this.sun = new THREE.DirectionalLight(th.night ? '#9fb0ff' : '#fff2dc', th.sun);
    sun.castShadow = true; sun.shadow.mapSize.set(this.lowSpec ? 1024 : 2048, this.lowSpec ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 260; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.buildRoad(scene, track, th);
    this.buildTerrain(scene, track, th);
    this.buildScenery(scene, track, th);
    // karts
    this.karts = kartDefs.map(d => { const m = makeKart(d.racer, d.kart); scene.add(m, m.userData.blob); return m; });
    this.shields = this.karts.map(() => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.22, wireframe: true })); s.visible = false; scene.add(s); return s; });
    // crystals
    this.crystals = track.boxes.map(b => { const c = makeCrystal(); c.position.set(b.x, b.y, b.z); scene.add(c); return c; });
    this.projMeshes = new Map(); this.projPool = { goo: [], puck: [], wasp: [], decoy: [] };
    this.fx = new Particles(scene);
    this.flash = 0; this.ghost = null;
    this.prevFrame = null;
  }

  buildRoad(scene, T, th) {
    const N = T.n;
    // strips: [latFrom, latTo, yOff, u0, u1] built into separate meshes with their own materials
    const strip = (fromFn, toFn, yOff, keep = () => true, vScale = 1 / 10) => {
      const P = [], U = [], I = [];
      for (let i = 0; i <= N; i++) {
        const j = i % N, a = T.at(j, fromFn(j)), b = T.at(j, toFn(j)), v = i * T.step * vScale;
        P.push(a.x, a.y + yOff, a.z, b.x, b.y + yOff, b.z); U.push(0, v, 1, v);
        if (i < N && keep(j)) { const k = i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
      // wind every strip so it faces up, whichever side of the road it is on
      const nrm = new Float32Array(P.length); for (let v = 1; v < P.length; v += 3) nrm[v] = 1;
      const a = I[0], b = I[1], c = I[2];
      if (a !== undefined) { const ux = P[b * 3] - P[a * 3], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vz = P[c * 3 + 2] - P[a * 3 + 2]; if (uz * vx - ux * vz < 0) for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; } g.setIndex(I); }
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      return g;
    };
    const hw = j => T.w[j] / 2;
    const road = new THREE.Mesh(strip(j => hw(j), j => -hw(j), 0.04), new THREE.MeshStandardMaterial({ map: roadTexture(th), roughness: 0.85, metalness: 0, emissive: th.theme === 'sky' ? '#20208a' : '#000000' }));
    road.material.map.repeat.set(1, 1); road.receiveShadow = true; scene.add(road);
    if (T.def.theme === 'sky') road.material.emissive = new THREE.Color('#1c1c6e');
    const curbMat = new THREE.MeshStandardMaterial({ map: stripeTexture(...th.curb), roughness: 0.6, emissive: th.night ? '#ffffff' : '#000000', emissiveIntensity: th.night ? 0.25 : 0, emissiveMap: th.night ? stripeTexture(...th.curb) : null });
    for (const s of [1, -1]) {
      const c = new THREE.Mesh(strip(j => s * hw(j), j => s * (hw(j) + 1.3), 0.06, () => true, 1 / 4), curbMat); c.receiveShadow = true; scene.add(c);
      const off = new THREE.Mesh(strip(j => s * (hw(j) + 1.3), j => s * (hw(j) + T.shoulder + 0.2), 0.03, j => T.edge[j] === 0, 1 / 6), new THREE.MeshStandardMaterial({ color: th.off, roughness: 1 }));
      off.receiveShadow = true; scene.add(off);
      // barrier: a low wall at the edge of the shoulder (none over the voids)
      const P = [], I = [], C = [];
      const wallCol = new THREE.Color(th.wall), alt = new THREE.Color(th.night ? '#ff2bd6' : th.wall).offsetHSL(0, 0, th.night ? 0 : -0.12);
      for (let i = 0; i <= N; i++) {
        const j = i % N, lat = s * (hw(j) + T.shoulder + 0.2), p = T.at(j, lat), q = T.at(j, lat + s * 0.5);
        const c = Math.floor(i / 3) % 2 ? wallCol : alt;
        P.push(p.x, p.y, p.z, p.x, p.y + 1.1, p.z, q.x, q.y + 1.1, q.z); C.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
        if (i < N && T.edge[j] === 0 && T.edge[(j + 1) % N] === 0) { const k = i * 3; I.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
      const wm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: th.night || th === THEMES.sky ? th.wall : '#000000', emissiveIntensity: th.night ? 0.8 : th === THEMES.sky ? 0.5 : 0 });
      const wall = new THREE.Mesh(g, wm); wall.castShadow = !th.night; wall.receiveShadow = true; scene.add(wall);
    }
    // skyway: the road is a slab floating in the air, with a glowing underside
    if (T.def.theme === 'sky') {
      const under = new THREE.Mesh(strip(j => hw(j) + 1.3, j => -(hw(j) + 1.3), -1.4), new THREE.MeshStandardMaterial({ color: '#2a1f6b', emissive: '#5a3cff', emissiveIntensity: 0.4, side: THREE.DoubleSide }));
      scene.add(under);
    }
    // start line + gate (holder: local +Z runs along the road, x across it)
    const w0 = T.w[0] + 2.6, p0 = T.at(0), holder = new THREE.Group();
    holder.position.set(p0.x, p0.y + 0.07, p0.z); holder.rotation.y = Math.PI / 2 - T.heading(0);
    const check = checkerTexture(); check.repeat.set(w0 / 4, 1);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w0, 2.4), new THREE.MeshStandardMaterial({ map: check, roughness: 0.8 })); line.rotation.x = -Math.PI / 2; line.receiveShadow = true; holder.add(line);
    const gm = mat('#20232c', { metal: 0.6 }), bt = this.bannerTexture();
    const banner = new THREE.Mesh(new THREE.BoxGeometry(w0 + 2, 1.8, 0.3), new THREE.MeshStandardMaterial({ map: bt, emissive: '#ffffff', emissiveIntensity: th.night ? 0.6 : 0.15, emissiveMap: bt }));
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), gm); post.position.set(s * (w0 / 2 + 0.8), 3.5, 0); post.castShadow = true; holder.add(post); }
    banner.position.set(0, 6.6, 0); holder.add(banner);
    scene.add(holder);
    // boost pads
    const chev = chevronTexture(); this.chev = chev;
    for (const pd of T.pads) {
      const p = T.at(pd.i + Math.round(pd.len / T.step / 2), pd.lat), h = T.heading(pd.i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, pd.len), new THREE.MeshBasicMaterial({ map: chev, transparent: true, opacity: 0.95 }));
      m.rotation.x = -Math.PI / 2; const hold = new THREE.Group(); hold.position.set(p.x, p.y + 0.09, p.z); hold.rotation.y = Math.PI / 2 - h; hold.add(m);
      m.rotation.z = Math.PI; scene.add(hold);
    }
    // ramps
    for (const r of T.ramps) {
      const len = 8, P = [], I = [];
      const n = Math.round(len / T.step);
      for (let k = 0; k <= n; k++) {
        const j = T.wrap(r.i - n + k), hgt = 1.3 * r.power * (k / n), a = T.at(j, T.w[j] / 2 - 0.5), b = T.at(j, -T.w[j] / 2 + 0.5);
        P.push(a.x, a.y + hgt + 0.05, a.z, b.x, b.y + hgt + 0.05, b.z, a.x, a.y, a.z, b.x, b.y, b.z);
        if (k < n) { const q = k * 4; I.push(q, q + 4, q + 1, q + 1, q + 4, q + 5); }
      }
      const q = n * 4; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      const ramp = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: chev, side: THREE.DoubleSide, roughness: 0.6 })); ramp.castShadow = true; ramp.receiveShadow = true; scene.add(ramp);
    }
  }

  bannerTexture() {
    if (this._banner) return this._banner;
    this._banner = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#12141c'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#fff' : '#111'; g.fillRect(x, 0, 32, 8); g.fillRect(x + 16, h - 8, 32, 8); }
      g.font = '900 34px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd23f'; g.fillText('SPARKPLUG GP', w / 2, h / 2 + 2);
    }, false);
    return this._banner;
  }

  /** Ground: a height field that follows the road (embankments) and rolls into hills away from it. */
  buildTerrain(scene, T, th) {
    if (!th.ground) {   // the skyway: a sea of clouds far below
      const clouds = new THREE.Group(); const r = rng(11), cm = new THREE.MeshStandardMaterial({ color: '#ffe3f4', emissive: '#7a4aa8', emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.92 });
      for (let i = 0; i < 90; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(20 + r() * 40, 10, 8), cm); c.scale.y = 0.35; c.position.set((r() - 0.5) * 1200, -30 - r() * 30, (r() - 0.5) * 1200 - 150); clouds.add(c); }
      scene.add(clouds);
      const stars = new THREE.BufferGeometry(), sp = [];
      for (let i = 0; i < 900; i++) { const a = r() * Math.PI * 2, e = 0.1 + r() * 1.3, R = 800; sp.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R); }
      stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const st = new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false })); this.stars = st; scene.add(st);
      return;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
    const M = 260, cell = this.lowSpec ? 8 : 5;
    const x0 = minX - M, z0 = minZ - M, nx = Math.ceil((maxX - minX + 2 * M) / cell), nz = Math.ceil((maxZ - minZ + 2 * M) / cell);
    const P = new Float32Array((nx + 1) * (nz + 1) * 3), C = new Float32Array((nx + 1) * (nz + 1) * 3), I = [];
    const r = rng(5), c1 = new THREE.Color(th.ground), c2 = new THREE.Color(th.ground2), tmp = new THREE.Color();
    // coarse sample list for the distance query
    const S = []; for (let i = 0; i < T.n; i += 2) S.push(i);
    const phase = [r() * 10, r() * 10, r() * 10];
    const beach = th === THEMES.beach, canyon = th === THEMES.canyon, snow = th === THEMES.snow;
    this.heightAt = (x, z) => {
      let bd = Infinity, bi = 0; for (const i of S) { const d = (T.x[i] - x) ** 2 + (T.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
      const d = Math.sqrt(bd), edge = T.w[bi] / 2 + T.shoulder + 1.5, ty = T.y[bi];
      const hills = (Math.sin(x * 0.012 + phase[0]) * Math.cos(z * 0.01 + phase[1]) * 0.5 + 0.5) * (canyon ? 46 : snow ? 40 : beach ? 3 : 14) + Math.sin(x * 0.05 + z * 0.04 + phase[2]) * 1.5;
      let far = beach ? -2.2 : hills;
      if (canyon) far = Math.max(hills, d > 40 ? 18 + hills * 0.6 : 0);
      if (d < edge) return { y: ty - 0.25, d };
      const t = Math.min(1, (d - edge) / (beach ? 30 : 60)), s = t * t * (3 - 2 * t);
      return { y: (ty - 0.25) * (1 - s) + far * s, d };
    };
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * cell, z = z0 + j * cell, { y, d } = this.heightAt(x, z), k = (j * (nx + 1) + i) * 3;
      P[k] = x; P[k + 1] = y; P[k + 2] = z;
      tmp.copy(c1).lerp(c2, beach ? (y < -0.8 ? 1 : 0) : Math.min(1, Math.max(0, (Math.sin(x * 0.07) * Math.sin(z * 0.06) * 0.5 + 0.5) * 0.7 + (canyon ? y / 60 : 0))));
      if (snow && d > 30) tmp.lerp(new THREE.Color('#ffffff'), 0.3);
      C[k] = tmp.r; C[k + 1] = tmp.g; C[k + 2] = tmp.b;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; I.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: canyon })); ground.receiveShadow = true; scene.add(ground);
    if (th.water) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: th.water, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.88 }));
      w.rotation.x = -Math.PI / 2; w.position.y = -0.9; this.water = w; scene.add(w);
    }
    if (th.night) {   // city floor glow grid far away
      const grid = new THREE.GridHelper(3000, 150, '#ff2bd6', '#3b1d5c'); grid.position.y = -0.2; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    }
  }

  /** Theme props scattered outside the barriers (instanced). */
  buildScenery(scene, T, th) {
    const r = rng(T.def.points.length * 31 + 7), spots = [];
    const S = []; for (let i = 0; i < T.n; i += 3) S.push(i);
    const clear = (x, z, m) => { for (const i of S) { if ((T.x[i] - x) ** 2 + (T.z[i] - z) ** 2 < (T.w[i] / 2 + T.shoulder + m) ** 2) return false; } return true; };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < T.n; i++) { minX = Math.min(minX, T.x[i]); maxX = Math.max(maxX, T.x[i]); minZ = Math.min(minZ, T.z[i]); maxZ = Math.max(maxZ, T.z[i]); }
    const want = this.lowSpec ? 140 : 260;
    for (let tries = 0; spots.length < want && tries < 6000; tries++) {
      // half the props hug the road (within 40 m), the rest fill the distance
      let x, z;
      if (tries % 2) { const i = Math.floor(r() * T.n), side = r() < 0.5 ? 1 : -1, d = T.w[i] / 2 + T.shoulder + 4 + r() * 36, p = T.at(i, side * d); x = p.x; z = p.z; }
      else { x = minX - 150 + r() * (maxX - minX + 300); z = minZ - 150 + r() * (maxZ - minZ + 300); }
      if (!clear(x, z, 3)) continue;
      const y = this.heightAt ? this.heightAt(x, z).y : 0;
      spots.push([x, y, z, r(), r()]);
    }
    const kinds = {
      meadow: [['tree', 0.5], ['flower', 0.3], ['bush', 0.2]], beach: [['palm', 0.55], ['hut', 0.12], ['rock', 0.33]],
      canyon: [['cactus', 0.4], ['mesa', 0.25], ['rock', 0.35]], snow: [['pine', 0.6], ['rock', 0.2], ['snowman', 0.2]],
      city: [['tower', 0.7], ['lamp', 0.3]], sky: [['island', 0.5], ['star', 0.5]],
    }[T.def.theme];
    const groups = {};
    for (const s of spots) {
      let u = s[3], k = kinds[0][0]; for (const [name, w] of kinds) { if ((u -= w) <= 0) { k = name; break; } }
      (groups[k] = groups[k] || []).push(s);
    }
    const tm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const place = (geo, material, list, fn) => {
      if (!list?.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length); im.castShadow = !th.night; im.receiveShadow = true;
      list.forEach((s, i) => { const o = fn(s); ps.set(s[0], s[1] + (o.dy || 0), s[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s[4] * 6.28); sc.set(o.sx || o.s, o.sy || o.s, o.sz || o.sx || o.s); tm.compose(ps, q, sc); im.setMatrixAt(i, tm); });
      scene.add(im);
    };
    const G = THREE;
    const sz = (s, a, b) => a + s[4] * (b - a);
    const g = groups;
    place(new G.CylinderGeometry(0.35, 0.5, 3, 7).translate(0, 1.5, 0), mat('#7a4f2a'), g.tree, s => ({ s: sz(s, 1, 1.6) }));
    place(new G.IcosahedronGeometry(2.4, 0).translate(0, 4.4, 0), mat('#3f9a38', { flat: true }), g.tree, s => ({ s: sz(s, 1, 1.6) }));
    place(new G.IcosahedronGeometry(1.2, 0).translate(0, 0.8, 0), mat('#4aa53d', { flat: true }), g.bush, s => ({ s: sz(s, 0.8, 1.6) }));
    place(new G.SphereGeometry(0.35, 6, 4).translate(0, 0.4, 0), mat('#ff7ab8', { emissive: '#ff7ab8', ei: 0.2 }), g.flower, s => ({ s: sz(s, 1, 2) }));
    place(new G.CylinderGeometry(0.25, 0.4, 8, 6).translate(0, 4, 0), mat('#a07a50'), g.palm, s => ({ s: sz(s, 0.8, 1.3) }));
    place(new G.ConeGeometry(3.4, 1.2, 7).translate(0, 8.2, 0), mat('#2f9e4a', { flat: true }), g.palm, s => ({ s: sz(s, 0.8, 1.3) }));
    place(new G.BoxGeometry(5, 3, 4).translate(0, 1.5, 0), mat('#f8e1b0'), g.hut, () => ({ s: 1 }));
    place(new G.ConeGeometry(4, 2.2, 4).translate(0, 4.1, 0), mat('#e0573a', { flat: true }), g.hut, () => ({ s: 1 }));
    place(new G.DodecahedronGeometry(2, 0).translate(0, 0.8, 0), mat(T.def.theme === 'canyon' ? '#a24a2a' : '#8c8f99', { flat: true }), g.rock, s => ({ s: sz(s, 0.6, 2.2), sy: sz(s, 0.5, 1.4) }));
    place(new G.CylinderGeometry(0.5, 0.6, 4, 8).translate(0, 2, 0), mat('#3c9a4a'), g.cactus, s => ({ s: sz(s, 0.8, 1.5) }));
    place(new G.CylinderGeometry(12, 16, 18, 7).translate(0, 9, 0), mat('#b8582f', { flat: true }), g.mesa, s => ({ s: sz(s, 0.7, 1.5), sy: sz(s, 0.6, 1.8) }));
    place(new G.ConeGeometry(2.2, 7, 7).translate(0, 4.5, 0), mat('#2c6b4f', { flat: true }), g.pine, s => ({ s: sz(s, 0.8, 1.6) }));
    place(new G.ConeGeometry(1.5, 2.4, 7).translate(0, 7.4, 0), mat('#ffffff', { flat: true }), g.pine, s => ({ s: sz(s, 0.8, 1.6) }));
    place(new G.SphereGeometry(1, 10, 8).translate(0, 1, 0), mat('#ffffff'), g.snowman, () => ({ s: 1 }));
    place(new G.SphereGeometry(0.7, 10, 8).translate(0, 2.4, 0), mat('#ffffff'), g.snowman, () => ({ s: 1 }));
    if (g.tower) {
      const win = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#0d0f1c'; c.fillRect(0, 0, w, h); const rr = rng(2); for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) { if (rr() < 0.55) { c.fillStyle = ['#ffe9a8', '#2be8ff', '#ff2bd6', '#ffffff'][Math.floor(rr() * 4)]; c.fillRect(x, y, 5, 6); } } });
      const tmat = new THREE.MeshStandardMaterial({ map: win, emissiveMap: win, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.8 });
      place(new G.BoxGeometry(14, 1, 14).translate(0, 0.5, 0), tmat, g.tower, s => ({ sx: sz(s, 0.7, 1.4), sy: 20 + s[4] * 70 }));
    }
    place(new G.CylinderGeometry(0.15, 0.15, 7, 6).translate(0, 3.5, 0), mat('#3a3f55'), g.lamp, () => ({ s: 1 }));
    place(new G.SphereGeometry(0.5, 8, 6).translate(0, 7.2, 0), mat('#2be8ff', { emissive: '#2be8ff', ei: 2 }), g.lamp, () => ({ s: 1 }));
    if (g.island) {
      const isl = g.island.map(s => [s[0], (this.track.y[0] || 30) - 20 - s[4] * 40, s[2], s[3], s[4]]);
      place(new G.ConeGeometry(10, 16, 7).rotateX(Math.PI).translate(0, -8, 0), mat('#6b4fa8', { flat: true }), isl, s => ({ s: sz(s, 0.6, 1.5) }));
      place(new G.CylinderGeometry(10, 10, 2, 7).translate(0, 1, 0), mat('#7fe0a8', { flat: true }), isl, s => ({ s: sz(s, 0.6, 1.5) }));
    }
    if (g.star) {
      const st = g.star.map(s => [s[0], 40 + s[4] * 60, s[2], s[3], s[4]]);
      place(new G.OctahedronGeometry(1.4, 0), mat('#ffe066', { emissive: '#ffe066', ei: 1.5 }), st, s => ({ s: sz(s, 0.6, 2) }));
    }
    // a windmill on the meadow, a lighthouse on the pier
    if (T.def.theme === 'meadow') {
      const wm = new THREE.Group(); wm.add(Object.assign(new THREE.Mesh(new G.CylinderGeometry(3, 4.5, 18, 8), mat('#f4ead8')), { castShadow: true }));
      wm.children[0].position.y = 9; const hub = new THREE.Group(); hub.position.set(0, 16, 4.6); wm.add(hub);
      for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new G.BoxGeometry(1.6, 12, 0.3), mat('#c94a3a')); b.position.y = 6; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); hub.add(arm); }
      const p = this.track.at(Math.round(this.track.n * 0.55), -55); wm.position.set(p.x, this.heightAt ? this.heightAt(p.x, p.z).y : 0, p.z); scene.add(wm); this.spinner = hub;
    }
    if (T.def.theme === 'beach') {
      const lh = new THREE.Group(); for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new G.CylinderGeometry(3 - i * 0.3, 3.2 - i * 0.3, 5, 12), mat(i % 2 ? '#e0383b' : '#ffffff')); s.position.y = 2.5 + i * 5; s.castShadow = true; lh.add(s); }
      const lamp = new THREE.Mesh(new G.SphereGeometry(2, 12, 8), mat('#fff6b0', { emissive: '#fff2a0', ei: 1.6 })); lamp.position.y = 27; lh.add(lamp);
      const p = this.track.at(Math.round(this.track.n * 0.62), 45); lh.position.set(p.x, 0, p.z); scene.add(lh);
    }
  }

  // ---- per-frame ---------------------------------------------------------------------------------------------------
  /**
   * frame: a replay frame { k: [[x,y,z,h,steer,drift,tier,boost,spin,shield,speed,place]...], p: [[type,x,y,z]...], b: [1/0...] }
   * opts: { follow: kart index, dt, time, lookBack, cam: 'chase'|'replay', events: [...], humanIdx }
   */
  render(frame, opts) {
    const dt = opts.dt, time = opts.time;
    const T = this.track;
    // karts
    frame.k.forEach((s, i) => {
      const m = this.karts[i]; if (!m) return;
      const [x, y, z, h, steer, drift, tier, boost, spin, shield, speed] = s;
      m.position.set(x, y, z);
      const slide = drift ? drift * 0.3 : 0;
      m.rotation.set(0, Math.PI / 2 - h - slide - spin, 0);
      // pitch with the slope
      const pr = T.project(x, z, m.userData.ti ?? -1); m.userData.ti = pr.i;
      const ud = m.userData;
      ud.body.rotation.z = THREE.MathUtils.lerp(ud.body.rotation.z, -steer * 0.06 - (drift ? drift * 0.08 : 0), Math.min(1, dt * 8));
      ud.body.position.y = Math.sin(time * 30 + i) * 0.015 * Math.min(1, Math.abs(speed) / 10) + (boost ? 0.04 : 0);
      for (const w of ud.wheels) w.rotation.x += speed * dt / 0.4;
      for (const p of ud.steer) p.rotation.y = -steer * 0.45;
      if (ud.wheel) ud.wheel.rotation.z = steer * 0.9;
      if (ud.head) ud.head.rotation.y = -steer * 0.35;
      const gy = T.height(pr.i, pr.f), onRoad = Math.abs(pr.lat) < T.w[pr.i] / 2 + T.shoulder + 1;
      ud.blob.position.set(x, (onRoad ? gy : y) + 0.08, z); ud.blob.rotation.z = -h; ud.blob.visible = onRoad && y - gy < 12; ud.blob.material.opacity = Math.max(0.05, 0.32 - (y - gy) * 0.03);
      this.shields[i].visible = !!shield; if (shield) { this.shields[i].position.set(x, y + 1, z); this.shields[i].rotation.y += dt * 2; this.shields[i].material.color.setHSL((time * 0.6) % 1, 0.9, 0.7); }
      // particles: drift sparks, boost flames, dust
      const fx = this.fx, cos = Math.cos(h), sin = Math.sin(h);
      if (drift && Math.abs(speed) > 5) {
        const col = TIER_COLORS[tier];
        for (const side of [1, -1]) {
          const wx = x - cos * 1.0 + sin * side * 0.95, wz = z - sin * 1.0 - cos * side * 0.95;
          if (tier > 0 || Math.random() < 0.4) fx.emit(wx, y + 0.15, wz, (Math.random() - 0.5) * 4 - cos * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 4 - sin * 3, col, tier ? 0.45 + tier * 0.08 : 0.3, 0.28, 14);
          if (Math.random() < 0.3) fx.emit(wx, y + 0.2, wz, -cos * 2, 0.8, -sin * 2, '#aaaaaa', 0.9, 0.5, -1, 2.5);
        }
      }
      if (boost) for (let e = 0; e < 2; e++) {
        const bx = x - cos * 1.9, bz = z - sin * 1.9;
        fx.emit(bx + (Math.random() - 0.5) * 0.6, y + 0.65, bz + (Math.random() - 0.5) * 0.6, -cos * 9, Math.random(), -sin * 9, Math.random() < 0.5 ? '#ffb020' : '#ff5a1f', 0.8, 0.18, 0, -2);
        fx.emit(bx, y + 0.65, bz, -cos * 6, 0, -sin * 6, '#4fe3ff', 0.5, 0.12);
      }
      if (Math.abs(speed) > 8 && onRoad && Math.abs(pr.lat) > T.w[pr.i] / 2 + 0.6 && T.edge[pr.i] === 0 && Math.random() < 0.6)
        fx.emit(x - cos * 1.2, y + 0.3, z - sin * 1.2, -cos * 3 + (Math.random() - 0.5) * 2, 1.5, -sin * 3, this.theme.off, 1.0, 0.6, 2, 2);
    });
    // crystals
    frame.b.forEach((on, i) => {
      const c = this.crystals[i]; if (!c) return;
      const tgt = on ? 1 : 0, s = c.scale.x + (tgt - c.scale.x) * Math.min(1, dt * (on ? 4 : 30));
      c.scale.setScalar(Math.max(0.001, s)); c.visible = s > 0.02;
      c.rotation.y = time * 1.4 + i; c.rotation.x = Math.sin(time * 1.2 + i) * 0.3; c.position.y = T.boxes[i].y + Math.sin(time * 2 + i) * 0.18;
      c.userData.inner.material.color.setHSL((time * 0.25 + i * 0.07) % 1, 0.9, 0.7);
    });
    // projectiles (pooled meshes per type)
    const used = { goo: 0, puck: 0, wasp: 0, decoy: 0 };
    for (const [type, x, y, z] of frame.p) {
      const pool = this.projPool[type]; let m = pool[used[type]];
      if (!m) { m = makeProjectile(type); pool.push(m); this.scene.add(m); }
      used[type]++; m.visible = true; m.position.set(x, y, z);
      if (type === 'puck') m.rotation.y += dt * 12;
      if (type === 'wasp') { m.position.y += Math.sin(time * 20) * 0.1; const prev = m.userData.prev || m.position.clone(); const dx = x - prev.x, dz = z - prev.z; if (dx * dx + dz * dz > 1e-4) m.rotation.y = Math.atan2(dx, dz); m.userData.prev = new THREE.Vector3(x, y, z); if (m.userData['wing1']) m.userData['wing1'].rotation.z = Math.sin(time * 60) * 0.5; }
      if (type === 'decoy') { m.rotation.y = time * 1.4; m.position.y = y + 1.2; }
      if (type === 'goo') m.scale.set(1 + Math.sin(time * 6) * 0.05, 1, 1 + Math.cos(time * 6) * 0.05);
    }
    for (const [type, pool] of Object.entries(this.projPool)) for (let i = used[type]; i < pool.length; i++) pool[i].visible = false;
    // events → bursts
    for (const e of opts.events || []) this.burst(e, frame);
    if (this.spinner) this.spinner.rotation.z += dt * 0.8;
    if (this.chev) this.chev.offset.y = (time * 1.6) % 1;
    if (this.water) this.water.position.y = -0.9 + Math.sin(time * 0.8) * 0.1;
    this.fx.update(dt);
    this.updateCamera(frame, opts);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.draw();
  }

  burst(e, frame) {
    const fx = this.fx, k = frame.k[e.k];
    const R = (a = 1) => (Math.random() - 0.5) * a;
    switch (e.type) {
      case 'box': for (let i = 0; i < 26; i++) fx.emit(e.x, e.y, e.z, R(14), R(10) + 3, R(14), `hsl(${Math.random() * 360},90%,70%)`, 0.6, 0.6, 10); break;
      case 'hit': if (k) for (let i = 0; i < 30; i++) fx.emit(k[0], k[1] + 1, k[2], R(12), Math.random() * 8, R(12), i % 2 ? '#ffe066' : '#ffffff', 0.7, 0.6, 14); if (e.k === this.followIdx) this.shake = 0.5; break;
      case 'pop': for (let i = 0; i < 20; i++) fx.emit(e.x, e.y + 0.5, e.z, R(10), Math.random() * 7, R(10), e.type === 'goo' ? '#5be37a' : '#ff8fa0', 0.6, 0.5, 12); break;
      case 'thunder': this.flash = 1; for (const kk of frame.k) if (kk[11] < (frame.k[e.k]?.[11] ?? 9)) for (let i = 0; i < 16; i++) fx.emit(kk[0] + R(2), kk[1] + 6 - i * 0.4, kk[2] + R(2), R(2), -4, R(2), '#fff6a0', 0.9, 0.4); break;
      case 'boost': if (k) for (let i = 0; i < 16; i++) fx.emit(k[0], k[1] + 0.6, k[2], R(8), Math.random() * 4, R(8), TIER_COLORS[e.tier || 1], 0.7, 0.4, 6); break;
      case 'land': if (k) for (let i = 0; i < 14; i++) fx.emit(k[0] + R(3), k[1] + 0.2, k[2] + R(3), R(6), 1.5, R(6), '#dddddd', 1.2, 0.5, 2, 3); if (e.k === this.followIdx && e.hard) this.shake = 0.25; break;
      case 'wall': if (k) for (let i = 0; i < 10; i++) fx.emit(k[0], k[1] + 0.6, k[2], R(8), Math.random() * 5, R(8), '#ffd080', 0.4, 0.35, 14); if (e.k === this.followIdx) this.shake = Math.max(this.shake, 0.2 * e.hit); break;
      case 'trick': if (k) for (let i = 0; i < 20; i++) fx.emit(k[0], k[1] + 1, k[2], R(10), R(10), R(10), '#ffffff', 0.6, 0.5); break;
      default: break;
    }
  }

  updateCamera(frame, opts) {
    const dt = opts.dt, cam = this.camera, idx = opts.follow ?? 0, s = frame.k[idx]; if (!s) return;
    this.followIdx = idx;
    const [x, y, z, h, , drift, , boost, spin, , speed] = s;
    const mode = opts.cam || 'chase';
    if (mode === 'chase' || mode === 'intro') {
      // look along the travel direction, smoothed; a drift swings the camera a little to the outside
      const want = h - (drift ? drift * 0.2 : 0) + (opts.lookBack ? Math.PI : 0);
      if (this.camH === undefined || opts.snap) this.camH = want;
      let d = want - this.camH; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      this.camH += d * Math.min(1, dt * (opts.lookBack ? 20 : 8));
      const dist = (opts.lookBack ? 6.5 : 6.4) + Math.min(1.4, Math.max(0, speed) * 0.03) + (boost ? 0.8 : 0), hgt = 2.55;
      const tx = x - Math.cos(this.camH) * dist, tz = z - Math.sin(this.camH) * dist;
      let ty = y + hgt;
      const want3 = new THREE.Vector3(tx, ty, tz);
      if (opts.snap || !this.camInit) { this.camPos.copy(want3); this.camInit = true; }
      this.camPos.lerp(want3, Math.min(1, dt * 10)); this.camPos.y += (ty - this.camPos.y) * Math.min(1, dt * 4);
      // never under the road
      const pr = this.track.project(this.camPos.x, this.camPos.z, this._camTi ?? -1); this._camTi = pr.i;
      const gy = this.track.height(pr.i, pr.f); if (this.camPos.y < gy + 1) this.camPos.y = gy + 1;
      cam.position.copy(this.camPos);
      // portrait screens: wider view and the kart nearer the middle, clear of the touch controls below
      const tall = cam.aspect < 1;
      const ahead = tall ? 0.5 : 3;
      this.camLook.set(x + Math.cos(this.camH) * ahead, y + (tall ? 0.2 : 1.3), z + Math.sin(this.camH) * ahead);
      cam.lookAt(this.camLook);
      const fov = (tall ? 86 : 68) + (boost ? 10 : 0) + Math.min(6, Math.max(0, speed - 20) * 0.5);
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
      void spin;
    } else if (mode === 'orbit') {
      const a = opts.time * 0.25, r = 16;
      cam.position.set(x + Math.cos(a) * r, y + 6, z + Math.sin(a) * r); cam.lookAt(x, y + 1, z); cam.fov = 55; cam.updateProjectionMatrix();
    } else if (mode === 'replay') {
      // trackside cameras: jump to the nearest pole ahead of the kart, keep it until the kart passes
      const T = this.track, pr = T.project(x, z, this._repTi ?? -1); this._repTi = pr.i;
      if (this._pole === undefined || T.wrap(pr.i - this._pole) < T.n / 2 && T.wrap(pr.i - this._pole) > 12) {
        const i = T.wrap(pr.i + 22), side = (Math.floor(i / 40) % 2 ? 1 : -1);
        this._pole = i; const p = T.at(i, side * (T.w[i] / 2 + T.shoulder - 1)); this._polePos = new THREE.Vector3(p.x, p.y + 3.2 + (i % 3), p.z);
      }
      cam.position.copy(this._polePos); cam.lookAt(x, y + 0.8, z);
      const d = cam.position.distanceTo(new THREE.Vector3(x, y, z)); cam.fov = THREE.MathUtils.clamp(900 / Math.max(10, d) * 1.4, 22, 60); cam.updateProjectionMatrix();
    }
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 1.5); }
    this.sky.position.copy(cam.position); if (this.stars) this.stars.position.copy(cam.position);
    // keep the shadow camera on the followed kart
    this.sun.position.set(x + 60, y + 110, z + 30); this.sun.target.position.set(x, y, z); this.sun.target.updateMatrixWorld();
  }

  setGhost(racer, kart) { if (this.ghost) this.scene.remove(this.ghost); if (!racer) { this.ghost = null; return; } const g = makeKart(racer, kart); g.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: '#9ff0ff', transparent: true, opacity: 0.35, depthWrite: false }); o.castShadow = false; } }); this.ghost = g; this.scene.add(g); }
  showGhost(s) { if (!this.ghost) return; if (!s) { this.ghost.visible = false; return; } this.ghost.visible = true; this.ghost.position.set(s[0], s[1], s[2]); this.ghost.rotation.set(0, Math.PI / 2 - s[3], 0); }

  draw() { this.renderer.render(this.scene, this.camera); }
}
