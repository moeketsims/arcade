// The island: terrain, sea, sky, lights, and the per-match generated content (buildings, props, decor).
import * as THREE from 'three';
import { Terrain, HALF } from './terrain.js';
import { CollisionWorld } from './colliders.js';
import { Pieces } from './structures.js';
import { Props, Decor, Occupancy } from './props.js';
import { generateWorld } from './buildings.js';
import { mulberry32 } from './noise.js';
import { NavGrid } from './nav.js';

export const SUN_DIR = new THREE.Vector3(0.5, 0.72, 0.38).normalize();
const hasDom = typeof document !== 'undefined' && !!document.createElement;

function radialTexture(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 62); stops.forEach(([o, col]) => g.addColorStop(o, col)); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function waterTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 14; const g = c.createRadialGradient(x, y, 0, x, y, r); const a = Math.random() < 0.5 ? 0.16 : 0.1; g.addColorStop(0, `rgba(170,215,255,${a})`); g.addColorStop(1, 'rgba(170,215,255,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 90); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World {
  constructor(scene, seed = 7) {
    this.scene = scene; this.seed = seed;
    this.terrain = new Terrain(seed);
    this.cw = new CollisionWorld(this.terrain);
    this.group = new THREE.Group(); scene.add(this.group);
    this.pieces = new Pieces(scene, this.cw);
    this.decor = new Decor(scene, this.cw);
    this.props = new Props(scene, this.cw, this.terrain);
    this.occ = new Occupancy(); this.nav = new NavGrid();
    this.out = { houses: [], chestSpots: [], lootSpots: [], towers: [], landmarks: new THREE.Group() };
    this.t = 0; this.clouds = [];
    this.buildEnvironment();
  }

  buildEnvironment() {
    const scene = this.scene, T = this.terrain;
    this.terrainMesh = T.buildMesh(); this.group.add(this.terrainMesh);
    // sea: translucent plane over a coloured sea-bed gives a natural shore gradient
    this.waterTex = hasDom ? waterTexture() : null;
    const wm = new THREE.MeshStandardMaterial({ color: 0x2f9fe0, transparent: true, opacity: 0.74, roughness: 0.18, metalness: 0.0, map: this.waterTex, depthWrite: false });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), wm); this.water.rotation.x = -Math.PI / 2; this.water.position.y = 0; this.water.renderOrder = -1; this.group.add(this.water);
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), new THREE.MeshBasicMaterial({ color: 0x0f4a78 })); deep.rotation.x = -Math.PI / 2; deep.position.y = -14; this.group.add(deep);
    // lights
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x99a383, 2.0); scene.add(this.hemi);   // strong sky fill: shaded sides stay readable (bright, toy-like look)
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 300 });
    this.sun.shadow.camera.updateProjectionMatrix(); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05; scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xbfdcf0, 160, 720); scene.background = new THREE.Color(0xbfdcf0);
    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 14), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2f78d0) }, horizon: { value: new THREE.Color(0xbfdcf0) }, bottom: { value: new THREE.Color(0x5fa0c8) }, sunDir: { value: SUN_DIR.clone() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)); c = mix(c, bottom, 1.0 - smoothstep(-0.3, 0.0, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0,0.9,0.65) * (pow(s,900.0)*4.0 + pow(s,14.0)*0.22);
          gl_FragColor = vec4(c,1.0);
          // no tone mapping: fog is applied after tone mapping, so a tone-mapped horizon would not match the fogged sea
          #include <colorspace_fragment>
        }` }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky);
    // clouds
    if (hasDom) {
      const tex = radialTexture([[0, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
      const rng = mulberry32(5);
      for (let i = 0; i < 26; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
        const a = rng() * 6.283, r = 150 + rng() * 900; s.position.set(Math.cos(a) * r, 220 + rng() * 260, Math.sin(a) * r); s.scale.set(140 + rng() * 220, 50 + rng() * 60, 1); s.userData.v = 1.5 + rng() * 2;
        scene.add(s); this.clouds.push(s);
      }
    }
  }

  /** Generate (or regenerate) the match content. */
  generate(seed = this.seed) {
    this.cw.reset(); this.pieces.reset(); this.props.reset(); this.decor.reset(); this.occ.reset();
    if (this.out.landmarks.parent) this.scene.remove(this.out.landmarks);
    this.out.landmarks.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
    const rng = mulberry32(seed * 7919 + 3), T = this.terrain;
    const ctx = { T, pieces: this.pieces, decor: this.decor, props: this.props, occ: this.occ, rng, cw: this.cw };
    this.out = generateWorld(ctx);
    this.props.generate(rng, this.occ);
    // cars along the roads and in the POIs
    const colors = [0xd9533b, 0x3b7bd9, 0xe0b23a, 0x3fae6a, 0xeeeeee, 0x222831, 0xe27d3a];
    let cars = 0, tries = 0;
    while (cars < 12 && tries++ < 300) {
      const r = T.roads[Math.floor(rng() * T.roads.length)], t = 0.1 + rng() * 0.8, side = rng() < 0.5 ? -1 : 1;
      const dx = r.bx - r.ax, dz = r.bz - r.az, L = Math.hypot(dx, dz), x = r.ax + dx * t + (-dz / L) * side * 4.2, z = r.az + dz * t + (dx / L) * side * 4.2;
      if (!this.occ.freeRect(x - 3, z - 3, x + 3, z + 3) || !T.isLand(x, z, 1.5) || T.slopeAt(x, z) > 0.2) continue;
      this.props.car(x, z, Math.abs(dx) > Math.abs(dz) ? 0 : 1, colors[Math.floor(rng() * colors.length)], rng); this.occ.mark(x - 3, z - 3, x + 3, z + 3, 0); cars++;
    }
    this.scene.add(this.out.landmarks);
    this.props.clearDoorways(this.out.houses);
    this.props.finish(); this.decor.finish(); this.pieces.flush(); this.nav.build(this.cw, T);
    this.cw.stampCtr = 1;
    return this.out;
  }

  /** Per-frame environment animation; follow = position the sun/shadow should track. */
  update(dt, camPos, follow) {
    this.t += dt;
    if (this.waterTex) { this.waterTex.offset.x = (this.waterTex.offset.x + dt * 0.004) % 1; this.waterTex.offset.y = (this.waterTex.offset.y + dt * 0.0025) % 1; }
    this.sky.position.copy(camPos);
    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 1100) c.position.x = -1100; }
    if (this.out.windmill) this.out.windmill.rotation.z += dt * 0.45;
    if (this.out.beacon) this.out.beacon.material.color.setHex((this.t * 1.2) % 2 < 1 ? 0xfff0b0 : 0xffb050);
    if (follow) {
      // snap the shadow frustum to a texel grid to avoid shimmering
      const q = 140 / 2048 * 2; const fx = Math.round(follow.x / q) * q, fz = Math.round(follow.z / q) * q;
      this.sun.target.position.set(fx, follow.y, fz); this.sun.position.set(fx + SUN_DIR.x * 150, follow.y + SUN_DIR.y * 150, fz + SUN_DIR.z * 150);
      this.sun.target.updateMatrixWorld();
    }
  }
  heightAt(x, z) { return this.terrain.heightAt(x, z); }
}
export { HALF };
