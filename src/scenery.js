// Starbolt atmosphere: sky dome with a sun, a sea of clouds below the level, drifting sprite clouds and
// distant floating islands. Themes opt in with `sunDir`, `cloudSea`, `clouds` and `islands`; themes
// without them keep the plain gradient sky.
import * as THREE from 'three';
import { mat, makeTree } from './models.js';

export const DEFAULT_SUN = new THREE.Vector3(18, 30, -12).normalize();

// Gradient noise with a quintic fade, summed in octaves that are each rotated, so no square lattice shows.
const NOISE = /* glsl */`
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 grad(vec2 i) { float a = hash(i) * 6.2831853; return vec2(cos(a), sin(a)); }
  float gnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(grad(i), f), b = dot(grad(i + vec2(1, 0)), f - vec2(1, 0));
    float c = dot(grad(i + vec2(0, 1)), f - vec2(0, 1)), d = dot(grad(i + vec2(1, 1)), f - vec2(1, 1));
    return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; mat2 r = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = r * p + 7.3; a *= 0.5; } return s / 0.97; }`;

export class Atmosphere {
  constructor(scene) {
    this.scene = scene; this.t = 0;
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, below: { value: new THREE.Color() },
        sunDir: { value: DEFAULT_SUN.clone() }, sunColor: { value: new THREE.Color() }, sunOn: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 top, bottom, below, sunDir, sunColor; uniform float sunOn; varying vec3 vP;
        void main() {
          vec3 d = normalize(vP);
          if (sunOn < 0.5) { float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, smoothstep(0.35, 1.0, h)), 1.0); return; }
          float h = d.y;
          vec3 c = mix(bottom, top, pow(clamp(h, 0.0, 1.0), 0.45));            // deep blue overhead, pale haze at the horizon
          if (h < 0.0) c = mix(bottom, below, smoothstep(0.0, -0.25, h));      // under the horizon: hazy blue depth below the clouds
          float cs = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (smoothstep(0.99935, 0.99965, cs) * 1.6               // the sun's disc (~2° radius)
                         + pow(cs, 400.0) * 0.6 + pow(cs, 40.0) * 0.22 + pow(cs, 5.0) * 0.08 * (1.0 - clamp(h, 0.0, 1.0)));
          gl_FragColor = vec4(c, 1.0);
        }` });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), this.skyMat); scene.add(this.sky);

    const n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(500); pos.set([v.x, v.y, v.z], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })); scene.add(this.stars);

    // Sea of clouds: one big plane that follows the camera; the noise is sampled in world space so it does not slide.
    this.seaMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, sunDir: { value: DEFAULT_SUN.clone() },
        lit: { value: new THREE.Color() }, shade: { value: new THREE.Color() }, haze: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE + /* glsl */`
        uniform float time; uniform vec3 cam, sunDir, lit, shade, haze; varying vec3 vW;
        void main() {
          vec2 p = vW.xz * 0.013 + vec2(time * 0.006, time * 0.002);
          float n = fbm(p), m = fbm(p * 3.1 + 9.0);
          float v = n * 0.75 + m * 0.25;
          float dens = smoothstep(0.44, 0.62, v);
          // puffs are brighter on the side facing the sun: compare the noise a little toward the sun
          float nl = fbm(p + normalize(sunDir.xz + 1e-4) * 0.06) * 0.75 + m * 0.25;
          float light = clamp(0.7 + (v - nl) * 7.0 + (v - 0.5) * 0.8, 0.35, 1.08);
          vec3 c = mix(shade, lit, light);
          float dist = length(vW.xz - cam.xz);
          float far = smoothstep(140.0, 650.0, dist);                          // melt into the horizon haze far away
          gl_FragColor = vec4(mix(c, haze, far), max(dens * 0.97, far));
        }` });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.seaMat); this.sea.rotation.x = -Math.PI / 2; this.sea.renderOrder = -1;
    scene.add(this.sea);

    this.cloudGroup = new THREE.Group(); scene.add(this.cloudGroup);
    this.islandGroup = new THREE.Group(); scene.add(this.islandGroup);
    this.cloudTex = [0, 1, 2, 3].map(cloudTexture);
    this.sunDir = DEFAULT_SUN.clone();
  }

  apply(t) {
    const u = this.skyMat.uniforms;
    u.top.value.set(t.sky[0]); u.bottom.value.set(t.sky[1]); u.below.value.set(t.skyBelow ?? t.sky[1]);
    u.sunOn.value = t.sunDir ? 1 : 0; u.sunColor.value.set(t.sun ?? 0xffffff);
    this.sunDir.copy(t.sunDir ? new THREE.Vector3(...t.sunDir).normalize() : DEFAULT_SUN);
    u.sunDir.value.copy(this.sunDir); this.seaMat.uniforms.sunDir.value.copy(this.sunDir);
    this.stars.visible = !!t.stars;

    const cs = t.cloudSea; this.sea.visible = !!cs;
    if (cs) { this.sea.position.y = cs.y; const s = this.seaMat.uniforms; s.lit.value.set(cs.lit ?? 0xffffff); s.shade.value.set(cs.shade ?? 0xaebfd8); s.haze.value.set(cs.haze ?? t.sky[1]); }

    this.cloudGroup.clear(); this.clouds = [];
    const c0 = new THREE.Vector3(...(t.center ?? [0, 0, 80]));
    this.center = c0;
    let seed = 1234; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < (t.clouds ?? 0); i++) {
      // Two layers that never sit at the height of the course: wisps just above the cloud sea, and clouds high overhead.
      const a = rnd() * Math.PI * 2, r = 55 + rnd() * 230, low = rnd() < 0.35;
      const y = low ? (t.cloudSea?.y ?? -8) + 1 + rnd() * 3 : 20 + rnd() * 44;
      let x = c0.x + Math.cos(a) * r; const z = c0.z + Math.sin(a) * r;
      // Low wisps stay out of the lane the course runs along (x ≈ centre, the whole level length) and do not drift,
      // so they never wash out the platforms ahead; the high layer drifts freely above everything.
      if (low && Math.abs(x - c0.x) < 60 && Math.abs(z - c0.z) < 140) x = c0.x + Math.sign(x - c0.x || 1) * (60 + rnd() * 40);
      const w = (low ? 30 : 24) + rnd() * 46;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cloudTex[i % 4], transparent: true, depthWrite: false, opacity: 0.92, fog: true }));
      s.scale.set(w, w * 0.42, 1);
      s.position.set(x, y, z);
      this.cloudGroup.add(s); this.clouds.push({ s, speed: low ? 0 : 0.6 + rnd() * 1.2 });
    }

    this.islandGroup.clear(); this.islands = [];
    for (let i = 0; i < (t.islands ?? 0); i++) {
      const a = i / t.islands * Math.PI * 2 + rnd() * 0.5, r = 105 + rnd() * 140, size = 5 + rnd() * 11;
      const isl = floatingIsland(size, rnd, t);
      isl.position.set(c0.x + Math.cos(a) * r, -4 + rnd() * 38, c0.z + Math.sin(a) * r); isl.rotation.y = rnd() * 6.3;
      this.islandGroup.add(isl); this.islands.push({ m: isl, y: isl.position.y, ph: rnd() * 6.3 });
    }
  }

  update(dt, camPos) {
    this.t += dt;
    this.sky.position.copy(camPos); this.stars.position.copy(camPos);
    if (this.sea.visible) { this.sea.position.x = camPos.x; this.sea.position.z = camPos.z; this.seaMat.uniforms.time.value = this.t; this.seaMat.uniforms.cam.value.copy(camPos); }
    for (const c of this.clouds) {           // slow wind along +x, wrapping around the level
      c.s.position.x += c.speed * dt;
      if (c.s.position.x > this.center.x + 290) c.s.position.x -= 580;
    }
    for (const i of this.islands) i.m.position.y = i.y + Math.sin(this.t * 0.25 + i.ph) * 0.6;
  }
}

// Soft cumulus painted from overlapping radial puffs, flat-ish base, shaded underside.
function cloudTexture(variant) {
  const W = 512, H = 224, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  let seed = 97 + variant * 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const puffs = 16 + variant * 3;
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1), x = W * (0.14 + t * 0.72) + (rnd() - 0.5) * 40;
    const hump = Math.sin(t * Math.PI), r = 34 + hump * 52 + rnd() * 22;
    const y = H * 0.72 - hump * 60 - rnd() * 22;
    const g = c.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, Math.min(y, H * 0.74), r, 0, Math.PI * 2); c.fill();
  }
  c.globalCompositeOperation = 'destination-out';          // cut a soft flat base
  const base = c.createLinearGradient(0, H * 0.74, 0, H); base.addColorStop(0, 'rgba(0,0,0,0)'); base.addColorStop(0.5, 'rgba(0,0,0,1)');
  c.fillStyle = base; c.fillRect(0, H * 0.7, W, H * 0.3);
  c.globalCompositeOperation = 'source-atop';              // blue-grey shading toward the underside
  const sh = c.createLinearGradient(0, H * 0.2, 0, H * 0.78); sh.addColorStop(0, 'rgba(160,180,210,0)'); sh.addColorStop(1, 'rgba(140,160,195,0.55)');
  c.fillStyle = sh; c.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// A lumpy rock that hangs down from a platform: unit radius, flat top at y = 0, rounded point at y = -1.
// It is the lower half of a sphere, pinched toward a point, with every vertex pushed in or out by a
// value hashed from its position (so the duplicated seam/pole vertices move together and no cracks open).
export function rockGeometry(seed, rough = 0.18) {
  const g = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const p = g.attributes.position, h = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.13) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.min(1, Math.max(0, -y));                  // 0 at the rim, 1 at the bottom
    const pinch = 1 - Math.pow(k, 1.6) * 0.55;               // narrower toward the bottom, like a hanging rock
    const bump = k < 0.02 ? 1 : 1 + (h(+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)) - 0.5) * rough * 2;
    x *= pinch * bump; z *= pinch * bump; y *= 1 + (bump - 1) * 0.5;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); return g;
}

function floatingIsland(r, rnd, t) {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, 0.8, 22), mat(t.top, { rough: 0.9 })); grass.position.y = -0.4; g.add(grass);
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.9, 1.6, 22), mat(t.side, { rough: 0.95 })); dirt.position.y = -1.6; g.add(dirt);
  const rock = new THREE.Mesh(rockGeometry(rnd() * 100, 0.24), mat(t.rock ?? 0x6f5a48, { flat: true, rough: 1 }));
  rock.scale.set(r * 0.9, r * (1.3 + rnd() * 0.6), r * 0.9); rock.position.y = -2.4; g.add(rock);
  const trees = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < trees && t.id === 'meadow'; i++) {
    const a = rnd() * 6.3, d = rnd() * r * 0.6, tr = makeTree(0x8b5a2b, [0x5fbf4a, 0x4fae5a, 0x7fcf4f][i % 3], 1.4 + rnd() * 1.6);
    tr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(tr);
  }
  if (rnd() < 0.5) {                                        // a thin waterfall spilling off the rim
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.18, r * 2.6), new THREE.MeshBasicMaterial({ map: fallTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    fall.position.set(0, -r * 1.3, r * 0.93); g.add(fall);
  }
  return g;
}

let fallTex = null;
function fallTexture() {
  if (fallTex) return fallTex;
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 256; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(225,245,255,0.95)'); g.addColorStop(0.7, 'rgba(225,245,255,0.55)'); g.addColorStop(1, 'rgba(225,245,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 32, 256);
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 6; i++) c.fillRect(3 + i * 5, 0, 1.5, 256);
  fallTex = new THREE.CanvasTexture(cv); fallTex.colorSpace = THREE.SRGBColorSpace; return fallTex;
}
