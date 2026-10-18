// Floodlit stadium: striped pitch with exact markings (105 × 68 m), goals with deforming nets, stands with a
// cheering instanced crowd, floodlight towers and advertising boards.
import * as THREE from 'three';

export const L = 105, W = 68, HL = 52.5, HW = 34;
export const GOAL_W = 7.32, GOAL_H = 2.44, GOAL_D = 2.0;

function canvasTex(w, h, draw, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export class Stadium {
  constructor(scene) {
    this.scene = scene; this.nets = []; this.cheer = 0; this.time = 0;
    const root = this.root = new THREE.Group(); scene.add(root);
    this.pitch(); this.lines(); this.goals(); this.stands(); this.boards(); this.lights();
  }

  pitch() {
    const grass = canvasTex(512, 512, (c, w, h) => {
      for (let i = 0; i < 2; i++) { c.fillStyle = i ? '#3f8f3a' : '#4a9e42'; c.fillRect(i * w / 2, 0, w / 2, h); }
      for (let k = 0; k < 9000; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '20,60,20' : '120,180,90'},${Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, [10, 6]);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, W + 8), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    grass.repeat.set((L + 8) / 10.5, (W + 8) / 10.5);
    pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; this.root.add(pitch);
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(220, 170), new THREE.MeshStandardMaterial({ color: 0x2f5f2c, roughness: 1 }));
    surround.rotation.x = -Math.PI / 2; surround.position.y = -0.02; surround.receiveShadow = true; this.root.add(surround);
  }

  lines() {
    const m = new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }), y = 0.015, lw = 0.12;
    const rect = (x0, z0, x1, z1) => { // outline rectangle
      const s = [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]];
      for (const [a, b, c, d] of s) { const len = Math.hypot(c - a, d - b); const p = new THREE.Mesh(new THREE.PlaneGeometry(a === c ? lw : len + lw, a === c ? len + lw : lw), m); p.rotation.x = -Math.PI / 2; p.position.set((a + c) / 2, y, (b + d) / 2); this.root.add(p); }
    };
    rect(-HL, -HW, HL, HW);
    const half = new THREE.Mesh(new THREE.PlaneGeometry(lw, W), m); half.rotation.x = -Math.PI / 2; half.position.y = y; this.root.add(half);
    const ring = (x, z, r, a0 = 0, al = Math.PI * 2) => { const g = new THREE.RingGeometry(r - lw / 2, r + lw / 2, 64, 1, a0, al); const me = new THREE.Mesh(g, m); me.rotation.x = -Math.PI / 2; me.position.set(x, y, z); this.root.add(me); };
    ring(0, 0, 9.15);
    const spot = (x, z, r = 0.2) => { const s = new THREE.Mesh(new THREE.CircleGeometry(r, 16), m); s.rotation.x = -Math.PI / 2; s.position.set(x, y, z); this.root.add(s); };
    spot(0, 0, 0.25);
    for (const s of [-1, 1]) {
      rect(s * HL, -20.16, s * (HL - 16.5), 20.16); // penalty area
      rect(s * HL, -9.16, s * (HL - 5.5), 9.16);    // goal area
      spot(s * (HL - 11), 0);
      // penalty arc outside the box (radius 9.15 from the spot)
      const a = Math.acos(5.5 / 9.15); // box edge is 5.5 m beyond the spot
      ring(s * (HL - 11), 0, 9.15, s > 0 ? Math.PI - a : -a, 2 * a);
      for (const t of [-1, 1]) ring(s * HL, t * HW, 1, Math.atan2(t, -s) - Math.PI / 4, Math.PI / 2); // quarter-circle corner arcs
    }
    // corner flags
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pole.position.set(sx * HL, 0.75, sz * HW); this.root.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshStandardMaterial({ color: 0xff3b3b, side: THREE.DoubleSide }));
      flag.position.set(sx * HL + 0.17, 1.38, sz * HW); this.root.add(flag);
    }
  }

  goals() {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2 });
    const netTex = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(64, 64); c.moveTo(64, 0); c.lineTo(0, 64); c.stroke(); });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); this.root.add(g);
      const r = 0.06;
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_H, 12), white); p.position.set(s * HL, GOAL_H / 2, z); p.castShadow = true; g.add(p); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, GOAL_W + 2 * r, 12), white); bar.rotation.x = Math.PI / 2; bar.position.set(s * HL, GOAL_H, 0); bar.castShadow = true; g.add(bar);
      // back frame
      const thin = new THREE.MeshStandardMaterial({ color: 0xdddddd });
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(GOAL_D, GOAL_H), 6), thin); b.position.set(s * (HL + GOAL_D / 2), GOAL_H / 2, z); b.rotation.z = s * Math.atan2(GOAL_D, GOAL_H); g.add(b); }
      // nets: back (deformable), sides, roof
      const mk = (w, h, sx, sy) => { const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.25, h / 0.25); return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 }); };
      const backGeo = new THREE.PlaneGeometry(GOAL_W, GOAL_H, 28, 10);
      const back = new THREE.Mesh(backGeo, mk(GOAL_W, GOAL_H)); back.position.set(s * (HL + GOAL_D), GOAL_H / 2, 0); back.rotation.y = s * Math.PI / 2; g.add(back);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_W), mk(GOAL_D, GOAL_W)); roof.rotation.x = -Math.PI / 2; roof.position.set(s * (HL + GOAL_D / 2), GOAL_H, 0); g.add(roof);
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H), mk(GOAL_D, GOAL_H)); side.position.set(s * (HL + GOAL_D / 2), GOAL_H / 2, z); g.add(side); }
      const base = backGeo.attributes.position.array.slice();
      this.nets.push({ side: s, mesh: back, geo: backGeo, base, dents: [] });
    }
  }

  /** Dent the back net where the ball hit (side = +1 or −1 goal). */
  bulge(side, z, y, strength = 1) { const n = this.nets.find(n => n.side === side); if (n) n.dents.push({ z, y, s: Math.min(1.2, strength), t: 0 }); }

  stands() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.9 });
    const seats = [];
    const sides = [
      { cx: 0, cz: -1, len: 124, dist: 42, rows: 16 }, { cx: 0, cz: 1, len: 124, dist: 42, rows: 16 },
      { cx: -1, cz: 0, len: 84, dist: 62, rows: 14 }, { cx: 1, cz: 0, len: 84, dist: 62, rows: 14 },
    ];
    for (const s of sides) {
      for (let r = 0; r < s.rows; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(s.cz ? s.len : 1.2, 0.9, s.cz ? 1.2 : s.len), concrete);
        const off = s.dist + r * 1.1, y = 0.45 + r * 0.85;
        step.position.set(s.cx * off, y, s.cz * off); step.receiveShadow = true; this.root.add(step);
        for (let i = -s.len / 2 + 0.6; i < s.len / 2; i += 0.85) {
          if (Math.random() < 0.08) continue;
          seats.push(s.cz ? [i, y + 0.75, s.cz * off] : [s.cx * off, y + 0.75, i]);
        }
      }
      // roof
      const roof = new THREE.Mesh(new THREE.BoxGeometry(s.cz ? s.len + 6 : 22, 0.6, s.cz ? 22 : s.len + 6), new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 0.7, metalness: 0.3 }));
      roof.position.set(s.cx * (s.dist + 14), 18, s.cz * (s.dist + 14)); this.root.add(roof);
    }
    // instanced crowd that bounces when cheering (vertex shader uses the instance id)
    const geo = new THREE.BoxGeometry(0.42, 0.75, 0.32);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.crowdUniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.crowdUniforms.uTime; sh.uniforms.uCheer = this.crowdUniforms.uCheer;
      sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nfloat ph = float(gl_InstanceID) * 1.618;\ntransformed.y += (abs(sin(uTime * 9.0 + ph)) * uCheer * 0.45) + sin(uTime * 1.3 + ph) * 0.02;');
    };
    const crowd = new THREE.InstancedMesh(geo, mat, seats.length);
    const palette = [0x5ec8f2, 0xd62828, 0xffffff, 0x222222, 0xffd60a, 0x2a9d8f, 0x8a8a8a, 0xf28c28, 0x3a5fcd];
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    seats.forEach((p, i) => { mtx.makeTranslation(p[0], p[1], p[2]); crowd.setMatrixAt(i, mtx); crowd.setColorAt(i, col.setHex(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(0.6 + Math.random() * 0.5)); });
    crowd.instanceMatrix.needsUpdate = true; crowd.frustumCulled = false; this.root.add(crowd);
    // dugouts
    for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(8, 2.2, 2), new THREE.MeshStandardMaterial({ color: 0x223, roughness: 0.4, metalness: 0.4, transparent: true, opacity: 0.85 })); d.position.set(s * 8, 1.1, HW + 5); this.root.add(d); }
  }

  boards() {
    const brands = ['GOLAZO', 'STARBOLT', 'ARCADE', 'SUNVALE', 'HARBOUR AIR', 'REDWOOD', 'PIXEL COLA', 'NORTHBRIDGE BANK'];
    const tex = canvasTex(2048, 64, (c, w, h) => {
      const seg = w / brands.length;
      brands.forEach((b, i) => { c.fillStyle = ['#0b3d91', '#d62828', '#111827', '#f59e0b', '#0e7490', '#7c3aed', '#16a34a', '#be123c'][i]; c.fillRect(i * seg, 0, seg, h); c.fillStyle = '#fff'; c.font = 'bold 40px Arial Black, Arial'; c.textAlign = 'center'; c.fillText(b, i * seg + seg / 2, 47); });
    });
    this.boardTex = tex;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
    const mk = (len, x, z, ry) => { const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), mat); b.position.set(x, 0.45, z); b.rotation.y = ry; this.root.add(b); };
    mk(110, 0, -HW - 4, 0); mk(110, 0, HW + 4, Math.PI);
    for (const s of [-1, 1]) { mk(30, s * (HL + 5), -22, -s * Math.PI / 2); mk(30, s * (HL + 5), 22, -s * Math.PI / 2); }
  }

  lights() {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tower = new THREE.Group(); tower.position.set(sx * 66, 0, sz * 52); this.root.add(tower);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 40, 8), new THREE.MeshStandardMaterial({ color: 0x555b66, metalness: 0.5 })); pole.position.y = 20; tower.add(pole);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 2.2 }));
      panel.position.y = 41; panel.lookAt(0, 0, 0); tower.add(panel);
    }
  }

  update(dt) {
    this.time += dt; this.cheer = Math.max(0, this.cheer - dt * 0.25);
    this.crowdUniforms.uTime.value = this.time; this.crowdUniforms.uCheer.value = Math.min(1, this.cheer);
    this.boardTex.offset.x = (this.time * 0.02) % 1;
    for (const n of this.nets) {
      if (!n.dents.length && !n.dirty) continue;
      const pos = n.geo.attributes.position.array; pos.set(n.base); n.dirty = false;
      n.dents = n.dents.filter(d => (d.t += dt) < 1.6);
      for (const d of n.dents) {
        const amp = d.s * 0.9 * Math.exp(-d.t * 2.2) * Math.cos(d.t * 9) ;
        for (let i = 0; i < pos.length; i += 3) {
          // plane local: x across (−z world for side +1), y up
          const lx = pos[i], ly = pos[i + 1];
          const wz = n.side > 0 ? -lx : lx, wy = ly + 1.22;
          const r2 = (wz - d.z) ** 2 + (wy - d.y) ** 2;
          pos[i + 2] += amp * Math.exp(-r2 / 0.9);
        }
        n.dirty = true;
      }
      n.geo.attributes.position.needsUpdate = true;
    }
  }
}
