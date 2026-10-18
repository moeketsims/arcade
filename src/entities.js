import * as THREE from 'three';
import * as M from './models.js';

// ---------- particles & effects ----------
export class FX {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.rings = [];
    this.geo = new THREE.SphereGeometry(0.12, 6, 5);
  }
  clear() { for (const p of this.parts) this.scene.remove(p.m); for (const r of this.rings) this.scene.remove(r.m); this.parts = []; this.rings = []; }
  spawn(pos, vel, color, life = 0.6, size = 1, grav = 6) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos); m.scale.setScalar(size); this.scene.add(m);
    this.parts.push({ m, vel, life, max: life, grav, size });
  }
  puff(pos, n = 6, color = 0xffffff) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; this.spawn(pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(Math.cos(a) * 3, 1 + Math.random() * 2, Math.sin(a) * 3), color, 0.45, 1.2, 2); } }
  burst(pos, n = 14, color = 0xffd34d) { for (let i = 0; i < n; i++) { const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 4); this.spawn(pos.clone(), v, color, 0.8, 0.9, 12); } }
  bubbles(pos, n = 4) { for (let i = 0; i < n; i++) this.spawn(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), new THREE.Vector3(0, 2 + Math.random() * 2, 0), 0xcff8ff, 1.2, 0.7, -1); }
  ring(pos, color = 0xffffff, maxR = 3, life = 0.45) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.rotation.x = Math.PI / 2; m.position.copy(pos).add(new THREE.Vector3(0, 0.15, 0)); this.scene.add(m);
    this.rings.push({ m, life, max: life, maxR });
  }
  update(dt) {
    this.parts = this.parts.filter(p => {
      p.life -= dt; if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); return false; }
      p.vel.y -= p.grav * dt; p.m.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max; p.m.material.opacity = k; p.m.scale.setScalar(p.size * (0.4 + 0.6 * k)); return true;
    });
    this.rings = this.rings.filter(r => {
      r.life -= dt; if (r.life <= 0) { this.scene.remove(r.m); return false; }
      const k = 1 - r.life / r.max; r.m.scale.setScalar(0.3 + k * r.maxR); r.m.material.opacity = 1 - k; return true;
    });
  }
}

// ---------- entity manager ----------
export class Entities {
  constructor(game) { this.game = game; this.list = []; this.projectiles = []; this.magnets = []; }

  build(descs) {
    const g = this.game, root = g.levelRoot;
    this.list = []; this.projectiles = []; this.magnets = [];
    for (const d of descs) {
      const e = { ...d, alive: true, t: Math.random() * 10 };
      switch (d.type) {
        case 'coin': e.m = M.makeCoin(); e.m.position.copy(d.pos); if (d.hidden) { e.m.visible = false; } root.add(e.m); break;
        case 'bot': e.m = M.makeBot(d.idx + g.level.index * 3); e.m.position.copy(d.pos); root.add(e.m);
          e.id = `${g.level.id}:${d.idx}`; e.already = g.save.bots.includes(e.id);
          if (e.already) e.m.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; } });
          e.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0x46f0ff, transparent: true, opacity: 0.25 }));
          e.beacon.position.y = 3; e.m.add(e.beacon); break;
        case 'crate': e.m = M.makeCrate(); e.m.position.copy(d.pos); root.add(e.m); break;
        case 'spring': e.m = M.makeMushroom(d.color); e.m.position.copy(d.pos); root.add(e.m); e.squash = 0; break;
        case 'checkpoint': e.m = M.makeCheckpoint(); e.m.position.copy(d.pos); root.add(e.m); e.on = false; break;
        case 'goal': e.m = M.makePortal(g.level.accent ?? 0x46f0ff, 2.2); e.m.position.copy(d.pos).add(new THREE.Vector3(0, 2.4, 0)); root.add(e.m); break;
        case 'powerup': e.m = M.makePowerup(d.kind); e.m.position.copy(d.pos); root.add(e.m); break;
        case 'magnet': e.m = M.makeMagnetNode(); e.m.position.copy(d.pos); root.add(e.m); this.magnets.push(d.pos); break;
        case 'enemy': this.makeEnemy(e); break;
        case 'hazard': case 'laser': case 'mover': case 'crumble': break;
      }
      this.list.push(e);
    }
  }

  makeEnemy(e) {
    const col = this.game.level.enemyColor;
    if (e.kind === 'walker') e.m = M.makeWalker(e.color ?? col ?? 0x8e5bd6);
    else if (e.kind === 'turret') e.m = M.makeTurret(e.color ?? 0x5a6b8c);
    else if (e.kind === 'floater') e.m = M.makeFloater(e.color ?? 0xff7ad9);
    else e.m = M.makeFlyer(e.color ?? 0x3dd6d0);
    e.home = e.pos.clone(); e.m.position.copy(e.pos); this.game.levelRoot.add(e.m);
    e.cool = 1 + Math.random(); e.dir = 1; e.hp = e.kind === 'turret' ? 2 : 1;
  }

  kill(e, coins = 1) {
    if (!e.alive) return; e.alive = false; this.game.levelRoot.remove(e.m);
    const c = e.m.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.game.fx.burst(c, 16, 0xffffff); this.game.fx.puff(c, 8, 0xffd34d); this.game.audio.sfx('stomp');
    if (coins) this.game.addCoins(coins, c);
  }

  shoot(from, dir, speed = 9, color = 0xff3355, owner = 'enemy', size = 0.3) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
    m.position.copy(from); this.game.levelRoot.add(m);
    const p = { m, vel: dir.clone().normalize().multiplyScalar(speed), life: 5, owner, size };
    this.projectiles.push(p); this.game.audio.sfx('shoot'); return p;
  }

  update(dt, wdt) {
    // dt = real step (for player-facing timers), wdt = world step (slowed by Time Slow)
    const g = this.game, P = g.player, pc = P.center(), now = g.worldTime;
    for (const e of this.list) {
      if (!e.alive) continue;
      e.t += wdt;
      switch (e.type) {
        case 'coin': {
          e.m.rotation.y += dt * 3; e.m.position.y = e.pos.y + Math.sin(e.t * 2) * 0.1;
          if (e.hidden && !e.revealed) break;
          if (e.m.position.distanceTo(pc) < 1.05) { e.alive = false; g.levelRoot.remove(e.m); g.addCoins(1, e.pos); }
          break;
        }
        case 'bot': {
          const r = e.m.userData; e.m.lookAt(P.pos.x, e.m.position.y, P.pos.z);
          if (e.rescuing) { e.rt += dt; e.m.position.y += dt * (e.rt > 0.5 ? 9 : 0); e.m.rotation.y += dt * 12; if (e.rt > 1.6) { e.alive = false; g.levelRoot.remove(e.m); } break; }
          r.arm.rotation.z = -2.4 + Math.sin(e.t * 9) * 0.5; r.root.position.y = Math.abs(Math.sin(e.t * 4)) * 0.12;
          if (e.m.position.distanceTo(P.pos) < 1.4) { e.rescuing = true; e.rt = 0; g.rescueBot(e); }
          break;
        }
        case 'crate': {
          if (P.attacking && P.hits(e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 0.5)) this.breakCrate(e);
          break;
        }
        case 'spring': { e.squash *= Math.pow(0.001, dt); const s = e.m.userData.cap; s.scale.set(1 + e.squash * 0.4, 0.55 * (1 - e.squash), 1 + e.squash * 0.4); break; }
        case 'checkpoint': {
          if (!e.on && e.pos.distanceTo(P.pos) < 1.8) { e.on = true; g.setCheckpoint(e.pos); e.m.userData.lamp.material.color.set(0x5dff8a); e.m.userData.lamp.material.emissive.set(0x22ff66); g.audio.sfx('checkpoint'); g.fx.burst(e.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), 12, 0x5dff8a); }
          break;
        }
        case 'goal': {
          const u = e.m.userData; u.disc.material.opacity = 0.45 + Math.sin(e.t * 3) * 0.15; e.m.rotation.y = Math.sin(e.t) * 0.3;
          u.lights.forEach((l, i) => l.scale.setScalar(1 + 0.5 * Math.sin(e.t * 6 + i)));
          if (P.pos.distanceTo(e.pos) < 2.4 && Math.abs(P.pos.y - e.pos.y) < 3) { e.alive = false; g.completeLevel(); }
          break;
        }
        case 'powerup': {
          e.m.rotation.y += dt * 2; e.m.position.y = e.pos.y + Math.sin(e.t * 2.5) * 0.2;
          if (e.m.position.distanceTo(pc) < 1.3) { e.alive = false; g.levelRoot.remove(e.m); g.givePower(e.kind); }
          break;
        }
        case 'magnet': { e.m.rotation.y += dt; e.m.userData.ring.rotation.x = e.t * 2; const near = P.power?.kind === 'magnet' && e.pos.distanceTo(pc) < 16; e.m.userData.ring.scale.setScalar(near ? 1.2 + Math.sin(e.t * 8) * 0.1 : 1); break; }
        case 'mover': {
          const c = e.c, [x, y, z] = c.path(now), [hx, hy, hz] = c.home;
          const ox = (c.cur?.[0] ?? hx), oy = (c.cur?.[1] ?? hy), oz = (c.cur?.[2] ?? hz);
          c.delta.set(x - ox, y - oy, z - oz); c.cur = [x, y, z];
          if (c.kind === 'box') { const [w, h, d] = c.size; c.min.set(x - w / 2, y - h, z - d / 2); c.max.set(x + w / 2, y, z + d / 2); c.mesh.position.set(x - hx, y - hy, z - hz); }
          else { c.x = x; c.z = z; c.y1 = y; c.y0 = y - c.size[1]; c.mesh.position.set(x, y, z); }
          break;
        }
        case 'crumble': {
          const c = e.c;
          if (e.timer >= 0) {
            e.timer += dt;
            if (e.timer < 0.55) c.mesh.position.set((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
            else if (e.timer < 3.5) { c.active = false; c.mesh.position.y -= dt * (8 + e.timer * 10); }
            else { e.timer = -1; c.active = true; c.mesh.position.set(0, 0, 0); }
          }
          break;
        }
        case 'laser': { const ph = ((now + e.phase) % e.period) / e.period; e.hz.on = ph < e.duty; e.hz.mesh.visible = e.hz.on || ph > 0.92; e.hz.mesh.material.opacity = e.hz.on ? 0.9 : 0.25; break; }
        case 'hazard': {
          const hz = e.hz;
          if (hz.kind === 'lava' && hz.mesh.material) { hz.mesh.material.emissiveIntensity = 0.8 + Math.sin(now * 2) * 0.15; if (hz.mesh.material.map) hz.mesh.material.map.offset.set(now * 0.01, now * 0.006); }
          if (!hz.on) break;
          const p = P.pos, r = P.radius;
          if (p.x + r > hz.min.x && p.x - r < hz.max.x && p.z + r > hz.min.z && p.z - r < hz.max.z && p.y < hz.max.y && p.y + P.height > hz.min.y) {
            if (hz.kind === 'lava' || hz.kind === 'water' || hz.kind === 'acid') { if (P.hurt(null)) { P.vel.y = 17; P.vel.x *= 0.3; P.vel.z *= 0.3; g.fx.burst(p.clone(), 10, hz.kind === 'lava' ? 0xff7a1f : 0xbff4ff); } else if (P.vel.y < 0) P.vel.y = 14; }
            else P.hurt(new THREE.Vector3((hz.min.x + hz.max.x) / 2, 0, (hz.min.z + hz.max.z) / 2));
          }
          break;
        }
        case 'enemy': this.updateEnemy(e, dt, wdt, P, pc); break;
      }
    }
    // projectiles
    this.projectiles = this.projectiles.filter(p => {
      p.life -= wdt; p.m.position.addScaledVector(p.vel, wdt);
      if (p.life <= 0) { g.levelRoot.remove(p.m); return false; }
      const d = p.m.position.distanceTo(pc);
      if (p.owner === 'enemy') {
        if (P.attacking && P.punchT + P.spinT > 0 && d < 1.8) { p.vel.multiplyScalar(-1.6); p.owner = 'player'; p.life = 3; p.m.material.color.set(0x46f0ff); p.m.material.emissive.set(0x46f0ff); g.audio.sfx('punch'); g.fx.ring(p.m.position.clone(), 0x46f0ff, 1.5); return true; }
        if (d < 0.65 + p.size) { P.hurt(p.m.position); g.levelRoot.remove(p.m); return false; }
      } else {
        for (const e of this.list) if (e.type === 'enemy' && e.alive && e.m.position.distanceTo(p.m.position) < 1.2) { this.kill(e); g.levelRoot.remove(p.m); return false; }
        if (g.boss && g.boss.hitByProjectile(p)) { g.levelRoot.remove(p.m); return false; }
      }
      return true;
    });
  }

  updateEnemy(e, dt, wdt, P, pc) {
    const g = this.game, m = e.m, pos = m.position;
    const toP = new THREE.Vector3(P.pos.x - pos.x, 0, P.pos.z - pos.z), dP = toP.length();
    if (e.kind === 'walker') {
      const leash = e.home.distanceTo(new THREE.Vector3(P.pos.x, e.home.y, P.pos.z));
      let tx, tz, spd = 2.2;
      if (dP < 6 && leash < 9 && Math.abs(P.pos.y - pos.y) < 2.5) { tx = P.pos.x; tz = P.pos.z; spd = 3.4; }
      else { const a = e.t * 0.6 * (e.speed ?? 1); const rr = e.range ?? 3; tx = e.home.x + (e.axis === 'z' ? 0 : Math.sin(a) * rr); tz = e.home.z + (e.axis === 'z' ? Math.sin(a) * rr : 0); }
      const dx = tx - pos.x, dz = tz - pos.z, dd = Math.hypot(dx, dz);
      if (dd > 0.05) { const s = Math.min(dd, spd * wdt); pos.x += dx / dd * s; pos.z += dz / dd * s; m.rotation.y = Math.atan2(dx, dz); }
      if (Math.hypot(pos.x - e.home.x, pos.z - e.home.z) > 9.5) { pos.x = e.home.x; pos.z = e.home.z; }
      const u = m.userData; u.fl.position.z = Math.sin(e.t * 10) * 0.15; u.fr.position.z = -Math.sin(e.t * 10) * 0.15; u.body.position.y = 0.55 + Math.abs(Math.sin(e.t * 10)) * 0.06;
    } else if (e.kind === 'turret') {
      const u = m.userData;
      if (dP < 20 && Math.abs(P.pos.y - pos.y) < 8) {
        u.head.rotation.y = Math.atan2(toP.x, toP.z); e.cool -= wdt;
        if (e.cool <= 0) { e.cool = e.rate ?? 2.2; const from = pos.clone().add(new THREE.Vector3(Math.sin(u.head.rotation.y) * 0.9, 0.75, Math.cos(u.head.rotation.y) * 0.9));
          const dir = pc.clone().sub(from); this.shoot(from, dir, e.pspeed ?? 9, e.pcolor ?? 0xff3355); }
      }
    } else if (e.kind === 'floater') {
      pos.y = e.home.y + Math.sin(e.t * 1.6) * (e.amp ?? 1.2); m.userData.dome.scale.y = 1 + Math.sin(e.t * 3.2) * 0.12;
      if (e.drift) pos.x = e.home.x + Math.sin(e.t * 0.7) * e.drift;
    } else {
      const a = e.t * (e.speed ?? 1.2), rr = e.range ?? 3;
      pos.set(e.home.x + Math.cos(a) * rr, e.home.y + Math.sin(e.t * 2) * 0.4, e.home.z + Math.sin(a) * rr);
      m.rotation.y = -a; m.userData.prop.rotation.y += dt * 25;
    }
    // interactions
    const ec = pos.clone().add(new THREE.Vector3(0, e.kind === 'floater' ? 0.3 : e.kind === 'flyer' ? 0 : 0.6, 0));
    if (P.attacking && P.hits(ec, 0.55)) { e.hp -= 1; if (e.hp <= 0) this.kill(e); else { g.fx.puff(ec, 6); g.audio.sfx('punch'); e.cool = 1.5; } return; }
    const hd = Math.hypot(pc.x - ec.x, pc.z - ec.z), vd = pc.y - ec.y;
    if (hd < 1.05 && vd > 0.4 && vd < 1.6 && P.vel.y < 0) {
      if (e.kind === 'floater') { P.vel.y = 15; P.hoverLeft = 1.1; g.audio.sfx('spring'); }
      else { P.vel.y = 11; P.hoverLeft = 1.1; P.spinUsed = false; this.kill(e); }
      return;
    }
    if (hd < 0.95 && Math.abs(vd) < 1.1) P.hurt(ec);
  }

  breakCrate(e) {
    if (!e.alive) return; e.alive = false; this.game.levelRoot.remove(e.m); this.game.phys.remove(e.c);
    const c = e.pos.clone().add(new THREE.Vector3(0, 0.5, 0)); this.game.fx.burst(c, 12, 0xd98b3a); this.game.audio.sfx('break');
    this.game.addCoins(3, c);
  }

  // Shockwave from a ground pound or boss event.
  shockwave(pos, r) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const q = e.m?.position ?? e.pos;
      if (!q) continue;
      const d = Math.hypot(q.x - pos.x, q.z - pos.z), dy = Math.abs(q.y - pos.y);
      if (d < r && dy < 2.5) { if (e.type === 'enemy') this.kill(e); else if (e.type === 'crate') this.breakCrate(e); }
    }
  }

  reveal(pos, r) {
    let n = 0;
    for (const e of this.list) if (e.type === 'coin' && e.hidden && !e.revealed && e.alive && e.pos.distanceTo(pos) < r) {
      e.revealed = true; e.m.visible = true; n++; this.game.fx.burst(e.pos.clone(), 6, 0xbff4ff);
    }
    return n;
  }

  onSpring(c) { const e = this.list.find(x => x.type === 'spring' && x.c === c); if (e) e.squash = 0.6; }
  onCrumble(c) { const e = this.list.find(x => x.type === 'crumble' && x.c === c); if (e && e.timer < 0) e.timer = 0; }
  hoverBeam(pos) { for (const e of this.list) if (e.type === 'enemy' && e.alive) { const q = e.m.position; if (Math.hypot(q.x - pos.x, q.z - pos.z) < 0.9 && pos.y - q.y > 0 && pos.y - q.y < 3.5) this.kill(e); } }
}
