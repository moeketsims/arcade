// The Storm: a shrinking safe circle in phases, purple wall, damage outside.
import * as THREE from 'three';

export const PHASES = [
  { wait: 80, shrink: 60, radius: 178, dmg: 1 },
  { wait: 50, shrink: 50, radius: 112, dmg: 2 },
  { wait: 40, shrink: 40, radius: 66, dmg: 4 },
  { wait: 30, shrink: 35, radius: 36, dmg: 6 },
  { wait: 20, shrink: 28, radius: 15, dmg: 8 },
  { wait: 10, shrink: 22, radius: 3, dmg: 10 },
];
const START_R = 400;

export class Storm {
  constructor(scene, terrain) {
    this.T = terrain; this.scene = scene; this.active = false; this.t = 0; this.time = 0;
    const geo = new THREE.CylinderGeometry(1, 1, 520, 96, 1, true); geo.translate(0, 220, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { time: { value: 0 }, r: { value: 100 } },
      vertexShader: 'varying vec3 vP; varying float vY; varying vec3 vW; void main(){ vP = position; vY = position.y; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float time; uniform float r; varying vec3 vP; varying float vY; varying vec3 vW;
        void main(){ float a = atan(vP.z, vP.x); float arcLen = a * r * 0.08; float s = 0.5 + 0.5 * sin(arcLen * 3.0 + vY * 0.03 - time * 0.8) * sin(vY * 0.06 + time * 0.5 + arcLen);
          float fade = 1.0 - smoothstep(20.0, 500.0, vY + 40.0); float edge = 0.28 + 0.34 * s;
          vec3 col = mix(vec3(0.36, 0.12, 0.7), vec3(0.75, 0.4, 1.0), s);
          // a far wall is a haze on the horizon, a near one a dense curtain; it thins out high above the ground
          float dist = length(vW.xz - cameraPosition.xz);
          float far = mix(1.0, 0.32, smoothstep(70.0, 360.0, dist));
          float high = mix(1.0, 0.25, smoothstep(40.0, 260.0, vW.y - cameraPosition.y * 0.5));
          gl_FragColor = vec4(col, edge * (0.55 + 0.45 * fade) * far * high);
          #include <colorspace_fragment>
        }` });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.visible = false; scene.add(this.mesh);
    // a ring marking the next safe zone on the ground
    const rg = new THREE.RingGeometry(0.985, 1, 96); rg.rotateX(-Math.PI / 2); this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, fog: false })); this.ring.visible = false; scene.add(this.ring);
    this.reset();
  }
  reset() {
    this.active = false; this.phase = -1; this.state = 'idle'; this.t = 0; this.center = new THREE.Vector2(0, 0); this.radius = START_R; this.prevC = new THREE.Vector2(0, 0); this.prevR = START_R; this.nextC = new THREE.Vector2(0, 0); this.nextR = START_R;
    this.mesh.visible = false; this.ring.visible = false; this.time = 0; this.dmg = 0; this.announce = null; this.finalClosed = false;
  }
  start() { this.active = true; this.mesh.visible = true; this.nextPhase(); }
  _pickCenter(prevC, prevR, nextR) {
    const maxOff = Math.max(0, prevR - nextR - 4); let best = null, bs = -1;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * maxOff * (this.phase === 0 ? 0.9 : 1), c = new THREE.Vector2(prevC.x + Math.cos(a) * d, prevC.y + Math.sin(a) * d);
      let land = 0, n = 0; for (let k = 0; k < 16; k++) { const aa = k * 0.39, rr = nextR * (k % 2 ? 0.5 : 0.85); n++; if (this.T.heightAt(c.x + Math.cos(aa) * rr, c.y + Math.sin(aa) * rr) > 0.5) land++; }
      if (this.T.heightAt(c.x, c.y) > 1 && land / n > bs) { bs = land / n; best = c; }
    }
    return best || new THREE.Vector2(prevC.x, prevC.y);
  }
  nextPhase() {
    this.phase++;
    if (this.phase >= PHASES.length) { this.state = 'final'; this.finalClosed = true; this.dmg = PHASES[PHASES.length - 1].dmg; this.announce = null; return; }
    const P = PHASES[this.phase]; this.prevC.copy(this.center); this.prevR = this.radius; this.nextR = P.radius; this.nextC.copy(this._pickCenter(this.center, this.radius, P.radius));
    this.state = 'wait'; this.t = 0; this.dmg = P.dmg; this.announce = { type: 'new', phase: this.phase };
    this.ring.visible = true;
  }
  /** seconds left in the current wait/shrink */
  get timeLeft() { if (this.state === 'wait') return PHASES[this.phase].wait - this.t; if (this.state === 'shrink') return PHASES[this.phase].shrink - this.t; return 0; }
  get label() { return this.state === 'wait' ? 'Storm closes in' : this.state === 'shrink' ? 'Storm closing' : this.state === 'final' ? 'Storm' : ''; }
  update(dt) {
    if (!this.active) return; this.time += dt; this.mat.uniforms.time.value = this.time;
    if (this.state === 'wait') {
      this.t += dt; if (this.t >= PHASES[this.phase].wait) { this.state = 'shrink'; this.t = 0; this.announce = { type: 'shrink', phase: this.phase }; }
    } else if (this.state === 'shrink') {
      this.t += dt; const P = PHASES[this.phase], k = Math.min(1, this.t / P.shrink);
      this.center.lerpVectors(this.prevC, this.nextC, k); this.radius = this.prevR + (this.nextR - this.prevR) * k;
      if (k >= 1) { this.center.copy(this.nextC); this.radius = this.nextR; this.nextPhase(); }
    } else if (this.state === 'final') { this.radius = 3; }
    const r = Math.max(0.5, this.radius); this.mesh.scale.set(r, 1, r); this.mesh.position.set(this.center.x, -30, this.center.y); this.mat.uniforms.r.value = r;
    if (this.state !== 'final') { const nr = Math.max(0.5, this.nextR); this.ring.position.set(this.nextC.x, 0.6, this.nextC.y); this.ring.scale.set(nr, 1, nr); this.ring.material.opacity = 0.0; this.ring.visible = false; }
  }
  inside(x, z) { return Math.hypot(x - this.center.x, z - this.center.y) <= this.radius; }
  /** signed distance to the wall (negative = inside) */
  distToWall(x, z) { return Math.hypot(x - this.center.x, z - this.center.y) - this.radius; }
  /** is this point going to be outside the NEXT circle */
  outsideNext(x, z) { return Math.hypot(x - this.nextC.x, z - this.nextC.y) > this.nextR; }
}
