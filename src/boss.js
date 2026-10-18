import * as THREE from 'three';
import { mat } from './models.js';

// Void Titan: 3 phases, 9 hits. Phase 1 hand slams (hit the stunned hand's core),
// phase 2 orbs (punch them back), phase 3 sweeping laser + pound the lit floor switches.
export class Boss {
  constructor(game, center = new THREE.Vector3(0, 0, 0), arenaR = 15) {
    this.g = game; this.c = center; this.R = arenaR; this.hp = 9; this.max = 9; this.phase = 1;
    this.t = 0; this.state = 'intro'; this.st = 0; this.flash = 0; this.dead = false;
    const root = this.root = new THREE.Group(); game.levelRoot.add(root);
    // head
    const head = this.head = new THREE.Group(); head.position.set(center.x, 8, center.z + 6); root.add(head);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(2.6, 32, 24), mat(0x2b1d4a, { metal: 0.5, rough: 0.3 })); shell.castShadow = true; head.add(shell);
    const face = new THREE.Mesh(new THREE.SphereGeometry(2.3, 32, 20, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.4), mat(0x07030f, { rough: 0.1 })); face.position.z = 0.45; head.add(face);
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3df2, emissive: 0xff3df2, emissiveIntensity: 2 });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), this.eyeMat); e.position.set(0.85 * s, 0.25, 2.4); e.scale.set(1.3, 0.6, 0.5); head.add(e); }
    for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 10), mat(0x7a4cff, { emissive: 0x3a1080, ei: 0.8 })); horn.position.set(1.6 * s, 2.2, 0); horn.rotation.z = -0.5 * s; head.add(horn); }
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffaa00, emissiveIntensity: 1.5 }));
    this.core.position.set(0, -1.2, 2.2); head.add(this.core);
    // hands
    this.hands = [-1, 1].map(s => {
      const h = new THREE.Group(); const palm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 2.6), mat(0x3a2a63, { metal: 0.5, rough: 0.35 })); palm.castShadow = true; h.add(palm);
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 1.2), mat(0x3a2a63, { metal: 0.5 })); f.position.set(-0.9 + i * 0.6, -0.3, 1.6); f.castShadow = true; h.add(f); }
      const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x46f0ff, emissive: 0x46f0ff, emissiveIntensity: 0.2 })); gem.position.y = 0.8; h.add(gem);
      h.position.set(center.x + 6 * s, 4, center.z + 3); root.add(h);
      const tele = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 32), new THREE.MeshBasicMaterial({ color: 0xff2d75, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      tele.rotation.x = -Math.PI / 2; root.add(tele);
      return { g: h, gem, tele, s, state: 'idle', st: 0, rest: new THREE.Vector3(center.x + 6 * s, 4, center.z + 3), target: new THREE.Vector3() };
    });
    this.waves = []; // shockwave rings on the floor
    // laser (phase 3)
    this.laser = new THREE.Mesh(new THREE.BoxGeometry(arenaR * 2, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0xff2d75, emissive: 0xff2d75, emissiveIntensity: 2, transparent: true, opacity: 0.9 }));
    this.laser.position.set(center.x, 0.9, center.z); this.laser.visible = false; root.add(this.laser);
    // floor switches (phase 3)
    this.switches = [0, 1, 2, 3].map(i => {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, p = new THREE.Vector3(center.x + Math.cos(a) * 9, 0, center.z + Math.sin(a) * 9);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x555a70, emissive: 0x000000 }));
      m.position.copy(p).add(new THREE.Vector3(0, 0.12, 0)); m.visible = false; root.add(m);
      return { p, m, lit: false };
    });
    this.orbT = 2; this.laserA = 0; this.zap = null;
    game.ui.bossBar(true, 1);
  }

  get headPos() { return this.head.position; }

  update(dt, wdt) {
    if (this.dead) { this.deathT += dt; this.head.position.y -= dt * 2; this.head.rotation.z += dt * 2; if (Math.random() < dt * 20) this.g.fx.burst(this.head.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, 0)), 10, [0xff3df2, 0xffd34d, 0x46f0ff][Math.floor(Math.random() * 3)]); if (this.deathT > 3) { this.root.visible = false; } return; }
    const g = this.g, P = g.player; this.t += wdt; this.st += wdt;
    this.head.position.y = 8 + Math.sin(this.t * 1.3) * 0.5; this.head.lookAt(P.pos.x, 3, P.pos.z);
    this.core.rotation.y += dt * 2; this.core.rotation.x += dt;
    this.flash = Math.max(0, this.flash - dt); this.eyeMat.emissiveIntensity = this.flash > 0 ? 6 : 2 + Math.sin(this.t * 5) * 0.5;
    if (this.state === 'intro') { if (this.st > 1.5) { this.state = 'fight'; this.st = 0; } return; }

    // shockwaves
    this.waves = this.waves.filter(w => {
      w.r += wdt * 9; w.m.scale.setScalar(w.r); w.m.material.opacity = Math.max(0, 1 - w.r / this.R);
      const d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
      if (Math.abs(d - w.r) < 0.55 && P.pos.y < 0.6) P.hurt(new THREE.Vector3(w.x, 0, w.z));
      if (w.r > this.R) { this.root.remove(w.m); return false; } return true;
    });

    if (this.phase === 1 || this.phase === 3) this.updateHands(wdt, P);
    if (this.phase === 2) {
      this.orbT -= wdt;
      if (this.orbT <= 0) { this.orbT = 2.4; const from = this.core.getWorldPosition(new THREE.Vector3());
        g.ents.shoot(from, P.center().sub(from), 7.5, 0xb44cff, 'enemy', 0.55); }
      for (const h of this.hands) { h.g.position.lerp(h.rest.clone().add(new THREE.Vector3(0, Math.sin(this.t * 2 + h.s) * 0.6, 0)), Math.min(1, wdt * 3)); }
    }
    if (this.phase === 3) {
      this.laser.visible = true; this.laserA += wdt * 0.9; this.laser.rotation.y = this.laserA;
      // distance from player to the rotating beam line through the centre
      const dx = P.pos.x - this.c.x, dz = P.pos.z - this.c.z, ax = Math.cos(this.laserA), az = -Math.sin(this.laserA);
      const perp = Math.abs(dx * az - dz * ax);
      if (perp < 0.45 && P.pos.y < 1.05 && P.pos.y + P.height > 0.75) P.hurt(new THREE.Vector3(this.c.x, 0, this.c.z));
      if (!this.switches.some(s => s.lit)) { const s = this.switches[Math.floor(Math.random() * 4)]; s.lit = true; s.m.visible = true; }
      for (const s of this.switches) { s.m.material.emissive.set(s.lit ? 0x46f0ff : 0x000000); s.m.material.emissiveIntensity = s.lit ? 1 + Math.sin(this.t * 8) * 0.5 : 0; }
    }
    if (this.zap) { this.zap.life -= dt; this.zap.m.material.opacity = this.zap.life * 3; if (this.zap.life <= 0) { this.root.remove(this.zap.m); this.zap = null; } }
  }

  updateHands(wdt, P) {
    const g = this.g;
    for (const h of this.hands) {
      h.st += wdt;
      const other = this.hands.find(o => o !== h);
      switch (h.state) {
        case 'idle':
          h.g.position.lerp(h.rest.clone().add(new THREE.Vector3(0, Math.sin(this.t * 2 + h.s) * 0.5, 0)), Math.min(1, wdt * 3));
          if (h.st > (this.phase === 3 ? 3.2 : 2.2) + (h.s > 0 ? 1.1 : 0) && other.state !== 'aim' && other.state !== 'slam') { h.state = 'aim'; h.st = 0; }
          break;
        case 'aim': {
          h.target.set(P.pos.x, 0, P.pos.z); h.g.position.lerp(new THREE.Vector3(P.pos.x, 7, P.pos.z), Math.min(1, wdt * 4));
          h.tele.position.set(h.g.position.x, 0.06, h.g.position.z); h.tele.material.opacity = 0.4 + 0.4 * Math.sin(h.st * 20);
          if (h.st > 1.1) { h.state = 'slam'; h.st = 0; }
          break;
        }
        case 'slam':
          h.g.position.y -= wdt * 30;
          if (h.g.position.y <= 0.55) { h.g.position.y = 0.55; h.state = 'stun'; h.st = 0; h.tele.material.opacity = 0; g.audio.sfx('slam'); g.shake(0.5);
            this.addWave(h.g.position.x, h.g.position.z);
            if (Math.hypot(P.pos.x - h.g.position.x, P.pos.z - h.g.position.z) < 1.9 && P.pos.y < 2) P.hurt(h.g.position);
            if (this.phase === 1) { h.gem.material.emissiveIntensity = 2.5; } }
          break;
        case 'stun':
          if (this.phase === 1) {
            const gp = h.gem.getWorldPosition(new THREE.Vector3());
            if (P.attacking && (P.hits(gp, 1.0) || P.pound === 2 && gp.distanceTo(P.pos) < 2.2)) { this.damage(); h.gem.material.emissiveIntensity = 0.2; h.state = 'rise'; h.st = 0; P.vel.y = 10; }
            else if (P.pos.distanceTo(new THREE.Vector3(h.g.position.x, 1, h.g.position.z)) < 1.3 && P.vel.y < 0 && P.pos.y > 0.9) { /* standing on hand: allowed */ }
          }
          if (h.st > (this.phase === 1 ? 2.4 : 0.8)) { h.state = 'rise'; h.st = 0; h.gem.material.emissiveIntensity = 0.2; }
          break;
        case 'rise':
          h.g.position.y += wdt * 8; if (h.g.position.y > 4) { h.state = 'idle'; h.st = 0; }
          break;
      }
    }
  }

  addWave(x, z) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 64), new THREE.MeshBasicMaterial({ color: 0xff3df2, transparent: true }));
    m.rotation.x = Math.PI / 2; m.position.set(x, 0.25, z); this.root.add(m);
    this.waves.push({ x, z, r: 1, m });
  }

  hitByProjectile(p) {
    if (this.phase !== 2 || this.dead) return false;
    if (p.m.position.distanceTo(this.core.getWorldPosition(new THREE.Vector3())) < 2.8) { this.damage(); return true; }
    return false;
  }

  onPound(pos) {
    if (this.phase !== 3 || this.dead) return;
    const s = this.switches.find(s => s.lit && Math.hypot(pos.x - s.p.x, pos.z - s.p.z) < 1.6);
    if (!s) return;
    s.lit = false;
    const from = s.p.clone().add(new THREE.Vector3(0, 0.3, 0)), to = this.head.position.clone();
    const geo = new THREE.CylinderGeometry(0.15, 0.15, from.distanceTo(to), 6);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true }));
    m.position.copy(from).add(to).multiplyScalar(0.5); m.lookAt(to); m.rotateX(Math.PI / 2); this.root.add(m);
    if (this.zap) this.root.remove(this.zap.m); this.zap = { m, life: 0.35 };
    this.damage();
  }

  damage() {
    const g = this.g; this.hp--; this.flash = 0.4; g.audio.sfx('bosshit'); g.shake(0.6);
    g.fx.burst(this.head.position.clone(), 20, 0xff3df2); g.ui.bossBar(true, this.hp / this.max);
    if (this.hp <= 0) { this.dead = true; this.deathT = 0; this.laser.visible = false; this.switches.forEach(s => s.m.visible = false); g.audio.sfx('win'); g.onBossDefeated(); return; }
    const np = this.hp > 6 ? 1 : this.hp > 3 ? 2 : 3;
    if (np !== this.phase) {
      this.phase = np; g.toast(np === 2 ? 'Punch its orbs back with X!' : 'Ground pound the glowing switches with Y!');
      for (const h of this.hands) { h.state = 'rise'; h.st = 0; h.tele.material.opacity = 0; }
      if (np === 3) this.switches.forEach(s => s.m.visible = true);
    }
  }

  dispose() { this.g.levelRoot.remove(this.root); this.g.ui.bossBar(false); }
}
