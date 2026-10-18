// The match: owns the world (level, navigation, actors, projectiles, streaks, pickups), hit resolution (hitscan with thin-wall
// penetration, melee, explosions, flash/stun), kills/medals/XP, spawning, and drives one frame of simulation.
import * as THREE from 'three';
import { buildSaltworks, buildRange } from './map.js';
import { buildLevelMeshes, makeSky, makeSea, makeFarScenery } from './levelmesh.js';
import { NavGraph } from './nav.js';
import { FX } from './fx.js';
import { Projectiles } from './projectiles.js';
import { Streaks } from './streaks.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { rayShapes, ZONE_MUL, STANCE } from './actors.js';
import { SURFACES, distSegSq } from './collision.js';
import { DIFFICULTY, MODES, WEAPONS, BOT_NAMES, LETHALS } from './data.js';
import { buildPickupGun } from './guns.js';
import { makeMode } from './modes.js';
import { Sound } from './sound.js';
import { clamp, lerp, rnd, pick } from './util.js';

const MAP_CACHE = new Map();
/** Build (once) and cache a map with its level meshes and navigation graph. */
export function getMapData(id) {
  if (MAP_CACHE.has(id)) return MAP_CACHE.get(id);
  const map = id === 'range' ? buildRange() : buildSaltworks();
  const meshes = buildLevelMeshes(map);
  const nav = id === 'range' ? null : NavGraph.build(map.level, { bounds: map.bounds, extra: map.nodes, seeds: map.spawns.filter(s => s.team !== 'F'), step: 2 });
  // snap any spawn that is not on a clear floor to the nearest nav node
  if (nav) for (const s of map.spawns) {
    if (map.level.overlaps(s.x - 0.3, s.y + 0.03, s.z - 0.3, s.x + 0.3, s.y + 1.8, s.z + 0.3)) { const n = nav.nearest(s.x, s.y, s.z, 10); if (n) { s.x = n.x; s.y = n.y; s.z = n.z; } }
  }
  if (nav) {   // tag nodes with the building they are in, so the AI can pick interiors and upper floors as destinations
    nav.zoneNodes = {}; for (const z of map.zones) nav.zoneNodes[z.name] = [];
    for (const n of nav.nodes) { n.upper = n.y > 3.2; n.zone = ''; for (const z of map.zones) if (n.x > z.x0 && n.x < z.x1 && n.z > z.z0 && n.z < z.z1 && (z.name !== 'tower' || n.upper)) { n.zone = z.name; nav.zoneNodes[z.name].push(n); if (n.upper) nav.zoneNodes[z.name].push(n); break; } }
  }
  const data = { map, meshes, nav, far: id === 'range' ? null : makeFarScenery() };
  MAP_CACHE.set(id, data); return data;
}

const ZONE_NAME = { head: 'head', torso: 'torso', limb: 'limb' };
const _hits = [];

export class Match {
  /**
   * opts: { scene, camera, sfx, ui, ctl, vm, settings, loadout, modeId, difficulty, renderer? }
   */
  constructor(o) {
    this.scene = o.scene; this.camera = o.camera; this.ui = o.ui; this.ctl = o.ctl; this.vm = o.vm; this.settings = o.settings;
    this.sound = o.sound || new Sound(o.sfx);
    this.modeId = o.modeId; this.modeDef = MODES[o.modeId]; this.diff = DIFFICULTY[o.difficulty] || DIFFICULTY.regular;
    this.time = 0; this.state = 'countdown'; this.countdown = o.modeId === 'range' ? 0.1 : 3.4; this.over = false;
    this.data = getMapData(o.modeId === 'range' ? 'range' : 'saltworks'); this.map = this.data.map; this.level = this.map.level; this.nav = this.data.nav;
    this.fx = new FX(this.scene, this.level);
    this.proj = new Projectiles(this); this.streaks = new Streaks(this);
    this.hittables = []; this.actors = []; this.bots = []; this.pickups = []; this.targets = [];
    this.firstBlood = false; this.lastKillerId = -1;
    this.setupScene();
    this.player = new Player(this); this.player.loadout = o.loadout; this.player.makeArc(this.scene);
    this.actors.push(this.player); this.hittables.push(this.player);
    this.mode = makeMode(this, o.modeId);
    this.mode.init();
    // static ammo crates
    for (const a of this.map.ammo) this.pickups.push(this.makeAmmoPickup(a));
    this.sound.ambience?.(true);
  }

  // ---------------------------------------------------------------------------------------------------------
  // scene
  // ---------------------------------------------------------------------------------------------------------
  setupScene() {
    const sc = this.scene;
    sc.background = new THREE.Color(0xbcd4e6); sc.fog = new THREE.Fog(0xc4d8e8, 70, 330);
    sc.add(this.data.meshes.group);
    this.sky = makeSky(); sc.add(this.sky);
    if (this.modeId !== 'range') { sc.add(makeSea()); sc.add(this.data.far); }
    else { const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x6f7a62, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.05; sc.add(g); }
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b665c, 1.15); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.0); this.sunDir = new THREE.Vector3(-0.45, 0.8, 0.5).normalize();
    this.sun.castShadow = this.settings.shadows !== false;
    this.sun.shadow.mapSize.set(2048, 2048); const sh = this.sun.shadow.camera; sh.left = -42; sh.right = 42; sh.top = 42; sh.bottom = -42; sh.near = 5; sh.far = 220; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    sc.add(this.sun, this.sun.target);
  }
  /** Keep the shadow frustum centred on the player, snapped to shadow-map texels so shadows do not shimmer. */
  updateSun() {
    const p = this.player.body, tex = 84 / 2048;
    const cx = Math.round(p.x / tex) * tex, cz = Math.round(p.z / tex) * tex;
    this.sun.target.position.set(cx, 0, cz); this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 120);
    this.sky.position.copy(this.camera.position);
  }

  // ---------------------------------------------------------------------------------------------------------
  // hittables and teams
  // ---------------------------------------------------------------------------------------------------------
  addHittable(e) { if (!this.hittables.includes(e)) this.hittables.push(e); }
  removeHittable(e) { const i = this.hittables.indexOf(e); if (i >= 0) this.hittables.splice(i, 1); }
  hostile(a, b) { return !!a && !!b && a !== b && a.team !== b.team; }
  /** Everything alive that is an enemy of `who` (actors, turrets, drones, range targets). */
  hostilesOf(who) {
    const out = [];
    for (const t of this.hittables) if (t !== who && t.alive && t.team !== who.team) out.push(t);
    return out;
  }
  lockables(owner) { return this.streaks.lockables(owner); }
  los(ax, ay, az, bx, by, bz) { return !this.level.blocked(ax, ay, az, bx, by, bz) && !this.fx.smokeBlocks(ax, ay, az, bx, by, bz); }

  // ---------------------------------------------------------------------------------------------------------
  // spawning
  // ---------------------------------------------------------------------------------------------------------
  /** Choose a spawn that is far from enemies and out of their sight; team bases are preferred in team modes. */
  pickSpawn(actor, initial = false) {
    const pts = this.map.spawns, enemies = this.hostilesOf(actor).filter(t => t.isActor || t.isBot);
    const side = actor.team === 0 ? 'A' : actor.team === 1 ? 'B' : 'F';
    let best = null, bestScore = -1e9;
    for (const s of pts) {
      let score = Math.random() * 12;
      if (this.modeId === 'tdm') { if (s.team === side) score += initial ? 40 : 12; else if (s.team !== 'F') score -= initial ? 60 : 6; }
      let minD = 99; let seen = 0;
      for (const e of enemies) { if (!e.alive) continue; const d = Math.hypot(e.body.x - s.x, e.body.z - s.z); minD = Math.min(minD, d); if (d < 38 && this.level.blocked(e.body.x, e.body.y + 1.6, e.body.z, s.x, s.y + 1.2, s.z) === false) seen++; }
      score += Math.min(minD, 40) * 1.4 - seen * 45;
      for (const a of this.actors) { if (a.alive && a !== actor && Math.hypot(a.body.x - s.x, a.body.z - s.z) < 2) score -= 80; }
      if (score > bestScore) { bestScore = score; best = s; }
    }
    best = best || pts[0];
    let h = best.h;
    if (this.modeId !== 'range') { // face the nearest enemy region (or the map centre)
      const tx = actor.team === 0 ? 20 : -20; h = Math.atan2(tx - best.x, 0 - best.z) + (Math.random() - 0.5) * 0.4;
      if (this.modeId === 'ffa') h = Math.atan2(-best.x, -best.z) + (Math.random() - 0.5) * 1.0;
    }
    return { x: best.x, y: best.y, z: best.z, h };
  }
  addBot(o) {
    const b = new Bot(this, { ...o, diff: o.ally ? DIFFICULTY.regular : this.diff });
    this.bots.push(b); this.actors.push(b); this.hittables.push(b);
    return b;
  }
  respawn(actor, initial = false) {
    const s = this.pickSpawn(actor, initial);
    if (actor.isPlayer) { actor.spawnAt(s, initial); this.ui.respawned?.(); }
    else actor.spawnAt(s);
  }
  onFell(actor) {
    if (this.mode.onFell) { this.mode.onFell(actor); return; }
    if (actor.alive) this.damage(actor, 999, null, { weapon: 'Fall', world: true });
  }

  // ---------------------------------------------------------------------------------------------------------
  // bullets
  // ---------------------------------------------------------------------------------------------------------
  /**
   * Hitscan with wall penetration. weapon: Weapon (or {stats, damage(dist)}). opts: mx,my,mz (visual muzzle), tracer, dmgMul, maxDist.
   * Returns { dist, target, killed }.
   */
  fireBullet(shooter, ox, oy, oz, dx, dy, dz, weapon, opts = {}) {
    const s = weapon.stats, maxD = opts.maxDist ?? 450, pen = s.pen ?? 0.2;
    // gather candidate hits
    const levelHits = this.level.raycastAll(ox, oy, oz, dx, dy, dz, maxD, this._lh || (this._lh = []));
    const list = _hits; list.length = 0;
    for (const h of levelHits) { if (h.box.bulletPass && !opts.stopOnFence) { list.push({ t: h.t, kind: 'pass', h }); continue; } list.push({ t: h.t, kind: 'level', h }); }
    for (const t of this.hostilesOf(shooter)) {
      if (!t.shapes) continue;
      const cx = t.body ? t.body.x : t.x, cy = (t.body ? t.body.y : t.y) + 0.9, cz = t.body ? t.body.z : t.z;
      const px = cx - ox, py = cy - oy, pz = cz - oz, proj = px * dx + py * dy + pz * dz;
      if (proj < -1.2 || proj > maxD + 1.2) continue;
      const d2 = px * px + py * py + pz * pz - proj * proj;
      if (d2 > 2.4 * 2.4) continue;
      const r = rayShapes(ox, oy, oz, dx, dy, dz, t.shapes, maxD);
      if (r) list.push({ t: r.t, kind: 'actor', target: t, zone: r.zone });
    }
    list.sort((a, b) => a.t - b.t);
    let power = 1, end = maxD, hitTarget = null, killed = false, endNormal = null, endBox = null, endKind = null;
    for (const e of list) {
      if (e.kind === 'pass') { const h = e.h; this.fx.impact(ox + dx * h.t, oy + dy * h.t, oz + dz * h.t, h.nx, h.ny, h.nz, 'spark', 0.3); continue; }
      if (e.kind === 'level') {
        const h = e.h, box = h.box, thick = h.tFar - h.t, cost = thick * box.penCost;
        const px = ox + dx * h.t, py = oy + dy * h.t, pz = oz + dz * h.t;
        if (box.penCost > 0 && cost <= pen && power > 0.3 && h.axis >= 0) {
          this.impactFx(px, py, pz, h, box, 0.6, s, opts);                     // goes through: scuff on the way in, continue with less power
          power *= 0.55; continue;
        }
        end = h.t; endNormal = h; endBox = box; endKind = 'level';
        this.impactFx(px, py, pz, h, box, 1, s, opts);
        break;
      }
      // actor
      const t = e.target, dist = e.t;
      const zoneMul = e.zone === 'head' ? (s.headMul ?? 2.0) : e.zone === 'limb' ? (s.limbMul ?? 0.8) : 1;
      const dmg = weapon.damage(dist) * zoneMul * power * (opts.dmgMul ?? 1);
      const px = ox + dx * dist, py = oy + dy * dist, pz = oz + dz * dist;
      hitTarget = t; end = dist; endKind = 'actor';
      this.fx.robotHit(px, py, pz, dx, dy, dz, e.zone === 'head');
      killed = this.damage(t, dmg, shooter, { weapon: opts.weaponName || weapon.name || s.name, head: e.zone === 'head', dist, zone: e.zone, point: { x: px, y: py, z: pz }, dir: { x: dx, y: dy, z: dz }, power });
      break;
    }
    // tracer (visual only)
    if (opts.tracer !== false) {
      const sx = opts.mx ?? ox, sy = opts.my ?? oy - 0.15, sz = opts.mz ?? oz;
      const ex = ox + dx * end, ey = oy + dy * end, ez = oz + dz * end;
      this.fx.tracer(sx, sy, sz, ex, ey, ez, opts.tracerColor ?? s.tracer ?? 0xffd27a, s.bolt ? 700 : 480, s.bolt ? 9 : 4.5, s.bolt ? 0.03 : 0.018);
    }
    // supersonic crack when a robot's round passes close to the player
    if (opts.botShot || opts.sentry || opts.drone) this.whizCheck(shooter, ox, oy, oz, dx, dy, dz, end);
    return { dist: end, target: hitTarget, killed, kind: endKind };
  }
  impactFx(x, y, z, h, box, k, s, opts) {
    const surf = SURFACES[box.mat] || SURFACES.concrete;
    this.fx.impact(x, y, z, h.nx, h.ny, h.nz, surf.fx, k * (s.pellets > 1 ? 0.5 : 1));
    if (k >= 1) {
      const size = s.id && (s.pellets > 1) ? 0.06 : s.kind === 'launcher' ? 0.2 : (s.dmg?.[0]?.[1] ?? 30) > 80 ? 0.2 : 0.11;
      this.fx.decal(x, y, z, h.nx, h.ny, h.nz, size, box.tag === 'recoilwall' ? 75 : 28);
    }
    if (opts.botShot !== true && surf.fx === 'spark' && Math.random() < 0.5) this.sound.at('hit', x, y, z, { vol: 0.25, pitch: 1.6, ref: 8 });
  }
  whizCheck(shooter, ox, oy, oz, dx, dy, dz, end) {
    const p = this.player; if (!p.alive || shooter === p || shooter.team === p.team) return;
    const px = p.body.x - ox, py = p.eye - oy, pz = p.body.z - oz, proj = px * dx + py * dy + pz * dz;
    if (proj < 2 || proj > end) return;
    const d2 = px * px + py * py + pz * pz - proj * proj;
    if (d2 < 1.8 * 1.8 && (this._whiz || 0) < this.time - 0.12) { this._whiz = this.time; this.sound.whiz?.(); p.shake = Math.max(p.shake, 0.08); }
  }

  /** Close-range melee: several rays in a narrow cone, blocked by walls. Damage is flat (no zones). */
  meleeStrike(attacker, ox, oy, oz, dx, dy, dz, reach, dmg, info = {}) {
    let best = null, bt = 1e9;
    const offsets = [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.15], [0, -0.15], [0.3, 0], [-0.3, 0]];
    const rx = -dz, rz = dx, rl = Math.hypot(rx, rz) || 1;
    for (const t of this.hostilesOf(attacker)) {
      if (!t.shapes) continue;
      for (const [ho, vo] of offsets) {
        const ddx = dx + (rx / rl) * ho, ddy = dy + vo, ddz = dz + (rz / rl) * ho, l = Math.hypot(ddx, ddy, ddz);
        const r = rayShapes(ox, oy, oz, ddx / l, ddy / l, ddz / l, t.shapes, reach + 0.45);
        if (r && r.t < bt) { bt = r.t; best = t; }
      }
    }
    if (!best) return { hit: false };
    const tp = best.shapes[1], tx = (tp.ax + tp.bx) / 2, ty = (tp.ay + tp.by) / 2, tz = (tp.az + tp.bz) / 2;
    if (this.level.blocked(ox, oy, oz, tx, ty, tz)) return { hit: false };
    this.fx.robotHit(tx, ty, tz, dx, dy, dz, false); this.fx.burst(tx, ty, tz, 8, 0xfff0b0, 4);
    const killed = this.damage(best, dmg, attacker, { weapon: info.weapon || 'Knife', melee: true, head: false, dist: bt, point: { x: tx, y: ty, z: tz } });
    return { hit: true, killed, target: best };
  }

  // ---------------------------------------------------------------------------------------------------------
  // damage, kills, medals, xp
  // ---------------------------------------------------------------------------------------------------------
  damage(victim, amount, attacker, info = {}) {
    if (!victim || !victim.alive || amount <= 0.01) return false;
    if (victim.invulnT > 0) return false;
    let att = attacker; if (att && att.isEntity) att = att.owner;
    if (att && att !== victim && !this.hostile(att, victim)) return false;
    if (this.state !== 'playing' && this.modeId !== 'range') return false;
    victim.hp -= amount;
    victim.recordDamage?.(amount, att, this.time);
    victim.onDamaged?.(amount, att, info);
    if (att?.isPlayer && victim !== att) {
      const k = victim.hp <= 0 ? 'kill' : info.head ? 'head' : 'hit';
      this.ui.hitmarker?.(k, amount); this.sound.hitmarker(k === 'kill' ? (info.head ? 'head' : 'kill') : k);
      this.ui.rumble?.(0.15, 0.25, 40);
      this.mode.onPlayerHit?.(victim, amount, info);
    }
    if (victim.hp <= 0) { this.kill(victim, att, info); return true; }
    return false;
  }
  kill(victim, att, info) {
    const p = this.player;
    victim.hp = 0; victim.alive = false;
    const self = !att || att === victim;
    if (!self && att.stats) {
      att.stats.kills++; att.stats.streak++; att.stats.bestStreak = Math.max(att.stats.bestStreak, att.stats.streak); att.stats.score += 100 + (info.head ? 50 : 0);
      if (info.head) att.stats.headshots++;
    }
    if (victim.dmgBy) for (const e of victim.dmgBy.values()) {
      if (e.who && e.who !== att && e.who !== victim && e.who.stats && e.dmg >= 25 && this.time - e.t < 8) {
        e.who.stats.assists++; e.who.stats.score += 25;
        if (e.who.isPlayer) { p.sessionXp += 50; this.ui.xp?.(50, 'Assist'); this.ui.assist?.(); }
      }
    }
    this.ui.killfeed?.({ killer: self ? victim.name : att.name, killerTeam: self ? victim.team : att.team, victim: victim.name, victimTeam: victim.team, weapon: info.weapon || '', head: !!info.head, self, melee: !!info.melee, you: !!(att && att.isPlayer), youDied: victim === p, longshot: false });
    if (att?.isPlayer && !self) this.playerKill(victim, info);
    if (victim === p) { this.lastKillerId = att ? att.id : -1; p.lastKilledBy = att || null; }
    victim.onKilled?.(att, info);
    this.mode.onKill?.(victim, att, info);
    if (victim.isActor || victim.isTarget) this.mode.afterKill?.(victim, att, info);
  }
  playerKill(victim, info) {
    const p = this.player, t = this.time;
    let xp = 100; const medals = [];
    if (victim.isEntity) { xp = 100; this.ui.xp?.(100, `${victim.name} destroyed`); p.sessionXp += 100; this.sound.hitmarker('kill'); return; }
    if (victim.isTarget) { this.sound.hitmarker('kill'); return; }
    p.killsThisLife++;
    this.ui.xp?.(100, info.melee ? 'Melee kill' : 'Kill');
    if (info.head) { xp += 50; this.ui.xp?.(50, 'Headshot'); medals.push('Headshot'); }
    if (info.melee) { xp += 50; medals.push('Knifed'); }
    if (!info.melee && !info.explosive && info.dist >= 50) { xp += 50; this.ui.xp?.(50, 'Longshot'); medals.push('Longshot'); }
    if (!this.firstBlood && this.modeId !== 'range') { this.firstBlood = true; medals.push('First Blood'); }
    if (t - p.lastKillT < 3.8) p.multi++; else p.multi = 1;
    p.lastKillT = t;
    if (p.multi === 2) medals.push('Double Kill'); else if (p.multi === 3) medals.push('Triple Kill'); else if (p.multi >= 4) medals.push('Multi Kill');
    if (victim.id === this.lastKillerId) { medals.push('Revenge'); this.lastKillerId = -1; }
    if (info.explosive && !info.melee) { /* no extra */ }
    if (p.stats.streak === 5) medals.push('Killing Spree'); else if (p.stats.streak === 10) medals.push('Unstoppable');
    for (const mname of medals) { xp += 50; this.ui.medal?.(mname); this.sound.ui('medal'); }
    p.sessionXp += xp;
    p.onKillCredit();
    this.sound.ui('kill', { vol: 0.2 });
  }

  // ---------------------------------------------------------------------------------------------------------
  // explosions and area effects
  // ---------------------------------------------------------------------------------------------------------
  explode(x, y, z, radius, dmg, owner, opts = {}) {
    const p = this.player;
    this.fx.explosion(x, y, z, radius);
    this.sound.at('explosion', x, y, z, { vol: 1.3, ref: 46 });
    const dp = Math.hypot(p.body.x - x, p.eye - y, p.body.z - z);
    if (dp < radius * 5) { p.shake = Math.max(p.shake, clamp(1.1 - dp / (radius * 5), 0, 1)); this.ui.rumble?.(clamp(1 - dp / (radius * 4), 0.1, 1), clamp(1.2 - dp / (radius * 4), 0.2, 1), 260); }
    const inner = opts.inner ?? radius * 0.3, minF = opts.min ?? 0.15;
    for (const t of this.hittables.slice()) {
      if (!t.alive || !t.shapes || t === opts.skip) continue;
      let dMin = 1e9;
      for (const s of t.shapes) { const d = Math.sqrt(distSegSq(x, y, z, s.ax, s.ay, s.az, s.bx, s.by, s.bz)) - s.r; if (d < dMin) dMin = d; }
      dMin = Math.max(0, dMin);
      if (dMin > radius) continue;
      const tp = t.shapes[1], cx = (tp.ax + tp.bx) / 2, cy = (tp.ay + tp.by) / 2, cz = (tp.az + tp.bz) / 2;
      const blocked = this.level.blocked(x, y + 0.3, z, cx, cy, cz);
      let f = dMin <= inner ? 1 : 1 - (dMin - inner) / Math.max(0.01, radius - inner);
      f = Math.max(f, minF); if (blocked) f *= 0.18;
      let amount = dmg * f;
      if (t === owner) amount *= 0.5;
      else if (owner && !this.hostile(owner, t) && !(owner.isEntity)) continue;
      if (t.body && t.isActor) { const dx = cx - x, dz = cz - z, l = Math.hypot(dx, dz) || 1; t.body.vx += dx / l * 4 * f; t.body.vz += dz / l * 4 * f; if (t.body.onGround) t.body.vy = Math.max(t.body.vy, 2.2 * f); }
      this.damage(t, amount, owner, { weapon: opts.weapon || 'Explosion', explosive: true, head: false, dist: Math.hypot(x - (owner?.body?.x ?? x), z - (owner?.body?.z ?? z)), point: { x, y, z } });
    }
    // nearby mines chain-react
    for (const pr of this.proj.list) if (pr.type === 'mine' && pr.armed && Math.hypot(pr.x - x, pr.z - z) < radius * 0.8) pr.trig = Math.min(pr.trig || 0.2, 0.2) || 0.2;
  }
  flashbang(x, y, z, def, owner) {
    const p = this.player;
    this.fx.flashLight(x, y + 0.3, z, 12, 0.4, 0xffffff, 40); this.fx.ring(x, y, z, 6, 0.4);
    for (let i = 0; i < 20; i++) this.fx.sparks.emit(x, y + 0.3, z, rnd(-1, 1) * 9, rnd(0, 1) * 7, rnd(-1, 1) * 9, rnd(0.2, 0.5), 0.16, 0.02, 0xffffff, 0xaaccff, 1, 3, 1);
    this.sound.at('flash', x, y, z, { vol: 1.2, ref: 34 });
    for (const a of this.actors) {
      if (!a.alive) continue;
      const ey = a.isPlayer ? a.eye : a.eyeY(), dx = x - a.body.x, dy = y + 0.3 - ey, dz = z - a.body.z, d = Math.hypot(dx, dy, dz);
      if (d > def.radius) continue;
      if (this.level.blocked(x, y + 0.3, z, a.body.x, ey, a.body.z) && d > 1.5) continue;
      let facing;
      if (a.isPlayer) { const pit = a.pitch, fx = Math.sin(a.heading) * Math.cos(pit), fy = Math.sin(pit), fz = Math.cos(a.heading) * Math.cos(pit); facing = (dx * fx + dy * fy + dz * fz) / (d || 1); }
      else facing = (dx * Math.sin(a.heading) + dz * Math.cos(a.heading)) / (Math.hypot(dx, dz) || 1);
      const strength = d < 3 ? 1 : clamp(Math.pow(1 - d / def.radius, 0.7) * lerp(0.28, 1, (facing + 1) / 2), 0, 1);
      if (strength < 0.08) continue;
      if (a.isPlayer) { a.flashT = Math.max(a.flashT, 0.9 + 3.4 * strength); a.flashMax = a.flashT; this.sound.flashRing(strength); this.ui.rumble?.(0.3, 0.3, 200); }
      else { a.blindT = Math.max(a.blindT, 1.2 + 3.8 * strength); a.targetVisible = false; a.burstLeft = 0; }
    }
  }
  stunGrenade(x, y, z, def, owner) {
    this.fx.flashLight(x, y + 0.3, z, 6, 0.25, 0x9fd0ff, 24); this.fx.ring(x, y, z, def.radius * 0.9, 0.45);
    for (let i = 0; i < 24; i++) this.fx.sparks.emit(x, y + 0.2, z, rnd(-1, 1) * 8, rnd(0, 1) * 5, rnd(-1, 1) * 8, rnd(0.3, 0.6), 0.12, 0.02, 0xbfe0ff, 0x6fa8ff, 1, 4, 1);
    this.sound.at('shieldBreak', x, y, z, { vol: 1.1, ref: 28 }); this.sound.at('explosion', x, y, z, { vol: 0.4, ref: 28, pitch: 1.5 });
    for (const a of this.actors) {
      if (!a.alive) continue;
      const cy = a.body.y + 1, d = Math.hypot(a.body.x - x, cy - y, a.body.z - z);
      if (d > def.radius) continue;
      if (this.level.blocked(x, y + 0.3, z, a.body.x, cy, a.body.z)) continue;
      const k = clamp(1.15 - d / def.radius, 0.3, 1);
      if (a.isPlayer) { a.stunT = Math.max(a.stunT, def.dur * k); this.ui.rumble?.(0.6, 0.2, 300); }
      else a.stunT = Math.max(a.stunT, def.dur * k);
    }
  }
  /** Gunfire and footsteps alert nearby robots. */
  noise(x, y, z, radius, source, loud) {
    for (const b of this.bots) {
      if (!b.alive || b === source || !this.hostile(b, source)) continue;
      const hearing = b.diff.id === 'recruit' ? 0.6 : b.diff.id === 'veteran' ? 1.2 : 0.9;
      if (Math.hypot(b.body.x - x, b.body.z - z) < radius * hearing) b.hear(x, y, z, loud);
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // pickups: dropped guns, ammo crates
  // ---------------------------------------------------------------------------------------------------------
  makeAmmoPickup(a) {
    const mesh = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.7 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; mesh.add(ring);
    mesh.position.set(a.x, this.level.floorY(a.x, 1, a.z, 0.6), a.z); this.scene.add(mesh);
    return { kind: 'ammo', x: a.x, y: mesh.position.y, z: a.z, mesh, ring, cool: 0 };
  }
  dropWeapon(bot) {
    if (this.pickups.filter(p => p.kind === 'gun').length > 7) { const old = this.pickups.find(p => p.kind === 'gun'); if (old) this.removePickup(old); }
    this.dropGunAt(bot.weaponId, bot.body.x + rnd(-0.2, 0.2), bot.body.y, bot.body.z + rnd(-0.2, 0.2));
  }
  dropGunAt(id, x, y, z) {
    const g = buildPickupGun(id); g.position.set(x, y + 0.45, z); this.scene.add(g);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.8 })); glow.rotation.x = Math.PI / 2; glow.position.y = -0.4; g.add(glow);
    const pk = { kind: 'gun', id, x, y, z, mesh: g, ttl: 28, spin: Math.random() * 6 }; this.pickups.push(pk); return pk;
  }
  removePickup(pk) { this.scene.remove(pk.mesh); const i = this.pickups.indexOf(pk); if (i >= 0) this.pickups.splice(i, 1); }
  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      if (pk.kind === 'gun') {
        pk.ttl -= dt; pk.spin += dt * 1.6; pk.mesh.rotation.y = pk.spin; pk.mesh.position.y = pk.y + 0.5 + Math.sin(pk.spin * 2) * 0.06;
        if (pk.ttl < 4) pk.mesh.visible = Math.floor(pk.ttl * 6) % 2 === 0;
        if (pk.ttl <= 0) { this.removePickup(pk); }
      } else if (pk.kind === 'ammo') {
        pk.cool = Math.max(0, pk.cool - dt); pk.ring.material.opacity = pk.cool > 0 ? 0.15 : 0.55 + Math.sin(this.time * 4) * 0.2; pk.ring.scale.setScalar(1 + Math.sin(this.time * 3) * 0.05);
      }
    }
  }
  findInteractable(player) {
    const b = player.body; let best = null, bd = 1e9;
    for (const pk of this.pickups) {
      const dx = pk.x - b.x, dz = pk.z - b.z, d = Math.hypot(dx, dz);
      if (d > (pk.kind === 'ammo' ? 1.9 : 1.7) || Math.abs(pk.y - b.y) > 1.6 || d >= bd) continue;
      if (pk.kind === 'ammo' && pk.cool > 0) continue;
      best = pk; bd = d;
    }
    if (!best) return null;
    const ui = this.ui;
    return { pk: best, prompt: () => best.kind === 'ammo' ? `Hold ${ui.glyphInteract?.() ?? 'X'} for ammo` : `Hold ${ui.glyphInteract?.() ?? 'X'} to take ${WEAPONS[best.id].name}` };
  }
  useInteractable(player, it) {
    const pk = it.pk;
    if (pk.kind === 'ammo') {
      for (const w of player.weapons) { w.reserve = Math.round(w.def.reserve); }
      const l = LETHALS[player.lethal.id]; player.lethal.n = Math.min(l.count, player.lethal.n + 1);
      player.tactical.n = Math.min(player.tactical.n + 1, 2);
      pk.cool = 25; this.sound.ui('pickup'); this.ui.flashText?.('Ammo restocked');
    } else if (pk.kind === 'gun') {
      this.takeGun(player, pk.id); this.removePickup(pk);
    }
  }
  takeGun(player, id) {
    const def = WEAPONS[id], slot = def.slot === 'secondary' ? 1 : 0, cur = player.weapons[slot];
    if (cur.id === id) { cur.reserve = Math.round(def.reserve); this.sound.ui('pickup'); this.ui.flashText?.(`${def.name}: ammo`); return; }
    this.dropGunAt(cur.id, player.body.x, player.body.y, player.body.z);
    const w = new (cur.constructor)(id, player.loadout?.att?.[id] || null);
    player.weapons[slot] = w;
    this.sound.ui('pickup'); this.ui.flashText?.(`Picked up ${def.name}`);
    if (player.hold === 'gun' && player.cur === slot) this.vm?.setWeapon(w);
    else { player.hold = 'gun'; player.cur = slot; this.vm?.setWeapon(w); }
  }

  // ---------------------------------------------------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------------------------------------------------
  update(dt, aspect, viewH = 720) {
    this.sound.beginFrame();
    const p = this.player;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(Math.max(0, this.countdown));
      if (after !== before && after >= 1) this.sound.countdown(false);
      if (this.countdown <= 0) { this.state = 'playing'; this.sound.countdown(true); this.mode.start(); }
      // freeze the actors but keep the player looking around
      p.doLook(dt, this.ctl); p.updateShapes();
    } else {
      this.time += dt;
      if (this.state === 'playing') this.mode.update(dt);
      p.update(dt, this.ctl);
      if (this.state === 'playing' || this.modeId === 'range') for (const b of this.bots) b.update(dt);
      this.proj.update(dt); this.streaks.update(dt); this.updatePickups(dt);
      this.mode.updateWorld?.(dt);
    }
    this.fx.update(dt);
    p.applyCamera(this.camera, dt, aspect);
    this.camera.updateMatrixWorld(true);
    this.fx.setScale(viewH / (2 * Math.tan(this.camera.fov * Math.PI / 360)));   // point-sprite size in pixels per metre at 1 m
    this.sound.setListener(p.body.x, p.eye, p.body.z, p.heading);
    this.updateSun();
    if (this.vm) { this.vm.update(dt, p.vmState(), p.weapon); }
  }
  dispose() {
    this.proj.clear(); this.streaks.clear(); this.fx.clear();
    for (const b of this.bots) b.dispose();
    for (const pk of this.pickups) this.scene.remove(pk.mesh);
    this.sound.ambience?.(false);
    this.mode.dispose?.();
  }
}
